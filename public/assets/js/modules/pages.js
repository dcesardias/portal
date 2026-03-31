window.PortalPages = {
    normalizePages(pages) {
        return pages.map(p => ({
            id: p.Id || p.id,
            title: p.Title || p.title,
            subtitle: p.Subtitle || p.subtitle,
            description: p.Description || p.description,
            powerbiUrl: p.PowerBIUrl || p.powerbiUrl || '',
            showInHome: p.ShowInHome !== undefined ? p.ShowInHome : (p.showInHome !== false),
            icon: p.Icon || p.icon || null,
            order: p.Order !== undefined ? p.Order : (p.order || 0)
        }));
    },

    async loadPage(pageId, clickedElement) {
        const page = window.PortalApp.pagesData.find(p => p.id === pageId);
        if (!page) return;
        
        window.PortalApp.selectedPageId = pageId;
        const homeView = document.getElementById('homeView');
        const pageView = document.getElementById('pageView');
        
        if (homeView) homeView.style.display = 'none';
        if (pageView) pageView.style.display = 'block';

        const headerTitleEl = document.querySelector('.page-title');
        const headerSubtitleEl = document.querySelector('.page-subtitle');
        if (headerTitleEl) headerTitleEl.textContent = page.title || '';
        if (headerSubtitleEl) headerSubtitleEl.textContent = page.subtitle || '';
        
        const descEl = document.getElementById('pageDescription');
        if (descEl) descEl.textContent = page.description || '';

        document.querySelectorAll('#menuContainer .menu-item').forEach(item => item.classList.remove('active'));
        
        if (!clickedElement) {
            const menuItem = document.querySelector(`#menuContainer .menu-item[data-page-id="${pageId}"]`);
            if (menuItem) {
                menuItem.classList.add('active');
                let parent = menuItem.closest('.submenu');
                while (parent) {
                    parent.classList.add('show');
                    const parentButton = parent.previousElementSibling;
                    if (parentButton && parentButton.classList.contains('has-submenu')) {
                        parentButton.classList.add('expanded');
                    }
                    parent = parent.parentElement?.closest('.submenu');
                }
            }
        } else {
            const menuItem = clickedElement.closest('.menu-item') || clickedElement;
            if (menuItem) {
                menuItem.classList.add('active');
            }
        }

        const container = document.getElementById('powerbiContainer');
        const refreshBtn = document.getElementById('refreshIframeBtn');
        
        if (container) {
            if (page.powerbiUrl) {
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
                container.innerHTML = `<iframe src="${escapeHtml(page.powerbiUrl)}" frameborder="0" allowFullScreen="true"></iframe>`;
                
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
        const home = document.getElementById('homeView');
        const pageV = document.getElementById('pageView');
        if (home) home.style.display = 'block';
        if (pageV) pageV.style.display = 'none';

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

