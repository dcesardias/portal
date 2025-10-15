window.PortalConfig = {
    MAX_LENGTHS: {
        pageTitle: 200,
        pageSubtitle: 500,
        pageDescription: 4000,
        powerBIUrl: 2000,
        pageIcon: 500,
        menuName: 200,
        menuIcon: 500
    },

    homeMenuName: 'Home',
    homeMenuIcon: '🏠',

    async loadConfig() {
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/config?cb=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                const config = await response.json();
                this.applySettings(config);
            }
        } catch (err) {
            console.error('Error loading configuration:', err);
        }
    },

    async saveConfig() {
        if (!window.PortalApp.authToken) {
            alert('Faça login como administrador para salvar configurações');
            return;
        }

        const config = this.collectConfigFromUI();
        
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/config`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result && result.settings) {
                    this.applySettings(result.settings);
                } else {
                    await this.loadConfig();
                }
                alert('Configurações salvas com sucesso!');
            } else {
                let bodyText = '';
                try { 
                    const json = await response.json(); 
                    bodyText = json.error || JSON.stringify(json); 
                } catch(e) { 
                    bodyText = await response.text().catch(() => response.statusText); 
                }
                alert(`Erro ao salvar configurações: ${bodyText}`);
            }
        } catch (err) {
            alert('Erro de conexão ao salvar configurações.');
        }
    },

    collectConfigFromUI() {
        const getEl = (id) => document.getElementById(id);
        
        // Pegar o logo atual da sidebar se existir
        const sidebarLogo = document.getElementById('sidebarLogo');
        let currentLogoUrl = null;
        if (sidebarLogo && sidebarLogo.src && sidebarLogo.style.display !== 'none') {
            currentLogoUrl = sidebarLogo.src;
        }

        return {
            portalName: (getEl('portalName')?.value) || 'Power BI Dashboard',
            primaryColor: (getEl('primaryColor')?.value) || '#0066cc',
            menuBgColor: (getEl('menuBgColor')?.value) || '#4A4A4A',
            menuCollapsedBgColor: (getEl('menuCollapsedBgColor')?.value) || '#4A4A4A',
            menuHoverColor: (getEl('menuHoverColor')?.value) || '#2a2d4a',
            homeMenuName: (getEl('homeMenuName')?.value) || 'Home',
            homeMenuIcon: (getEl('homeIconInput')?.value) || '🏠',
            logoSize: (getEl('logoSizeInput')?.value) || 32,
            logoUrl: currentLogoUrl,
            portalFontFamily: getEl('portalFontSelect')?.value,
            portalFontSize: getEl('portalFontSize')?.value,
            portalFontBold: !!getEl('portalFontBold')?.checked,
            menuFontFamily: getEl('menuFontSelect')?.value,
            menuFontSize: getEl('menuFontSize')?.value,
            menuFontBold: !!getEl('menuFontBold')?.checked,
            menuIconSize: getEl('menuIconSize')?.value,
            pageFontFamily: getEl('pageFontSelect')?.value,
            pageTitleSize: getEl('pageTitleSize')?.value,
            pageTitleBold: !!getEl('pageTitleBold')?.checked,
            pageSubtitleSize: getEl('pageSubtitleSize')?.value,
            pageSubtitleBold: !!getEl('pageSubtitleBold')?.checked,
            pageDescSize: getEl('pageDescSize')?.value,
            pageDescBold: !!getEl('pageDescBold')?.checked
        };
    },

    applySettings(settings = {}) {
        if (!settings) return;
        
        const s = {};
        Object.keys(settings).forEach(k => {
            const lk = String(k).toLowerCase();
            s[lk] = settings[k];
        });

        const get = (name, def = undefined) => {
            return s[name.toLowerCase()] !== undefined ? s[name.toLowerCase()] : def;
        };

        const setVar = (name, value) => {
            if (value === undefined || value === null || value === '') return;
            document.documentElement.style.setProperty(name, String(value));
        };
        
        const toPx = (v) => {
            if (v === undefined || v === null || v === '') return undefined;
            const str = String(v).trim();
            return str.endsWith('px') ? str : `${str}px`;
        };
        
        const toBool = (v) => {
            if (typeof v === 'boolean') return v;
            if (v == null) return false;
            const str = String(v).toLowerCase().trim();
            return str === 'true' || str === '1' || str === 'yes' || str === 'on';
        };

        // Portal name
        const portalName = get('portalname');
        if (portalName !== undefined) {
            const titleEl = document.querySelector('.sidebar-title');
            if (titleEl) titleEl.textContent = portalName;
            const pn = document.getElementById('portalName'); 
            if (pn) pn.value = portalName;
            document.title = portalName;
        }

        // Home menu settings  
        const homeMenuNameValue = get('homemenuname');
        if (homeMenuNameValue !== undefined) {
            this.homeMenuName = homeMenuNameValue;
            const hmn = document.getElementById('homeMenuName'); 
            if (hmn) hmn.value = this.homeMenuName;
            if (window.PortalMenu) window.PortalMenu.renderMenu();
        }
        const homeMenuIconValue = get('homemenuicon');
        if (homeMenuIconValue !== undefined) {
            this.homeMenuIcon = homeMenuIconValue;
            const hmi = document.getElementById('homeIconInput'); 
            if (hmi) hmi.value = this.homeMenuIcon;
            if (window.PortalMenu) window.PortalMenu.renderMenu();
        }

        // Colors
        const primaryColor = get('primarycolor');
        if (primaryColor !== undefined) {
            const pc = document.getElementById('primaryColor'); 
            if (pc) pc.value = primaryColor;
            setVar('--primary-color', primaryColor);
        }
        const menuBgColor = get('menubgcolor');
        if (menuBgColor !== undefined) {
            const el = document.getElementById('menuBgColor'); 
            if (el) el.value = menuBgColor;
            setVar('--menu-bg-color', menuBgColor);
        }
        const menuCollapsedBgColor = get('menucollapsedbgcolor');
        if (menuCollapsedBgColor !== undefined) {
            const el = document.getElementById('menuCollapsedBgColor'); 
            if (el) el.value = menuCollapsedBgColor;
            setVar('--menu-collapsed-bg-color', menuCollapsedBgColor);
        }
        const menuHoverColor = get('menuhovercolor');
        if (menuHoverColor !== undefined) {
            const el = document.getElementById('menuHoverColor'); 
            if (el) el.value = menuHoverColor;
            setVar('--menu-hover-color', menuHoverColor);
        }

        // Logo
        const logoUrl = get('logourl');
        if (logoUrl) {
            this.updateLogoPreview(logoUrl);
        }
        const logoSize = get('logosize');
        if (logoSize !== undefined) {
            const ls = document.getElementById('logoSizeInput');
            if (ls) ls.value = parseInt(logoSize, 10) || 32;
            setVar('--logo-size', toPx(logoSize));
        }

        // Fonts - Portal
        const portalFontFamily = get('portalfontfamily');
        if (portalFontFamily !== undefined) {
            const sel = document.getElementById('portalFontSelect');
            if (sel) sel.value = portalFontFamily;
            setVar('--portal-font-family', portalFontFamily);
        }
        const portalFontSize = get('portalfontsize');
        if (portalFontSize !== undefined) {
            const inp = document.getElementById('portalFontSize');
            if (inp) inp.value = parseInt(portalFontSize, 10) || 16;
            setVar('--portal-font-size', toPx(portalFontSize));
        }
        const portalFontBold = get('portalfontbold');
        if (portalFontBold !== undefined) {
            const chk = document.getElementById('portalFontBold');
            const bold = toBool(portalFontBold);
            if (chk) chk.checked = bold;
            setVar('--portal-font-weight', bold ? '600' : '500');
        }

        // Fonts - Menu
        const menuFontFamily = get('menufontfamily');
        if (menuFontFamily !== undefined) {
            const sel = document.getElementById('menuFontSelect');
            if (sel) sel.value = menuFontFamily;
            setVar('--menu-font-family', menuFontFamily);
        }
        const menuFontSize = get('menufontsize');
        if (menuFontSize !== undefined) {
            const inp = document.getElementById('menuFontSize');
            if (inp) inp.value = parseInt(menuFontSize, 10) || 14;
            setVar('--menu-font-size', toPx(menuFontSize));
        }
        const menuFontBold = get('menufontbold');
        if (menuFontBold !== undefined) {
            const chk = document.getElementById('menuFontBold');
            const bold = toBool(menuFontBold);
            if (chk) chk.checked = bold;
            setVar('--menu-font-weight', bold ? '600' : '500');
        }

        // Tamanhos dos ícones do menu
        const menuIconSize = get('menuiconsize');
        if (menuIconSize !== undefined) {
            const el = document.getElementById('menuIconSize');
            if (el) el.value = parseInt(menuIconSize, 10) || 24;
            setVar('--menu-icon-size', toPx(menuIconSize));
        }

        // Configurações da página
        const pageFontFamily = get('pagefontfamily');
        if (pageFontFamily !== undefined) {
            const sel = document.getElementById('pageFontSelect');
            if (sel) sel.value = pageFontFamily;
            setVar('--page-font-family', pageFontFamily);
        }
        const pageTitleSize = get('pagetitlesize');
        if (pageTitleSize !== undefined) {
            const inp = document.getElementById('pageTitleSize');
            if (inp) inp.value = parseInt(pageTitleSize, 10) || 24;
            setVar('--page-title-size', toPx(pageTitleSize));
        }
        const pageTitleBold = get('pagetitlebold');
        if (pageTitleBold !== undefined) {
            const chk = document.getElementById('pageTitleBold');
            const bold = toBool(pageTitleBold);
            if (chk) chk.checked = bold;
            setVar('--page-title-weight', bold ? '600' : '400');
        }
        const pageSubtitleSize = get('pagesubtitlesize');
        if (pageSubtitleSize !== undefined) {
            const inp = document.getElementById('pageSubtitleSize');
            if (inp) inp.value = parseInt(pageSubtitleSize, 10) || 20;
            setVar('--page-subtitle-size', toPx(pageSubtitleSize));
        }
        const pageSubtitleBold = get('pagesubtitlebold');
        if (pageSubtitleBold !== undefined) {
            const chk = document.getElementById('pageSubtitleBold');
            const bold = toBool(pageSubtitleBold);
            if (chk) chk.checked = bold;
            setVar('--page-subtitle-weight', bold ? '600' : '400');
        }
        const pageDescSize = get('pagedessize');
        if (pageDescSize !== undefined) {
            const inp = document.getElementById('pageDescSize');
            if (inp) inp.value = parseInt(pageDescSize, 10) || 16;
            setVar('--page-desc-size', toPx(pageDescSize));
        }
        const pageDescBold = get('pagedescbold');
        if (pageDescBold !== undefined) {
            const chk = document.getElementById('pageDescBold');
            const bold = toBool(pageDescBold);
            if (chk) chk.checked = bold;
            setVar('--page-desc-weight', bold ? '600' : '400');
        }
    },

    updateLogoPreview(logoUrl) {
        const previewContainer = document.getElementById('logoPreviewContainer');
        const removeLogoBtn = document.getElementById('removeLogo');
        const sidebarLogo = document.getElementById('sidebarLogo');
        
        if (logoUrl) {
            if (previewContainer) {
                previewContainer.innerHTML = `<img src="${logoUrl}" alt="Logo" style="width: 48px; height: 48px; object-fit: contain; border-radius: 4px;">`;
            }
            
            if (removeLogoBtn) {
                removeLogoBtn.style.display = 'inline-block';
            }
            
            if (sidebarLogo) {
                sidebarLogo.src = logoUrl;
                sidebarLogo.style.display = 'block';
            }
        } else {
            if (previewContainer) {
                previewContainer.innerHTML = '<div class="logo-placeholder">Logo</div>';
            }
            
            if (removeLogoBtn) {
                removeLogoBtn.style.display = 'none';
            }
            
            if (sidebarLogo) {
                sidebarLogo.style.display = 'none';
            }
        }
    },

    uploadLogo() {
        const fileInput = document.getElementById('logoUpload');
        const file = fileInput.files[0];
        
        if (!file) return;
        
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml'];
        if (!validTypes.includes(file.type)) {
            alert('Por favor, selecione um arquivo de imagem válido (PNG, JPG, GIF ou SVG)');
            return;
        }
        
        if (file.size > 2 * 1024 * 1024) {
            alert('O arquivo deve ter no máximo 2MB');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const logoUrl = e.target.result;
            
            this.updateLogoPreview(logoUrl);
            
            if (window.PortalApp.authToken) {
                const config = { logoUrl: logoUrl };
                
                fetch(`${window.PortalApp.API_URL}/config`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${window.PortalApp.authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                })
                .then(response => {
                    if (response.ok) {
                        alert('Logo enviado com sucesso!');
                    } else {
                        alert('Erro ao salvar o logo');
                        this.updateLogoPreview(null);
                    }
                })
                .catch(err => {
                    alert('Erro ao enviar o logo');
                    this.updateLogoPreview(null);
                });
            }
        };
        
        reader.readAsDataURL(file);
    },

    removeLogo() {
        if (!window.PortalApp.authToken) {
            alert('Faça login como administrador');
            return;
        }
        
        if (!confirm('Tem certeza que deseja remover o logo?')) {
            return;
        }
        
        this.updateLogoPreview(null);
        
        const config = { logoUrl: null };
        
        fetch(`${window.PortalApp.API_URL}/config`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.PortalApp.authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => {
            if (response.ok) {
                alert('Logo removido com sucesso!');
            } else {
                alert('Erro ao remover o logo do servidor');
                this.loadConfig();
            }
        })
        .catch(err => {
            alert('Erro de conexão ao remover o logo');
            console.error('Erro:', err);
            this.loadConfig();
        });
    }
};

// Expor funções globais para compatibilidade
window.saveConfig = () => window.PortalConfig.saveConfig();
window.uploadLogo = () => window.PortalConfig.uploadLogo();
window.removeLogo = () => window.PortalConfig.removeLogo();
