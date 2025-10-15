window.PortalAuth = {
    async checkAuth() {
        let authToken = window.PortalApp.authToken;
        if (!authToken) {
            authToken = localStorage.getItem('authToken');
            try {
                window.PortalApp.currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
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
                    document.getElementById('adminButton').textContent = 'Configurações';
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
                localStorage.setItem('authToken', window.PortalApp.authToken);
                localStorage.setItem('currentUser', JSON.stringify(window.PortalApp.currentUser));
                document.getElementById('loginUsername').value = '';
                document.getElementById('loginPassword').value = '';
                document.getElementById('loginModal').classList.remove('show');
                document.getElementById('overlay').classList.remove('show');
                document.getElementById('adminButton').textContent = 'Configurações';
                await window.PortalData.loadDataFromAPI();
                setTimeout(() => {
                    if (window.PortalAdmin) {
                        window.PortalAdmin.openAdminPanel();
                    }
                }, 300);
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

    clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        window.PortalApp.authToken = null;
        window.PortalApp.currentUser = null;
        window.PortalApp.isAdmin = false;
        document.getElementById('adminButton').textContent = 'Configurações';
    }
};

// Expor funções globais para compatibilidade
window.doLogin = () => window.PortalAuth.doLogin();
window.logout = () => window.PortalAuth.logout();
