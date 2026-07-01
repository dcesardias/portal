window.PortalData = {
    publicMenuCache: null,
    publicPagesCache: null,

    init() {
        // Tentar carregar cache do localStorage
        try { 
            this.publicMenuCache = JSON.parse(localStorage.getItem('publicMenuCache') || 'null'); 
        } catch(e) { 
            this.publicMenuCache = null; 
        }
        try { 
            this.publicPagesCache = JSON.parse(localStorage.getItem('publicPagesCache') || 'null'); 
        } catch(e) { 
            this.publicPagesCache = null; 
        }
    },

    async loadDataFromAPI() {
        const useAuth = !!window.PortalApp.authToken;
        try {
            // Carregar páginas
            const pagesResponse = await fetch(`${window.PortalApp.API_URL}/pages`, 
                useAuth ? { headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` } } : {}
            );
            
            if (pagesResponse.ok) {
                const pages = await pagesResponse.json();
                window.PortalApp.pagesData = this.normalizePages(pages);
                this.publicPagesCache = JSON.parse(JSON.stringify(window.PortalApp.pagesData));
                try { 
                    localStorage.setItem('publicPagesCache', JSON.stringify(this.publicPagesCache)); 
                } catch(e) { /* noop */ }
            } else {
                if (!useAuth && this.publicPagesCache) {
                    window.PortalApp.pagesData = this.publicPagesCache;
                } else {
                    window.PortalApp.pagesData = [];
                }
            }

            // Carregar menu
            const menuResponse = await fetch(`${window.PortalApp.API_URL}/menu`, 
                useAuth ? { headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` } } : {}
            );
            
            if (menuResponse.ok) {
                const menu = await menuResponse.json();
                window.PortalApp.menuData = this.normalizeMenu(menu);
                this.publicMenuCache = JSON.parse(JSON.stringify(window.PortalApp.menuData));
                try { 
                    localStorage.setItem('publicMenuCache', JSON.stringify(this.publicMenuCache)); 
                } catch(e) { /* noop */ }
            } else {
                if (!useAuth && this.publicMenuCache) {
                    window.PortalApp.menuData = this.publicMenuCache;
                } else if (this.publicMenuCache) {
                    window.PortalApp.menuData = this.publicMenuCache;
                } else {
                    window.PortalApp.menuData = [];
                }
            }

            // Renderizar menu após carregar dados
            if (window.PortalMenu) {
                window.PortalMenu.renderMenu();
            }
            
            // Atualizar listas admin se necessário
            if (window.PortalApp.isAdmin && window.PortalAdmin) {
                window.PortalAdmin.loadMenuStructure();
                window.PortalAdmin.loadPagesList();
                window.PortalAdmin.updatePageSelect();
            }

        } catch (err) {
            console.error('Erro ao carregar dados do servidor:', err);
            // Usar cache em caso de erro
            if (this.publicMenuCache) window.PortalApp.menuData = this.publicMenuCache;
            if (this.publicPagesCache) window.PortalApp.pagesData = this.publicPagesCache;
            
            if (window.PortalMenu) {
                window.PortalMenu.renderMenu();
            }
        }
    },

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

    normalizePages(pages) {
        return pages.map(p => ({
            id: p.Id || p.id,
            title: p.Title || p.title,
            subtitle: p.Subtitle || p.subtitle,
            description: p.Description || p.description,
            powerbiUrl: p.PowerBIUrl || p.powerbiUrl || '',
            redirectPowerBIUrl: p.RedirectPowerBIUrl || p.redirectPowerBIUrl || '',
            redirectEmails: p.RedirectEmails || p.redirectEmails || '',
            showInHome: p.ShowInHome !== undefined ? p.ShowInHome : (p.showInHome !== false),
            icon: p.Icon || p.icon || null,
            order: p.Order !== undefined ? p.Order : (p.order || 0),
            useEmbed: !!(p.UseEmbed !== undefined ? p.UseEmbed : p.useEmbed),
            embedWorkspaceId: p.EmbedWorkspaceId || p.embedWorkspaceId || '',
            embedReportId: p.EmbedReportId || p.embedReportId || '',
            allowedAADGroups: p.AllowedAADGroups || p.allowedAADGroups || null,
            embedRoles: p.EmbedRoles || p.embedRoles || '',
            redirectEmbedWorkspaceId: p.RedirectEmbedWorkspaceId || p.redirectEmbedWorkspaceId || '',
            redirectEmbedReportId: p.RedirectEmbedReportId || p.redirectEmbedReportId || '',
            isHomologation: !!(p.IsHomologation !== undefined ? p.IsHomologation : p.isHomologation),
            // HomologationStartedAt vem do SQL Server como Date que o JSON
            // serializa em ISO 8601 ('2026-05-28T00:00:00.000Z'). O <input
            // type="date"> precisa de 'YYYY-MM-DD' puro — pegamos os 10
            // primeiros caracteres. null/undefined viram null.
            homologationStartedAt: (() => {
                const raw = p.HomologationStartedAt !== undefined ? p.HomologationStartedAt : p.homologationStartedAt;
                if (!raw) return null;
                if (raw instanceof Date) return raw.toISOString().slice(0, 10);
                const s = String(raw);
                return s.length >= 10 ? s.slice(0, 10) : null;
            })()
        }));
    }
};
