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
    postLoginPathKey: 'portal.microsoft.postLoginPath',
    pendingPostLoginRedirect: null,

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

                // Como o redirectUri AAD e' sempre `/`, qualquer login feito a
                // partir de uma rota interna (ex.: /homologa) cai em / depois
                // do AAD. Salvamos o pathname original em sessionStorage antes
                // de disparar o loginRedirect e aqui re-navegamos pro destino
                // pretendido. requireAccountAtStartup le pendingPostLoginRedirect
                // logo apos await init() e dispara location.replace.
                try {
                    const postPath = sessionStorage.getItem(this.postLoginPathKey);
                    if (postPath) {
                        sessionStorage.removeItem(this.postLoginPathKey);
                        const currentFullPath = window.location.pathname + window.location.search;
                        if (postPath !== currentFullPath) {
                            this.pendingPostLoginRedirect = postPath;
                        }
                    }
                } catch (_) {}
            }
        } catch (error) {
            console.error('[MSAUTH] Falha na inicializacao:', error);
            this.initializationFailed = true;
            this.lastInitErrorMessage = error && error.message ? error.message : 'Falha ao inicializar autenticacao Microsoft.';
        } finally {
            this.initialized = true;
            this.updateAccountIndicator();
            this.startPresenceStream();
        }
    },

    presenceHeartbeatTimer: null,

    // Gera/le um tabId UUID em sessionStorage. Diferente do deviceId
    // (localStorage, compartilhado entre abas), sessionStorage e' isolado
    // por aba — cada aba tem seu proprio tabId. Isso permite ao servidor
    // rastrear a view de cada aba individualmente.
    getTabId() {
        let id = null;
        try { id = sessionStorage.getItem('portal.tabId'); } catch (_) {}
        if (!id) {
            id = (window.crypto && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID()
                : ('t-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
            try { sessionStorage.setItem('portal.tabId', id); } catch (_) {}
        }
        return id;
    },

    // Gera/le um deviceId UUID persistente em localStorage. Util para o admin
    // saber quantas maquinas (browsers + devices) estao logadas com um mesmo
    // usuario generico — cada localStorage e' isolado por browser+device.
    getDeviceId() {
        let id = null;
        try { id = localStorage.getItem('portal.deviceId'); } catch (_) {}
        if (!id) {
            id = (window.crypto && typeof window.crypto.randomUUID === 'function')
                ? window.crypto.randomUUID()
                : ('d-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12));
            try { localStorage.setItem('portal.deviceId', id); } catch (_) {}
        }
        return id;
    },

    // Identifica em qual tela do portal a sessao atual esta agora. Retorna
    // um codigo curto pra economizar bytes no header (`portal:home`,
    // `portal:page:42`, `homologa:page:7`, `admin:presenca`, etc). A
    // resolucao do nome amigavel (ex: titulo da pagina) acontece no front
    // do admin via lookup em window.PortalApp.pagesData / menuData.
    getCurrentView() {
        try {
            const path = (window.location.pathname || '/').toLowerCase();

            if (path === '/admin' || path === '/admin.html') {
                const hash = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase().trim();
                return hash ? `admin:${hash.slice(0, 32)}` : 'admin';
            }

            if (path === '/homologa' || path === '/homologa.html') {
                const pageId = window.PortalApp && window.PortalApp.selectedPageId;
                return Number.isFinite(Number(pageId))
                    ? `homologa:page:${Number(pageId)}`
                    : 'homologa:home';
            }

            if (path.startsWith('/chatbot')) return 'chatbot';
            if (path.startsWith('/excel'))   return 'excel';
            if (path.startsWith('/fatura'))  return 'fatura';
            if (path.startsWith('/mapdb'))   return 'mapdb';
            if (path.startsWith('/tutorial'))return 'tutorial';

            // / ou /index.html — portal principal.
            const pageId = window.PortalApp && window.PortalApp.selectedPageId;
            const groupId = window.PortalApp && window.PortalApp.selectedGroupId;
            if (Number.isFinite(Number(pageId)))  return `portal:page:${Number(pageId)}`;
            if (Number.isFinite(Number(groupId))) return `portal:group:${Number(groupId)}`;
            return 'portal:home';
        } catch (_) {
            return '';
        }
    },

    // Captura UMA VEZ o usuario Windows logado (DOMAIN\username) via NTLM/
    // Kerberos. /api/whoami-windows responde 401 com WWW-Authenticate na
    // primeira tentativa anonima — o browser, se for maquina joined e site
    // estiver na zona intranet, re-envia automaticamente com credenciais e
    // IIS Windows Auth popula LOGON_USER. Se o browser nao puder fornecer
    // (BYOD, mobile, prompt cancelado), retornamos null e o heartbeat segue
    // sem o header X-Win-User. Best-effort: nunca lanca.
    _windowsUserCache: null,
    _windowsUserChecked: false,
    async getWindowsUser() {
        if (this._windowsUserChecked) return this._windowsUserCache;
        this._windowsUserChecked = true;
        try {
            const res = await fetch(`${window.PortalApp.API_URL}/whoami-windows`, {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            // 401 = browser nao conseguiu autenticar (maquina nao joined,
            // prompt cancelado, ou site fora da zona intranet). Trata como
            // "sem mapeamento" silenciosamente.
            if (!res.ok) {
                this._windowsUserCache = null;
                return null;
            }
            const data = await res.json();
            const user = (data && data.user) ? String(data.user).trim() : '';
            this._windowsUserCache = user || null;
            return this._windowsUserCache;
        } catch (_) {
            this._windowsUserCache = null;
            return null;
        }
    },

    // Envia heartbeat HTTP a cada 30s ao /api/presence/heartbeat. Backend
    // atualiza presence[email][deviceId]; entradas sem heartbeat em 90s
    // viram offline. Substituiu a abordagem SSE original (incompativel com
    // iisnode).
    async startPresenceStream() {
        if (!this.isEnabled() || this.initializationFailed || !this.msalInstance) return;
        // getActiveAccount() retorna null em loads subsequentes mesmo com conta
        // cacheada — fallback PASSIVO para getAllAccounts()[0].
        let account = this.msalInstance.getActiveAccount();
        if (!account) {
            const all = this.msalInstance.getAllAccounts();
            if (all && all.length > 0) account = all[0];
        }
        if (!account) return;
        if (this.presenceHeartbeatTimer) return; // ja iniciado

        const send = async () => {
            try {
                const result = await this.msalInstance.acquireTokenSilent({
                    account,
                    scopes: ['openid', 'profile'],
                });
                if (!result || !result.idToken) return;
                const winUser = await this.getWindowsUser();
                const view = this.getCurrentView();
                const headers = {
                    'X-MS-Id-Token': result.idToken,
                    'X-Device-Id': this.getDeviceId(),
                    'X-Tab-Id': this.getTabId(),
                };
                if (winUser) headers['X-Win-User'] = winUser;
                if (view) headers['X-Portal-View'] = view;
                await fetch(`${window.PortalApp.API_URL}/presence/heartbeat`, {
                    method: 'POST',
                    headers,
                });
            } catch (e) {
                // Silencioso — heartbeat eh best-effort.
            }
        };
        send(); // primeiro ping imediato
        this.presenceHeartbeatTimer = setInterval(send, 30 * 1000);
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

        // Se acabamos de voltar do AAD e o login original veio de uma rota
        // interna (/homologa, etc), re-navega pra ela antes de hidratar a UI.
        // O caller (app.js) recebe false e PARA — a janela vai navegar.
        if (this.pendingPostLoginRedirect) {
            const target = this.pendingPostLoginRedirect;
            this.pendingPostLoginRedirect = null;
            try { window.location.replace(target); } catch (_) { window.location.href = target; }
            return false;
        }

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

        // Salva o path atual pra ser restaurado depois do AAD. Isso e' o que
        // permite acessos diretos a /homologa (ou outras rotas) sobreviverem
        // ao redirect login — sem isso o usuario sempre cai em / depois do
        // AAD por causa do redirectUri fixo. Ignoramos / e /index.html pois
        // a/ ja' e' o destino padrao do MSAL.
        try {
            const curPath = window.location.pathname + window.location.search;
            if (curPath && curPath !== '/' && curPath !== '/index.html') {
                sessionStorage.setItem(this.postLoginPathKey, curPath);
            }
        } catch (_) {}

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

    // Retorna um access token AAD do usuario logado com escopo do Power BI
    // Service (delegated). Usado pelo embed user-owns-data via SDK powerbi-client
    // — permite renovacao silenciosa de token sem recarregar o relatorio.
    //
    // Pre-requisito (Entra ID): o app SPA precisa ter a permissao delegada
    // "Power BI Service / Report.Read.All" e o consent (admin ou user) concedido.
    // Sem isso, acquireTokenSilent falha com InteractionRequiredAuthError;
    // por padrao (silentOnly:true) NAO abrimos popup — devolvemos null e o
    // caller faz fallback gracioso pro iframe legado.
    //
    // Retorna { accessToken, expiresOn } ou null.
    async getPowerBIToken({ silentOnly = true } = {}) {
        await this.init();
        if (!this.isEnabled() || this.initializationFailed || !this.msalInstance) return null;

        const account = this.msalInstance.getActiveAccount() || this.msalInstance.getAllAccounts()[0] || null;
        if (!account) return null;

        const scopes = ['https://analysis.windows.net/powerbi/api/Report.Read.All'];
        try {
            const result = await this.msalInstance.acquireTokenSilent({ account, scopes });
            if (!result || !result.accessToken) return null;
            return { accessToken: result.accessToken, expiresOn: result.expiresOn || null };
        } catch (e) {
            if (silentOnly) {
                // Esperado quando o consent do PBI ainda nao foi dado. Loga em
                // info pra nao poluir; o caller cai pro iframe atual.
                console.info('[MSAUTH] PBI token silent indisponivel (consent pendente?):', e && (e.errorCode || e.message));
                return null;
            }
            try {
                const result = await this.msalInstance.acquireTokenPopup({ account, scopes });
                if (!result || !result.accessToken) return null;
                return { accessToken: result.accessToken, expiresOn: result.expiresOn || null };
            } catch (e2) {
                console.warn('[MSAUTH] PBI token popup falhou:', e2 && (e2.errorCode || e2.message));
                return null;
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
