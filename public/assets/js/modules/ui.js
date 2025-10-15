window.PortalUI = {
    initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        
        document.documentElement.setAttribute('data-theme', theme);
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.style.transform = 'scale(0.95)';
            setTimeout(() => {
                toggle.style.transform = 'scale(1)';
            }, 150);
        }
    },

    setupComponents() {
        this.setupThemeToggle();
        this.setupSidebar();
        this.setupAdminButton();
        this.setupLoginButton();
        this.setupLoginModal(); // Nova função para configurar o modal
        this.setupMenuTypeSelect();
        this.setupIconInputs();
        this.setupLogoUpload();
        this.clearSearchInput();
        
        if (window.PortalSearch) {
            window.PortalSearch.setupSearch();
        }
        
        if (window.PortalIcons) {
            window.PortalIcons.buildAllPalettes();
        }
    },

    setupThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme);
        }
    },

    setupSidebar() {
        const sidebar = document.getElementById('sidebar');
        const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
        if (sidebarCloseBtn && sidebar) {
            sidebarCloseBtn.addEventListener('click', (e) => {
                sidebar.classList.toggle('collapsed');
                sidebarCloseBtn.title = sidebar.classList.contains('collapsed') 
                    ? 'Expandir menu' : 'Retrair menu';
            });
        }
    },

    setupAdminButton() {
        const adminBtn = document.getElementById('adminButton');
        if (adminBtn) {
            adminBtn.addEventListener('click', () => {
                if (window.PortalAdmin) {
                    window.PortalAdmin.toggleAdmin();
                }
            });
        }
    },

    setupLoginButton() {
        const loginBtn = document.getElementById('loginButton');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                if (window.PortalAuth) {
                    window.PortalAuth.doLogin();
                }
            });
        }
    },

    setupMenuTypeSelect() {
        const menuTypeSelect = document.getElementById('menuTypeSelect');
        if (menuTypeSelect) {
            menuTypeSelect.addEventListener('change', function() {
                const type = this.value;
                const parentSelectGroup = document.getElementById('parentSelectGroup');
                const pageSelectGroup = document.getElementById('pageSelectGroup');
                
                if (type === 'category') {
                    if (parentSelectGroup) parentSelectGroup.style.display = 'block';
                    if (pageSelectGroup) {
                        pageSelectGroup.style.display = 'none';
                        const pageSelect = document.getElementById('pageSelect');
                        if (pageSelect) pageSelect.value = '';
                    }
                } else {
                    if (parentSelectGroup) parentSelectGroup.style.display = 'block';
                    if (pageSelectGroup) pageSelectGroup.style.display = 'block';
                }
            });
            
            // Disparar evento inicial
            menuTypeSelect.dispatchEvent(new Event('change'));
        }
    },

    setupIconInputs() {
        // Menu icon input
        const iconInput = document.getElementById('menuIconInput');
        if (iconInput && window.PortalIcons) {
            iconInput.addEventListener('input', (e) => {
                window.PortalIcons.updateIconPreview(e.target.value);
                window.PortalIcons.setDropdownValueForIcon(e.target.value);
            });
            if (iconInput.value) {
                window.PortalIcons.updateIconPreview(iconInput.value);
                window.PortalIcons.setDropdownValueForIcon(iconInput.value);
            }
        }
        
        // Page icon input
        const pageIconInput = document.getElementById('pageIconInput');
        if (pageIconInput && window.PortalIcons) {
            pageIconInput.addEventListener('input', (e) => {
                window.PortalIcons.updatePageIconPreview(e.target.value);
                window.PortalIcons.setPageDropdownValueForIcon(e.target.value);
            });
            if (pageIconInput.value) {
                window.PortalIcons.updatePageIconPreview(pageIconInput.value);
                window.PortalIcons.setPageDropdownValueForIcon(pageIconInput.value);
            }
        }
        
        // Home icon input
        const homeIconInput = document.getElementById('homeIconInput');
        if (homeIconInput && window.PortalIcons) {
            homeIconInput.addEventListener('input', (e) => {
                window.PortalIcons.updateHomeIconPreview(e.target.value);
                window.PortalIcons.setHomeDropdownValueForIcon(e.target.value);
            });
            if (homeIconInput.value) {
                window.PortalIcons.updateHomeIconPreview(homeIconInput.value);
                window.PortalIcons.setHomeDropdownValueForIcon(homeIconInput.value);
            }
        }
    },

    setupLogoUpload() {
        const logoUploadInput = document.getElementById('logoUpload');
        if (logoUploadInput && window.PortalConfig) {
            logoUploadInput.addEventListener('change', () => {
                window.PortalConfig.uploadLogo();
            });
        }
    },

    clearSearchInput() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => {
                searchInput.value = '';
                searchInput.setAttribute('value', '');
            }, 100);
            
            searchInput.addEventListener('focus', function() {
                if (this.value === 'admin' || this.value.toLowerCase().includes('admin')) {
                    this.value = '';
                }
            });
        }
    },

    setupLoginModal() {
        // Configurar fechamento do modal de login
        const overlay = document.getElementById('overlay');
        const loginModal = document.getElementById('loginModal');
        
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                // Fechar modal se clicar no overlay (fundo)
                if (e.target === overlay) {
                    this.closeLoginModal();
                }
            });
        }
        
        // Adicionar evento de tecla ESC para fechar modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (loginModal && loginModal.classList.contains('show')) {
                    this.closeLoginModal();
                }
            }
        });
        
        // Se não existe botão de fechar, criar um
        if (loginModal && !loginModal.querySelector('.modal-close-btn')) {
            this.addCloseButtonToLoginModal();
        }
    },

    addCloseButtonToLoginModal() {
        const loginModal = document.getElementById('loginModal');
        if (!loginModal) return;
        
        // Procurar o cabeçalho do modal
        let modalHeader = loginModal.querySelector('.modal-header');
        if (!modalHeader) {
            // Se não existe cabeçalho, procurar o primeiro elemento com texto
            const h2 = loginModal.querySelector('h2');
            if (h2) {
                // Criar um wrapper para o cabeçalho
                modalHeader = document.createElement('div');
                modalHeader.className = 'modal-header';
                modalHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
                
                // Mover o h2 para dentro do header
                h2.parentNode.insertBefore(modalHeader, h2);
                modalHeader.appendChild(h2);
            }
        }
        
        if (modalHeader) {
            // Criar botão de fechar
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close-btn';
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                font-size: 24px;
                color: #999;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s ease;
            `;
            
            // Adicionar hover effect
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.backgroundColor = '#f0f0f0';
                closeBtn.style.color = '#333';
            });
            
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.backgroundColor = 'transparent';
                closeBtn.style.color = '#999';
            });
            
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeLoginModal();
            });
            
            modalHeader.appendChild(closeBtn);
        }
    },

    closeLoginModal() {
        const loginModal = document.getElementById('loginModal');
        const overlay = document.getElementById('overlay');
        const errorDiv = document.getElementById('loginError');
        
        if (loginModal) {
            loginModal.classList.remove('show');
        }
        
        if (overlay) {
            overlay.classList.remove('show');
        }
        
        // Limpar campos do formulário
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');
        
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        
        // Limpar mensagem de erro
        if (errorDiv) {
            errorDiv.classList.remove('show');
            errorDiv.textContent = '';
        }
    },

    // ...existing code...
};

// Expor funções globais para compatibilidade
window.toggleTheme = () => window.PortalUI.toggleTheme();
window.closeLoginModal = () => window.PortalUI.closeLoginModal(); // Nova função global
window.switchTab = (tab, event) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    if (event && event.target) event.target.classList.add('active');
    
    const tabContent = document.getElementById(tab + 'Tab');
    if (tabContent) tabContent.classList.add('active');
};
