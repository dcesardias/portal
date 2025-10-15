window.PortalSearch = {
    searchHistory: [],

    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput || !searchResults) return;
        
        let searchTimeout;
        
        // Carregar histórico de busca do localStorage
        try {
            this.searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        } catch(e) {
            this.searchHistory = [];
        }
        
        // Prevenir qualquer autocomplete do navegador
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.setAttribute('readonly', 'readonly');
        
        searchInput.addEventListener('focus', function() {
            this.removeAttribute('readonly');
            // Limpar se tiver "admin" no valor
            if (this.value === 'admin' || this.value.toLowerCase().includes('admin')) {
                this.value = '';
            }
        });
        
        searchInput.addEventListener('blur', function() {
            setTimeout(() => {
                this.setAttribute('readonly', 'readonly');
            }, 100);
        });
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                searchResults.style.display = 'none';
                return;
            }
            
            searchTimeout = setTimeout(() => {
                this.performSearch(query);
            }, 300);
        });
        
        searchInput.addEventListener('focus', () => {
            const query = searchInput.value.trim();
            if (query.length >= 2) {
                this.performSearch(query);
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });
    },

    performSearch(query) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        if (!query || query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }
        
        const lowerQuery = query.toLowerCase();
        const results = [];
        
        // Buscar nas páginas
        window.PortalApp.pagesData.forEach(page => {
            const titleMatch = page.title && page.title.toLowerCase().includes(lowerQuery);
            const subtitleMatch = page.subtitle && page.subtitle.toLowerCase().includes(lowerQuery);
            const descMatch = page.description && page.description.toLowerCase().includes(lowerQuery);
            
            if (titleMatch || subtitleMatch || descMatch) {
                results.push({
                    type: 'page',
                    id: page.id,
                    title: page.title,
                    subtitle: page.subtitle,
                    description: page.description,
                    relevance: titleMatch ? 3 : (subtitleMatch ? 2 : 1)
                });
            }
        });
        
        // Buscar no menu
        const searchMenuItems = (items, parentPath = '') => {
            items.forEach(item => {
                if (item.type === 'item' && item.pageId) {
                    const page = window.PortalApp.pagesData.find(p => p.id === item.pageId);
                    if (page) {
                        const nameMatch = item.name && item.name.toLowerCase().includes(lowerQuery);
                        if (nameMatch) {
                            results.push({
                                type: 'menu',
                                id: item.id,
                                pageId: item.pageId,
                                title: item.name,
                                subtitle: page.subtitle,
                                description: parentPath ? `Em: ${parentPath}` : '',
                                relevance: 2
                            });
                        }
                    }
                }
                
                if (item.children && item.children.length > 0) {
                    const newPath = parentPath ? `${parentPath} > ${item.name}` : item.name;
                    searchMenuItems(item.children, newPath);
                }
            });
        };
        
        searchMenuItems(window.PortalApp.menuData);
        
        results.sort((a, b) => b.relevance - a.relevance);
        
        if (results.length > 0) {
            searchResults.innerHTML = '';
            results.slice(0, 10).forEach(result => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                
                const badge = document.createElement('span');
                badge.className = 'result-type-badge';
                badge.textContent = result.type === 'page' ? 'Página' : 'Menu';
                
                const content = document.createElement('div');
                content.style.flex = '1';
                
                const title = document.createElement('div');
                title.className = 'result-title';
                title.innerHTML = this.highlightText(result.title || '', query);
                
                const desc = document.createElement('div');
                desc.className = 'result-desc';
                if (result.subtitle) {
                    desc.innerHTML = this.highlightText(result.subtitle, query);
                } else if (result.description) {
                    desc.innerHTML = this.highlightText(result.description.substring(0, 100), query);
                }
                
                content.appendChild(title);
                if (desc.innerHTML) content.appendChild(desc);
                
                div.appendChild(badge);
                div.appendChild(content);
                
                div.addEventListener('click', () => {
                    this.addToHistory(query);
                    document.getElementById('searchInput').value = '';
                    searchResults.style.display = 'none';
                    
                    if (result.type === 'page') {
                        if (window.PortalPages) {
                            window.PortalPages.loadPage(result.id);
                        }
                    } else if (result.type === 'menu' && result.pageId) {
                        if (window.PortalPages) {
                            window.PortalPages.loadPage(result.pageId);
                        }
                    }
                });
                
                searchResults.appendChild(div);
            });
            
            searchResults.style.display = 'block';
        } else {
            searchResults.innerHTML = '<div style="padding: 12px; color: #666; text-align: center;">Nenhum resultado encontrado</div>';
            searchResults.style.display = 'block';
        }
    },

    highlightText(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    },

    addToHistory(query) {
        if (!query || query.length < 2) return;
        // Remover duplicatas
        this.searchHistory = this.searchHistory.filter(item => item !== query);
        // Adicionar no início
        this.searchHistory.unshift(query);
        // Manter apenas últimos 10
        this.searchHistory = this.searchHistory.slice(0, 10);
        // Salvar
        try {
            localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
        } catch(e) {}
    }
};

// Expor função global para compatibilidade
window.setupSearch = () => window.PortalSearch.setupSearch();
