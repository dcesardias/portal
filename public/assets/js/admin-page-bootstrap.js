/* ============================================================
   admin-page-bootstrap.js
   Bootstrap dedicado para a página /admin (admin.html).
   - Carrega só os módulos necessários (sem PortalPages/menu/etc).
   - Verifica autenticação direta com /api/verify-token.
   - Implementa routing por hash (#/paginas, #/menu, ...).
   - Aciona os mesmos loaders de window.PortalAdmin que o drawer usava.
   ============================================================ */
(function () {
    'use strict';

    // Estado global mínimo (espelha o de app.js para os módulos funcionarem).
    window.PortalApp = window.PortalApp || {
        API_URL: '/api',
        authToken: sessionStorage.getItem('authToken'),
        currentUser: null,
        isAdmin: false,
        menuData: [],
        pagesData: [],
        selectedPageId: null,
        selectedGroupId: null,
        editingPageId: null,
        editingMenuId: null,
        editingUserId: null
    };

    // Versão para cache-busting (lê meta tag, igual ao app.js).
    const APP_VERSION = (() => {
        const meta = document.querySelector('meta[name="app-version"]');
        const v = meta && meta.getAttribute('content');
        if (v && v !== '__APP_VERSION__') return v;
        return String(Date.now());
    })();
    window.PortalApp.version = APP_VERSION;

    // Mapeamento das seções de hash -> id da seção HTML + função de carga.
    // A função de carga é resolvida em runtime (depois dos módulos carregarem).
    const SECTIONS = {
        'paginas':       { id: 'section-paginas',       loader: () => window.PortalAdmin && window.PortalAdmin.loadPagesList && window.PortalAdmin.loadPagesList() },
        'menu':          { id: 'section-menu',          loader: () => window.PortalAdmin && window.PortalAdmin.loadMenuStructure && window.PortalAdmin.loadMenuStructure() },
        'usuarios':      { id: 'section-usuarios',      loader: () => window.PortalAdmin && window.PortalAdmin.loadUsersList && window.PortalAdmin.loadUsersList() },
        'dicionarios':   { id: 'section-dicionarios',   loader: () => window.PortalAdmin && window.PortalAdmin.loadDataDictionaries && window.PortalAdmin.loadDataDictionaries() },
        'configuracoes': { id: 'section-configuracoes', loader: () => {
            // A aba de configurações só precisa que os campos do form estejam preenchidos
            // pelo loadConfig que rodou no boot. Aqui só inicializa o icon picker do Home.
            if (window.PortalIcons && typeof window.PortalIcons.buildAllPalettes === 'function') {
                setTimeout(() => window.PortalIcons.buildAllPalettes(), 50);
            }
        } }
    };
    const DEFAULT_SECTION = 'paginas';

    // ----------- Roteamento por hash -----------
    function parseHash() {
        // Aceita #/paginas, #paginas e variações
        const raw = (location.hash || '').replace(/^#\/?/, '').toLowerCase().trim();
        return SECTIONS[raw] ? raw : DEFAULT_SECTION;
    }

    function activateSection(name) {
        const target = SECTIONS[name] ? name : DEFAULT_SECTION;

        // Esconde todas, mostra a alvo
        document.querySelectorAll('.admin-page-section').forEach(el => el.classList.remove('is-active'));
        const sectionEl = document.getElementById(SECTIONS[target].id);
        if (sectionEl) sectionEl.classList.add('is-active');

        // Marca item ativo na sidenav
        document.querySelectorAll('#adminNav .admin-nav-item, .admin-sidenav .admin-nav-item').forEach(el => {
            el.classList.toggle('is-active', el.getAttribute('data-section') === target);
        });

        // Atualiza title
        const titleEl = sectionEl ? sectionEl.querySelector('h1') : null;
        if (titleEl) document.title = `${titleEl.textContent.trim()} — Administração`;

        // Carrega dados da seção (sob demanda)
        try {
            const fn = SECTIONS[target].loader;
            if (typeof fn === 'function') fn();
        } catch (err) {
            console.error('[admin-page] erro ao carregar seção', target, err);
        }
    }

    function setupRouting() {
        window.addEventListener('hashchange', () => activateSection(parseHash()));
        // Garante hash inicial limpo
        if (!location.hash) {
            location.replace('#/' + DEFAULT_SECTION);
        }
        activateSection(parseHash());
    }

    // ----------- Carregamento de módulos (igual app.js, sem os do portal público) -----------
    async function loadModules() {
        const modules = [
            'utils',
            'data',
            'config',
            'auth',
            'admin',
            'icons'
        ];
        for (const m of modules) {
            try {
                await import(`./modules/${m}.js?v=${APP_VERSION}`);
                console.log(`[admin-page] módulo ${m} carregado`);
            } catch (err) {
                console.error(`[admin-page] falha ao carregar módulo ${m}:`, err);
            }
        }
    }

    // ----------- Verificação de autenticação direta -----------
    async function verifyAuth() {
        const token = sessionStorage.getItem('authToken');
        if (!token) return { ok: false, reason: 'no-token' };

        try {
            const userRaw = sessionStorage.getItem('currentUser');
            if (userRaw) {
                try { window.PortalApp.currentUser = JSON.parse(userRaw); } catch (e) { /* ignore */ }
            }
            const resp = await fetch(`${window.PortalApp.API_URL}/verify-token`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) return { ok: false, reason: 'invalid-token' };
            const data = await resp.json();
            window.PortalApp.authToken = token;
            window.PortalApp.currentUser = data.user;
            window.PortalApp.isAdmin = !!(data.user && data.user.isAdmin);
            return { ok: true, isAdmin: window.PortalApp.isAdmin };
        } catch (err) {
            console.error('[admin-page] verify-token falhou:', err);
            return { ok: false, reason: 'network' };
        }
    }

    // ----------- Tela de acesso negado -----------
    function showAccessDenied(reason) {
        document.querySelectorAll('.admin-page-section').forEach(el => el.classList.remove('is-active'));
        const sec = document.getElementById('section-access-denied');
        if (sec) sec.classList.add('is-active');

        const title = document.getElementById('accessDeniedTitle');
        const msg = document.getElementById('accessDeniedMessage');
        if (reason === 'not-admin') {
            if (title) title.textContent = 'Acesso restrito';
            if (msg) msg.textContent = 'Você está autenticado, mas não possui permissão de administrador. Solicite o acesso ao administrador do portal.';
        } else {
            if (title) title.textContent = 'É preciso fazer login';
            if (msg) msg.textContent = 'Esta área é exclusiva para administradores. Faça login pelo portal e tente novamente.';
        }

        // Esconde sidenav e botões do topbar que dependem dos módulos.
        const sidenav = document.querySelector('.admin-sidenav');
        if (sidenav) sidenav.style.display = 'none';
        const main = document.querySelector('.admin-main');
        if (main) main.style.gridColumn = '1 / -1';
        document.querySelectorAll('.admin-topbar-actions button, .admin-topbar-actions a:not([href="/"])').forEach(el => el.style.display = 'none');
    }

    // ----------- Carregar dados que TODA seção precisa (pages, menu, config) -----------
    async function loadInitialData() {
        try {
            if (window.PortalData && typeof window.PortalData.loadDataFromAPI === 'function') {
                await window.PortalData.loadDataFromAPI();
            }
        } catch (err) {
            console.error('[admin-page] loadDataFromAPI falhou:', err);
        }
        try {
            if (window.PortalConfig && typeof window.PortalConfig.loadConfig === 'function') {
                await window.PortalConfig.loadConfig();
            }
        } catch (err) {
            console.error('[admin-page] loadConfig falhou:', err);
        }
    }

    // ----------- Interceptor de 401: sessão expirou → relogar -----------
    // Envolve window.fetch e, se uma resposta 401 vier de uma chamada à própria
    // API do portal com token, limpa sessão e volta para /. Outras 401 (ex.: APIs
    // externas) são deixadas em paz.
    function installAuthRedirect() {
        if (window._adminFetchPatched) return;
        window._adminFetchPatched = true;
        const origFetch = window.fetch.bind(window);
        let redirected = false;
        window.fetch = async (...args) => {
            const resp = await origFetch(...args);
            try {
                if (resp && resp.status === 401 && !redirected) {
                    const url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url);
                    // Só age para chamadas locais à nossa API.
                    if (url && url.indexOf('/api/') !== -1) {
                        redirected = true;
                        sessionStorage.removeItem('authToken');
                        sessionStorage.removeItem('currentUser');
                        // Pequeno delay para dar chance ao código chamador de logar o erro.
                        setTimeout(() => { window.location.href = '/'; }, 50);
                    }
                }
            } catch (_) { /* ignore */ }
            return resp;
        };
    }

    // ----------- Esc fecha modais "Nova Página"/"Novo Item" -----------
    // O drawer original tinha um listener próprio que cuidava disso. Em /admin
    // o drawer não roda — então registramos o listener aqui.
    function installEscCloseModals() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // Prioridade: confirmação > admin-modal > nada (deixa o navegador agir).
            const confirmOverlay = document.querySelector('.admin-confirm-overlay');
            if (confirmOverlay) return; // adminConfirm já trata Esc internamente
            const overlay = document.getElementById('adminModalOverlay');
            if (overlay && typeof window.closeAdminModal === 'function') {
                window.closeAdminModal();
            }
        });
    }

    // ----------- Pequeno polyfill: PortalAdmin chama PortalUI.syncOverlayState -----------
    // Como não temos overlay no /admin, viramos no-op para evitar erros.
    function installNoOpFallbacks() {
        window.PortalUI = window.PortalUI || {
            syncOverlayState: () => {},
            initializeTheme: () => {},
            setupComponents: () => {}
        };
        // Stub do botão Admin (botão original do drawer não existe nesta página)
        if (typeof window.toggleAdmin !== 'function') {
            window.toggleAdmin = () => { /* no-op */ };
        }
        // Em /admin, "fechar drawer" volta ao portal.
        if (typeof window.closeAdminPanel !== 'function') {
            window.closeAdminPanel = () => { window.location.href = '/'; };
        }
    }

    // ----------- Wire-up dos cliques na sidenav (sem hashchange duplicado) -----------
    function setupSidenavClicks() {
        document.querySelectorAll('#adminNav .admin-nav-item, .admin-sidenav .admin-nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                const section = link.getAttribute('data-section');
                if (!section) return;
                // O href já é #/secao — deixamos o navegador atualizar o hash;
                // o listener hashchange chama activateSection.
            });
        });
    }

    // ----------- Popula <select data-typography-font> com a lista padrão de fontes -----------
    // O HTML deixa esses selects vazios pra evitar duplicação de ~16 linhas em 3 lugares.
    function populateTypographyFontSelects() {
        const FONTS = [
            ["'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif", "Segoe UI (padrão)"],
            ["Arial, Helvetica, sans-serif", "Arial"],
            ["'Helvetica Neue', Helvetica, Arial, sans-serif", "Helvetica Neue"],
            ["'Roboto', sans-serif", "Roboto"],
            ["'Open Sans', sans-serif", "Open Sans"],
            ["'Lato', sans-serif", "Lato"],
            ["'Poppins', sans-serif", "Poppins"],
            ["'Montserrat', sans-serif", "Montserrat"],
            ["'Inter', sans-serif", "Inter"],
            ["'Nunito', sans-serif", "Nunito"],
            ["Georgia, serif", "Georgia"],
            ["'Times New Roman', Times, serif", "Times New Roman"],
            ["'Courier New', Courier, monospace", "Courier New"],
            ["'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif", "SF Pro Display"],
            ["Verdana, Geneva, sans-serif", "Verdana"],
            ["Tahoma, Geneva, sans-serif", "Tahoma"]
        ];
        document.querySelectorAll('select[data-typography-font]').forEach(sel => {
            if (sel.options.length > 0) return; // já populado
            FONTS.forEach(([value, label]) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                sel.appendChild(opt);
            });
        });
    }

    // ----------- Boot -----------
    async function boot() {
        installAuthRedirect();
        installNoOpFallbacks();
        installEscCloseModals();
        populateTypographyFontSelects();

        // 1) Verifica token primeiro — se falhar, mostra a tela de acesso negado e para.
        const auth = await verifyAuth();
        if (!auth.ok) {
            const app = document.getElementById('adminPanel');
            if (app) app.classList.add('is-ready');
            showAccessDenied('not-logged');
            return;
        }
        if (!auth.isAdmin) {
            const app = document.getElementById('adminPanel');
            if (app) app.classList.add('is-ready');
            showAccessDenied('not-admin');
            return;
        }

        // 2) Carrega módulos
        await loadModules();

        // 3) Carrega dados que toda seção depende (páginas + menu + config)
        await loadInitialData();

        // 4) Mostra botão de "Minha senha" se aplicável
        const cpBtn = document.getElementById('adminChangePasswordButton');
        if (cpBtn && window.PortalApp.isAdmin) cpBtn.style.display = 'inline-flex';

        // 5) Routing
        setupSidenavClicks();
        setupRouting();

        // 6) Esconde loader
        const app = document.getElementById('adminPanel');
        if (app) app.classList.add('is-ready');

        console.log('[admin-page] pronta. usuário:', window.PortalApp.currentUser);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
