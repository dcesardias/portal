window.PortalMicrosoftAuth = {
    config: null,
    msalInstance: null,
    initialized: false,
    initializationFailed: false,
    lastInitErrorMessage: '',
    pendingPageKey: 'portal.microsoft.pendingPageId',
    skipPromptKey: 'portal.microsoft.skipPromptOnce',
    activeAccountKey: 'portal.microsoft.activeAccount',
    startupRedirectInFlightKey: 'portal.microsoft.startupRedirectInFlight',

    async init() {
        if (this.initialized) return;

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/microsoft-auth/config?cb=${Date.now()}`, {
                cache: 'no-store'
            });
            if (!response.ok) {
                throw new Error(`Config HTTP ${response.status}`);
            }

            this.config = await response.json();
            if (!this.isEnabled()) {
                this.initialized = true;
                return;
            }

            if (!window.msal || !window.msal.PublicClientApplication) {
                this.initializationFailed = true;
                this.lastInitErrorMessage = 'Biblioteca msal-browser não foi carregada pelo portal.';
                console.warn('[MSAUTH] msal-browser indisponivel; autenticacao Microsoft nao inicializada.');
                this.initialized = true;
                return;
            }

            const redirectUri = `${window.location.origin}/`;
            this.msalInstance = new window.msal.PublicClientApplication({
                auth: {
                    clientId: this.config.clientId,
                    authority: this.config.authority,
                    redirectUri,
                    postLogoutRedirectUri: redirectUri,
                    navigateToLoginRequestUrl: false
                },
                cache: {
                    cacheLocation: 'sessionStorage',
                    storeAuthStateInCookie: false
                }
            });

            if (typeof this.msalInstance.initialize === 'function') {
                await this.msalInstance.initialize();
            }

            // IMPORTANTE: Só pegamos a conta quando o usuário realmente acabou
            // de voltar de um redirect de login. NUNCA puxamos getAllAccounts()
            // automaticamente — isso é o que disparava o "auto-login" indesejado.
            const redirectResult = await this.msalInstance.handleRedirectPromise();
            if (redirectResult && redirectResult.account) {
                this.msalInstance.setActiveAccount(redirectResult.account);
                sessionStorage.setItem(this.activeAccountKey, redirectResult.account.username || redirectResult.account.homeAccountId || '');
                sessionStorage.removeItem(this.startupRedirectInFlightKey);
            }
        } catch (error) {
            console.error('[MSAUTH] Falha na inicializacao:', error);
            this.initializationFailed = true;
            this.lastInitErrorMessage = error && error.message ? error.message : 'Falha ao inicializar autenticacao Microsoft.';
        } finally {
            this.initialized = true;
            this.updateAccountIndicator();
        }
    },

    // Popula o indicador #accountIndicator do header com nome (ou email,
    // como fallback) do usuario logado via MSAL. Se nao houver conta ativa,
    // mantem o indicador oculto. Idempotente — pode ser chamado a qualquer
    // momento apos init().
    updateAccountIndicator() {
        const container = document.getElementById('accountIndicator');
        const label = document.getElementById('accountIndicatorLabel');
        if (!container || !label) return;

        const name = this.getSignedInName();
        const email = this.getSignedInEmail();
        const display = name || email;

        if (!display) {
            container.style.display = 'none';
            label.textContent = '';
            container.removeAttribute('title');
            return;
        }

        label.textContent = display;
        // Email no tooltip ajuda a desambiguar usuarios com mesmo nome.
        container.title = email && email !== display ? `${display} (${email})` : display;
        container.style.display = 'inline-flex';
    },

    isEnabled() {
        return !!(this.config && this.config.enabled && this.config.clientId && this.config.tenantId);
    },

    getSignedInEmail() {
        if (!this.msalInstance) return '';

        // Só consideramos a conta ATIVA. Não usamos getAllAccounts() como
        // fallback porque ele pode trazer contas residuais do cache MSAL
        // que o usuário não escolheu nesta sessão.
        const account = this.msalInstance.getActiveAccount();
        if (!account) return '';

        const claims = account.idTokenClaims || {};
        return claims.preferred_username || claims.email || account.username || '';
    },

    getSignedInName() {
        if (!this.msalInstance) return '';
        const account = this.msalInstance.getActiveAccount();
        if (!account) return '';

        const claims = account.idTokenClaims || {};
        // claims.name é o nome de exibição; account.name idem na maioria dos
        // tenants. Pode ou não estar presente — caller deve tratar string vazia.
        return claims.name || account.name || '';
    },

    getBaseRequest() {
        // Sempre forçamos prompt: 'select_account'. O portal exige login
        // explícito a cada sessão — nada de SSO automático.
        return {
            scopes: Array.isArray(this.config?.loginScopes) ? this.config.loginScopes : ['openid', 'profile', 'offline_access', 'User.Read'],
            prompt: 'select_account'
        };
    },

    getRedirectRequest() {
        return this.getBaseRequest();
    },

    getActiveAccount() {
        if (!this.msalInstance) return null;
        return this.msalInstance.getActiveAccount();
    },

    // Garante que existe uma conta MSAL ativa antes de prosseguir com a UI.
    // Chamada no startup do portal, depois do checkAuth e antes de qualquer
    // render. Se não houver conta, dispara loginRedirect; a janela inteira
    // navega para AAD e ao retornar handleRedirectPromise() popula a conta.
    //
    // Retorna:
    //   true  → tem conta, pode renderizar a UI normalmente
    //   false → disparou redirect (caller deve PARAR — a página vai recarregar)
    //   true  → MS auth desabilitado / falhou init (caller segue sem MS)
    async requireAccountAtStartup() {
        await this.init();

        if (!this.isEnabled()) {
            return true;
        }

        if (this.initializationFailed || !this.msalInstance) {
            console.warn('[MSAUTH] requireAccountAtStartup: init falhou, seguindo sem MS auth.');
            return true;
        }

        if (this.getActiveAccount()) {
            return true;
        }

        // Sem conta ativa. Antes de disparar o redirect, verificamos se já
        // estamos no meio de um redirect (proteção contra loop infinito caso
        // o IdP rejeite e devolva sem conta).
        const inFlight = sessionStorage.getItem(this.startupRedirectInFlightKey) === '1';
        if (inFlight) {
            // O redirect voltou mas handleRedirectPromise() não populou conta.
            // Limpa o marcador e desiste — o usuário pode clicar de novo se
            // quiser. Não entramos em loop.
            sessionStorage.removeItem(this.startupRedirectInFlightKey);
            console.warn('[MSAUTH] startup redirect retornou sem conta; desistindo.');
            return true;
        }

        sessionStorage.setItem(this.startupRedirectInFlightKey, '1');

        try {
            await this.msalInstance.loginRedirect(this.getRedirectRequest());
        } catch (error) {
            console.error('[MSAUTH] loginRedirect no startup falhou:', error);
            sessionStorage.removeItem(this.startupRedirectInFlightKey);
            alert('Não foi possível iniciar o login Microsoft. Recarregue a página para tentar novamente.');
            return true;
        }

        // loginRedirect navega a janela. Se chegamos aqui, o redirect foi
        // disparado mas a página ainda não foi descartada — sinalizamos
        // ao caller para não renderizar nada.
        return false;
    },

    // Verificação defensiva chamada antes de renderizar um iframe Power BI.
    // Como o startup já garantiu a conta, normalmente passa direto. Se por
    // algum motivo não houver conta (race / sessionStorage corrompido), nós
    // NÃO tentamos logar silenciosamente — pedimos pro usuário usar "Trocar
    // conta" ou recarregar.
    async ensurePowerBIAccount() {
        await this.init();

        if (!this.isEnabled()) {
            return true;
        }

        if (this.initializationFailed || !this.msalInstance) {
            return true;
        }

        if (this.getActiveAccount()) {
            return true;
        }

        return false;
    },

    clearLocalAccounts() {
        if (!this.msalInstance) return;
        try {
            this.msalInstance.setActiveAccount(null);
        } catch (e) { /* noop */ }

        try {
            const cache = typeof this.msalInstance.getTokenCache === 'function' ? this.msalInstance.getTokenCache() : null;
            const accounts = this.msalInstance.getAllAccounts() || [];
            for (const acc of accounts) {
                if (cache && typeof cache.removeAccount === 'function') {
                    try { cache.removeAccount(acc); } catch (e) { /* noop */ }
                }
            }
        } catch (e) {
            console.debug('[MSAUTH] clearLocalAccounts: nao foi possivel limpar todas as contas em cache:', e);
        }

        try { sessionStorage.removeItem(this.activeAccountKey); } catch (e) { /* noop */ }
    },

    // Retorna o id_token MSAL do usuario logado, fazendo silent acquire ou
    // login popup se preciso. Devolve string vazia se MSAL desabilitado/falhou.
    async getIdToken({ promptIfMissing = true } = {}) {
        await this.init();
        if (!this.isEnabled() || this.initializationFailed || !this.msalInstance) return '';

        let account = this.msalInstance.getActiveAccount() || this.msalInstance.getAllAccounts()[0] || null;

        if (!account) {
            if (!promptIfMissing) return '';
            try {
                const popupResult = await this.msalInstance.loginPopup(this.getPopupRequest());
                if (popupResult && popupResult.account) {
                    this.msalInstance.setActiveAccount(popupResult.account);
                    account = popupResult.account;
                    if (popupResult.idToken) return popupResult.idToken;
                }
            } catch (e) {
                console.warn('[MSAUTH] loginPopup para id_token falhou:', e);
                return '';
            }
        }

        if (!account) return '';

        try {
            const result = await this.msalInstance.acquireTokenSilent({
                account,
                scopes: ['openid', 'profile'],
            });
            return result?.idToken || '';
        } catch (e) {
            console.warn('[MSAUTH] acquireTokenSilent falhou; tentando popup:', e);
            try {
                const result = await this.msalInstance.acquireTokenPopup({
                    account,
                    scopes: ['openid', 'profile'],
                });
                return result?.idToken || '';
            } catch (e2) {
                console.warn('[MSAUTH] acquireTokenPopup falhou:', e2);
                return '';
            }
        }
    },

    async finishStartup() {
        await this.init();

        if (!this.isEnabled()) {
            return;
        }

        const pendingPageId = sessionStorage.getItem(this.pendingPageKey);
        const skipPrompt = sessionStorage.getItem(this.skipPromptKey) === '1';
        if (!pendingPageId || !skipPrompt) {
            return;
        }

        const pageId = Number(pendingPageId);
        if (!Number.isFinite(pageId)) {
            sessionStorage.removeItem(this.pendingPageKey);
            sessionStorage.removeItem(this.skipPromptKey);
            return;
        }

        if (window.PortalPages && typeof window.PortalPages.loadPage === 'function') {
            await window.PortalPages.loadPage(pageId);
        }
    }
};
