window.PortalPages = {
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
            allowedAADGroups: p.AllowedAADGroups || p.allowedAADGroups || null
        }));
    },

    findMenuItemById(items, id) {
        for (const item of items || []) {
            if (item.id === id) return item;
            if (item.children && item.children.length) {
                const found = this.findMenuItemById(item.children, id);
                if (found) return found;
            }
        }
        return null;
    },

    setActiveMenuItem(clickedElement, itemId) {
        document.querySelectorAll('#menuContainer .menu-item').forEach(item => item.classList.remove('active'));

        let menuItem = clickedElement;
        if (!menuItem && itemId !== undefined && itemId !== null) {
            menuItem = document.querySelector(`#menuContainer .menu-item[data-item-id="${itemId}"]`);
        }

        if (menuItem) {
            menuItem.classList.add('active');
        }

        return menuItem;
    },

    expandMenuPathFromElement(menuItem) {
        if (!menuItem) return;

        if (menuItem.classList.contains('has-submenu')) {
            menuItem.classList.add('expanded');
            const submenu = menuItem.nextElementSibling;
            if (submenu && submenu.classList.contains('submenu')) {
                submenu.classList.add('show');
            }
        }

        let parent = menuItem.closest('.submenu');
        while (parent) {
            parent.classList.add('show');
            const parentButton = parent.previousElementSibling;
            if (parentButton && parentButton.classList.contains('has-submenu')) {
                parentButton.classList.add('expanded');
            }
            parent = parent.parentElement?.closest('.submenu');
        }
    },

    showOnlyView(viewId) {
        const home = document.getElementById('homeView');
        const group = document.getElementById('groupView');
        const page = document.getElementById('pageView');

        if (home) home.style.display = viewId === 'homeView' ? 'block' : 'none';
        if (group) group.style.display = viewId === 'groupView' ? 'block' : 'none';
        if (page) page.style.display = viewId === 'pageView' ? 'block' : 'none';
    },

    getGroupCardSubtitle(item) {
        if (item.type === 'category') {
            const count = Array.isArray(item.children) ? item.children.length : 0;
            return count === 1 ? 'Grupo • 1 item' : `Grupo • ${count} itens`;
        }

        const page = window.PortalApp.pagesData.find(p => p.id === item.pageId);
        return page?.subtitle || page?.description || 'Página do portal';
    },

    renderGroupCards(groupItem) {
        const container = document.getElementById('groupCards');
        if (!container) return;

        container.innerHTML = '';

        const children = [...(groupItem.children || [])].sort((a, b) => {
            const aOrder = a.order ?? 0;
            const bOrder = b.order ?? 0;
            if (aOrder === bOrder) return (a.id || 0) - (b.id || 0);
            return aOrder - bOrder;
        });

        if (children.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
                    <p>Este grupo ainda não possui itens cadastrados.</p>
                </div>
            `;
            return;
        }

        children.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'quick-access-card';

            const icon = item.icon || (item.type === 'category' ? '📁' : '📊');
            const title = item.name || 'Item sem nome';
            const subtitle = this.getGroupCardSubtitle(item);
            const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);

            card.innerHTML = `
                <div class="card-icon">${this.renderCardIcon(icon)}</div>
                <div class="card-content">
                    <h3 class="card-title">${escapeHtml(title)}</h3>
                    <p class="card-subtitle">${escapeHtml(subtitle)}</p>
                </div>
                <div class="card-arrow">→</div>
            `;

            card.style.animationDelay = `${0.05 + (index * 0.05)}s`;

            card.addEventListener('click', () => {
                if (item.type === 'category') {
                    this.loadGroupHome(item.id);
                    return;
                }

                if (item.pageId) {
                    this.loadPage(item.pageId);
                }
            });

            container.appendChild(card);
        });
    },

    loadGroupHome(groupId, clickedElement) {
        const groupItem = this.findMenuItemById(window.PortalApp.menuData, groupId);
        if (!groupItem) return;

        window.PortalApp.selectedPageId = null;
        window.PortalApp.selectedGroupId = groupId;

        this.showOnlyView('groupView');

        const pageTitleEl = document.getElementById('pageTitle');
        const pageSubtitleEl = document.getElementById('pageSubtitle');
        const groupTitleEl = document.getElementById('groupViewTitle');
        const groupSubtitleEl = document.getElementById('groupViewSubtitle');
        const groupSectionTitleEl = document.getElementById('groupViewSectionTitle');

        const childCount = Array.isArray(groupItem.children) ? groupItem.children.length : 0;
        const subtitle = childCount === 1
            ? 'Explore o item disponível neste grupo.'
            : `Explore os ${childCount} itens disponíveis neste grupo.`;

        if (pageTitleEl) pageTitleEl.textContent = groupItem.name || 'Grupo';
        if (pageSubtitleEl) pageSubtitleEl.textContent = subtitle;
        if (groupTitleEl) groupTitleEl.textContent = groupItem.name || 'Grupo';
        if (groupSubtitleEl) groupSubtitleEl.textContent = subtitle;
        if (groupSectionTitleEl) groupSectionTitleEl.textContent = `Itens em ${groupItem.name || 'Grupo'}`;

        const activeMenuItem = this.setActiveMenuItem(clickedElement, groupId);
        this.expandMenuPathFromElement(activeMenuItem);
        this.renderGroupCards(groupItem);
    },

    resolvePowerBIUrl(page) {
        const defaultUrl = page.powerbiUrl || '';
        const redirectUrl = page.redirectPowerBIUrl || '';
        const redirectEmails = page.redirectEmails || '';

        if (!redirectUrl || !redirectEmails || !window.PortalMicrosoftAuth || typeof window.PortalMicrosoftAuth.getSignedInEmail !== 'function') {
            return defaultUrl;
        }

        const signedInEmail = window.PortalMicrosoftAuth.getSignedInEmail();
        if (!signedInEmail) {
            return defaultUrl;
        }

        const normalizedEmail = signedInEmail.trim().toLowerCase();
        const allowedEmails = String(redirectEmails)
            .split(/[;,\n\r]+/)
            .map(item => item.trim().toLowerCase())
            .filter(Boolean);

        return allowedEmails.includes(normalizedEmail) ? redirectUrl : defaultUrl;
    },

    async loadPage(pageId, clickedElement) {
        const page = window.PortalApp.pagesData.find(p => p.id === pageId);
        if (!page) return;
        
        window.PortalApp.selectedPageId = pageId;
        window.PortalApp.selectedGroupId = null;
        this.showOnlyView('pageView');

        const headerTitleEl = document.querySelector('.page-title');
        const headerSubtitleEl = document.querySelector('.page-subtitle');
        if (headerTitleEl) headerTitleEl.textContent = page.title || '';
        if (headerSubtitleEl) headerSubtitleEl.textContent = page.subtitle || '';
        
        const descEl = document.getElementById('pageDescription');
        if (descEl) descEl.textContent = page.description || '';

        if (!clickedElement) {
            const menuItem = this.setActiveMenuItem(null, undefined) || document.querySelector(`#menuContainer .menu-item[data-page-id="${pageId}"]`);
            if (menuItem) {
                menuItem.classList.add('active');
                this.expandMenuPathFromElement(menuItem);
            }
        } else {
            const menuItem = clickedElement.closest('.menu-item') || clickedElement;
            this.setActiveMenuItem(menuItem);
            this.expandMenuPathFromElement(menuItem);
        }

        const container = document.getElementById('powerbiContainer');
        const refreshBtn = document.getElementById('refreshIframeBtn');
        
        if (container) {
            // NOVO: modo embed (App Owns Data) — usado quando UseEmbed=1 e GUIDs preenchidos
            if (page.useEmbed && page.embedWorkspaceId && page.embedReportId) {
                await this.renderEmbedded(container, page, refreshBtn);
            } else if (page.powerbiUrl) {
                if (window.PortalMicrosoftAuth && typeof window.PortalMicrosoftAuth.ensurePowerBIAccount === 'function') {
                    const canRenderReport = await window.PortalMicrosoftAuth.ensurePowerBIAccount(page);
                    if (!canRenderReport) {
                        container.innerHTML = `
                            <div class="placeholder placeholder--microsoft-auth">
                                <div class="powerbi-icon">🔐</div>
                                <h3 class="powerbi-placeholder-title">Abrindo autenticação Microsoft</h3>
                                <p class="powerbi-placeholder-desc">Escolha a conta Microsoft desejada para continuar no Power BI.</p>
                            </div>
                        `;

                        if (refreshBtn) refreshBtn.style.display = 'none';
                        return;
                    }
                }

                const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
                const effectivePowerBIUrl = this.resolvePowerBIUrl(page);
                container.innerHTML = `<iframe src="${escapeHtml(effectivePowerBIUrl)}" frameborder="0" allowFullScreen="true"></iframe>`;

                if (refreshBtn) {
                    refreshBtn.style.display = 'flex';

                    // Remover listeners antigos e adicionar novo
                    const newBtn = refreshBtn.cloneNode(true);
                    refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);

                    newBtn.addEventListener('click', () => {
                        const iframe = document.querySelector('#powerbiContainer iframe');
                        if (iframe) {
                            const icon = newBtn.querySelector('i');
                            if (icon) icon.style.animation = 'spin 0.5s linear';

                            const currentSrc = iframe.src;
                            iframe.src = '';
                            setTimeout(() => {
                                iframe.src = currentSrc;
                                if (icon) icon.style.animation = '';
                            }, 100);
                        }
                    });
                }
            } else {
                container.innerHTML = `<div class="placeholder"><div class="powerbi-icon">📊</div><h3 style="color:#666; margin-bottom:10px;">Power BI</h3><p style="color:#999; margin-bottom:20px;">Relatório sem link embed</p></div>`;

                if (refreshBtn) refreshBtn.style.display = 'none';
            }
        }

        // NOVO: Verificar tutorial após carregar a página
        console.log('[PAGES] Verificando tutorial para página:', pageId);
        await this.checkTutorial(pageId);
    },

    // NOVA FUNÇÃO: Verificar disponibilidade de tutorial
    async checkTutorial(pageId) {
        const tutorialBtn = document.getElementById('startTutorialBtn');
        
        if (!tutorialBtn) {
            console.warn('[TUTORIAL] ⚠️ Botão startTutorialBtn não encontrado no DOM');
            return;
        }

        console.log('[TUTORIAL] Botão encontrado, fazendo fetch...');

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/tutorials/page/${pageId}`);
            
            console.log('[TUTORIAL] Status da resposta:', response.status);
            
            if (response.ok) {
                const tutorial = await response.json();
                console.log('[TUTORIAL] ✅ Tutorial encontrado:', tutorial);
                console.log('[TUTORIAL] Número de passos:', tutorial.steps ? tutorial.steps.length : 0);
                
                // Mostrar botão
                tutorialBtn.style.display = 'flex';
                
                // Configurar evento de clique
                tutorialBtn.onclick = () => {
                    console.log('[TUTORIAL] 🎯 Botão clicado!');
                    
                    if (window.PortalTutorial) {
                        console.log('[TUTORIAL] Iniciando tutorial...');
                        window.PortalTutorial.startTutorial(pageId);
                    } else {
                        console.error('[TUTORIAL] ❌ PortalTutorial não está disponível');
                        alert('Erro: módulo de tutorial não carregado');
                    }
                };
                
                console.log('[TUTORIAL] ✅ Botão configurado e visível');
            } else {
                console.log('[TUTORIAL] ❌ Página sem tutorial (status ' + response.status + ')');
                tutorialBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('[TUTORIAL] ❌ Erro ao verificar tutorial:', error);
            tutorialBtn.style.display = 'none';
        }
    },

    showHome() {
        window.PortalApp.selectedPageId = null;
        window.PortalApp.selectedGroupId = null;
        this.showOnlyView('homeView');

        // Atualizar o título e subtítulo do header
        const pageTitleEl = document.getElementById('pageTitle');
        const pageSubtitleEl = document.getElementById('pageSubtitle');
        
        if (pageTitleEl) {
            const sidebarTitle = document.querySelector('.sidebar-title');
            const currentPortalName = sidebarTitle ? sidebarTitle.textContent : 'Power BI Dashboard';
            pageTitleEl.textContent = currentPortalName;
        }
        
        if (pageSubtitleEl) {
            pageSubtitleEl.textContent = 'Visão geral do portal de relatórios';
        }

        // Marcar Home como ativo
        document.querySelectorAll('#menuContainer .menu-item').forEach(item => item.classList.remove('active'));
        const firstBtn = document.querySelector('#menuContainer .menu-item');
        if (firstBtn) firstBtn.classList.add('active');
        
        // Carregar cards de acesso rápido
        this.loadQuickAccessCards();
    },

    loadQuickAccessCards() {
        const container = document.getElementById('quickAccessCards');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Obter páginas marcadas como acesso rápido e ordenar
        const quickAccessPages = window.PortalApp.pagesData
            .filter(page => page.showInHome !== false)
            .sort((a, b) => {
                const aOrder = a.order ?? 0;
                const bOrder = b.order ?? 0;
                if (aOrder === bOrder) {
                    return a.id - b.id;
                }
                return aOrder - bOrder;
            });
        
        if (quickAccessPages.length === 0) {
            const isAdmin = window.PortalApp.isAdmin;
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                    <p>Nenhum painel disponível para acesso rápido</p>
                    ${isAdmin ? '<p style="font-size: 12px; margin-top: 8px;">Adicione páginas no painel administrativo</p>' : ''}
                </div>
            `;
            return;
        }
        
        // Ícones padrão caso não tenha ícone personalizado
        const defaultIcons = ['📊', '📈', '📉', '💹', '📋', '📑', '💼', '🎯', '💰', '📌'];
        
        quickAccessPages.forEach((page, index) => {
            const card = document.createElement('div');
            card.className = 'quick-access-card';
            
            // Usar ícone da página ou ícone padrão
            const icon = page.icon || defaultIcons[index % defaultIcons.length];
            const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
            
            card.innerHTML = `
                <div class="card-icon">${this.renderCardIcon(icon)}</div>
                <div class="card-content">
                    <h3 class="card-title">${escapeHtml(page.title)}</h3>
                    ${page.subtitle ? `<p class="card-subtitle">${escapeHtml(page.subtitle)}</p>` : ''}
                </div>
                <div class="card-arrow">→</div>
            `;
            
            card.addEventListener('click', () => {
                this.loadPage(page.id);
            });
            
            container.appendChild(card);
        });
    },

    // -------- Power BI Embedded (App Owns Data) --------
    _powerbiLoading: null,
    loadPowerBIClient() {
        if (window['powerbi-client']) return Promise.resolve();
        if (this._powerbiLoading) return this._powerbiLoading;
        this._powerbiLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/vendor/powerbi-client/powerbi.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Falha ao carregar powerbi-client'));
            document.head.appendChild(s);
        });
        return this._powerbiLoading;
    },

    async renderEmbedded(container, page, refreshBtn) {
        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        try {
            await this.loadPowerBIClient();
        } catch (e) {
            container.innerHTML = `<div class="placeholder"><div class="powerbi-icon">!</div><p>Nao foi possivel carregar o powerbi-client: ${escapeHtml(e.message)}</p></div>`;
            if (refreshBtn) refreshBtn.style.display = 'none';
            return;
        }

        const token = window.PortalApp && window.PortalApp.authToken;
        let idToken = '';
        if (window.PortalMicrosoftAuth && typeof window.PortalMicrosoftAuth.getIdToken === 'function') {
            try { idToken = await window.PortalMicrosoftAuth.getIdToken({ promptIfMissing: true }); } catch (_) {}
        }
        const res = await fetch(`${window.PortalApp.API_URL}/embed/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(idToken ? { 'X-MS-Id-Token': idToken } : {})
            },
            body: JSON.stringify({
                pageId: page.id,
                workspaceId: page.embedWorkspaceId,
                reportId: page.embedReportId
            })
        });

        if (!res.ok) {
            let parsed = null;
            try { parsed = await res.json(); } catch (_) {}
            const pbiCode = parsed && parsed.body && (parsed.body.error?.code || parsed.body.error || parsed.body.errorCode);
            const portalError = parsed && parsed.error;

            // Caso 1: permissao do AAD/PBI nega o usuario
            if (portalError === 'forbidden') {
                container.innerHTML = `
                    <div class="placeholder">
                        <div class="powerbi-icon">🔒</div>
                        <h3 style="color:#b91c1c; margin-bottom:8px;">Sem permissao para este painel</h3>
                        <p style="color:#374151;">${escapeHtml(parsed?.message || '')}</p>
                        <p style="color:#6b7280; font-size:13px; margin-top:8px;">${escapeHtml(parsed?.hint || '')}</p>
                    </div>`;
            } else if (portalError === 'msal_required' || portalError === 'invalid_msal_token') {
                container.innerHTML = `
                    <div class="placeholder placeholder--microsoft-auth">
                        <div class="powerbi-icon">🔐</div>
                        <h3 class="powerbi-placeholder-title">Login Microsoft obrigatorio</h3>
                        <p class="powerbi-placeholder-desc">Este painel exige autenticacao Microsoft. Saia e entre novamente para confirmar sua conta.</p>
                    </div>`;
            }
            // JWT do portal expirou/faltou
            else if ((res.status === 401 || res.status === 403) && !pbiCode && !portalError) {
                container.innerHTML = `
                    <div class="placeholder placeholder--microsoft-auth">
                        <div class="powerbi-icon">🔐</div>
                        <h3 class="powerbi-placeholder-title">Acesso restrito</h3>
                        <p class="powerbi-placeholder-desc">Faça login no portal para visualizar este painel.</p>
                    </div>`;
            } else if (pbiCode === 'PowerBINotAuthorizedException' || (portalError === 'pbi-get' && res.status === 401)) {
                container.innerHTML = `
                    <div class="placeholder">
                        <div class="powerbi-icon">!</div>
                        <h3 style="color:#b91c1c; margin-bottom:8px;">Service Principal sem acesso a este workspace</h3>
                        <p style="color:#374151; max-width:560px; margin:0 auto 8px;">
                            O SP <code>Microsof-Fabric-PowerBI</code> nao e Member do workspace
                            <code>${escapeHtml(page.embedWorkspaceId)}</code>.
                        </p>
                        <p style="color:#6b7280; font-size:13px; max-width:560px; margin:0 auto;">
                            Em Power BI Service: abra o workspace - Manage access - Add people or groups - adicione o SP com role Member.
                        </p>
                    </div>`;
            } else if (portalError === 'generate-token' || (pbiCode && /license|capacity/i.test(pbiCode))) {
                container.innerHTML = `<div class="placeholder"><div class="powerbi-icon">!</div><h3 style="color:#b91c1c;">Capacity nao habilitada</h3><p>O workspace precisa estar em Fabric/Premium. Detalhe: ${escapeHtml(pbiCode || '')}</p></div>`;
            } else {
                const detail = parsed?.message || parsed?.error || `HTTP ${res.status}`;
                container.innerHTML = `<div class="placeholder"><div class="powerbi-icon">!</div><p>Erro ao obter embed token: ${escapeHtml(detail)}</p></div>`;
            }
            if (refreshBtn) refreshBtn.style.display = 'none';
            return;
        }

        const cfg = await res.json();
        container.innerHTML = '';
        const models = window['powerbi-client'].models;
        const embedConfig = {
            type: 'report',
            id: cfg.reportId,
            embedUrl: cfg.embedUrl,
            accessToken: cfg.accessToken,
            tokenType: models.TokenType.Embed,
            permissions: models.Permissions.Read,
            settings: {
                panes: {
                    filters: { expanded: false, visible: true },
                    pageNavigation: { visible: true }
                },
                background: models.BackgroundType.Default
            }
        };
        window.powerbi.reset(container);
        const report = window.powerbi.embed(container, embedConfig);

        if (refreshBtn) {
            refreshBtn.style.display = 'flex';
            const newBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
            newBtn.addEventListener('click', async () => {
                const icon = newBtn.querySelector('i');
                if (icon) icon.style.animation = 'spin 0.5s linear';
                try { await report.refresh(); } catch (_) {}
                if (icon) setTimeout(() => { icon.style.animation = ''; }, 500);
            });
        }
    },

    renderCardIcon(icon) {
        if (!icon) return '';
        
        if (window.PortalUtils) {
            if (window.PortalUtils.isSvgString(icon)) {
                return icon.replace('<svg', '<svg style="width:24px;height:24px;color:white;"');
            }
            
            if (window.PortalUtils.isIconClass(icon)) {
                return `<i class="${window.PortalUtils.escapeHtml(icon)}" style="color:white;font-size:24px;"></i>`;
            }
        }
        
        // Emoji ou texto
        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        return escapeHtml(icon);
    }
};

