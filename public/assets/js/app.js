console.log('=== Portal Power BI Starting ===');

// Configurações globais
window.PortalApp = {
    API_URL: '/api',
    authToken: localStorage.getItem('authToken'),
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