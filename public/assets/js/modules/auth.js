window.PortalAuth = {
    syncAuthUI() {
        const adminButton = document.getElementById('adminButton');
        if (adminButton) {
            adminButton.textContent = 'Configurações';
        }

        const adminChangePasswordButton = document.getElementById('adminChangePasswordButton');
        if (adminChangePasswordButton) {
            adminChangePasswordButton.style.display = window.PortalApp.currentUser ? 'inline-flex' : 'none';
        }
    },

    async checkAuth() {
        let authToken = window.PortalApp.authToken;
        if (!authToken) {
            authToken = sessionStorage.getItem('authToken');
            try {
                window.PortalApp.currentUser = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
            } catch(e) {
                window.PortalApp.currentUser = null;
            }
        }
        
        if (authToken) {
            console.log('Verifying token...');
            try {
                const response = await fetch(`${window.PortalApp.API_URL}/verify-token`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                
                console.log('Token verification response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    window.PortalApp.currentUser = data.user;
                    window.PortalApp.isAdmin = !!data.user.isAdmin;
                    window.PortalApp.authToken = authToken;
                    console.log('User verified:', window.PortalApp.currentUser, 'isAdmin:', window.PortalApp.isAdmin);
                    this.syncAuthUI();
                    await window.PortalData.loadDataFromAPI();
                    await window.PortalConfig.loadConfig();
                } else {
                    console.log('Token verification failed, clearing auth data');
                    this.clearAuth();
                    await window.PortalData.loadDataFromAPI();
                    await window.PortalConfig.loadConfig();
                }
            } catch (err) {
                console.error('Token verification failed:', err);
                this.clearAuth();
                await window.PortalData.loadDataFromAPI();
                await window.PortalConfig.loadConfig();
            }
        } else {
            console.log('No token found, loading as anonymous user');
            this.syncAuthUI();
            await window.PortalData.loadDataFromAPI();
            await window.PortalConfig.loadConfig();
        }
        
        // Chamar showHome após carregar as configurações
        if (window.PortalPages) {
            window.PortalPages.showHome();
        }
    },

    async doLogin() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');
        errorDiv.classList.remove('show');
        
        if (!username || !password) {
            errorDiv.textContent = 'Preencha todos os campos'; 
            errorDiv.classList.add('show'); 
            return;
        }
        
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            if (response.ok) {
                const data = await response.json();
                window.PortalApp.authToken = data.token;
                window.PortalApp.currentUser = data.user;
                window.PortalApp.isAdmin = !!data.user.isAdmin;
                sessionStorage.setItem('authToken', window.PortalApp.authToken);
                sessionStorage.setItem('currentUser', JSON.stringify(window.PortalApp.currentUser));
                document.getElementById('loginUsername').value = '';
                document.getElementById('loginPassword').value = '';
                document.getElementById('loginModal').classList.remove('show');
                if (window.PortalUI && typeof window.PortalUI.syncOverlayState === 'function') {
                    window.PortalUI.syncOverlayState();
                }
                this.syncAuthUI();
                await window.PortalData.loadDataFromAPI();
                if (window.PortalApp.isAdmin) {
                    setTimeout(() => {
                        if (window.PortalAdmin) {
                            window.PortalAdmin.openAdminPanel();
                        }
                    }, 300);
                } else {
                    alert('Login realizado com sucesso. Este usuario nao possui acesso administrativo ao portal.');
                }
            } else {
                errorDiv.textContent = 'Usuário ou senha inválidos'; 
                errorDiv.classList.add('show');
            }
        } catch (err) {
            console.error('Login error:', err);
            errorDiv.textContent = 'Erro ao conectar ao servidor. Verifique se está rodando.'; 
            errorDiv.classList.add('show');
        }
    },

    logout() {
        this.clearAuth();
        if (window.PortalAdmin) {
            window.PortalAdmin.closeAdminPanel();
        }
        
        if (window.PortalData.publicMenuCache) {
            window.PortalApp.menuData = window.PortalData.publicMenuCache || [];
        }
        if (window.PortalData.publicPagesCache) {
            window.PortalApp.pagesData = window.PortalData.publicPagesCache || [];
        }
        
        if (window.PortalMenu) {
            window.PortalMenu.renderMenu();
        }
        alert('Você saiu do modo administrativo');
    },

    openChangePasswordModal() {
        if (!window.PortalApp.authToken || !window.PortalApp.currentUser) {
            alert('Faça login para alterar sua senha.');
            return;
        }

        const modal = document.getElementById('changePasswordModal');
        const errorDiv = document.getElementById('changePasswordError');
        const currentPasswordInput = document.getElementById('currentPasswordInput');
        const newPasswordInput = document.getElementById('newPasswordInput');
        const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');

        if (errorDiv) {
            errorDiv.classList.remove('show');
            errorDiv.textContent = '';
        }

        if (currentPasswordInput) currentPasswordInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmNewPasswordInput) confirmNewPasswordInput.value = '';

        if (modal) {
            modal.classList.add('show');
        }

        if (window.PortalUI && typeof window.PortalUI.syncOverlayState === 'function') {
            window.PortalUI.syncOverlayState();
        }

        if (currentPasswordInput) currentPasswordInput.focus();
    },

    async doChangePassword() {
        const errorDiv = document.getElementById('changePasswordError');
        const currentPassword = document.getElementById('currentPasswordInput')?.value || '';
        const newPassword = document.getElementById('newPasswordInput')?.value || '';
        const confirmNewPassword = document.getElementById('confirmNewPasswordInput')?.value || '';

        if (errorDiv) {
            errorDiv.classList.remove('show');
            errorDiv.textContent = '';
        }

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            if (errorDiv) {
                errorDiv.textContent = 'Preencha todos os campos';
                errorDiv.classList.add('show');
            }
            return;
        }

        if (newPassword.length < 6) {
            if (errorDiv) {
                errorDiv.textContent = 'A nova senha deve ter pelo menos 6 caracteres';
                errorDiv.classList.add('show');
            }
            return;
        }

        if (newPassword !== confirmNewPassword) {
            if (errorDiv) {
                errorDiv.textContent = 'A confirmacao da nova senha nao confere';
                errorDiv.classList.add('show');
            }
            return;
        }

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/users/me/password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    this.clearAuth();
                    if (window.PortalUI && typeof window.PortalUI.closeChangePasswordModal === 'function') {
                        window.PortalUI.closeChangePasswordModal();
                    }
                    alert('Sua sessao expirou. Faça login novamente.');
                    return;
                }

                if (errorDiv) {
                    errorDiv.textContent = data.error || 'Nao foi possivel alterar a senha';
                    errorDiv.classList.add('show');
                }
                return;
            }

            if (window.PortalUI && typeof window.PortalUI.closeChangePasswordModal === 'function') {
                window.PortalUI.closeChangePasswordModal();
            }
            alert(data.message || 'Senha alterada com sucesso');
        } catch (err) {
            console.error('Change password error:', err);
            if (errorDiv) {
                errorDiv.textContent = 'Erro ao conectar ao servidor';
                errorDiv.classList.add('show');
            }
        }
    },

    clearAuth() {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('currentUser');
        window.PortalApp.authToken = null;
        window.PortalApp.currentUser = null;
        window.PortalApp.isAdmin = false;
        this.syncAuthUI();
    }
};

// Expor funções globais para compatibilidade
window.doLogin = () => window.PortalAuth.doLogin();
window.logout = () => window.PortalAuth.logout();
window.openChangePasswordModal = () => window.PortalAuth.openChangePasswordModal();
window.doChangePassword = () => window.PortalAuth.doChangePassword();
