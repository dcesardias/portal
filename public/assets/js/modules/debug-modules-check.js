'use strict';

window.addEventListener('load', () => {
    setTimeout(() => {
        console.log('[DEBUG] Módulos carregados:');
        console.log('  PortalApp:', !!window.PortalApp);
        console.log('  PortalAdmin:', !!window.PortalAdmin);
        console.log('  PortalTutorial:', !!window.PortalTutorial);
        if (!window.PortalTutorial) {
            console.error('[DEBUG] ⚠️ PortalTutorial NÃO foi carregado!');
        }
    }, 1000);
});
