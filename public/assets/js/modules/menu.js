window.PortalMenu = {
    normalizeMenu(items) {
        if (!items || !Array.isArray(items)) return [];
        return items.map(it => ({
            id: it.Id || it.id,
            name: it.Name || it.name || '',
            type: it.Type || it.type || 'item',
            pageId: it.PageId !== undefined ? it.PageId : (it.pageId || null),
            icon: it.Icon || it.icon || '',
            order: it.Order || it.order || 0,
            parentId: it.ParentId || it.parentId || null,
            children: this.normalizeMenu(it.children || it.Children || [])
        }));
    },

    renderMenu() {
        const container = document.getElementById('menuContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Renderizar botão Home
        this.renderHomeButton(container);
        
        // Renderizar itens do menu
        const sortedMenu = [...window.PortalApp.menuData].sort((a, b) => (a.order || 0) - (b.order || 0));
        sortedMenu.forEach(item => {
            const itemDiv = this.renderMenuItem(item, 0);
            container.appendChild(itemDiv);
        });
    },

    renderHomeButton(container) {
        const homeBtnWrapper = document.createElement('div');
        const homeBtn = document.createElement('button');
        homeBtn.className = 'menu-item';
        homeBtn.setAttribute('data-item-id', 'home');
        
        const homeMenuIcon = window.PortalConfig ? window.PortalConfig.homeMenuIcon : '🏠';
        const homeMenuName = window.PortalConfig ? window.PortalConfig.homeMenuName : 'Home';
        
        if (window.PortalIcons) {
            homeBtn.innerHTML = window.PortalIcons.renderIconHTML(homeMenuIcon);
        } else {
            homeBtn.innerHTML = `<span class="menu-icon">${homeMenuIcon}</span>`;
        }
        
        const homeSpan = document.createElement('span');
        homeSpan.textContent = homeMenuName;
        homeBtn.appendChild(homeSpan);
        
        homeBtn.onclick = () => {
            if (window.PortalPages) {
                window.PortalPages.showHome();
            }
        };
        
        homeBtnWrapper.appendChild(homeBtn);
        container.appendChild(homeBtnWrapper);
    },

    renderMenuItem(item, level = 0) {
        const div = document.createElement('div');
        
        if (item.type === 'category' && item.children && item.children.length > 0) {
            const button = document.createElement('button');
            button.className = 'menu-item has-submenu';
            button.setAttribute('data-item-id', item.id);
            
            if (level > 0) {
                button.style.paddingLeft = (20 + level * 15) + 'px';
            }
            
            const iconHtml = this.renderIconHTML(item.icon);
            button.innerHTML = iconHtml;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            button.appendChild(nameSpan);
            
            button.onclick = () => {
                button.classList.toggle('expanded');
                const submenu = button.nextElementSibling;
                if (submenu) submenu.classList.toggle('show');
            };
            
            const submenu = document.createElement('div');
            submenu.className = 'submenu';
            if (level > 0) {
                submenu.classList.add(`submenu-level-${level}`);
            }
            
            const sortedChildren = [...item.children].sort((a, b) => (a.order || 0) - (b.order || 0));
            sortedChildren.forEach(child => {
                const childDiv = this.renderMenuItem(child, level + 1);
                submenu.appendChild(childDiv);
            });
            
            div.appendChild(button);
            div.appendChild(submenu);
        } else if (item.type === 'category') {
            // Categoria vazia
            const button = document.createElement('button');
            button.className = 'menu-item has-submenu';
            button.setAttribute('data-item-id', item.id);
            
            if (level > 0) {
                button.style.paddingLeft = (20 + level * 15) + 'px';
            }
            
            const iconHtml = this.renderIconHTML(item.icon);
            button.innerHTML = iconHtml;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            button.appendChild(nameSpan);
            
            const submenu = document.createElement('div');
            submenu.className = 'submenu';
            const emptyMsg = document.createElement('div');
            emptyMsg.style.padding = (level === 0 ? '10px 40px' : `10px ${40 + level * 15}px`);
            emptyMsg.style.color = '#999';
            emptyMsg.style.fontSize = '12px';
            emptyMsg.textContent = '(vazio)';
            submenu.appendChild(emptyMsg);
            
            div.appendChild(button);
            div.appendChild(submenu);
        } else {
            // Item simples
            const button = document.createElement('button');
            button.className = `menu-item ${item.active ? 'active' : ''}`;
            button.style.paddingLeft = (20 + level * 15) + 'px';
            button.setAttribute('data-item-id', item.id);
            if (item.pageId) button.setAttribute('data-page-id', item.pageId);
            
            const iconHtml = this.renderIconHTML(item.icon);
            button.innerHTML = iconHtml;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            button.appendChild(nameSpan);
            
            button.onclick = function(e) { 
                if (window.PortalPages) {
                    window.PortalPages.loadPage(item.pageId, e.currentTarget); 
                }
            };
            div.appendChild(button);
        }
        
        return div;
    },

    renderIconHTML(icon) {
        if (!icon) {
            return '<span class="menu-icon"></span>';
        }
        
        if (window.PortalUtils) {
            if (window.PortalUtils.isSvgString(icon)) {
                return `<span class="menu-icon">${icon}</span>`;
            }
            
            if (window.PortalUtils.isIconClass(icon)) {
                return `<span class="menu-icon"><i class="${window.PortalUtils.escapeHtml(icon)}"></i></span>`;
            }
        }
        
        const span = document.createElement('span');
        span.className = 'menu-icon';
        span.textContent = String(icon);
        return span.outerHTML;
    }
};
