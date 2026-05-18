//admin.js - Versão completa atualizada com Tutorial Builder

// Função auxiliar para garantir que o modal do Tutorial Builder existe
function ensureTutorialBuilderModal() {
    if (document.getElementById('tutorialBuilderModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'tutorialBuilderModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;backdrop-filter:blur(2px);background:rgba(0,0,0,0.55)';
    modal.innerHTML = [
        '<div style="position:absolute;inset:30px;display:flex;flex-direction:column;">',
        '  <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">',
        '    <button id="closeTutorialBuilderBtn" aria-label="Fechar" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px 12px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.2);font-size:18px;">×</button>',
        '  </div>',
        '  <div style="flex:1;min-height:0;background:#1f1f1f;border-radius:10px;overflow:hidden;border:1px solid #333;">',
        '    <iframe id="tutorialBuilderIframe" src="" title="Tutorial Builder" style="width:100%;height:100%;border:0;display:block;"></iframe>',
        '  </div>',
        '</div>'
    ].join('');
    document.body.appendChild(modal);
}

// Inicializar modal quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTutorialBuilderModal);
} else {
    ensureTutorialBuilderModal();
}

window.PortalAdmin = {

    toggleAdmin() {
        if (!window.PortalApp.isAdmin) {
            document.getElementById('loginModal').classList.add('show');
            document.getElementById('overlay').classList.add('show');
            document.getElementById('loginUsername').focus();
        } else {
            // Migração drawer → página dedicada: o botão "Configurações" agora
            // navega para /admin. O drawer (openAdminPanel) ainda existe como
            // fallback para chamadas legadas, mas não é mais o caminho principal.
            window.location.href = '/admin#/paginas';
        }
    },

    openAdminPanel() {
        const panel = document.getElementById('adminPanel');
        panel.classList.add('show');
        panel.setAttribute('aria-hidden', 'false');
        if (window.PortalUI && typeof window.PortalUI.syncOverlayState === 'function') {
            window.PortalUI.syncOverlayState();
        } else {
            document.getElementById('overlay').classList.add('show');
        }
        
        const savedWidth = localStorage.getItem('adminPanelWidth');
        if (savedWidth) {
            panel.style.width = savedWidth + 'px';
        }
        
        this.loadPagesList();
        this.loadMenuStructure();
        this.updatePageSelect();
        this.loadUsersList();
        this.loadDataDictionaries();
        
        // Inicializar dropdowns de ícones - com delay maior para garantir que o DOM está pronto
        if (window.PortalIcons) {
            setTimeout(() => {
                console.log('[Admin] Inicializando paletas de ícones...');
                if (typeof window.PortalIcons.buildAllPalettes === 'function') {
                    window.PortalIcons.buildAllPalettes();
                    console.log('[Admin] ✅ Paletas de ícones inicializadas');
                } else {
                    console.warn('[Admin] ⚠️ PortalIcons.buildAllPalettes não é uma função');
                }
            }, 500);
        } else {
            console.warn('[Admin] ⚠️ PortalIcons não está disponível');
        }
        
        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo && sidebarLogo.src && sidebarLogo.style.display !== 'none' && window.PortalConfig) {
            window.PortalConfig.updateLogoPreview(sidebarLogo.src);
        }
        
        document.getElementById('overlay').onclick = () => this.closeAdminPanel();

        // Esc fecha o painel — registrado uma única vez.
        if (!this._escListenerInstalled) {
            this._escListenerInstalled = true;
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                const panel = document.getElementById('adminPanel');
                if (!panel || !panel.classList.contains('show')) return;
                // Não fecha se houver modal de confirmação ou modal de form aberto.
                if (document.querySelector('.admin-confirm-overlay')) return;
                if (document.getElementById('adminModalOverlay')) return;
                this.closeAdminPanel();
            });
        }
    },

    closeAdminPanel() {
        const panel = document.getElementById('adminPanel');
        panel.classList.remove('show');
        panel.setAttribute('aria-hidden', 'true');
        if (window.PortalUI && typeof window.PortalUI.syncOverlayState === 'function') {
            window.PortalUI.syncOverlayState();
        } else {
            document.getElementById('overlay').classList.remove('show');
        }
    },

    // NOVO MÉTODO: openTutorialBuilder
    openTutorialBuilder(pageId) {
        console.log('[TutorialBuilder] Abrindo builder para página:', pageId);
        
        // Garante que o modal existe
        ensureTutorialBuilderModal();
        
        const modal = document.getElementById('tutorialBuilderModal');
        const iframe = document.getElementById('tutorialBuilderIframe');
        const closeBtn = document.getElementById('closeTutorialBuilderBtn');
        
        if (!modal || !iframe || !closeBtn) {
            console.error('[TutorialBuilder] Modal não encontrado no DOM');
            // Fallback: abre em nova aba se o modal falhar
            window.open(`/tutorial-builder.html?pageId=${pageId}`, 'TutorialBuilder');
            return;
        }

        // Configura o iframe com a URL do builder
        iframe.src = `/tutorial-builder.html?pageId=${pageId}`;
        
        // Mostra o modal
        modal.style.display = 'block';
        
        // Previne scroll do body
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Função para fechar o modal
        const close = () => {
            iframe.src = ''; // Limpa o iframe
            modal.style.display = 'none';
            document.body.style.overflow = prevOverflow || '';
        };

        // Botão de fechar
        closeBtn.onclick = close;
        
        // Fecha ao clicar fora do conteúdo
        modal.onclick = (e) => {
            const path = e.composedPath ? e.composedPath() : [];
            const insideContent = path.some(el => el && el.style && el.style.minHeight === '0');
            if (!insideContent) close();
        };
        
        // Fecha com ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },

    // Método auxiliar para adicionar botão de Tutorial Builder na lista de páginas
    addTutorialButtonToPage(pageId, container) {
        const tutorialBtn = document.createElement('button');
        tutorialBtn.className = 'btn-small';
        tutorialBtn.style.cssText = 'background: #0066cc; color: white;';
        tutorialBtn.title = 'Tutorial Builder';
        tutorialBtn.textContent = '📚';
        tutorialBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openTutorialBuilder(pageId);
        });
        container.appendChild(tutorialBtn);
    },

    loadPagesList() {
        const container = document.getElementById('pagesList');
        if (!container) return;

        // Criar barra de busca uma vez
        if (!document.getElementById('pagesSearchBar')) {
            const bar = document.createElement('div');
            bar.id = 'pagesSearchBar';
            bar.className = 'pages-search-bar';
            bar.innerHTML = `
                <i class="fa fa-search search-icon" aria-hidden="true"></i>
                <input type="text" id="pagesSearchInput" placeholder="Filtrar por título ou subtítulo..." autocomplete="off">
                <span id="pagesSearchCount" class="pages-search-count"></span>
            `;
            container.parentNode.insertBefore(bar, container);
            document.getElementById('pagesSearchInput').addEventListener('input', () => this._renderPagesList());
        }

        this._pagesListSorted = [...window.PortalApp.pagesData].sort((a, b) => {
            const ao = a.order ?? 0, bo = b.order ?? 0;
            return ao !== bo ? ao - bo : a.id - b.id;
        });
        this._renderPagesList();
    },

    _renderPagesList() {
        const container = document.getElementById('pagesList');
        if (!container) return;

        const filter = (document.getElementById('pagesSearchInput')?.value || '').toLowerCase().trim();
        const sorted = this._pagesListSorted || [];
        const pages = filter
            ? sorted.filter(p =>
                (p.title || '').toLowerCase().includes(filter) ||
                (p.subtitle || '').toLowerCase().includes(filter))
            : sorted;

        const countEl = document.getElementById('pagesSearchCount');
        if (countEl) countEl.textContent = filter ? `${pages.length} de ${sorted.length}` : `${sorted.length} página(s)`;

        container.innerHTML = '';

        if (pages.length === 0) {
            container.innerHTML = '<div class="admin-placeholder">Nenhuma página encontrada.</div>';
            return;
        }

        // Drag-and-drop só faz sentido para páginas que aparecem no Acesso Rápido
        // — a ordem controla os cards na home. Para "Outras páginas" (não-home),
        // a ordem é irrelevante. Também desligado quando há filtro ativo (índices
        // visuais não corresponderiam à lista real).
        const dragEnabled = !filter;

        const quickAccessPages = pages.filter(p => p.showInHome !== false);
        const otherPages = pages.filter(p => p.showInHome === false);

        // ---------- Seção 1: Acesso Rápido (ordenável) ----------
        const quickSection = document.createElement('section');
        quickSection.className = 'pages-section';
        quickSection.innerHTML = `
            <header class="pages-section-head">
                <h2><i class="fas fa-bolt" aria-hidden="true"></i> Acesso rápido <span class="pages-section-count">${quickAccessPages.length}</span></h2>
                <p>Aparecem como cards na home do portal. ${dragEnabled ? 'Arraste pelo <strong>⠿</strong> para reordenar.' : 'A reordenação é desativada quando há um filtro ativo.'}</p>
            </header>
            <div class="menu-list pages-section-list" id="pagesListQuickAccess"></div>
        `;
        container.appendChild(quickSection);
        const quickList = quickSection.querySelector('#pagesListQuickAccess');
        if (quickAccessPages.length === 0) {
            quickList.innerHTML = '<div class="admin-placeholder">Nenhuma página marcada para o Acesso Rápido. Edite uma página e marque <em>"Mostrar na tela inicial"</em>.</div>';
        } else {
            quickAccessPages.forEach(page => quickList.appendChild(this._buildPageRow(page, { draggable: dragEnabled })));
        }

        // ---------- Seção 2: Outras páginas (não ordenável) ----------
        const otherSection = document.createElement('section');
        otherSection.className = 'pages-section';
        otherSection.innerHTML = `
            <header class="pages-section-head">
                <h2><i class="fas fa-folder" aria-hidden="true"></i> Outras páginas <span class="pages-section-count">${otherPages.length}</span></h2>
                <p>Não aparecem na home. Acessíveis pelo menu lateral ou por links diretos.</p>
            </header>
            <div class="menu-list pages-section-list" id="pagesListOther"></div>
        `;
        container.appendChild(otherSection);
        const otherList = otherSection.querySelector('#pagesListOther');
        if (otherPages.length === 0) {
            otherList.innerHTML = '<div class="admin-placeholder">Nenhuma página fora do Acesso Rápido.</div>';
        } else {
            otherPages.forEach(page => otherList.appendChild(this._buildPageRow(page, { draggable: false })));
        }

        if (dragEnabled && quickAccessPages.length > 1) this._initPagesDragDrop(quickList);
    },

    // Helper que constrói uma linha de página. Extraído para ser usado pelas duas seções.
    _buildPageRow(page, { draggable }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'menu-item-wrapper';
        wrapper.dataset.id = String(page.id);
        if (draggable) wrapper.draggable = true;

        const item = document.createElement('div');
        item.className = 'menu-list-item';

        if (draggable) {
            const handle = document.createElement('span');
            handle.className = 'menu-drag-handle';
            handle.innerHTML = '<i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>';
            handle.title = 'Arrastar para reordenar';
            item.appendChild(handle);
        }

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'flex:1;min-width:0;';

        let badges = '';
        if (page.icon) badges += '<span class="page-list-badge badge-blue" title="Tem ícone personalizado">🎨</span>';
        if (page.redirectPowerBIUrl && page.redirectEmails) badges += '<span class="page-list-badge badge-purple">REDIRECT</span>';
        if (page.useEmbed && page.embedWorkspaceId && page.embedReportId) badges += '<span class="page-list-badge badge-green" title="Renderizado via Power BI Embedded">EMBED</span>';
        const menuLinks = this._countMenuLinksToPage(page.id);
        if (menuLinks > 0) badges += `<span class="page-list-badge badge-green" title="${menuLinks} item(ns) do menu apontam para esta página">${menuLinks}× menu</span>`;

        infoDiv.innerHTML = `
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:3px;">
                <strong>${this._escHtml(page.title || 'Sem título')}</strong>
                ${badges}
            </div>
            <small style="color:var(--text-secondary);">${this._escHtml(page.subtitle || 'Sem subtítulo')}</small>
        `;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'menu-list-item-actions';
        actionsDiv.style.flexShrink = '0';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-small btn-edit';
        editBtn.textContent = 'Editar';
        editBtn.addEventListener('click', () => this.editPage(page.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-small btn-delete';
        deleteBtn.textContent = 'Excluir';
        deleteBtn.addEventListener('click', () => this.deletePage(page.id));

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        this.addTutorialButtonToPage(page.id, actionsDiv);

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) {
                wrapper.draggable = false;
                requestAnimationFrame(() => { if (draggable) wrapper.draggable = true; });
            }
        }, true);

        item.appendChild(infoDiv);
        item.appendChild(actionsDiv);
        wrapper.appendChild(item);
        return wrapper;
    },

    _escHtml(str) {
        const d = document.createElement('div');
        d.textContent = String(str ?? '');
        return d.innerHTML;
    },

    _countMenuLinksToPage(pageId) {
        let n = 0;
        const scan = (items) => {
            for (const it of items) {
                if (it.pageId === pageId) n++;
                if (it.children && it.children.length) scan(it.children);
            }
        };
        if (Array.isArray(window.PortalApp.menuData)) scan(window.PortalApp.menuData);
        return n;
    },

    // ===================== MODAIS =====================

    openPageModal(pageId) {
        this._closeAdminModal();
        const isEdit = !!pageId;
        const page = isEdit ? window.PortalApp.pagesData.find(p => p.id === pageId) : null;
        if (isEdit && !page) {
            window.adminConfirm({ title: 'Página não encontrada', message: 'Pode ter sido removida por outra sessão.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        window.PortalApp.editingPageId = pageId || null;

        const overlay = document.createElement('div');
        overlay.id = 'adminModalOverlay';
        overlay.className = 'admin-modal-overlay';
        overlay.addEventListener('click', (e) => { e.stopPropagation(); });

        overlay.innerHTML = `
        <div class="admin-modal admin-modal--page" role="dialog" aria-modal="true" aria-labelledby="pageModalTitle">
            <div class="admin-modal-header">
                <h3 id="pageModalTitle">${isEdit ? 'Editar página' : 'Nova página'}</h3>
                <button class="admin-modal-close" onclick="closeAdminModal()" aria-label="Fechar">&times;</button>
            </div>
            <div class="admin-modal-body">
                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Conteúdo</legend>
                    <div class="form-group">
                        <label for="pageNameInput">Título da página <span aria-hidden="true">*</span></label>
                        <input type="text" id="pageNameInput" placeholder="Ex: Dashboard de Vendas">
                    </div>
                    <div class="form-group">
                        <label for="pageSubtitleInput">Subtítulo</label>
                        <input type="text" id="pageSubtitleInput" placeholder="Ex: Análise detalhada de vendas">
                    </div>
                    <div class="form-group">
                        <label for="pageDescInput">Descrição</label>
                        <textarea id="pageDescInput" rows="3" placeholder="Descrição detalhada da página…"></textarea>
                    </div>
                </fieldset>

                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Power BI</legend>
                    <p class="admin-fieldset-hint">URL principal do dashboard embed (modo iframe legado).</p>
                    <div class="form-group">
                        <label for="powerbiUrlInput">URL do Power BI Embed</label>
                        <input type="text" id="powerbiUrlInput" placeholder="https://app.powerbi.com/view?r=…">
                    </div>
                </fieldset>

                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Power BI Embedded <span class="admin-legend-tag">(App Owns Data)</span></legend>
                    <p class="admin-fieldset-hint">Quando ligado, o portal gera embed token via Service Principal em vez de usar a URL iframe acima. Permissoes refletem o "Manage access" do workspace/report.</p>
                    <div class="form-group">
                        <label class="admin-checkbox-row">
                            <input type="checkbox" id="useEmbedCheckbox">
                            <span><strong>Usar Power BI Embedded</strong></span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label for="embedUrlPasteInput">Cole URL do Power BI Service (auto-extrai IDs)</label>
                        <input type="text" id="embedUrlPasteInput" placeholder="https://app.fabric.microsoft.com/groups/{workspaceId}/reports/{reportId}?…">
                    </div>
                    <div class="form-group">
                        <label for="embedWorkspaceIdInput">Workspace ID (GUID)</label>
                        <input type="text" id="embedWorkspaceIdInput" placeholder="00000000-0000-0000-0000-000000000000">
                    </div>
                    <div class="form-group">
                        <label for="embedReportIdInput">Report ID (GUID)</label>
                        <input type="text" id="embedReportIdInput" placeholder="00000000-0000-0000-0000-000000000000">
                    </div>
                </fieldset>

                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Redirecionamento condicional <span class="admin-legend-tag">(opcional)</span></legend>
                    <p class="admin-fieldset-hint">URL alternativa usada quando o usuário Microsoft logado estiver na lista de e-mails abaixo.</p>
                    <div class="form-group">
                        <label for="redirectPowerbiUrlInput">URL alternativa</label>
                        <input type="text" id="redirectPowerbiUrlInput" placeholder="https://app.powerbi.com/view?r=…">
                    </div>
                    <div class="form-group">
                        <label for="redirectEmailsInput">E-mails Microsoft</label>
                        <textarea id="redirectEmailsInput" rows="3" placeholder="usuario1@aacd.org.br&#10;usuario2@aacd.org.br"></textarea>
                        <small class="admin-help">Um e-mail por linha. Aceita vírgula ou ponto e vírgula.</small>
                    </div>
                </fieldset>

                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Aparência e visibilidade</legend>
                    <div class="form-group">
                        <label class="admin-checkbox-row">
                            <input type="checkbox" id="showInHomeCheckbox">
                            <span>Mostrar na tela inicial (Acesso Rápido)</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label for="pageIconInput">Ícone do card</label>
                        <div class="admin-inline-row">
                            <input type="text" id="pageIconInput" placeholder="Ex: 📊 ou escolha abaixo" class="admin-flex-1">
                            <div id="pageIconPreview" class="icon-preview" title="Preview do ícone"></div>
                        </div>
                        <div id="pageIconDropdown" class="admin-dropdown">
                            <div id="pageIconDropdownToggle" class="admin-dropdown-toggle">
                                <span id="pageIconDropdownSelected" class="admin-inline-row"><span class="admin-muted">Selecione um ícone…</span></span>
                                <span class="admin-dropdown-caret">›</span>
                            </div>
                            <div id="pageIconDropdownMenu" class="admin-dropdown-menu" style="display:none;"></div>
                        </div>
                    </div>
                </fieldset>
            </div>
            <div class="admin-modal-actions">
                <button class="btn" onclick="closeAdminModal()">Cancelar</button>
                <button class="btn btn-admin" id="savePageBtn" onclick="savePage()">${isEdit ? 'Atualizar página' : 'Criar página'}</button>
            </div>
        </div>`;

        // Inserir dentro do adminPanel para herdar estilos CSS dos dropdowns
        const adminPanel = document.getElementById('adminPanel');
        (adminPanel || document.body).appendChild(overlay);

        // Preencher campos se editando
        if (isEdit && page) {
            document.getElementById('pageNameInput').value = page.title || '';
            document.getElementById('pageSubtitleInput').value = page.subtitle || '';
            document.getElementById('pageDescInput').value = page.description || '';
            document.getElementById('powerbiUrlInput').value = page.powerbiUrl || '';
            document.getElementById('redirectPowerbiUrlInput').value = page.redirectPowerBIUrl || '';
            document.getElementById('redirectEmailsInput').value = page.redirectEmails || '';
            document.getElementById('showInHomeCheckbox').checked = page.showInHome !== false;
            document.getElementById('pageIconInput').value = (window.PortalIcons ? window.PortalIcons.svgToKey(page.icon) : page.icon) || '';
            document.getElementById('useEmbedCheckbox').checked = !!page.useEmbed;
            document.getElementById('embedWorkspaceIdInput').value = page.embedWorkspaceId || '';
            document.getElementById('embedReportIdInput').value = page.embedReportId || '';
        }

        // Auto-extrair IDs ao colar URL do Power BI Service
        const pasteInput = document.getElementById('embedUrlPasteInput');
        if (pasteInput) {
            pasteInput.addEventListener('input', () => {
                const m = pasteInput.value.match(/groups\/([0-9a-fA-F-]{36})\/reports\/([0-9a-fA-F-]{36})/);
                if (m) {
                    document.getElementById('embedWorkspaceIdInput').value = m[1];
                    document.getElementById('embedReportIdInput').value = m[2];
                }
            });
        }

        // Inicializar icon input handler e paletas
        this._setupModalIconInputs('page');
        document.getElementById('pageNameInput').focus();
    },

    openMenuItemModal(menuItemId) {
        this._closeAdminModal();
        const isEdit = !!menuItemId;
        const item = isEdit ? this.findMenuItemById(window.PortalApp.menuData, menuItemId) : null;
        if (isEdit && !item) {
            window.adminConfirm({ title: 'Item não encontrado', message: 'Pode ter sido removido por outra sessão.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        window.PortalApp.editingMenuId = menuItemId || null;

        const overlay = document.createElement('div');
        overlay.id = 'adminModalOverlay';
        overlay.className = 'admin-modal-overlay';
        overlay.addEventListener('click', (e) => { e.stopPropagation(); });

        overlay.innerHTML = `
        <div class="admin-modal admin-modal--page" role="dialog" aria-modal="true" aria-labelledby="menuModalTitle">
            <div class="admin-modal-header">
                <h3 id="menuModalTitle">${isEdit ? 'Editar item do menu' : 'Novo item do menu'}</h3>
                <button class="admin-modal-close" onclick="closeAdminModal()" aria-label="Fechar">&times;</button>
            </div>
            <div class="admin-modal-body">
                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Identificação</legend>
                    <div class="form-group">
                        <label for="menuItemInput">Nome do item <span aria-hidden="true">*</span></label>
                        <input type="text" id="menuItemInput" placeholder="Ex: Financeiro">
                    </div>
                    <div class="form-group">
                        <label for="menuTypeSelect">Tipo</label>
                        <select id="menuTypeSelect">
                            <option value="item">Item simples (vai para uma página)</option>
                            <option value="category">Categoria (agrupa subitens)</option>
                        </select>
                    </div>
                </fieldset>

                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Aparência</legend>
                    <div class="form-group">
                        <label for="menuIconInput">Ícone</label>
                        <div class="admin-inline-row">
                            <input type="text" id="menuIconInput" placeholder="Ex: 📊 ou fas fa-chart" class="admin-flex-1">
                            <div id="menuIconPreview" class="icon-preview" title="Preview do ícone"></div>
                        </div>
                        <div id="iconDropdown" class="admin-dropdown">
                            <div id="iconDropdownToggle" class="admin-dropdown-toggle">
                                <span id="iconDropdownSelected" class="admin-inline-row"><span class="admin-muted">Selecione um ícone…</span></span>
                                <span class="admin-dropdown-caret">›</span>
                            </div>
                            <div id="iconDropdownMenu" class="admin-dropdown-menu" style="display:none;"></div>
                        </div>
                    </div>
                </fieldset>

                <fieldset class="admin-fieldset">
                    <legend class="admin-legend">Hierarquia e destino</legend>
                    <div class="form-group" id="parentSelectGroup">
                        <label for="parentSelect">Item pai (categoria)</label>
                        <select id="parentSelect">
                            <option value="">Nenhum (nível principal)</option>
                        </select>
                        <small class="admin-help">Deixe em branco para colocar no nível principal do menu.</small>
                    </div>
                    <div class="form-group" id="pageSelectGroup">
                        <label for="pageSearchInput">Página associada</label>
                        <input type="hidden" id="pageSelect" value="">
                        <div class="page-search-select" id="pageSearchSelect">
                            <input type="text" id="pageSearchInput" class="page-search-input" placeholder="Buscar página…" autocomplete="off">
                            <div id="pageSearchResults" class="page-search-results"></div>
                        </div>
                        <small class="admin-help">Categorias não têm página associada — agrupam subitens.</small>
                    </div>
                </fieldset>
            </div>
            <div class="admin-modal-actions">
                <button class="btn" onclick="closeAdminModal()">Cancelar</button>
                <button class="btn btn-admin" id="saveMenuBtn" onclick="saveMenuItem()">${isEdit ? 'Atualizar item' : 'Adicionar ao menu'}</button>
            </div>
        </div>`;

        // Inserir dentro do adminPanel para herdar estilos CSS dos dropdowns
        const adminPanel = document.getElementById('adminPanel');
        (adminPanel || document.body).appendChild(overlay);

        // Preencher selects
        this._populateModalParentSelect();
        this.updatePageSelect();

        // Configurar handler do tipo. Tanto item quanto categoria podem ter pai
        // (categoria pode estar dentro de outra). Mas só item simples tem página.
        const typeSelect = document.getElementById('menuTypeSelect');
        typeSelect.addEventListener('change', function () {
            const pgsg = document.getElementById('pageSelectGroup');
            if (!pgsg) return;
            if (this.value === 'category') {
                pgsg.style.display = 'none';
                const ps = document.getElementById('pageSelect');
                if (ps) ps.value = '';
                const searchInp = document.getElementById('pageSearchInput');
                if (searchInp) searchInp.value = '';
            } else {
                pgsg.style.display = 'block';
            }
        });

        // Preencher campos se editando
        if (isEdit && item) {
            document.getElementById('menuItemInput').value = item.name || '';
            typeSelect.value = item.type || 'item';
            typeSelect.dispatchEvent(new Event('change'));
            const parentSel = document.getElementById('parentSelect');
            if (parentSel) parentSel.value = item.parentId || '';
            const pageSel = document.getElementById('pageSelect');
            if (pageSel) pageSel.value = item.pageId || '';
            // Atualizar campo de busca com o titulo da pagina selecionada
            if (item.pageId) {
                const linkedPage = (window.PortalApp.pagesData || []).find(p => p.id === item.pageId);
                const searchInp = document.getElementById('pageSearchInput');
                if (searchInp && linkedPage) searchInp.value = linkedPage.title || `Página ${linkedPage.id}`;
            }
            document.getElementById('menuIconInput').value = (window.PortalIcons ? window.PortalIcons.svgToKey(item.icon) : item.icon) || '';
        } else {
            typeSelect.dispatchEvent(new Event('change'));
        }

        // Inicializar icon input handler e paletas
        this._setupModalIconInputs('menu');
        document.getElementById('menuItemInput').focus();
    },

    _populateModalParentSelect() {
        const parentSelect = document.getElementById('parentSelect');
        if (!parentSelect) return;
        parentSelect.innerHTML = '<option value="">Nenhum (Nível Principal)</option>';
        if (Array.isArray(window.PortalApp.menuData)) {
            this._populateParentSelect(parentSelect, window.PortalApp.menuData, 0);
        }
    },

    _setupModalIconInputs(type) {
        const isPage = type === 'page';
        const inputId = isPage ? 'pageIconInput' : 'menuIconInput';
        const input = document.getElementById(inputId);

        // Handler de digitacao no campo de icone
        if (input && window.PortalIcons) {
            const updatePreview = isPage ? 'updatePageIconPreview' : 'updateIconPreview';
            const setDropdown = isPage ? 'setPageDropdownValueForIcon' : 'setDropdownValueForIcon';
            input.addEventListener('input', (e) => {
                if (typeof window.PortalIcons[updatePreview] === 'function') window.PortalIcons[updatePreview](e.target.value);
                if (typeof window.PortalIcons[setDropdown] === 'function') window.PortalIcons[setDropdown](e.target.value);
            });
            if (input.value) {
                setTimeout(() => {
                    window.PortalIcons[updatePreview](input.value);
                    window.PortalIcons[setDropdown](input.value);
                }, 120);
            }
        }

        // Construir paletas apos a animacao do modal (200ms) terminar
        if (window.PortalIcons && typeof window.PortalIcons.buildAllPalettes === 'function') {
            setTimeout(() => window.PortalIcons.buildAllPalettes(), 300);
        }
    },

    _closeAdminModal() {
        const overlay = document.getElementById('adminModalOverlay');
        if (overlay) overlay.remove();
        window.PortalApp.editingPageId = null;
        window.PortalApp.editingMenuId = null;
    },

    loadMenuStructure() {
        const container = document.getElementById('menuStructure');
        if (!container) return;

        if (!this._collapsedCategories) {
            this._collapsedCategories = new Set();
            // Colapsar todas as categorias por padrao
            const collectCategories = (items) => {
                for (const it of items) {
                    if (it.type === 'category' && it.children && it.children.length > 0) {
                        this._collapsedCategories.add(it.id);
                        collectCategories(it.children);
                    }
                }
            };
            if (Array.isArray(window.PortalApp.menuData)) collectCategories(window.PortalApp.menuData);
        }

        // Injeta barra de busca uma vez (mesmo padrão da lista de páginas).
        if (!document.getElementById('menuSearchBar')) {
            const bar = document.createElement('div');
            bar.id = 'menuSearchBar';
            bar.className = 'pages-search-bar';
            bar.innerHTML = `
                <i class="fa fa-search search-icon" aria-hidden="true"></i>
                <input type="text" id="menuSearchInput" placeholder="Filtrar itens do menu..." autocomplete="off" aria-label="Filtrar itens do menu">
                <span id="menuSearchCount" class="pages-search-count"></span>
            `;
            container.parentNode.insertBefore(bar, container);
            document.getElementById('menuSearchInput').addEventListener('input', () => this.loadMenuStructure());
        }

        const filter = (document.getElementById('menuSearchInput')?.value || '').toLowerCase().trim();

        container.innerHTML = '';

        const parentSelect = document.getElementById('parentSelect');
        if (parentSelect) parentSelect.innerHTML = '<option value="">Nenhum (Nível Principal)</option>';

        let rootItems = [...window.PortalApp.menuData].sort((a, b) => {
            const ao = a.order ?? 0, bo = b.order ?? 0;
            return ao !== bo ? ao - bo : a.id - b.id;
        });

        // Filtragem recursiva: mantém pais cujos filhos casam, e expande categorias com match.
        let totalAll = 0;
        const countAll = (items) => { for (const it of items) { totalAll++; if (it.children) countAll(it.children); } };
        countAll(rootItems);

        let totalFiltered = totalAll;
        if (filter) {
            const filterTree = (items) => {
                const out = [];
                for (const it of items) {
                    const selfMatch = (it.name || it.title || '').toLowerCase().includes(filter);
                    const filteredChildren = it.children ? filterTree(it.children) : [];
                    if (selfMatch || filteredChildren.length > 0) {
                        out.push({ ...it, children: filteredChildren });
                        if (it.type === 'category') this._collapsedCategories.delete(it.id);
                    }
                }
                return out;
            };
            rootItems = filterTree(rootItems);
            totalFiltered = 0;
            const countFiltered = (items) => { for (const it of items) { totalFiltered++; if (it.children) countFiltered(it.children); } };
            countFiltered(rootItems);
        }

        const countEl = document.getElementById('menuSearchCount');
        if (countEl) countEl.textContent = filter ? `${totalFiltered} de ${totalAll}` : `${totalAll} item(ns)`;

        this._renderMenuItems(container, rootItems, 0);
        if (parentSelect) this._populateParentSelect(parentSelect, [...window.PortalApp.menuData], 0);
        this._initMenuDragDrop(container);
    },

    _renderMenuItems(container, items, level) {
        const sorted = [...items].sort((a, b) => {
            const ao = a.order ?? 0, bo = b.order ?? 0;
            return ao !== bo ? ao - bo : a.id - b.id;
        });

        sorted.forEach((item) => {
            const isCategory = item.type === 'category';
            const hasChildren = isCategory && Array.isArray(item.children) && item.children.length > 0;
            const isCollapsed = hasChildren && this._collapsedCategories.has(item.id);

            // Wrapper externo (movido no drag & drop)
            const wrapper = document.createElement('div');
            wrapper.className = 'menu-item-wrapper';
            wrapper.dataset.id = String(item.id);
            wrapper.dataset.parentId = String(item.parentId ?? '');
            wrapper.dataset.type = item.type;
            wrapper.draggable = true;

            // Linha do item
            const itemEl = document.createElement('div');
            itemEl.className = 'menu-list-item';

            // Handle de drag
            const handle = document.createElement('span');
            handle.className = 'menu-drag-handle';
            handle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
            handle.title = 'Arrastar para reordenar';

            // Botao de colapso
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'menu-collapse-toggle';
            if (hasChildren) {
                toggleBtn.innerHTML = isCollapsed ? '&#9658;' : '&#9660;';
                toggleBtn.title = isCollapsed ? 'Expandir' : 'Retrair';
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggleMenuCategory(item.id, wrapper, toggleBtn);
                });
            } else {
                toggleBtn.style.visibility = 'hidden';
            }

            // Info
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;min-width:0;';
            const iconHtml = window.PortalIcons ? window.PortalIcons.renderIconHTML(item.icon) : (item.icon ? `<span>${item.icon}</span>` : '');
            const typeBadge = isCategory
                ? '<span class="page-list-badge badge-teal">Categoria</span>'
                : '<span class="page-list-badge badge-gray">Item</span>';
            const childBadge = hasChildren
                ? `<span class="page-list-badge badge-blue">${item.children.length} ${item.children.length === 1 ? 'subitem' : 'subitens'}</span>`
                : '';
            const levelBadge = level > 0 ? `<span style="font-size:11px;color:var(--text-secondary);">nível ${level + 1}</span>` : '';

            infoDiv.innerHTML = `
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;">
                    ${iconHtml}<strong>${this._escHtml(item.name)}</strong>${typeBadge}${childBadge}${levelBadge}
                </div>
            `;

            // Acoes
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'menu-list-item-actions';
            actionsDiv.style.flexShrink = '0';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-small btn-edit';
            editBtn.textContent = 'Editar';
            editBtn.addEventListener('click', () => this.editMenuItem(item.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-small btn-delete';
            deleteBtn.textContent = 'Excluir';
            deleteBtn.addEventListener('click', () => this.deleteMenuItem(item.id));

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);

            // Impedir drag ao clicar em botoes
            wrapper.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) {
                    wrapper.draggable = false;
                    requestAnimationFrame(() => { wrapper.draggable = true; });
                }
            }, true);

            itemEl.appendChild(handle);
            itemEl.appendChild(toggleBtn);
            itemEl.appendChild(infoDiv);
            itemEl.appendChild(actionsDiv);
            wrapper.appendChild(itemEl);

            // Container de filhos
            if (hasChildren) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'menu-children-container';
                childrenContainer.dataset.parentId = String(item.id);
                childrenContainer.style.paddingLeft = '20px';
                if (isCollapsed) childrenContainer.style.display = 'none';
                this._renderMenuItems(childrenContainer, item.children, level + 1);
                wrapper.appendChild(childrenContainer);
            }

            container.appendChild(wrapper);
        });
    },

    _populateParentSelect(parentSelect, items, level) {
        const sorted = [...items].sort((a, b) => {
            const ao = a.order ?? 0, bo = b.order ?? 0;
            return ao !== bo ? ao - bo : a.id - b.id;
        });
        sorted.forEach(item => {
            if (item.type === 'category') {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = '\u00a0\u00a0'.repeat(level) + item.name + ` (Nível ${level + 1})`;
                parentSelect.appendChild(opt);
            }
            if (item.children && item.children.length) {
                this._populateParentSelect(parentSelect, item.children, level + 1);
            }
        });
    },

    _toggleMenuCategory(itemId, wrapper, toggleBtn) {
        const childrenContainer = wrapper.querySelector(':scope > .menu-children-container');
        if (!childrenContainer) return;
        if (this._collapsedCategories.has(itemId)) {
            this._collapsedCategories.delete(itemId);
            childrenContainer.style.display = '';
            toggleBtn.innerHTML = '&#9660;';
            toggleBtn.title = 'Retrair';
        } else {
            this._collapsedCategories.add(itemId);
            childrenContainer.style.display = 'none';
            toggleBtn.innerHTML = '&#9658;';
            toggleBtn.title = 'Expandir';
        }
    },

    expandAllMenuCategories() {
        if (!this._collapsedCategories) this._collapsedCategories = new Set();
        this._collapsedCategories.clear();
        const container = document.getElementById('menuStructure');
        if (!container) return;
        container.querySelectorAll('.menu-children-container').forEach(c => { c.style.display = ''; });
        container.querySelectorAll('.menu-collapse-toggle').forEach(btn => {
            if (btn.style.visibility !== 'hidden') {
                btn.innerHTML = '&#9660;';
                btn.title = 'Retrair';
            }
        });
    },

    collapseAllMenuCategories() {
        if (!this._collapsedCategories) this._collapsedCategories = new Set();
        const container = document.getElementById('menuStructure');
        if (!container) return;
        container.querySelectorAll('.menu-children-container').forEach(c => {
            const parentId = c.dataset.parentId;
            if (parentId) this._collapsedCategories.add(parseInt(parentId));
            c.style.display = 'none';
        });
        container.querySelectorAll('.menu-collapse-toggle').forEach(btn => {
            if (btn.style.visibility !== 'hidden') {
                btn.innerHTML = '&#9658;';
                btn.title = 'Expandir';
            }
        });
    },

    // Helper genérico de drag-and-drop. Usado tanto pelo Menu (siblings dentro de
    // categorias) quanto pelas Páginas (lista flat). Quando `onReorder` retorna,
    // chamamos com o array completo de {id, newOrder} dos siblings do container
    // onde o drop aconteceu.
    _initListDragDrop(rootContainer, onReorder, opts) {
        if (rootContainer._dragDropInstalled) return;
        rootContainer._dragDropInstalled = true;

        const restrictToSameParent = !opts || opts.restrictToSameParent !== false;
        let draggedWrapper = null;
        let dropTarget = null;
        let dropPos = null;

        const clearDropHighlight = () => {
            rootContainer.querySelectorAll('.drag-drop-before, .drag-drop-after').forEach(el => {
                el.classList.remove('drag-drop-before', 'drag-drop-after');
            });
            dropTarget = null;
            dropPos = null;
        };

        rootContainer.addEventListener('dragstart', (e) => {
            const wrapper = e.target.closest('.menu-item-wrapper');
            if (!wrapper || !rootContainer.contains(wrapper)) return;
            draggedWrapper = wrapper;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', wrapper.dataset.id);
            requestAnimationFrame(() => {
                wrapper.classList.add('dragging-active');
            });
        });

        rootContainer.addEventListener('dragend', () => {
            if (draggedWrapper) {
                draggedWrapper.classList.remove('dragging-active');
                draggedWrapper = null;
            }
            clearDropHighlight();
        });

        rootContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedWrapper) return;

            const target = e.target.closest('.menu-item-wrapper');
            if (!target || target === draggedWrapper) { clearDropHighlight(); return; }
            if (restrictToSameParent && target.parentNode !== draggedWrapper.parentNode) { clearDropHighlight(); return; }
            if (draggedWrapper.contains(target)) { clearDropHighlight(); return; }

            const itemEl = target.querySelector(':scope > .menu-list-item');
            const rect = (itemEl || target).getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const pos = e.clientY < midY ? 'before' : 'after';

            if (target === dropTarget && pos === dropPos) {
                e.dataTransfer.dropEffect = 'move';
                return;
            }

            clearDropHighlight();
            dropTarget = target;
            dropPos = pos;
            target.classList.add(pos === 'before' ? 'drag-drop-before' : 'drag-drop-after');
            e.dataTransfer.dropEffect = 'move';
        });

        rootContainer.addEventListener('dragleave', (e) => {
            if (!rootContainer.contains(e.relatedTarget)) clearDropHighlight();
        });

        rootContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedWrapper || !dropTarget || !dropPos) { clearDropHighlight(); return; }

            const dropContainer = dropTarget.parentNode;
            if (restrictToSameParent && dropContainer !== draggedWrapper.parentNode) { clearDropHighlight(); return; }

            if (dropPos === 'before') {
                dropContainer.insertBefore(draggedWrapper, dropTarget);
            } else {
                dropContainer.insertBefore(draggedWrapper, dropTarget.nextSibling);
            }
            clearDropHighlight();

            const siblings = Array.from(dropContainer.querySelectorAll(':scope > .menu-item-wrapper'));
            const orderUpdates = siblings.map((el, i) => ({
                id: parseInt(el.dataset.id),
                newOrder: (i + 1) * 10
            }));

            draggedWrapper.classList.remove('dragging-active');
            draggedWrapper = null;

            try { onReorder(orderUpdates); } catch (err) { console.error('[drag-drop] onReorder falhou:', err); }
        });
    },

    _initMenuDragDrop(rootContainer) {
        this._initListDragDrop(rootContainer, (orderUpdates) => this._applyMenuDragOrder(orderUpdates));
    },

    _initPagesDragDrop(rootContainer) {
        this._initListDragDrop(rootContainer, (orderUpdates) => this._applyPagesDragOrder(orderUpdates));
    },

    async _applyPagesDragOrder(orderUpdates) {
        if (!window.PortalApp.authToken || !orderUpdates.length) return;

        const container = document.getElementById('pagesList');
        if (container) container.style.pointerEvents = 'none';

        try {
            await this.applyPageReorderPlan(orderUpdates);
            // Atualiza ordem em memória sem re-render (evita "flash" visual após o drop).
            const pageById = new Map(window.PortalApp.pagesData.map(p => [p.id, p]));
            for (const upd of orderUpdates) {
                const p = pageById.get(upd.id);
                if (p) p.order = upd.newOrder;
            }
            this._pagesListSorted = [...window.PortalApp.pagesData].sort((a, b) => {
                const ao = a.order ?? 0, bo = b.order ?? 0;
                return ao !== bo ? ao - bo : a.id - b.id;
            });
            // Repropaga na home (Acesso Rápido) sem recarregar tudo.
            if (window.PortalApp.selectedPageId === null && window.PortalPages) {
                window.PortalPages.loadQuickAccessCards();
            }
        } catch (err) {
            console.error('Erro ao reordenar páginas via drag:', err);
            await window.adminConfirm({ title: 'Erro ao reordenar páginas', message: err.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
            await window.PortalData.loadDataFromAPI();
        } finally {
            if (container) container.style.pointerEvents = '';
        }
    },

    async _applyMenuDragOrder(orderUpdates) {
        if (!window.PortalApp.authToken || !orderUpdates.length) return;

        const container = document.getElementById('menuStructure');
        if (container) container.style.pointerEvents = 'none';

        try {
            for (const upd of orderUpdates) {
                const resp = await fetch(`${window.PortalApp.API_URL}/menu/${upd.id}/order`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${window.PortalApp.authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ order: upd.newOrder })
                });
                if (!resp.ok) {
                    const txt = await resp.text().catch(() => '');
                    throw new Error(`Falha ao atualizar item ${upd.id}${txt ? ': ' + txt : ''}`);
                }
            }
            this._updateMenuDataOrders(orderUpdates);
            if (window.PortalMenu) window.PortalMenu.renderMenu();
        } catch (err) {
            console.error('Erro ao salvar ordem do menu:', err);
            await window.adminConfirm({ title: 'Erro ao reordenar', message: err.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
            await window.PortalData.loadDataFromAPI();
        } finally {
            if (container) container.style.pointerEvents = '';
        }
    },

    _updateMenuDataOrders(orderUpdates) {
        const update = (items) => {
            for (const it of items) {
                const u = orderUpdates.find(x => x.id === it.id);
                if (u) it.order = u.newOrder;
                if (it.children && it.children.length) update(it.children);
            }
        };
        if (Array.isArray(window.PortalApp.menuData)) update(window.PortalApp.menuData);
    },

    updatePageSelect() {
        const hidden = document.getElementById('pageSelect');
        if (!hidden) return;

        const searchInput = document.getElementById('pageSearchInput');
        const resultsDiv = document.getElementById('pageSearchResults');
        if (!searchInput || !resultsDiv) {
            // Fallback: se nao existe o search, tentar como select antigo
            if (hidden.tagName === 'SELECT') {
                hidden.innerHTML = '<option value="">Selecione uma página</option>';
                if (Array.isArray(window.PortalApp.pagesData)) {
                    window.PortalApp.pagesData.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = p.title || (`Página ${p.id}`);
                        hidden.appendChild(opt);
                    });
                }
            }
            return;
        }

        const pages = Array.isArray(window.PortalApp.pagesData) ? window.PortalApp.pagesData : [];

        // Se ja tem valor selecionado, mostrar o titulo
        if (hidden.value) {
            const current = pages.find(p => String(p.id) === String(hidden.value));
            if (current) searchInput.value = current.title || `Página ${current.id}`;
        }

        const renderResults = (filter) => {
            resultsDiv.innerHTML = '';
            const term = (filter || '').toLowerCase().trim();
            const filtered = term
                ? pages.filter(p => (p.title || '').toLowerCase().includes(term))
                : pages;

            if (filtered.length === 0) {
                resultsDiv.innerHTML = '<div class="page-search-item page-search-empty">Nenhuma página encontrada</div>';
                resultsDiv.style.display = 'block';
                return;
            }

            // Opcao de limpar
            const clearItem = document.createElement('div');
            clearItem.className = 'page-search-item page-search-clear';
            clearItem.textContent = '— Nenhuma página —';
            clearItem.addEventListener('mousedown', (e) => {
                e.preventDefault();
                hidden.value = '';
                searchInput.value = '';
                resultsDiv.style.display = 'none';
            });
            resultsDiv.appendChild(clearItem);

            filtered.forEach(p => {
                const item = document.createElement('div');
                item.className = 'page-search-item';
                if (String(p.id) === String(hidden.value)) item.classList.add('selected');
                item.textContent = p.title || `Página ${p.id}`;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    hidden.value = p.id;
                    searchInput.value = p.title || `Página ${p.id}`;
                    resultsDiv.style.display = 'none';
                });
                resultsDiv.appendChild(item);
            });
            resultsDiv.style.display = 'block';
        };

        searchInput.addEventListener('focus', () => renderResults(searchInput.value));
        searchInput.addEventListener('input', () => renderResults(searchInput.value));
        searchInput.addEventListener('blur', () => {
            // Delay para permitir click no item antes de fechar
            setTimeout(() => { resultsDiv.style.display = 'none'; }, 150);
        });
    },

    async loadUsersList() {
        const container = document.getElementById('usersList');
        if (!container) return;

        if (!window.PortalApp.authToken || !window.PortalApp.isAdmin) {
            container.innerHTML = '<div class="admin-placeholder">Acesso restrito a administradores.</div>';
            return;
        }

        // Injeta barra de busca uma única vez.
        if (!document.getElementById('usersSearchBar')) {
            const bar = document.createElement('div');
            bar.id = 'usersSearchBar';
            bar.className = 'pages-search-bar';
            bar.innerHTML = `
                <i class="fa fa-search search-icon" aria-hidden="true"></i>
                <input type="text" id="usersSearchInput" placeholder="Filtrar por nome, usuário ou e-mail..." autocomplete="off" aria-label="Filtrar usuários">
                <span id="usersSearchCount" class="pages-search-count"></span>
            `;
            container.parentNode.insertBefore(bar, container);
            document.getElementById('usersSearchInput').addEventListener('input', () => this._renderUsersList());
        }

        container.innerHTML = '<div class="admin-placeholder">Carregando usuários...</div>';

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/users`, {
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || 'Erro ao carregar usuários');
            }

            const users = await response.json();
            this._usersListCache = Array.isArray(users) ? users : [];
            this._renderUsersList();
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            container.innerHTML = `<div class="admin-placeholder">${error.message || 'Erro ao carregar usuários.'}</div>`;
        }
    },

    _renderUsersList() {
        const container = document.getElementById('usersList');
        if (!container) return;
        const all = this._usersListCache || [];

        const filter = (document.getElementById('usersSearchInput')?.value || '').toLowerCase().trim();
        const users = filter
            ? all.filter(u =>
                (u.username || '').toLowerCase().includes(filter) ||
                (u.fullName || '').toLowerCase().includes(filter) ||
                (u.email || '').toLowerCase().includes(filter))
            : all;

        const countEl = document.getElementById('usersSearchCount');
        if (countEl) countEl.textContent = filter ? `${users.length} de ${all.length}` : `${all.length} usuário(s)`;

        if (users.length === 0) {
            container.innerHTML = `<div class="admin-placeholder">${filter ? 'Nenhum usuário corresponde ao filtro.' : 'Nenhum usuário encontrado.'}</div>`;
            return;
        }

        container.innerHTML = '';
        users.forEach((user) => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';

            const infoDiv = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = user.fullName || user.username;
            infoDiv.appendChild(title);

            if (user.isAdmin) {
                const adminBadge = document.createElement('span');
                adminBadge.className = 'admin-pill admin-pill--admin';
                adminBadge.textContent = 'ADMIN';
                infoDiv.appendChild(adminBadge);
            }

            if (!user.isActive) {
                const inactiveBadge = document.createElement('span');
                inactiveBadge.className = 'admin-pill admin-pill--inactive';
                inactiveBadge.textContent = 'INATIVO';
                infoDiv.appendChild(inactiveBadge);
            }

            infoDiv.appendChild(document.createElement('br'));
            const details = document.createElement('small');
            details.style.color = 'var(--text-secondary)';
            const email = user.email || 'Sem e-mail';
            const lastLogin = user.lastLogin ? ` • Último login: ${new Date(user.lastLogin).toLocaleString('pt-BR')}` : '';
            details.textContent = `${user.username} • ${email}${lastLogin}`;
            infoDiv.appendChild(details);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'menu-list-item-actions';
            actionsDiv.innerHTML = `
                <button type="button" class="btn-small btn-edit" onclick="editUser(${user.id})" aria-label="Editar usuário ${user.username}">Editar</button>
                <button type="button" class="btn-small btn-delete" onclick="deleteUser(${user.id}, '${String(user.username).replace(/'/g, "\\'")}')" aria-label="Excluir usuário ${user.username}">Excluir</button>
            `;

            item.appendChild(infoDiv);
            item.appendChild(actionsDiv);
            container.appendChild(item);
        });
    },

    // Abre modal de criar/editar usuário. Substituiu o card inline em /admin
    // que ficava sempre visível (com 2 cards desconectados na mesma tela).
    openUserModal(userId) {
        if (!window.PortalApp.authToken || !window.PortalApp.isAdmin) {
            window.adminConfirm({ title: 'Acesso restrito', message: 'Faça login como administrador para gerenciar usuários.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        const isEdit = !!userId;
        window.PortalApp.editingUserId = userId || null;

        const body = `
            <fieldset class="admin-fieldset">
                <legend class="admin-legend">Dados de acesso</legend>
                <div class="admin-grid-2">
                    <div class="form-group">
                        <label for="userUsernameInput">Usuário</label>
                        <input type="text" id="userUsernameInput" placeholder="Ex: joao.silva" autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="userFullNameInput">Nome completo</label>
                        <input type="text" id="userFullNameInput" placeholder="Ex: João Silva" autocomplete="name">
                    </div>
                    <div class="form-group">
                        <label for="userEmailInput">E-mail</label>
                        <input type="email" id="userEmailInput" placeholder="usuario@aacd.org.br" autocomplete="email">
                    </div>
                    <div class="form-group">
                        <label for="userPasswordInput">Senha${isEdit ? '' : ' *'}</label>
                        <input type="password" id="userPasswordInput" placeholder="${isEdit ? 'Deixe em branco para manter' : 'Obrigatória ao criar'}" autocomplete="new-password">
                        <small class="admin-help">${isEdit ? 'Em branco mantém a senha atual.' : 'Mínimo recomendado: 8 caracteres.'}</small>
                    </div>
                </div>
            </fieldset>
            <fieldset class="admin-fieldset">
                <legend class="admin-legend">Permissões</legend>
                <div class="form-group admin-form-spaced">
                    <label class="admin-checkbox-row">
                        <input type="checkbox" id="userIsAdminCheckbox">
                        <span>Conceder acesso administrativo ao portal</span>
                    </label>
                    <label class="admin-checkbox-row">
                        <input type="checkbox" id="userIsActiveCheckbox" checked>
                        <span>Usuário ativo</span>
                    </label>
                    <label class="admin-checkbox-row">
                        <input type="checkbox" id="userAppFaturaCheckbox">
                        <span>Acesso à aplicação <code>/fatura</code> (OCR de faturas)</span>
                    </label>
                </div>
            </fieldset>
        `;
        const footer = `
            <button type="button" class="btn" data-role="cancel">Cancelar</button>
            <button type="button" class="btn btn-admin" data-role="save">${isEdit ? 'Atualizar usuário' : 'Criar usuário'}</button>
        `;
        const { overlay, close } = this._buildAdminModal({
            id: 'userModal',
            title: isEdit ? 'Editar usuário' : 'Novo usuário',
            bodyHTML: body,
            footerHTML: footer,
            onClose: () => { window.PortalApp.editingUserId = null; }
        });

        overlay.querySelector('[data-role="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-role="save"]').addEventListener('click', () => this.saveUser());

        // Pré-popula em edição buscando dados frescos.
        if (isEdit) {
            (async () => {
                try {
                    const response = await fetch(`${window.PortalApp.API_URL}/users`, {
                        headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const users = await response.json();
                    const user = Array.isArray(users) ? users.find(u => u.id === userId) : null;
                    if (!user) {
                        await window.adminConfirm({ title: 'Usuário não encontrado', message: 'Pode ter sido removido por outra sessão.', confirmText: 'OK', cancelText: ' ' });
                        close();
                        return;
                    }
                    overlay.querySelector('#userUsernameInput').value = user.username || '';
                    overlay.querySelector('#userFullNameInput').value = user.fullName || '';
                    overlay.querySelector('#userEmailInput').value = user.email || '';
                    overlay.querySelector('#userPasswordInput').value = '';
                    overlay.querySelector('#userIsAdminCheckbox').checked = !!user.isAdmin;
                    overlay.querySelector('#userIsActiveCheckbox').checked = !!user.isActive;
                    overlay.querySelector('#userAppFaturaCheckbox').checked = Array.isArray(user.apps) && user.apps.includes('fatura');
                } catch (err) {
                    console.error('[Usuário] openUserModal load failed:', err);
                    await window.adminConfirm({ title: 'Erro ao carregar usuário', message: err.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
                }
            })();
        }
        setTimeout(() => overlay.querySelector('#userUsernameInput')?.focus(), 50);
    },

    editUser(id) {
        this.openUserModal(id);
    },

    async saveUser() {
        if (!window.PortalApp.authToken || !window.PortalApp.isAdmin) {
            await window.adminConfirm({ title: 'Acesso restrito', message: 'Faça login como administrador para gerenciar usuários.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        const username = document.getElementById('userUsernameInput').value.trim();
        const fullName = document.getElementById('userFullNameInput').value.trim();
        const email = document.getElementById('userEmailInput').value.trim();
        const password = document.getElementById('userPasswordInput').value;
        const isAdmin = document.getElementById('userIsAdminCheckbox').checked;
        const isActive = document.getElementById('userIsActiveCheckbox').checked;
        const apps = [];
        if (document.getElementById('userAppFaturaCheckbox').checked) apps.push('fatura');

        if (!username) {
            await window.adminConfirm({ title: 'Usuário obrigatório', message: 'Informe o nome de usuário.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        if (!window.PortalApp.editingUserId && !password) {
            await window.adminConfirm({ title: 'Senha obrigatória', message: 'Informe a senha para criar o usuário.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        try {
            const isEditing = !!window.PortalApp.editingUserId;
            const response = await fetch(
                isEditing ? `${window.PortalApp.API_URL}/users/${window.PortalApp.editingUserId}` : `${window.PortalApp.API_URL}/users`,
                {
                    method: isEditing ? 'PUT' : 'POST',
                    headers: {
                        'Authorization': `Bearer ${window.PortalApp.authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username,
                        fullName: fullName || null,
                        email: email || null,
                        password: password || null,
                        isAdmin,
                        isActive,
                        apps
                    })
                }
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || errorData.message || 'Erro ao salvar usuário');
            }
            document.getElementById('userModal')?.remove();
            window.PortalApp.editingUserId = null;
            await this.loadUsersList();
        } catch (error) {
            console.error('[Usuário] saveUser falhou:', error);
            await window.adminConfirm({ title: 'Erro ao salvar usuário', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async deleteUser(id, username) {
        const ok = await window.adminConfirm({
            title: 'Excluir usuário',
            message: `Deseja realmente remover o usuário "${username}"? Esta ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            destructive: true
        });
        if (!ok) return;

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || errorData.message || 'Erro ao excluir usuário');
            }
            if (window.PortalApp.editingUserId === id) {
                document.getElementById('userModal')?.remove();
                window.PortalApp.editingUserId = null;
            }
            await this.loadUsersList();
        } catch (error) {
            console.error('[Usuário] deleteUser falhou:', error);
            await window.adminConfirm({ title: 'Erro ao excluir usuário', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    findMenuItemById(items, id) {
        for (const it of items) {
            if (it.id === id) return it;
            if (it.children && it.children.length) {
                const found = this.findMenuItemById(it.children, id);
                if (found) return found;
            }
        }
        return null;
    },

    editPage(id) {
        this.openPageModal(id);
    },

    editMenuItem(id) {
        this.openMenuItemModal(id);
    },

    async savePage() {
        const rawTitle = document.getElementById('pageNameInput').value;
        const rawSubtitle = document.getElementById('pageSubtitleInput').value;
        const rawDescription = document.getElementById('pageDescInput').value;
        const rawPowerBIUrl = document.getElementById('powerbiUrlInput').value;
        const rawRedirectPowerBIUrl = document.getElementById('redirectPowerbiUrlInput').value;
        const rawRedirectEmails = document.getElementById('redirectEmailsInput').value;
        const showInHome = document.getElementById('showInHomeCheckbox').checked;
        const rawIcon = document.getElementById('pageIconInput').value;

        if (!rawTitle) {
            await window.adminConfirm({ title: 'Título obrigatório', message: 'Informe o título da página.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        if (!window.PortalApp.authToken) {
            await window.adminConfirm({ title: 'Sessão expirada', message: 'Faça login como administrador para salvar páginas.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        const prepared = {
            title: this.prepareStringForDb(rawTitle, window.PortalConfig.MAX_LENGTHS.pageTitle),
            subtitle: this.prepareStringForDb(rawSubtitle, window.PortalConfig.MAX_LENGTHS.pageSubtitle),
            description: this.prepareStringForDb(rawDescription, window.PortalConfig.MAX_LENGTHS.pageDescription),
            powerBIUrl: this.prepareStringForDb(rawPowerBIUrl, window.PortalConfig.MAX_LENGTHS.powerBIUrl),
            redirectPowerBIUrl: this.prepareStringForDb(rawRedirectPowerBIUrl, window.PortalConfig.MAX_LENGTHS.pageRedirectPowerBIUrl),
            redirectEmails: this.prepareStringForDb(rawRedirectEmails, window.PortalConfig.MAX_LENGTHS.pageRedirectEmails),
            icon: this.prepareStringForDb(rawIcon || '', window.PortalConfig.MAX_LENGTHS.pageIcon)
        };
        
        const truncatedFields = this.collectTruncationMessages(prepared);
        if (truncatedFields.length) {
            const proceed = await window.adminConfirm({
                title: 'Conteúdo será truncado',
                message: `Alguns campos excedem o tamanho suportado pelo banco e serão cortados:\n\n${truncatedFields.join(', ')}\n\nDeseja continuar mesmo assim?`,
                confirmText: 'Continuar',
                cancelText: 'Cancelar'
            });
            if (!proceed) return;
        }

        const maxOrder = window.PortalApp.pagesData.length > 0 ? Math.max(...window.PortalApp.pagesData.map(p => p.order || 0)) : 0;
        const pageOrder = window.PortalApp.editingPageId ? 
            (window.PortalApp.pagesData.find(p => p.id === window.PortalApp.editingPageId)?.order || 0) : 
            maxOrder + 10;

        try {
            const url = window.PortalApp.editingPageId ? `${window.PortalApp.API_URL}/pages/${window.PortalApp.editingPageId}` : `${window.PortalApp.API_URL}/pages`;
            const method = window.PortalApp.editingPageId ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: prepared.title.value,
                    subtitle: prepared.subtitle.value,
                    description: prepared.description.value,
                    powerBIUrl: prepared.powerBIUrl.value,
                    redirectPowerBIUrl: prepared.redirectPowerBIUrl.value || null,
                    redirectEmails: prepared.redirectEmails.value || null,
                    showInHome: showInHome,
                    icon: prepared.icon.value || null,
                    order: pageOrder,
                    useEmbed: document.getElementById('useEmbedCheckbox').checked,
                    embedWorkspaceId: document.getElementById('embedWorkspaceIdInput').value.trim() || null,
                    embedReportId: document.getElementById('embedReportIdInput').value.trim() || null
                })
            });
            
            if (!response.ok) {
                let bodyText = '';
                try { const json = await response.json(); bodyText = json.error || JSON.stringify(json); }
                catch (_) { bodyText = await response.text().catch(() => response.statusText); }
                console.error('savePage failed', response.status, bodyText);
                await window.adminConfirm({ title: 'Erro ao salvar página', message: `${bodyText} (status ${response.status})`, confirmText: 'OK', cancelText: ' ' });
                return;
            }

            this._closeAdminModal();
            await window.PortalData.loadDataFromAPI();
            if (window.PortalApp.selectedPageId === null && window.PortalPages) {
                window.PortalPages.loadQuickAccessCards();
            }
        } catch (err) {
            console.error('[Página] savePage falhou:', err);
            await window.adminConfirm({ title: 'Erro ao salvar página', message: err.message || String(err), confirmText: 'OK', cancelText: ' ' });
        }
    },

    async saveMenuItem() {
        const rawName = document.getElementById('menuItemInput').value;
        const type = document.getElementById('menuTypeSelect').value;
        const rawIcon = document.getElementById('menuIconInput').value || null;
        const pageId = document.getElementById('pageSelect').value;
        const parentSelect = document.getElementById('parentSelect');
        const parentId = parentSelect ? (parentSelect.value ? parseInt(parentSelect.value) : null) : null;

        if (!rawName) {
            await window.adminConfirm({ title: 'Nome obrigatório', message: 'Informe o nome do item.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        if (!window.PortalApp.authToken) {
            await window.adminConfirm({ title: 'Sessão expirada', message: 'Faça login como administrador para alterar o menu.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        const prepared = {
            name: this.prepareStringForDb(rawName, window.PortalConfig.MAX_LENGTHS.menuName),
            icon: this.prepareStringForDb(rawIcon || '', window.PortalConfig.MAX_LENGTHS.menuIcon)
        };

        try {
            const url = window.PortalApp.editingMenuId ? `${window.PortalApp.API_URL}/menu/${window.PortalApp.editingMenuId}` : `${window.PortalApp.API_URL}/menu`;
            const method = window.PortalApp.editingMenuId ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: prepared.name.value,
                    type,
                    parentId,
                    pageId: pageId ? parseInt(pageId) : null,
                    icon: prepared.icon.value || null
                })
            });
            if (!response.ok) {
                let bodyText = '';
                try { const json = await response.json(); bodyText = json.error || JSON.stringify(json); }
                catch (_) { bodyText = await response.text().catch(() => response.statusText); }
                await window.adminConfirm({ title: 'Erro ao salvar item', message: bodyText, confirmText: 'OK', cancelText: ' ' });
                return;
            }
            this._closeAdminModal();
            await window.PortalData.loadDataFromAPI();
        } catch (err) {
            console.error('[Menu] saveMenuItem falhou:', err);
            await window.adminConfirm({ title: 'Erro de conexão', message: 'Não foi possível salvar o item do menu.', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async deletePage(id) {
        const ok = await window.adminConfirm({
            title: 'Excluir página',
            message: 'Tem certeza que deseja excluir esta página? Itens de menu que apontem para ela ficarão sem destino.',
            confirmText: 'Excluir',
            destructive: true
        });
        if (!ok) return;
        if (!window.PortalApp.authToken) {
            await window.adminConfirm({ title: 'Sessão expirada', message: 'Faça login como administrador para excluir páginas.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/pages/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                let bodyText = '';
                try { const json = await response.json(); bodyText = json.error || JSON.stringify(json); }
                catch (_) { bodyText = await response.text().catch(() => response.statusText); }
                await window.adminConfirm({ title: 'Erro ao excluir página', message: bodyText, confirmText: 'OK', cancelText: ' ' });
                return;
            }
            await window.PortalData.loadDataFromAPI();
        } catch (err) {
            console.error('[Página] deletePage falhou:', err);
            await window.adminConfirm({ title: 'Erro de conexão', message: 'Não foi possível excluir a página.', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async deleteMenuItem(id) {
        const ok = await window.adminConfirm({
            title: 'Excluir item do menu',
            message: 'Tem certeza que deseja excluir este item? Se for uma categoria com filhos, os filhos também serão removidos.',
            confirmText: 'Excluir',
            destructive: true
        });
        if (!ok) return;
        if (!window.PortalApp.authToken) {
            await window.adminConfirm({ title: 'Sessão expirada', message: 'Faça login como administrador para excluir itens.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/menu/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                let errorMessage = 'Erro desconhecido';
                try { const errorData = await response.json(); errorMessage = errorData.error || errorData.message || JSON.stringify(errorData); }
                catch (_) { errorMessage = await response.text().catch(() => `Status ${response.status}: ${response.statusText}`); }

                let title = 'Erro ao excluir item';
                if (response.status === 403) { title = 'Acesso negado'; errorMessage = 'Verifique se você está logado como administrador.'; }
                else if (response.status === 404) { title = 'Item não encontrado'; errorMessage = 'Pode ter sido excluído por outra sessão.'; await window.PortalData.loadDataFromAPI(); }
                await window.adminConfirm({ title, message: errorMessage, confirmText: 'OK', cancelText: ' ' });
                return;
            }
            await window.PortalData.loadDataFromAPI();
        } catch (err) {
            console.error('[Menu] deleteMenuItem falhou:', err);
            await window.adminConfirm({ title: 'Erro de conexão', message: 'Não foi possível excluir o item do menu.', confirmText: 'OK', cancelText: ' ' });
        }
    },

    clearPageForm() {
        this._closeAdminModal();
    },

    cancelPageEdit() {
        this._closeAdminModal();
    },

    cancelMenuEdit() {
        this._closeAdminModal();
    },

    computePageReorderPlan(pages, pageId, direction) {
        const sorted = [...pages].sort((a, b) => {
            const ao = a.order ?? 0, bo = b.order ?? 0;
            if (ao === bo) return (a.id || 0) - (b.id || 0);
            return ao - bo;
        });
        const currentIndex = sorted.findIndex(p => p.id === pageId);
        if (currentIndex < 0) return null;

        const targetIndex = currentIndex + direction;
        if (targetIndex < 0 || targetIndex >= sorted.length) return null;

        const baseOrders = sorted.map((p, i) => ({ id: p.id, newOrder: (i + 1) * 10 }));
        const temp = baseOrders[currentIndex];
        baseOrders[currentIndex] = baseOrders[targetIndex];
        baseOrders[targetIndex] = temp;

        baseOrders[currentIndex].newOrder = (targetIndex + 1) * 10;
        baseOrders[targetIndex].newOrder = (currentIndex + 1) * 10;

        return [
            { id: sorted[currentIndex].id, newOrder: baseOrders[currentIndex].newOrder },
            { id: sorted[targetIndex].id, newOrder: baseOrders[targetIndex].newOrder }
        ];
    },

    async applyPageReorderPlan(plan) {
        if (!Array.isArray(plan) || plan.length === 0) return;
        const results = [];
        for (const upd of plan) {
            const resp = await fetch(`${window.PortalApp.API_URL}/pages/${upd.id}/order`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ order: upd.newOrder })
            });
            if (resp.ok) {
                results.push({ success: true, id: upd.id });
            } else {
                const txt = await resp.text().catch(() => 'Erro desconhecido');
                results.push({ success: false, id: upd.id, error: txt });
            }
        }
        const failed = results.filter(r => !r.success);
        if (failed.length) {
            throw new Error(`Falha ao atualizar: ${failed.map(f => f.id).join(', ')}`);
        }
    },

    prepareStringForDb(input, max) {
        if (input === undefined || input === null) return { value: '', truncated: false };
        const s = String(input);
        if (!max || typeof max !== 'number') return { value: s, truncated: false };
        if (s.length > max) {
            return { value: s.slice(0, max), truncated: true };
        }
        return { value: s, truncated: false };
    },

    collectTruncationMessages(preparedObj) {
        const keys = [];
        for (const k in preparedObj) {
            if (Object.prototype.hasOwnProperty.call(preparedObj, k)) {
                const v = preparedObj[k];
                if (v && v.truncated) keys.push(k);
            }
        }
        return keys;
    },

    async loadDataDictionaries() {
        const container = document.getElementById('dictionariesList');
        if (!container) return;
        container.innerHTML = '<div class="admin-placeholder">Carregando dicionários...</div>';
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries`, {
                headers: window.PortalApp.authToken ? { 'Authorization': `Bearer ${window.PortalApp.authToken}` } : {}
            });
            if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
            const dictionaries = await response.json();
            window.PortalAdmin.renderDataDictionaries(dictionaries);
        } catch (error) {
            console.error('Erro ao carregar dicionários:', error);
            container.innerHTML = `
                <div class="admin-placeholder">
                    <p style="margin:0 0 6px;color:var(--admin-action-destructive,#c82333);font-weight:600;">
                        <i class="fas fa-circle-exclamation" aria-hidden="true"></i> Erro ao carregar dicionários
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;">${this._escHtml(error.message)}</p>
                    <button type="button" class="btn btn-admin" onclick="window.PortalAdmin.loadDataDictionaries()">
                        <i class="fas fa-rotate-right" aria-hidden="true"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    renderDataDictionaries(dictionaries) {
        const container = document.getElementById('dictionariesList');
        if (!container) return;

        if (!Array.isArray(dictionaries) || dictionaries.length === 0) {
            container.innerHTML = `
                <div class="admin-placeholder">
                    <p style="margin:0 0 12px;">Nenhum dicionário cadastrado.</p>
                    <button type="button" class="btn btn-admin" onclick="window.PortalAdmin.showCreateDictionaryForm()">
                        <i class="fas fa-plus" aria-hidden="true"></i> Criar primeiro dicionário
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        dictionaries.forEach((dict) => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;min-width:0;';

            let badges = '';
            if (dict.isDefault) badges += '<span class="page-list-badge badge-blue">PADRÃO</span>';
            if (dict.isActive === false) badges += '<span class="page-list-badge badge-gray">INATIVO</span>';

            const tableCount = (typeof dict.tableCount === 'number')
                ? dict.tableCount
                : (Array.isArray(dict.tables) ? dict.tables.length : 0);

            infoDiv.innerHTML = `
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:3px;">
                    <strong>${this._escHtml(dict.name || 'Sem nome')}</strong>
                    ${badges}
                </div>
                <small style="color:var(--text-secondary);">${this._escHtml(dict.description || 'Sem descrição')} • ${tableCount} tabela(s)</small>
            `;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'menu-list-item-actions';
            actionsDiv.style.flexShrink = '0';

            const mkBtn = (cls, icon, label, title, handler) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `btn-small ${cls}`;
                b.title = title;
                b.setAttribute('aria-label', title);
                b.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span class="btn-label">${label}</span>`;
                b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handler(); });
                return b;
            };

            actionsDiv.appendChild(mkBtn('btn-edit', 'fa-table-list', 'Tabelas', 'Gerenciar tabelas e colunas',
                () => window.PortalAdmin.manageDictionaryStructure(dict.id)));
            actionsDiv.appendChild(mkBtn('btn-edit', 'fa-pen', 'Editar', 'Editar dicionário',
                () => window.PortalAdmin.editDictionary(dict.id)));

            if (!dict.isDefault) {
                actionsDiv.appendChild(mkBtn('btn-edit', 'fa-star', 'Padrão', 'Definir como dicionário padrão',
                    () => window.PortalAdmin.setDefaultDictionary(dict.id)));
            }

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'btn-small btn-toggle';
            toggleBtn.dataset.active = String(!!dict.isActive);
            this.setToggleButtonVisual(toggleBtn, !!dict.isActive);
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                window.PortalAdmin.toggleDictionaryStatus(dict.id, toggleBtn);
            });
            actionsDiv.appendChild(toggleBtn);

            if (!dict.isDefault) {
                actionsDiv.appendChild(mkBtn('btn-delete', 'fa-trash', 'Excluir', 'Excluir dicionário',
                    () => window.PortalAdmin.deleteDictionary(dict.id)));
            }

            item.appendChild(infoDiv);
            item.appendChild(actionsDiv);
            container.appendChild(item);
        });
    },

    // Toggle ativo/inativo: pílula clara, sem inline-style. CSS em admin-page.css.
    setToggleButtonVisual(btn, isActive) {
        if (!btn) return;
        btn.dataset.active = String(!!isActive);
        const labelOn = 'Clique para desativar';
        const labelOff = 'Clique para ativar';
        btn.title = isActive ? labelOn : labelOff;
        btn.setAttribute('aria-label', isActive ? labelOn : labelOff);
        btn.innerHTML = isActive
            ? '<i class="fas fa-toggle-on" aria-hidden="true"></i><span class="btn-label">Ativo</span>'
            : '<i class="fas fa-toggle-off" aria-hidden="true"></i><span class="btn-label">Inativo</span>';
    },

    // Helper genérico que monta um modal no padrão admin-modal-overlay/admin-modal
    // já existente no portal.css. Substituiu 4 cópias de modais com <style> injetado.
    // - id: identificador do overlay (pra ter um close específico depois).
    // - title: título do modal.
    // - bodyHTML: HTML do conteúdo (já escapado pelo chamador).
    // - footerHTML: HTML dos botões de ação (geralmente .btn / .btn-admin).
    // - size: 'default' (560px), 'wide' (920px) — wide é usado pelo Estrutura.
    // - onClose: callback opcional ao fechar.
    _buildAdminModal({ id, title, bodyHTML, footerHTML, size, onClose }) {
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'admin-modal-overlay';
        if (size === 'wide') overlay.classList.add('admin-modal-overlay--wide');

        overlay.innerHTML = `
            <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="${id}_title">
                <div class="admin-modal-header">
                    <h3 id="${id}_title">${title}</h3>
                    <button type="button" class="admin-modal-close" data-role="close" aria-label="Fechar">&times;</button>
                </div>
                <div class="admin-modal-body">${bodyHTML}</div>
                <div class="admin-modal-actions">${footerHTML}</div>
            </div>
        `;

        const close = () => {
            overlay.remove();
            if (typeof onClose === 'function') {
                try { onClose(); } catch (e) { console.error('[admin-modal] onClose erro:', e); }
            }
        };
        overlay.querySelector('[data-role="close"]').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Esc fecha — só esse modal, não propaga.
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            // Não fecha se houver confirm overlay sobreposto.
            if (document.querySelector('.admin-confirm-overlay')) return;
            // Só age se este modal for o topo.
            const overlays = Array.from(document.querySelectorAll('.admin-modal-overlay'));
            if (overlays[overlays.length - 1] !== overlay) return;
            e.stopPropagation();
            close();
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey));
        // Como 'remove' não dispara DOM event nativo, observamos via MutationObserver.
        const mo = new MutationObserver(() => {
            if (!document.body.contains(overlay)) {
                document.removeEventListener('keydown', onKey);
                mo.disconnect();
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });

        document.body.appendChild(overlay);
        return { overlay, close };
    },

    escapeHtml(text) {
        if (text === undefined || text === null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    async manageDictionaryStructure(id) {
        try {
            this.closeDictionaryModal();
            this.closeDictionaryStructureManager();

            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}/full`, {
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }
            const dictData = await response.json();
            this.showDictionaryStructureManager(dictData);
        } catch (error) {
            console.error('[Dicionário] manageDictionaryStructure falhou:', error);
            const msg = (error.message || '').includes('Failed to fetch')
                ? 'Erro de conexão. Verifique se o servidor está rodando.'
                : (error.message || 'Erro desconhecido');
            await window.adminConfirm({
                title: 'Erro ao carregar estrutura do dicionário',
                message: msg,
                confirmText: 'OK',
                cancelText: ' '
            });
        }
    },

    showDictionaryStructureManager(dictData) {
        this.closeDictionaryStructureManager();

        const esc = (s) => this.escapeHtml(s);
        const tables = Array.isArray(dictData.tables) ? dictData.tables : [];

        const tablesHtml = tables.length === 0
            ? '<div class="admin-placeholder">Nenhuma tabela definida neste dicionário.</div>'
            : tables.map(table => {
                const colsHtml = (Array.isArray(table.columns) && table.columns.length > 0)
                    ? `
                        <table class="dict-cols-table">
                            <thead>
                                <tr>
                                    <th>Coluna</th>
                                    <th>Tipo</th>
                                    <th>Descrição</th>
                                    <th class="dict-cols-actions">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${table.columns.map(col => `
                                    <tr>
                                        <td class="dict-col-name">${esc(col.name)}</td>
                                        <td class="dict-col-type">${esc(col.type)}</td>
                                        <td class="dict-col-desc" title="${esc(col.description || '')}">${esc(col.description || '—')}</td>
                                        <td class="dict-cols-actions">
                                            <button type="button" class="btn-small btn-edit" data-action="edit-col"
                                                    data-dict-id="${dictData.id}"
                                                    data-table-id="${table.id}"
                                                    data-col-id="${col.id || 0}"
                                                    data-col-name="${esc(col.name || '')}"
                                                    data-col-type="${esc(col.type || '')}"
                                                    data-col-desc="${esc(col.description || '')}"
                                                    title="Editar coluna" aria-label="Editar coluna">
                                                <i class="fas fa-pen" aria-hidden="true"></i>
                                            </button>
                                            <button type="button" class="btn-small btn-delete" data-action="del-col"
                                                    data-dict-id="${dictData.id}"
                                                    data-table-id="${table.id}"
                                                    data-col-id="${col.id || 0}"
                                                    data-col-name="${esc(col.name || '')}"
                                                    title="Excluir coluna" aria-label="Excluir coluna">
                                                <i class="fas fa-trash" aria-hidden="true"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `
                    : '<p class="dict-empty-cols">Nenhuma coluna definida.</p>';

                return `
                    <div class="dict-table-card">
                        <div class="dict-table-head">
                            <div class="dict-table-info">
                                <h4>${esc(table.name)}</h4>
                                ${table.description ? `<p title="${esc(table.description)}">${esc(table.description)}</p>` : ''}
                                <small>${(table.columns ? table.columns.length : 0)} coluna(s)</small>
                            </div>
                            <div class="dict-table-actions">
                                <button type="button" class="btn-small btn-edit" data-action="add-col"
                                        data-dict-id="${dictData.id}" data-table-id="${table.id}"
                                        title="Adicionar coluna">
                                    <i class="fas fa-plus" aria-hidden="true"></i><span class="btn-label">Coluna</span>
                                </button>
                                <button type="button" class="btn-small btn-edit" data-action="edit-table"
                                        data-dict-id="${dictData.id}" data-table-id="${table.id}"
                                        data-table-name="${esc(table.name || '')}"
                                        data-table-desc="${esc(table.description || '')}"
                                        title="Editar tabela" aria-label="Editar tabela">
                                    <i class="fas fa-pen" aria-hidden="true"></i>
                                </button>
                                <button type="button" class="btn-small btn-delete" data-action="del-table"
                                        data-dict-id="${dictData.id}" data-table-id="${table.id}"
                                        data-table-name="${esc(table.name || '')}"
                                        title="Excluir tabela" aria-label="Excluir tabela">
                                    <i class="fas fa-trash" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>
                        <div class="dict-table-cols">${colsHtml}</div>
                    </div>
                `;
            }).join('');

        const statusBadges = `
            <span class="page-list-badge ${dictData.isActive ? 'badge-green' : 'badge-gray'}">
                ${dictData.isActive ? 'ATIVO' : 'INATIVO'}
            </span>
            ${dictData.isDefault ? '<span class="page-list-badge badge-blue">PADRÃO</span>' : ''}
            <span class="page-list-badge badge-gray">${tables.length} tabela(s)</span>
        `;

        const body = `
            <div class="dict-struct-summary">
                <div class="dict-struct-meta">
                    <strong>${esc(dictData.name)}</strong>
                    ${dictData.description ? `<p>${esc(dictData.description)}</p>` : ''}
                    <div class="dict-struct-badges">${statusBadges}</div>
                </div>
                <button type="button" class="btn btn-admin" data-action="add-table">
                    <i class="fas fa-plus" aria-hidden="true"></i> Nova tabela
                </button>
            </div>
            <h4 class="dict-struct-section-title">Tabelas e colunas</h4>
            <div class="dict-tables-list">${tablesHtml}</div>
        `;

        const footer = `
            <button type="button" class="btn" data-role="close-footer">Fechar</button>
            <button type="button" class="btn btn-admin" data-action="edit-dict">
                <i class="fas fa-pen" aria-hidden="true"></i> Editar dicionário
            </button>
        `;

        const { overlay, close } = this._buildAdminModal({
            id: 'dictionaryStructureModal',
            title: `Estrutura do dicionário`,
            bodyHTML: body,
            footerHTML: footer,
            size: 'wide'
        });

        // Wire-up dos botões com data-action.
        overlay.querySelector('[data-role="close-footer"]').addEventListener('click', close);
        overlay.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'add-table') return window.PortalAdmin.showCreateTableForm(dictData.id);
                if (action === 'edit-dict') return window.PortalAdmin.editDictionary(dictData.id);
                if (action === 'add-col') return window.PortalAdmin.showCreateColumnForm(parseInt(btn.dataset.dictId), parseInt(btn.dataset.tableId));
                if (action === 'edit-table') return window.PortalAdmin.editTable(
                    parseInt(btn.dataset.dictId), parseInt(btn.dataset.tableId),
                    btn.dataset.tableName, btn.dataset.tableDesc);
                if (action === 'del-table') return window.PortalAdmin.deleteTable(
                    parseInt(btn.dataset.dictId), parseInt(btn.dataset.tableId), btn.dataset.tableName);
                if (action === 'edit-col') return window.PortalAdmin.editColumn(
                    parseInt(btn.dataset.dictId), parseInt(btn.dataset.tableId), parseInt(btn.dataset.colId),
                    btn.dataset.colName, btn.dataset.colType, btn.dataset.colDesc);
                if (action === 'del-col') return window.PortalAdmin.deleteColumn(
                    parseInt(btn.dataset.dictId), parseInt(btn.dataset.tableId), parseInt(btn.dataset.colId),
                    btn.dataset.colName);
            });
        });
    },

    _openDictionaryFormModal({ id, dict }) {
        const isEdit = !!id;
        const body = `
            <fieldset class="admin-fieldset">
                <legend class="admin-legend">Identificação</legend>
                <div class="form-group">
                    <label for="dictName">Nome do dicionário <span aria-hidden="true">*</span></label>
                    <input type="text" id="dictName" placeholder="Ex: Dicionário de Atendimentos" maxlength="200">
                </div>
                <div class="form-group">
                    <label for="dictDescription">Descrição</label>
                    <textarea id="dictDescription" rows="3" placeholder="Descreva o propósito deste dicionário…" maxlength="1000"></textarea>
                </div>
            </fieldset>
            <fieldset class="admin-fieldset">
                <legend class="admin-legend">Comportamento</legend>
                <label class="admin-checkbox-row">
                    <input type="checkbox" id="dictIsDefault">
                    <span>Definir como dicionário padrão</span>
                </label>
                <small class="admin-help">O dicionário padrão é usado pelo chatbot IA quando ativo.</small>
            </fieldset>
        `;
        const footer = `
            <button type="button" class="btn" data-role="cancel">Cancelar</button>
            <button type="button" class="btn btn-admin" data-role="save">${isEdit ? 'Atualizar dicionário' : 'Criar dicionário'}</button>
        `;
        const { overlay, close } = this._buildAdminModal({
            id: 'dictionaryModal',
            title: isEdit ? 'Editar dicionário' : 'Novo dicionário',
            bodyHTML: body,
            footerHTML: footer
        });
        if (dict) {
            overlay.querySelector('#dictName').value = dict.name || '';
            overlay.querySelector('#dictDescription').value = dict.description || '';
            overlay.querySelector('#dictIsDefault').checked = !!dict.isDefault;
        }
        overlay.querySelector('[data-role="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-role="save"]').addEventListener('click', () => this.saveDictionary(id || null));
        setTimeout(() => overlay.querySelector('#dictName')?.focus(), 50);
    },

    showCreateDictionaryForm() {
        this.closeDictionaryModal();
        this._openDictionaryFormModal({ id: null, dict: null });
    },

    async saveDictionary(id) {
        const name = document.getElementById('dictName').value.trim();
        const description = document.getElementById('dictDescription').value.trim();
        const isDefault = document.getElementById('dictIsDefault').checked;

        if (!name) {
            await window.adminConfirm({ title: 'Nome obrigatório', message: 'Informe o nome do dicionário.', confirmText: 'OK', cancelText: ' ' });
            return;
        }

        try {
            const url = id ? `${window.PortalApp.API_URL}/data-dictionaries/${id}` : `${window.PortalApp.API_URL}/data-dictionaries`;
            const method = id ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description, isDefault })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Erro ao salvar');
            }
            this.closeDictionaryModal();
            await this.loadDataDictionaries();
        } catch (error) {
            console.error('[Dicionário] saveDictionary falhou:', error);
            await window.adminConfirm({ title: 'Erro ao salvar dicionário', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async deleteDictionary(id) {
        const ok = await window.adminConfirm({
            title: 'Excluir dicionário',
            message: 'Excluir este dicionário e todas as suas tabelas/colunas permanentemente?',
            confirmText: 'Excluir',
            destructive: true
        });
        if (!ok) return;

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Erro ao excluir');
            }
            await this.loadDataDictionaries();
        } catch (error) {
            console.error('[Dicionário] deleteDictionary falhou:', error);
            await window.adminConfirm({ title: 'Erro ao excluir dicionário', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async editDictionary(id) {
        try {
            this.closeDictionaryModal();
            this.closeDictionaryStructureManager();

            if (!window.PortalApp?.authToken) {
                await window.adminConfirm({ title: 'Sessão expirada', message: 'Faça login como administrador.', confirmText: 'OK', cancelText: ' ' });
                return;
            }

            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}`, {
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const dict = await response.json();
            this._openDictionaryFormModal({ id, dict });
        } catch (error) {
            console.error('[Dicionário] editDictionary falhou:', error);
            await window.adminConfirm({ title: 'Erro ao carregar dicionário', message: error.message || 'Não foi possível carregar os dados.', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async viewDictionary(id) {
        await this.manageDictionaryStructure(id);
    },

    async setDefaultDictionary(id) {
        const ok = await window.adminConfirm({
            title: 'Definir como padrão',
            message: 'Deseja definir este dicionário como padrão? Ele passará a ser usado pelo chatbot IA.',
            confirmText: 'Definir como padrão'
        });
        if (!ok) return;

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}/set-default`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await this.loadDataDictionaries();
        } catch (error) {
            console.error('[Dicionário] setDefaultDictionary falhou:', error);
            await window.adminConfirm({ title: 'Erro', message: 'Não foi possível definir como padrão.', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async toggleDictionaryStatus(id, btn) {
        if (!window.PortalApp?.authToken) {
            await window.adminConfirm({ title: 'Sessão expirada', message: 'Faça login como administrador.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        if (!btn) return;

        const wasActive = btn.dataset.active === 'true';
        btn.disabled = true;
        btn.classList.add('is-busy');
        const prevHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}/toggle-status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                let msg = errorData.message || errorData.error || `HTTP ${response.status}`;
                if (response.status === 400) msg = 'Não é possível desativar o dicionário padrão.';
                else if (response.status === 401 || response.status === 403) msg = 'Acesso negado. Faça login como administrador novamente.';
                throw new Error(msg);
            }
            const newActive = !wasActive;
            btn.dataset.active = String(newActive);
            this.setToggleButtonVisual(btn, newActive);
            await this.loadDataDictionaries();
        } catch (error) {
            console.error('[Dicionário] toggleDictionaryStatus falhou:', error);
            btn.innerHTML = prevHTML;
            this.setToggleButtonVisual(btn, wasActive);
            await window.adminConfirm({ title: 'Erro ao alterar status', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-busy');
        }
    },

    closeDictionaryStructureManager() {
        const modal = document.getElementById('dictionaryStructureModal');
        if (modal) modal.remove();
    },

    closeDictionaryModal() {
        const modal = document.getElementById('dictionaryModal');
        if (modal) modal.remove();
    },

    // === Tabelas do dicionário ===
    _openTableModal({ dictionaryId, tableId, name, description }) {
        const isEdit = !!tableId;
        const body = `
            <div class="form-group">
                <label for="tableName">Nome da tabela <span aria-hidden="true">*</span></label>
                <input type="text" id="tableName" placeholder="Ex: Atendimentos" maxlength="200">
            </div>
            <div class="form-group">
                <label for="tableDescription">Descrição</label>
                <textarea id="tableDescription" rows="3" placeholder="Descreva o propósito desta tabela…" maxlength="1000"></textarea>
            </div>
        `;
        const footer = `
            <button type="button" class="btn" data-role="cancel">Cancelar</button>
            <button type="button" class="btn btn-admin" data-role="save">${isEdit ? 'Atualizar tabela' : 'Criar tabela'}</button>
        `;
        const { overlay, close } = this._buildAdminModal({
            id: 'tableModal',
            title: isEdit ? 'Editar tabela' : 'Nova tabela',
            bodyHTML: body,
            footerHTML: footer
        });
        if (isEdit) {
            overlay.querySelector('#tableName').value = name || '';
            overlay.querySelector('#tableDescription').value = description || '';
        }
        overlay.querySelector('[data-role="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-role="save"]').addEventListener('click', () => this.saveTable(dictionaryId, tableId));
        setTimeout(() => overlay.querySelector('#tableName')?.focus(), 50);
    },

    showCreateTableForm(dictionaryId) {
        this._openTableModal({ dictionaryId });
    },

    editTable(dictionaryId, tableId, name, description) {
        this._openTableModal({ dictionaryId, tableId, name, description });
    },

    async saveTable(dictionaryId, tableId) {
        const name = document.getElementById('tableName')?.value?.trim();
        const description = document.getElementById('tableDescription')?.value?.trim();
        if (!name) {
            await window.adminConfirm({ title: 'Nome obrigatório', message: 'Informe o nome da tabela.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        try {
            const url = tableId
                ? `${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}`
                : `${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables`;
            const response = await fetch(url, {
                method: tableId ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Erro ao salvar');
            }
            document.getElementById('tableModal')?.remove();
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('[Tabela] saveTable falhou:', error);
            await window.adminConfirm({ title: 'Erro ao salvar tabela', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async deleteTable(dictionaryId, tableId, tableName) {
        const ok = await window.adminConfirm({
            title: 'Excluir tabela do dicionário',
            message: `Excluir "${tableName}" e todas as suas colunas?`,
            confirmText: 'Excluir',
            destructive: true
        });
        if (!ok) return;
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Erro ao excluir');
            }
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('[Tabela] deleteTable falhou:', error);
            await window.adminConfirm({ title: 'Erro ao excluir tabela', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    // === Colunas do dicionário ===
    _COLUMN_TYPES: ['INT', 'BIGINT', 'VARCHAR(50)', 'VARCHAR(200)', 'VARCHAR(MAX)', 'NVARCHAR(200)', 'DATE', 'DATETIME', 'DECIMAL(18,2)', 'BIT'],

    _openColumnModal({ dictionaryId, tableId, columnId, name, type, description }) {
        const isEdit = !!columnId;
        const typesOpts = this._COLUMN_TYPES.map(t =>
            `<option value="${t}"${t === type ? ' selected' : ''}>${t}</option>`
        ).join('');
        const body = `
            <div class="form-group">
                <label for="columnName">Nome <span aria-hidden="true">*</span></label>
                <input type="text" id="columnName" placeholder="Ex: DataAtendimento" maxlength="200">
            </div>
            <div class="form-group">
                <label for="columnType">Tipo <span aria-hidden="true">*</span></label>
                <select id="columnType">
                    <option value="">Selecione…</option>
                    ${typesOpts}
                </select>
            </div>
            <div class="form-group">
                <label for="columnDescription">Descrição</label>
                <textarea id="columnDescription" rows="2" placeholder="Descreva o que esta coluna representa…"></textarea>
            </div>
        `;
        const footer = `
            <button type="button" class="btn" data-role="cancel">Cancelar</button>
            <button type="button" class="btn btn-admin" data-role="save">${isEdit ? 'Atualizar coluna' : 'Criar coluna'}</button>
        `;
        const { overlay, close } = this._buildAdminModal({
            id: 'columnModal',
            title: isEdit ? 'Editar coluna' : 'Nova coluna',
            bodyHTML: body,
            footerHTML: footer
        });
        if (isEdit) {
            overlay.querySelector('#columnName').value = name || '';
            overlay.querySelector('#columnDescription').value = description || '';
        }
        overlay.querySelector('[data-role="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-role="save"]').addEventListener('click', () => this.saveColumn(dictionaryId, tableId, columnId));
        setTimeout(() => overlay.querySelector('#columnName')?.focus(), 50);
    },

    showCreateColumnForm(dictionaryId, tableId) {
        this._openColumnModal({ dictionaryId, tableId });
    },

    editColumn(dictionaryId, tableId, columnId, name, type, description) {
        this._openColumnModal({ dictionaryId, tableId, columnId, name, type, description });
    },

    async saveColumn(dictionaryId, tableId, columnId) {
        const name = document.getElementById('columnName')?.value?.trim();
        const type = document.getElementById('columnType')?.value;
        const description = document.getElementById('columnDescription')?.value?.trim();
        if (!name || !type) {
            await window.adminConfirm({ title: 'Campos obrigatórios', message: 'Nome e tipo são obrigatórios.', confirmText: 'OK', cancelText: ' ' });
            return;
        }
        try {
            const url = columnId
                ? `${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}/columns/${columnId}`
                : `${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}/columns`;
            const response = await fetch(url, {
                method: columnId ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, type, description })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Erro ao salvar');
            }
            document.getElementById('columnModal')?.remove();
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('[Coluna] saveColumn falhou:', error);
            await window.adminConfirm({ title: 'Erro ao salvar coluna', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    },

    async deleteColumn(dictionaryId, tableId, columnId, columnName) {
        const ok = await window.adminConfirm({
            title: 'Excluir coluna',
            message: `Excluir a coluna "${columnName}"?`,
            confirmText: 'Excluir',
            destructive: true
        });
        if (!ok) return;
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}/columns/${columnId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorData.error || 'Erro ao excluir');
            }
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('[Coluna] deleteColumn falhou:', error);
            await window.adminConfirm({ title: 'Erro ao excluir coluna', message: error.message || 'Erro desconhecido', confirmText: 'OK', cancelText: ' ' });
        }
    }

};

// Expor funções globais para compatibilidade com HTML
window.toggleAdmin = () => window.PortalAdmin.toggleAdmin();
window.openAdminPanel = () => window.PortalAdmin.openAdminPanel();
window.closeAdminPanel = () => window.PortalAdmin.closeAdminPanel();
window.editPage = (id) => window.PortalAdmin.editPage(id);
window.editMenuItem = (id) => window.PortalAdmin.editMenuItem(id);
window.loadPagesList = () => window.PortalAdmin.loadPagesList();
window.loadMenuStructure = () => window.PortalAdmin.loadMenuStructure();
window.updatePageSelect = () => window.PortalAdmin.updatePageSelect();
window.savePage = () => window.PortalAdmin.savePage();
window.saveMenuItem = () => window.PortalAdmin.saveMenuItem();
window.deletePage = (id) => window.PortalAdmin.deletePage(id);
window.deleteMenuItem = (id) => window.PortalAdmin.deleteMenuItem(id);
window.cancelPageEdit = () => window.PortalAdmin.cancelPageEdit();
window.cancelMenuEdit = () => window.PortalAdmin.cancelMenuEdit();
window.openPageModal = (id) => window.PortalAdmin.openPageModal(id);
window.openMenuItemModal = (id) => window.PortalAdmin.openMenuItemModal(id);
window.closeAdminModal = () => window.PortalAdmin._closeAdminModal();
window.expandAllMenuCategories = () => window.PortalAdmin.expandAllMenuCategories();
window.collapseAllMenuCategories = () => window.PortalAdmin.collapseAllMenuCategories();
window.loadUsersList = () => window.PortalAdmin.loadUsersList();
window.openUserModal = (id) => window.PortalAdmin.openUserModal(id);
window.saveUser = () => window.PortalAdmin.saveUser();
window.editUser = (id) => window.PortalAdmin.editUser(id);
window.deleteUser = (id, username) => window.PortalAdmin.deleteUser(id, username);
window.loadDataDictionaries = () => window.PortalAdmin.loadDataDictionaries();
window.manageDictionaryStructure = (id) => window.PortalAdmin.manageDictionaryStructure(id);
window.closeDictionaryStructureManager = () => window.PortalAdmin.closeDictionaryStructureManager();

// Expor novas funções de dicionários
window.showCreateDictionaryForm = () => window.PortalAdmin.showCreateDictionaryForm();
window.saveDictionary = (id) => window.PortalAdmin.saveDictionary(id);
window.deleteDictionary = (id) => window.PortalAdmin.deleteDictionary(id);

// Expor funções de gerenciamento de tabelas
window.showCreateTableForm = (dictId) => window.PortalAdmin.showCreateTableForm(dictId);
window.editTable = (dictId, tableId, name, desc) => window.PortalAdmin.editTable(dictId, tableId, name, desc);
window.saveTable = (dictId, tableId) => window.PortalAdmin.saveTable(dictId, tableId);
window.deleteTable = (dictId, tableId, name) => window.PortalAdmin.deleteTable(dictId, tableId, name);

// Expor funções de gerenciamento de colunas
window.showCreateColumnForm = (dictId, tableId) => window.PortalAdmin.showCreateColumnForm(dictId, tableId);
window.editColumn = (dictId, tableId, colId, name, type, desc) => window.PortalAdmin.editColumn(dictId, tableId, colId, name, type, desc);
window.saveColumn = (dictId, tableId, colId) => window.PortalAdmin.saveColumn(dictId, tableId, colId);
window.deleteColumn = (dictId, tableId, colId, name) => window.PortalAdmin.deleteColumn(dictId, tableId, colId, name);

// NOVA função global para o Tutorial Builder
window.openTutorialBuilder = (pageId) => window.PortalAdmin.openTutorialBuilder(pageId);

window.switchTab = (tab, event) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    
    if (event && event.target) event.target.classList.add('active');
    
    const tabContent = document.getElementById(tab + 'Tab');
    if (tabContent) tabContent.classList.add('active');
    
    if (tab === 'dictionary' && window.PortalAdmin) {
        console.log('Dictionary tab activated, loading dictionaries...');
        window.PortalAdmin.loadDataDictionaries();
    }

    if (tab === 'users' && window.PortalAdmin) {
        window.PortalAdmin.loadUsersList();
    }
    
    // NOVO: Reconstruir dropdowns de ícones ao trocar para abas que os usam
    if ((tab === 'pages' || tab === 'menu' || tab === 'config') && window.PortalIcons) {
        setTimeout(() => {
            console.log('[Admin] Reconstruindo paletas de ícones para aba:', tab);
            if (typeof window.PortalIcons.buildAllPalettes === 'function') {
                window.PortalIcons.buildAllPalettes();
                console.log('[Admin] ✅ Paletas reconstruídas');
            }
        }, 100);
    }
};

// Redimensionamento do painel admin
(function() {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    const MIN_WIDTH = 400;
    const MAX_WIDTH = 1200;

    function initResize() {
        const panel = document.getElementById('adminPanel');
        if (!panel) return;

        // Criar handle de redimensionamento se não existir
        let handle = panel.querySelector('.resize-handle');
        if (!handle) {
            handle = document.createElement('div');
            handle.className = 'resize-handle';
            handle.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                width: 5px;
                height: 100%;
                cursor: ew-resize;
                background: transparent;
                z-index: 10;
            `;
            panel.insertBefore(handle, panel.firstChild);

            // Indicador visual ao hover
            handle.addEventListener('mouseenter', () => {
                handle.style.background = 'rgba(0, 102, 204, 0.3)';
            });
            handle.addEventListener('mouseleave', () => {
                if (!isResizing) handle.style.background = 'transparent';
            });
        }

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const panel = document.getElementById('adminPanel');
        if (!panel) return;

        const delta = startX - e.clientX;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
        
        panel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        
        isResizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        const panel = document.getElementById('adminPanel');
        if (panel) {
            localStorage.setItem('adminPanelWidth', panel.offsetWidth);
            const handle = panel.querySelector('.resize-handle');
            if (handle) handle.style.background = 'transparent';
        }
    });

    // Inicializar quando o painel abrir
    const originalOpenPanel = window.PortalAdmin.openAdminPanel;
    window.PortalAdmin.openAdminPanel = function() {
        originalOpenPanel.call(this);
        setTimeout(initResize, 100);
    };
})();

console.log('[Admin] Módulo carregado com Tutorial Builder');