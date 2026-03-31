window.PortalMicrosoftAuth = {
    config: null,
    msalInstance: null,
    initialized: false,
    initializationFailed: false,
    lastInitErrorMessage: '',
    pendingPageKey: 'portal.microsoft.pendingPageId',
    skipPromptKey: 'portal.microsoft.skipPromptOnce',
    activeAccountKey: 'portal.microsoft.activeAccount',

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

            const redirectResult = await this.msalInstance.handleRedirectPromise();
            if (redirectResult && redirectResult.account) {
                this.msalInstance.setActiveAccount(redirectResult.account);
                sessionStorage.setItem(this.activeAccountKey, redirectResult.account.username || redirectResult.account.homeAccountId || '');
            } else {
                const cachedAccount = this.msalInstance.getActiveAccount() || this.msalInstance.getAllAccounts()[0] || null;
                if (cachedAccount) {
                    this.msalInstance.setActiveAccount(cachedAccount);
                    sessionStorage.setItem(this.activeAccountKey, cachedAccount.username || cachedAccount.homeAccountId || '');
                }
            }
        } catch (error) {
            console.error('[MSAUTH] Falha na inicializacao:', error);
            this.initializationFailed = true;
            this.lastInitErrorMessage = error && error.message ? error.message : 'Falha ao inicializar autenticacao Microsoft.';
        } finally {
            this.initialized = true;
        }
    },

    isEnabled() {
        return !!(this.config && this.config.enabled && this.config.clientId && this.config.tenantId);
    },

    getBaseRequest() {
        return {
            scopes: Array.isArray(this.config?.loginScopes) ? this.config.loginScopes : ['openid', 'profile', 'offline_access', 'User.Read'],
            prompt: this.config?.forceAccountSelection === false ? undefined : 'select_account'
        };
    },

    getPopupRequest() {
        const popupWidth = 520;
        const popupHeight = 720;
        const left = Math.max(0, Math.round(window.screenX + ((window.outerWidth - popupWidth) / 2)));
        const top = Math.max(0, Math.round(window.screenY + ((window.outerHeight - popupHeight) / 2)));

        return {
            ...this.getBaseRequest(),
            popupWindowAttributes: {
                popupSize: { width: popupWidth, height: popupHeight },
                popupPosition: { top, left }
            }
        };
    },

    getRedirectRequest() {
        return this.getBaseRequest();
    },

    async ensurePowerBIAccount(page) {
        await this.init();

        if (!this.isEnabled()) {
            return true;
        }

        if (this.initializationFailed || !this.msalInstance) {
            alert(`A autenticacao Microsoft nao foi inicializada corretamente neste portal. Detalhes: ${this.lastInitErrorMessage || 'erro desconhecido'}`);
            return false;
        }

        const pageId = String(page.id);
        const pendingPageId = sessionStorage.getItem(this.pendingPageKey);
        const skipPrompt = sessionStorage.getItem(this.skipPromptKey) === '1';

        if (skipPrompt && pendingPageId === pageId) {
            sessionStorage.removeItem(this.skipPromptKey);
            sessionStorage.removeItem(this.pendingPageKey);
            return true;
        }

        sessionStorage.setItem(this.pendingPageKey, pageId);
        sessionStorage.setItem(this.skipPromptKey, '1');

        try {
            const popupResult = await this.msalInstance.loginPopup(this.getPopupRequest());
            if (popupResult && popupResult.account) {
                this.msalInstance.setActiveAccount(popupResult.account);
                sessionStorage.setItem(this.activeAccountKey, popupResult.account.username || popupResult.account.homeAccountId || '');
            }

            sessionStorage.removeItem(this.skipPromptKey);
            sessionStorage.removeItem(this.pendingPageKey);
            return true;
        } catch (error) {
            console.warn('[MSAUTH] loginPopup falhou; tentando fallback via redirect:', error);

            try {
                await this.msalInstance.loginRedirect(this.getRedirectRequest());
            } catch (redirectError) {
                console.error('[MSAUTH] Falha ao iniciar loginRedirect:', redirectError);
                sessionStorage.removeItem(this.skipPromptKey);
                sessionStorage.removeItem(this.pendingPageKey);
                alert('Nao foi possivel iniciar o login Microsoft para abrir o painel.');
            }

            return false;
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
