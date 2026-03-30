window.PortalPages = {
    powerBIModalState: null,

    getMapDbCard() {
        return {
            title: 'MapDB',
            subtitle: 'Explorador de dependências de banco',
            icon: '🗺️',
            href: '/mapdb/'
        };
    },

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
                this.showPowerBIWaitingState(page);
                await this.openPowerBIWithAccountPrompt(page);
                
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
                            
                            const currentSrc = this.withCacheBuster(iframe.src);
                            iframe.src = 'about:blank';
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

        const mapDbCard = this.getMapDbCard();
        const card = document.createElement('div');
        card.className = 'quick-access-card';
        card.innerHTML = `
            <div class="card-icon">${this.renderCardIcon(mapDbCard.icon)}</div>
            <div class="card-content">
                <h3 class="card-title">${mapDbCard.title}</h3>
                <p class="card-subtitle">${mapDbCard.subtitle}</p>
            </div>
            <div class="card-arrow">→</div>
        `;

        card.addEventListener('click', () => {
            window.location.href = mapDbCard.href;
        });

        container.appendChild(card);
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
    },

    withCacheBuster(url) {
        try {
            const normalized = new URL(url, window.location.origin);
            normalized.searchParams.set('_portalTs', Date.now().toString());
            return normalized.toString();
        } catch (_) {
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}_portalTs=${Date.now()}`;
        }
    },

    renderPowerBIFrame(url) {
        const container = document.getElementById('powerbiContainer');
        if (!container) return;

        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        container.innerHTML = `<iframe src="${escapeHtml(this.withCacheBuster(url))}" frameborder="0" allowFullScreen="true"></iframe>`;
    },

    showPowerBIWaitingState(page) {
        const container = document.getElementById('powerbiContainer');
        if (!container) return;

        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        container.innerHTML = `
            <div class="powerbi-state">
                <div class="powerbi-state__card">
                    <div class="powerbi-state__icon">🔐</div>
                    <h3 class="powerbi-state__title">${escapeHtml(page.title || 'Painel Power BI')}</h3>
                    <p class="powerbi-state__text">Antes de carregar o relatório, escolha se deseja abrir direto ou tentar trocar a conta Microsoft desta sessão.</p>
                </div>
            </div>
        `;
    },

    showPowerBICancelledState(page) {
        const container = document.getElementById('powerbiContainer');
        if (!container) return;

        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        container.innerHTML = `
            <div class="powerbi-state">
                <div class="powerbi-state__card">
                    <div class="powerbi-state__icon">📊</div>
                    <h3 class="powerbi-state__title">Abertura cancelada</h3>
                    <p class="powerbi-state__text">O painel ${escapeHtml(page.title || '')} ainda não foi carregado. Você pode abrir direto ou tentar trocar a conta Microsoft antes de continuar.</p>
                    <div class="powerbi-state__actions">
                        <button type="button" class="btn" id="powerbiStateDirectBtn">Abrir direto</button>
                        <button type="button" class="btn btn-admin" id="powerbiStateSwitchBtn">Trocar conta Microsoft</button>
                    </div>
                </div>
            </div>
        `;

        const directBtn = document.getElementById('powerbiStateDirectBtn');
        const switchBtn = document.getElementById('powerbiStateSwitchBtn');
        if (directBtn) {
            directBtn.addEventListener('click', () => {
                this.openPowerBIWithAccountPrompt(page, 'direct-only');
            });
        }
        if (switchBtn) {
            switchBtn.addEventListener('click', () => {
                this.openPowerBIWithAccountPrompt(page, 'prefer-switch');
            });
        }
    },

    showPowerBILogoutProgressState(page) {
        const container = document.getElementById('powerbiContainer');
        if (!container) return;

        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        container.innerHTML = `
            <div class="powerbi-state">
                <div class="powerbi-state__card">
                    <div class="powerbi-state__spinner" aria-hidden="true"></div>
                    <h3 class="powerbi-state__title">Trocando conta Microsoft</h3>
                    <p class="powerbi-state__text">Tentando encerrar a sessão Microsoft atual antes de abrir ${escapeHtml(page.title || 'o painel')}. Se uma janela auxiliar abriu, conclua o fluxo nela.</p>
                </div>
            </div>
        `;
    },

    getPowerBIAccountModal() {
        const modal = document.getElementById('msAccountModal');
        const closeBtn = document.getElementById('msAccountModalClose');
        const directBtn = document.getElementById('msAccountDirectBtn');
        const switchBtn = document.getElementById('msAccountSwitchBtn');
        const lead = document.getElementById('msAccountModalLead');

        return { modal, closeBtn, directBtn, switchBtn, lead };
    },

    async promptPowerBIAccountChoice(page, mode = 'default') {
        const { modal, closeBtn, directBtn, switchBtn, lead } = this.getPowerBIAccountModal();
        if (!modal || !directBtn || !switchBtn || !lead) {
            return mode === 'prefer-switch' ? 'switch' : 'direct';
        }

        const escapeHtml = window.PortalUtils ? window.PortalUtils.escapeHtml : (text => text);
        lead.textContent = `Como deseja abrir o painel ${escapeHtml(page.title || 'selecionado')}?`;

        if (mode === 'direct-only') {
            return 'direct';
        }

        return new Promise(resolve => {
            const cleanup = () => {
                modal.classList.remove('is-open');
                modal.setAttribute('aria-hidden', 'true');
                directBtn.removeEventListener('click', onDirect);
                switchBtn.removeEventListener('click', onSwitch);
                modal.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeyDown);
                if (closeBtn) closeBtn.removeEventListener('click', onCancel);
            };

            const onDirect = () => {
                cleanup();
                resolve('direct');
            };

            const onSwitch = () => {
                cleanup();
                resolve('switch');
            };

            const onCancel = () => {
                cleanup();
                resolve('cancel');
            };

            const onBackdrop = (event) => {
                if (event.target === modal) {
                    onCancel();
                }
            };

            const onKeyDown = (event) => {
                if (event.key === 'Escape') {
                    onCancel();
                }
            };

            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            directBtn.addEventListener('click', onDirect);
            switchBtn.addEventListener('click', onSwitch);
            modal.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKeyDown);
            if (closeBtn) closeBtn.addEventListener('click', onCancel);
        });
    },

    async attemptMicrosoftLogout() {
        const popupWidth = 520;
        const popupHeight = 720;
        const left = Math.max(0, Math.round(window.screenX + ((window.outerWidth - popupWidth) / 2)));
        const top = Math.max(0, Math.round(window.screenY + ((window.outerHeight - popupHeight) / 2)));
        const features = `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top}`;
        const popup = window.open('/microsoft-logout-start.html', 'portalMicrosoftLogout', features);

        if (!popup) {
            alert('Não foi possível abrir a janela de logout da Microsoft. Verifique se o navegador bloqueou pop-ups para este portal.');
            return false;
        }

        popup.focus();

        return new Promise(resolve => {
            let finished = false;
            let timeoutId = null;
            let pollId = null;

            const cleanup = (result) => {
                if (finished) return;
                finished = true;
                window.removeEventListener('message', onMessage);
                if (timeoutId) window.clearTimeout(timeoutId);
                if (pollId) window.clearInterval(pollId);
                resolve(result);
            };

            const onMessage = (event) => {
                if (event.origin !== window.location.origin) return;
                if (event.data && event.data.type === 'portal-microsoft-logout-complete') {
                    cleanup(true);
                }
            };

            window.addEventListener('message', onMessage);

            pollId = window.setInterval(() => {
                if (popup.closed) {
                    cleanup(true);
                }
            }, 500);

            timeoutId = window.setTimeout(() => {
                cleanup(false);
            }, 15000);
        });
    },

    async openPowerBIWithAccountPrompt(page, mode = 'default') {
        const choice = await this.promptPowerBIAccountChoice(page, mode);

        if (choice === 'cancel') {
            this.showPowerBICancelledState(page);
            return;
        }

        if (choice === 'switch') {
            this.showPowerBILogoutProgressState(page);
            await this.attemptMicrosoftLogout();
        }

        this.renderPowerBIFrame(page.powerbiUrl);
    }
};

