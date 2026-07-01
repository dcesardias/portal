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
            allowedAADGroups: p.AllowedAADGroups || p.allowedAADGroups || null,
            embedRoles: p.EmbedRoles || p.embedRoles || '',
            redirectEmbedWorkspaceId: p.RedirectEmbedWorkspaceId || p.redirectEmbedWorkspaceId || '',
            redirectEmbedReportId: p.RedirectEmbedReportId || p.redirectEmbedReportId || '',
            isHomologation: !!(p.IsHomologation !== undefined ? p.IsHomologation : p.isHomologation),
            homologationStartedAt: (() => {
                const raw = p.HomologationStartedAt !== undefined ? p.HomologationStartedAt : p.homologationStartedAt;
                if (!raw) return null;
                if (raw instanceof Date) return raw.toISOString().slice(0, 10);
                const s = String(raw);
                return s.length >= 10 ? s.slice(0, 10) : null;
            })()
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

    // Posiciona o #pbiDotsBlocker exatamente sobre os "..." da toolbar do PBI.
    // A posicao foi calibrada uma vez (left=392 com container=1010px) e
    // scaled proporcionalmente via ResizeObserver quando o container muda de
    // tamanho. Isso garante que o bloqueador acompanhe redimensionamentos
    // sem JS rodando continuamente.
    // Valores de referencia: REF_WIDTH=1010, REF_LEFT=377 (ligeiramente antes
    // do centro do botao para cobrir a borda esquerda), BTN_W=44px.
    _pbiBlockerObserver: null,
    _positionPbiBlocker() {
        const blocker = document.getElementById('pbiDotsBlocker');
        const shell = document.querySelector('.powerbi-shell');
        if (!blocker || !shell) return;

        // O "..." do PBI usa botoes de largura FIXA na action bar, entao
        // a posicao left nao muda quando a janela cresce — so muda quando
        // a janela fica estreita demais e o PBI colapsa botoes. Por isso
        // usamos left fixo (calibrado com left=392, -15px de margem = 377)
        // sem escala proporcional. O ResizeObserver re-aplica pra cobrir
        // mudancas de layout (sidebar colapsar, painel admin fechar etc).
        const FIXED_LEFT = 260; // cobre "Assinar" + "..." com margem dos dois lados

        const update = () => {
            blocker.style.left = FIXED_LEFT + 'px';
        };

        update();

        if (this._pbiBlockerObserver) this._pbiBlockerObserver.disconnect();
        if ('ResizeObserver' in window) {
            this._pbiBlockerObserver = new ResizeObserver(update);
            this._pbiBlockerObserver.observe(shell);
        }
    },

    // Header retratil: ativa o botao toggle apenas quando o usuario esta dentro
    // de um painel (pageView). Em homeView/groupView a classe e' removida pra
    // o cabecalho voltar (e o botao sumir). Preferencia colapsado/expandido
    // fica em sessionStorage e e' aplicada via _initHeaderCollapse().
    _updateHeaderCollapseVisibility(viewId) {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;
        if (viewId === 'pageView') {
            mainContent.classList.add('show-header-collapse');
        } else {
            mainContent.classList.remove('show-header-collapse');
        }
    },

    // Registra o click handler do botao de toggle e restaura a preferencia
    // salva em sessionStorage. Idempotente — guarda flag pra nao re-registrar.
    _initHeaderCollapse() {
        if (this._headerCollapseWired) return;
        const mainContent = document.querySelector('.main-content');
        const btn = document.getElementById('headerCollapseToggle');
        if (!mainContent || !btn) return;
        this._headerCollapseWired = true;

        try {
            const saved = sessionStorage.getItem('portal.headerCollapsed');
            if (saved === '1') mainContent.classList.add('header-collapsed');
        } catch (_) {}

        const updateLabel = () => {
            const collapsed = mainContent.classList.contains('header-collapsed');
            const label = collapsed ? 'Expandir cabeçalho' : 'Recolher cabeçalho';
            btn.title = label;
            btn.setAttribute('aria-label', label);
        };
        updateLabel();

        btn.addEventListener('click', () => {
            const collapsed = mainContent.classList.toggle('header-collapsed');
            try { sessionStorage.setItem('portal.headerCollapsed', collapsed ? '1' : '0'); } catch (_) {}
            updateLabel();
        });
    },

    showOnlyView(viewId) {
        const home = document.getElementById('homeView');
        const group = document.getElementById('groupView');
        const page = document.getElementById('pageView');

        if (home) home.style.display = viewId === 'homeView' ? 'block' : 'none';
        if (group) group.style.display = viewId === 'groupView' ? 'block' : 'none';
        if (page) page.style.display = viewId === 'pageView' ? 'flex' : 'none';

        this._initHeaderCollapse();
        this._updateHeaderCollapseVisibility(viewId);

        if (viewId === 'pageView') {
            // Aguarda um frame para o layout estar estabilizado antes de
            // calcular a posicao (o shell precisa ter largura definitiva).
            requestAnimationFrame(() => this._positionPbiBlocker());
        }
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

    // Extrai reportId/groupId de uma URL do Power BI Service no formato
    // /reportEmbed?reportId=...&groupId=...  Retorna null se o formato nao
    // bater (ex.: /view?r=... publish-to-web ou URL desconhecida). Usado pra
    // decidir se o caminho legacy pode subir pro SDK user-owns-data.
    _parseReportEmbedUrl(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            const u = new URL(url);
            if (!/app\.powerbi\.com$/i.test(u.hostname)) return null;
            if (!/reportEmbed/i.test(u.pathname)) return null;
            const reportId = u.searchParams.get('reportId');
            const groupId = u.searchParams.get('groupId');
            if (!reportId) return null;
            return { reportId, groupId: groupId || null, embedUrl: url };
        } catch (_) { return null; }
    },

    async loadPage(pageId, clickedElement) {
        const page = window.PortalApp.pagesData.find(p => p.id === pageId);
        if (!page) return;

        window.PortalApp.selectedPageId = pageId;
        window.PortalApp.selectedGroupId = null;
        // Persistir a page atual pra sobreviver a F5/reload. Chave separada
        // por rota (/ vs /homologa) — ver comentario em app.js.
        try {
            const key = (window.PortalApp && window.PortalApp.homologMode)
                ? 'portal.homologa.lastPageId'
                : 'portal.lastPageId';
            sessionStorage.setItem(key, String(pageId));
        } catch (_) {}
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
        const fullscreenBtn = document.getElementById('fullscreenIframeBtn');
        const exportWrap = document.getElementById('exportEmbedWrap');
        // Fullscreen/Export so sao expostos no modo embed; iframe legacy ja
        // tem botoes nativos do PBI Service. Esconde sempre que troca de
        // page; o branch embed re-ativa explicitamente.
        if (fullscreenBtn) fullscreenBtn.style.display = 'none';
        if (exportWrap) exportWrap.style.display = 'none';

        if (container) {
            // Para o auto-refresh de token de um embed anterior antes de trocar
            // de page (evita timers orfaos chamando setAccessToken num report ja
            // resetado). O branch embed reinicia quando aplicavel.
            if (this._embedTokenTimer) { clearTimeout(this._embedTokenTimer); this._embedTokenTimer = null; }

            // NOVO: modo embed (App Owns Data) — usado quando UseEmbed=1 e GUIDs preenchidos
            if (page.useEmbed && page.embedWorkspaceId && page.embedReportId) {
                await this.renderEmbedded(container, page, refreshBtn, fullscreenBtn, exportWrap);
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

                // --- Tentativa user-owns-data via SDK powerbi-client ---
                // Se a URL bate em /reportEmbed?reportId=...&groupId=... e o
                // MSAL conseguir um access token PBI silencioso (consent ja
                // dado), embedamos via SDK. Isso da controle do token no lado
                // do portal (renovacao silenciosa antes de expirar = nao tem
                // mais "sessao expirada" recarregando o iframe e zerando os
                // filtros). Se qualquer pre-condicao falhar, caimos pro iframe
                // atual — comportamento identico ao de hoje, zero regressao.
                let usedSdk = false;
                const parsed = this._parseReportEmbedUrl(effectivePowerBIUrl);
                if (parsed && window.PortalMicrosoftAuth && typeof window.PortalMicrosoftAuth.getPowerBIToken === 'function') {
                    try {
                        const tok = await window.PortalMicrosoftAuth.getPowerBIToken({ silentOnly: true });
                        if (tok && tok.accessToken) {
                            usedSdk = await this.renderUserOwnsData(container, page, refreshBtn, {
                                reportId: parsed.reportId,
                                embedUrl: parsed.embedUrl,
                                accessToken: tok.accessToken,
                                expiresOn: tok.expiresOn
                            });
                        }
                    } catch (e) {
                        console.warn('[USER-OWNS-DATA] tentativa falhou, usando iframe:', e && e.message);
                    }
                }

                if (!usedSdk) {
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
        // Sair de uma page (ir pra home) tambem limpa o estado persistido.
        // Chave separada por rota — ver comentario em app.js.
        try {
            const key = (window.PortalApp && window.PortalApp.homologMode)
                ? 'portal.homologa.lastPageId'
                : 'portal.lastPageId';
            sessionStorage.removeItem(key);
        } catch (_) {}
        this.showOnlyView('homeView');

        const isHomolog = !!(window.PortalApp && window.PortalApp.homologMode);

        // Atualizar o título e subtítulo do header
        const pageTitleEl = document.getElementById('pageTitle');
        const pageSubtitleEl = document.getElementById('pageSubtitle');

        if (pageTitleEl) {
            if (isHomolog) {
                pageTitleEl.textContent = 'Painéis em Homologação';
            } else {
                const sidebarTitle = document.querySelector('.sidebar-title');
                const currentPortalName = sidebarTitle ? sidebarTitle.textContent : 'Power BI Dashboard';
                pageTitleEl.textContent = currentPortalName;
            }
        }

        if (pageSubtitleEl) {
            pageSubtitleEl.textContent = isHomolog
                ? 'Painéis publicados para validação antes de irem para produção'
                : 'Visão geral do portal de relatórios';
        }

        // Marcar Home como ativo (no /homologa nao existe menu — no-op seguro)
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

        // Em /homologa (window.PortalApp.homologMode), filtra so paineis
        // marcados como IsHomologation=1; ordem segue o mesmo campo [Order].
        // Na home padrao, mantem comportamento legado (showInHome).
        const isHomolog = !!(window.PortalApp && window.PortalApp.homologMode);
        const quickAccessPages = window.PortalApp.pagesData
            .filter(page => isHomolog ? page.isHomologation === true : page.showInHome !== false)
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
            if (isHomolog) {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🧪</div>
                        <p>Nenhum painel em homologação no momento.</p>
                        ${isAdmin ? '<p style="font-size: 12px; margin-top: 8px;">Marque painéis como "Homologação" na tela administrativa.</p>' : ''}
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #999;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                        <p>Nenhum painel disponível para acesso rápido</p>
                        ${isAdmin ? '<p style="font-size: 12px; margin-top: 8px;">Adicione páginas no painel administrativo</p>' : ''}
                    </div>
                `;
            }
            return;
        }
        
        // Ícones padrão caso não tenha ícone personalizado
        const defaultIcons = ['📊', '📈', '📉', '💹', '📋', '📑', '💼', '🎯', '💰', '📌'];

        quickAccessPages.forEach((page, index) => {
            const card = document.createElement('div');
            card.className = 'quick-access-card';
            if (isHomolog) card.classList.add('quick-access-card--homolog');

            // Usar ícone da página ou ícone padrão
            const icon = page.icon || defaultIcons[index % defaultIcons.length];
            const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);

            // No modo homologacao, exibimos "Em homologacao ha X" calculado
            // a partir de page.homologationStartedAt. Se nao tem data, omite
            // a badge (admin ainda nao preencheu).
            const elapsedBadge = isHomolog
                ? this._renderHomologationElapsedBadge(page.homologationStartedAt)
                : '';

            card.innerHTML = `
                <div class="card-icon">${this.renderCardIcon(icon)}</div>
                <div class="card-content">
                    <h3 class="card-title">${escapeHtml(page.title)}</h3>
                    ${page.subtitle ? `<p class="card-subtitle">${escapeHtml(page.subtitle)}</p>` : ''}
                    ${elapsedBadge}
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

    // Embed do modo "user-owns-data" para paineis legados (URL /reportEmbed).
    // Usa o SDK powerbi-client + access token AAD do USUARIO (via MSAL) — sem
    // Service Principal/App Owns Data. Vantagem sobre o iframe cru: temos um
    // objeto `report` no contexto do portal, entao da pra renovar o token em
    // background (setAccessToken) ANTES de expirar — sem reload e sem perda
    // de filtros/slicers/drill.
    //
    // embedInfo: { reportId, embedUrl, accessToken, expiresOn }
    // Retorna true se subiu o SDK; false se o caller deve cair pro iframe.
    async renderUserOwnsData(container, page, refreshBtn, embedInfo) {
        try {
            await this.loadPowerBIClient();
        } catch (e) {
            console.warn('[USER-OWNS-DATA] falha ao carregar powerbi-client, fallback iframe:', e && e.message);
            return false;
        }
        if (!window['powerbi-client'] || !window.powerbi) return false;

        container.innerHTML = '';
        const models = window['powerbi-client'].models;
        const embedConfig = {
            type: 'report',
            id: embedInfo.reportId,
            embedUrl: embedInfo.embedUrl,
            accessToken: embedInfo.accessToken,
            tokenType: models.TokenType.Aad,
            permissions: models.Permissions.Read,
            settings: {
                panes: {
                    filters: { expanded: false, visible: false },
                    pageNavigation: { visible: true }
                },
                background: models.BackgroundType.Default
            }
        };

        let report;
        try {
            try { window.powerbi.reset(container); } catch (_) {}
            report = window.powerbi.embed(container, embedConfig);
        } catch (e) {
            console.warn('[USER-OWNS-DATA] powerbi.embed falhou, fallback iframe:', e && e.message);
            return false;
        }

        // --- Renovacao silenciosa do token AAD ---
        // acquireTokenSilent (dentro de getPowerBIToken) usa o refresh token
        // MSAL pra emitir um access token novo sem popup. setAccessToken troca
        // o token no SDK SEM recarregar o report — filtros sao preservados.
        const scheduleTokenRefresh = (expiresOnDate) => {
            if (this._embedTokenTimer) { clearTimeout(this._embedTokenTimer); this._embedTokenTimer = null; }
            const expMs = expiresOnDate instanceof Date
                ? expiresOnDate.getTime()
                : (expiresOnDate ? Date.parse(expiresOnDate) : NaN);
            // Renova 2min antes; minimo 10s; default 30min se sem expiresOn.
            const delay = Number.isFinite(expMs)
                ? Math.max(expMs - Date.now() - 120000, 10000)
                : 30 * 60 * 1000;
            this._embedTokenTimer = setTimeout(refreshToken, delay);
        };
        const refreshToken = async () => {
            try {
                const tok = await window.PortalMicrosoftAuth.getPowerBIToken({ silentOnly: true });
                if (!tok || !tok.accessToken) throw new Error('PBI token silent indisponivel');
                await report.setAccessToken(tok.accessToken);
                console.log('[USER-OWNS-DATA] token renovado em background — filtros preservados');
                scheduleTokenRefresh(tok.expiresOn);
            } catch (e) {
                console.warn('[USER-OWNS-DATA] renovacao falhou, nova tentativa em 60s:', e && e.message);
                this._embedTokenTimer = setTimeout(refreshToken, 60000);
            }
        };
        scheduleTokenRefresh(embedInfo.expiresOn);

        // Rede de seguranca: se o report emitir erro relacionado a token,
        // renova imediatamente em vez de esperar o timer.
        try {
            report.on('error', (ev) => {
                const detail = (ev && ev.detail) || {};
                const msg = String(detail.message || detail.errorCode || '');
                if (/tokenexpired|expired|401|403/i.test(msg)) {
                    console.warn('[USER-OWNS-DATA] erro de token detectado, renovando:', msg);
                    refreshToken();
                }
            });
        } catch (_) {}

        // Botao "Atualizar painel": usa report.refresh() (atualiza dados
        // preservando filtros) em vez do reload do iframe que zerava o estado.
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

        return true;
    },

    // Busca um embed token sem nenhum efeito de UI — usado pela renovacao
    // silenciosa em background. Retorna o cfg parseado ou null.
    async _fetchEmbedToken(page) {
        const token = window.PortalApp && window.PortalApp.authToken;
        let idToken = '';
        if (window.PortalMicrosoftAuth && typeof window.PortalMicrosoftAuth.getIdToken === 'function') {
            // promptIfMissing:false — uma renovacao em background nunca deve
            // abrir popup de login Microsoft pro usuario.
            try { idToken = await window.PortalMicrosoftAuth.getIdToken({ promptIfMissing: false }); } catch (_) {}
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
        if (!res.ok) return null;
        return res.json();
    },

    async renderEmbedded(container, page, refreshBtn, fullscreenBtn, exportWrap) {
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
                        <p style="color:#374151; margin-top:18px; font-size:14px;">
                            Para solicitar acesso a este painel, envie um email para
                            <strong style="color:#0066cc;">bi@aacd.org.br</strong>
                        </p>
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
                    // Painel de filtros sempre oculto — AACD nao utiliza filtros
                    // nativos do Power BI em nenhum painel.
                    filters: { expanded: false, visible: false },
                    pageNavigation: { visible: true }
                },
                background: models.BackgroundType.Default
            }
        };
        window.powerbi.reset(container);
        const report = window.powerbi.embed(container, embedConfig);

        // --- Renovacao silenciosa do embed token ---
        // O embed token expira (validade = min entre a vida do token AAD e
        // 60min). Sem renovar, o relatorio trava apos alguns minutos e, ao
        // re-navegar, perde filtros/slicers/drill. setAccessToken troca o token
        // SEM recarregar o report, preservando todo o estado interativo.
        const scheduleTokenRefresh = (expirationIso) => {
            if (this._embedTokenTimer) { clearTimeout(this._embedTokenTimer); this._embedTokenTimer = null; }
            const expMs = Date.parse(expirationIso);
            // Renova 2min antes de expirar; minimo 10s pra cobrir tokens curtos.
            const delay = expMs ? Math.max(expMs - Date.now() - 120000, 10000) : 60000;
            this._embedTokenTimer = setTimeout(refreshToken, delay);
        };
        const refreshToken = async () => {
            try {
                const fresh = await this._fetchEmbedToken(page);
                if (!fresh || !fresh.accessToken) throw new Error('resposta sem accessToken');
                await report.setAccessToken(fresh.accessToken);
                console.log('[EMBED] token renovado em background — filtros/estado preservados');
                scheduleTokenRefresh(fresh.expiration);
            } catch (e) {
                console.warn('[EMBED] falha ao renovar token, nova tentativa em 30s:', e && e.message);
                this._embedTokenTimer = setTimeout(refreshToken, 30000);
            }
        };
        scheduleTokenRefresh(cfg.expiration);

        // Rede de seguranca: se o report emitir erro de token expirado, renova
        // imediatamente em vez de esperar o timer.
        try {
            report.off('error');
            report.on('error', (ev) => {
                const detail = (ev && ev.detail) || {};
                const msg = String(detail.message || detail.errorCode || '');
                if (/tokenexpired|expired|401|403/i.test(msg)) {
                    console.warn('[EMBED] erro de token detectado, renovando:', msg);
                    refreshToken();
                }
            });
        } catch (_) {}

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

        if (fullscreenBtn) {
            fullscreenBtn.style.display = 'flex';
            const newFs = fullscreenBtn.cloneNode(true);
            fullscreenBtn.parentNode.replaceChild(newFs, fullscreenBtn);
            newFs.addEventListener('click', () => {
                try { report.fullscreen(); } catch (e) {
                    console.warn('[EMBED] fullscreen falhou:', e && e.message);
                }
            });
        }

        if (exportWrap) {
            exportWrap.style.display = 'block';
            this._wireExportButton(exportWrap, page, report);
        }
    },

    // Liga o botao Export do embed. Click no botao principal toggle o menu;
    // click numa opcao dispara: (a) report.print() do SDK (browser dialog),
    // ou (b) export server-side (POST /api/embed/export) com polling +
    // download.
    _wireExportButton(exportWrap, page, report) {
        // Re-cria o wrapper inteiro pra zerar listeners de pages anteriores.
        const fresh = exportWrap.cloneNode(true);
        exportWrap.parentNode.replaceChild(fresh, exportWrap);

        const btn = fresh.querySelector('#exportEmbedBtn');
        const menu = fresh.querySelector('#exportEmbedMenu');
        const opts = fresh.querySelectorAll('#exportEmbedMenu button');
        if (!btn || !menu) return;

        const closeMenu = () => { menu.hidden = true; };
        const toggleMenu = () => { menu.hidden = !menu.hidden; };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.classList.contains('is-loading')) return;
            toggleMenu();
        });
        document.addEventListener('click', (e) => {
            if (!fresh.contains(e.target)) closeMenu();
        });

        opts.forEach((opt) => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                closeMenu();
                const action = opt.getAttribute('data-action');
                if (action === 'print') {
                    // report.print() do SDK PBI: rapido, mas o iframe imprime
                    // a si mesmo — nosso @media print CSS do portal NAO se
                    // aplica (cabecalho/rodape e orientacao sao controlados
                    // pelo PBI/navegador via o conteudo do iframe). Default
                    // paisagem.
                    try {
                        await report.print();
                    } catch (err) {
                        console.warn('[EMBED EXPORT] print falhou:', err);
                        alert('Falha ao abrir a impressao do navegador: ' + (err && err.message));
                    }
                    return;
                }
                const format = opt.getAttribute('data-format');
                if (format) await this._runExport(btn, page, format);
            });
        });
    },

    async _runExport(btn, page, format) {
        if (btn.classList.contains('is-loading')) return;
        btn.classList.add('is-loading');
        try {
            const idToken = (window.PortalMicrosoftAuth && typeof window.PortalMicrosoftAuth.getIdToken === 'function')
                ? await window.PortalMicrosoftAuth.getIdToken({ promptIfMissing: true })
                : '';
            if (!idToken) {
                alert('E necessario estar logado na conta Microsoft para exportar.');
                return;
            }
            // 1) Inicia export
            const startRes = await fetch(`${window.PortalApp.API_URL}/embed/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-MS-Id-Token': idToken },
                body: JSON.stringify({ pageId: page.id, format })
            });
            const startBody = await startRes.json().catch(() => ({}));
            if (!startRes.ok || !startBody.exportId) {
                alert(`Falha ao iniciar export: ${startBody.message || startBody.error || startRes.status}`);
                return;
            }
            const exportId = startBody.exportId;

            // 2) Polling do status (max ~3min: 60 tentativas x 3s)
            let done = false;
            for (let i = 0; i < 60 && !done; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const statusRes = await fetch(
                    `${window.PortalApp.API_URL}/embed/export/status?pageId=${page.id}&exportId=${encodeURIComponent(exportId)}`,
                    { headers: { 'X-MS-Id-Token': idToken } }
                );
                const statusBody = await statusRes.json().catch(() => ({}));
                if (statusBody.status === 'Succeeded') { done = true; break; }
                if (statusBody.status === 'Failed') {
                    alert(`Export falhou no Power BI: ${JSON.stringify(statusBody).slice(0,300)}`);
                    return;
                }
            }
            if (!done) {
                alert('Export demorou demais (mais de 3min). Tente novamente em alguns minutos.');
                return;
            }

            // 3) Download do arquivo. Como o endpoint exige header X-MS-Id-Token,
            //    nao da pra usar <a href> direto — buscamos como blob e
            //    disparamos download via objectURL.
            const fileRes = await fetch(
                `${window.PortalApp.API_URL}/embed/export/file?pageId=${page.id}&exportId=${encodeURIComponent(exportId)}&format=${format}`,
                { headers: { 'X-MS-Id-Token': idToken } }
            );
            if (!fileRes.ok) {
                alert(`Falha ao baixar arquivo: HTTP ${fileRes.status}`);
                return;
            }
            const blob = await fileRes.blob();
            const ext = format === 'PPTX' ? 'pptx' : format === 'PNG' ? 'png' : 'pdf';
            const filename = `${(page.title || 'painel').replace(/[^\w.-]+/g, '_')}.${ext}`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error('[EMBED EXPORT]', e);
            alert(`Erro inesperado no export: ${e && e.message}`);
        } finally {
            btn.classList.remove('is-loading');
        }
    },

    // Calcula "Em homologacao ha X dias/semanas/meses" a partir da data
    // de publicacao (YYYY-MM-DD). Retorna string HTML pronta para colar
    // no card, ou string vazia se a data nao for valida. Granularidade:
    //   - 0 dias  -> "hoje"
    //   - 1-6     -> "ha N dia(s)"
    //   - 7-29    -> "ha N semana(s)" (arredondado pra baixo)
    //   - 30+     -> "ha N mes(es)"   (aproximacao 30 dias = 1 mes)
    _renderHomologationElapsedBadge(startedAt) {
        if (!startedAt) return '';
        // 'YYYY-MM-DD' interpretado como local (sem UTC shift). Usamos
        // construtor (yyyy, mm-1, dd) para evitar diferenca de fuso.
        const m = String(startedAt).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return '';
        const start = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        if (isNaN(start.getTime())) return '';

        const today = new Date();
        const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diffMs = todayMid.getTime() - start.getTime();
        if (diffMs < 0) return ''; // data futura — nao renderiza

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        let label;
        if (diffDays === 0) {
            label = 'Em homologação desde hoje';
        } else if (diffDays === 1) {
            label = 'Em homologação há 1 dia';
        } else if (diffDays < 7) {
            label = `Em homologação há ${diffDays} dias`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            label = weeks === 1 ? 'Em homologação há 1 semana' : `Em homologação há ${weeks} semanas`;
        } else {
            const months = Math.floor(diffDays / 30);
            label = months === 1 ? 'Em homologação há 1 mês' : `Em homologação há ${months} meses`;
        }

        // Title com a data formatada PT-BR para hover.
        const fmtDay = String(start.getDate()).padStart(2, '0');
        const fmtMonth = String(start.getMonth() + 1).padStart(2, '0');
        const fmtYear = start.getFullYear();
        const titleStr = `Publicado em ${fmtDay}/${fmtMonth}/${fmtYear}`;

        return `<p class="card-homolog-elapsed" title="${titleStr}">
            <i class="fas fa-clock" aria-hidden="true"></i> ${label}
        </p>`;
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

