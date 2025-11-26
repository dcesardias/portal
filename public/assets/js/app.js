console.log('=== Portal Power BI Starting ===');

// Configurações globais
window.PortalApp = {
    API_URL: '/api',
    authToken: sessionStorage.getItem('authToken'),
    currentUser: null,
    isAdmin: false,
    menuData: [],
    pagesData: [],
    selectedPageId: null,
    editingPageId: null,
    editingMenuId: null
};

// Carregar módulos em sequência
async function loadModules() {
    const modules = [
        'utils',    // Primeiro - utilitários básicos
        'data',     // Segundo - manipulação de dados
        'config',   // Terceiro - configurações
        'menu',     // Quarto - menu
        'pages',    // Quinto - páginas  
        'auth',     // Sexto - autenticação
        'ui',       // Sétimo - interface
        'admin',    // Oitavo - administração
        'search',   // Nono - busca
        'icons'     // Último - ícones
    ];
    
    for (const module of modules) {
        try {
            await import(`./modules/${module}.js`);
            console.log(`Module ${module} loaded`);
        } catch (error) {
            console.error(`Failed to load module ${module}:`, error);
        }
    }
}

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadModules();
        
        // Carregar configurações do portal (cores, fonte, chatbotEnabled etc.)
        if (window.PortalConfig && typeof window.PortalConfig.loadConfig === 'function') {
            try { await window.PortalConfig.loadConfig(); } catch (e) { console.warn('Config load failed:', e); }
        }

        // Inicializar cache de dados
        if (window.PortalData) {
            window.PortalData.init();
        }
        
        // Inicializar tema
        if (window.PortalUI) {
            window.PortalUI.initializeTheme();
        }
        
        // Verificar autenticação e carregar dados
        if (window.PortalAuth) {
            await window.PortalAuth.checkAuth();
        } else {
            // Fallback se auth não carregar
            if (window.PortalData) {
                await window.PortalData.loadDataFromAPI();
            }
            if (window.PortalPages) {
                window.PortalPages.showHome();
            }
        }
        
        // Configurar componentes da UI
        if (window.PortalUI) {
            window.PortalUI.setupComponents();
        }
        
        console.log('Portal ready!');
    } catch (error) {
        console.error('Failed to initialize portal:', error);
    }
});

window.PortalPages = {
    // ...existing code...

    async loadPage(pageId, menuItemClicked) {
        try {
            window.selectedPageId = pageId;
            
            const response = await fetch(`${window.PortalApp.API_URL}/pages/${pageId}`);
            if (!response.ok) throw new Error('Página não encontrada');
            
            const page = await response.json();
            
            // ...existing code até document.getElementById('pageDescription').textContent = ...

            // NOVO: Verificar tutorial logo após carregar a página
            console.log('[TUTORIAL] Verificando tutorial para página:', pageId);
            await this.checkTutorialAvailability(pageId);

            // Mostrar view da página
            document.getElementById('homeView').style.display = 'none';
            document.getElementById('pageView').style.display = 'block';
            
            // Renderizar Power BI
            this.renderPowerBI(page.PowerBIUrl);
            
            // Atualizar menu ativo
            if (window.PortalMenu) {
                document.querySelectorAll('.menu-item.active').forEach(item => {
                    item.classList.remove('active');
                });
                
                if (menuItemClicked) {
                    menuItemClicked.classList.add('active');
                }
            }

        } catch (error) {
            console.error('Erro ao carregar página:', error);
            if (window.PortalUtils) {
                window.PortalUtils.showError('Erro ao carregar página');
            }
        }
    },

    // NOVA FUNÇÃO: Verificar disponibilidade de tutorial
    async checkTutorialAvailability(pageId) {
        const tutorialBtn = document.getElementById('startTutorialBtn');
        if (!tutorialBtn) {
            console.warn('[TUTORIAL] ⚠️ Botão startTutorialBtn não encontrado no DOM');
            return;
        }

        try {
            console.log('[TUTORIAL] Fazendo fetch para /api/tutorials/page/' + pageId);
            
            const response = await fetch(`${window.PortalApp.API_URL}/tutorials/page/${pageId}`);
            
            console.log('[TUTORIAL] Status da resposta:', response.status);
            
            if (response.ok) {
                const tutorial = await response.json();
                console.log('[TUTORIAL] ✅ Tutorial encontrado:', tutorial);
                console.log('[TUTORIAL] Steps:', tutorial.steps ? tutorial.steps.length : 0);
                
                // Mostrar botão e configurar click
                tutorialBtn.style.display = 'flex';
                tutorialBtn.onclick = () => {
                    console.log('[TUTORIAL] 🎯 Botão clicado - iniciando tutorial');
                    if (window.PortalTutorial) {
                        window.PortalTutorial.startTutorial(pageId);
                    } else {
                        console.error('[TUTORIAL] ❌ PortalTutorial não está carregado');
                        alert('Erro: módulo de tutorial não carregado');
                    }
                };
                
                console.log('[TUTORIAL] Botão ativado e visível');
            } else {
                console.log('[TUTORIAL] ❌ Página sem tutorial (status ' + response.status + ')');
                tutorialBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('[TUTORIAL] ❌ Erro ao verificar:', error);
            tutorialBtn.style.display = 'none';
        }
    },

    // ...existing code...
};

async function loadDataFromAPI() {
    try {
        // ...existing code...

        // Carregar dados das páginas
        const pagesResponse = await fetch(`${window.PortalApp.API_URL}/pages`);
        if (!pagesResponse.ok) throw new Error('Erro ao buscar páginas');
        let pages = await pagesResponse.json();

        // Verificar quais páginas têm tutorial
        console.log('[TUTORIAL] Verificando tutoriais para', pages.length, 'páginas');
        
        for (let page of pages) {
            try {
                const tutorialResponse = await fetch(`${window.PortalApp.API_URL}/tutorials/page/${page.Id}`);
                page.hasTutorial = tutorialResponse.ok;
                
                if (page.hasTutorial) {
                    console.log(`[TUTORIAL] ✅ Página ${page.Id} (${page.Title}) TEM tutorial`);
                } else {
                    console.log(`[TUTORIAL] ⬜ Página ${page.Id} (${page.Title}) NÃO tem tutorial`);
                }
            } catch {
                page.hasTutorial = false;
            }
        }

        window.PortalApp.pagesData = pages;

        // ...existing code...
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        if (window.PortalUtils) {
            window.PortalUtils.showError('Erro ao conectar com o servidor');
        }
    }
}

// ...existing code...