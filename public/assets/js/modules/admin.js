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
            this.openAdminPanel();
        }
    },

    openAdminPanel() {
        const panel = document.getElementById('adminPanel');
        panel.classList.add('show');
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
    },

    closeAdminPanel() {
        document.getElementById('adminPanel').classList.remove('show');
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
            container.innerHTML = '<div style="text-align:center;color:#999;padding:24px;">Nenhuma página encontrada.</div>';
            return;
        }

        pages.forEach((page, index) => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;min-width:0;';

            let badges = '';
            if (page.showInHome !== false) badges += '<span class="page-list-badge badge-blue">HOME</span>';
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

            const isFirst = index === 0;
            const isLast = index === (pages.length - 1);

            const upBtn = document.createElement('button');
            upBtn.className = 'btn-small btn-move';
            upBtn.title = 'Mover para cima';
            upBtn.textContent = '↑';
            upBtn.disabled = isFirst;
            upBtn.dataset.pageMove = page.id;
            upBtn.addEventListener('click', () => this.movePageUp(page.id));

            const downBtn = document.createElement('button');
            downBtn.className = 'btn-small btn-move';
            downBtn.title = 'Mover para baixo';
            downBtn.textContent = '↓';
            downBtn.disabled = isLast;
            downBtn.dataset.pageMove = page.id;
            downBtn.addEventListener('click', () => this.movePageDown(page.id));

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-small btn-edit';
            editBtn.textContent = 'Editar';
            editBtn.addEventListener('click', () => this.editPage(page.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-small btn-delete';
            deleteBtn.textContent = 'Excluir';
            deleteBtn.addEventListener('click', () => this.deletePage(page.id));

            actionsDiv.appendChild(upBtn);
            actionsDiv.appendChild(downBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            this.addTutorialButtonToPage(page.id, actionsDiv);

            item.appendChild(infoDiv);
            item.appendChild(actionsDiv);
            container.appendChild(item);
        });
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
        if (isEdit && !page) return alert('Página não encontrada');

        window.PortalApp.editingPageId = pageId || null;

        const overlay = document.createElement('div');
        overlay.id = 'adminModalOverlay';
        overlay.className = 'admin-modal-overlay';
        overlay.addEventListener('click', (e) => { e.stopPropagation(); });

        overlay.innerHTML = `
        <div class="admin-modal">
            <div class="admin-modal-header">
                <h3>${isEdit ? 'Editar Página' : 'Nova Página'}</h3>
                <button class="admin-modal-close" onclick="closeAdminModal()">&times;</button>
            </div>
            <div class="form-group">
                <label>Título da Página</label>
                <input type="text" id="pageNameInput" placeholder="Ex: Dashboard de Vendas">
            </div>
            <div class="form-group">
                <label>Subtítulo</label>
                <input type="text" id="pageSubtitleInput" placeholder="Ex: Análise detalhada de vendas">
            </div>
            <div class="form-group">
                <label>Descrição</label>
                <textarea id="pageDescInput" placeholder="Descrição detalhada da página..."></textarea>
            </div>
            <div class="form-group">
                <label>URL do Power BI Embed</label>
                <input type="text" id="powerbiUrlInput" placeholder="https://app.powerbi.com/view?r=...">
            </div>
            <div class="form-group">
                <label>URL de Redirecionamento (opcional)</label>
                <input type="text" id="redirectPowerbiUrlInput" placeholder="https://app.powerbi.com/view?r=...">
                <small class="admin-help">Se preenchida, será usada apenas para os e-mails abaixo.</small>
            </div>
            <div class="form-group">
                <label>E-mails Microsoft para redirecionamento (opcional)</label>
                <textarea id="redirectEmailsInput" placeholder="usuario1@aacd.org.br&#10;usuario2@aacd.org.br" rows="3"></textarea>
                <small class="admin-help">Um e-mail por linha. Aceita vírgula ou ponto e vírgula.</small>
            </div>
            <div class="form-group" style="border-top:1px solid #e5e7eb; padding-top:14px; margin-top:14px;">
                <label class="admin-inline-row">
                    <input type="checkbox" id="useEmbedCheckbox">
                    <span><strong>Usar Power BI Embedded</strong> (gera token via Service Principal)</span>
                </label>
                <small class="admin-help">Quando ligado, o portal ignora a URL iframe acima e renderiza via embed token. Requer Workspace ID e Report ID abaixo.</small>
            </div>
            <div class="form-group">
                <label>Cole uma URL do Power BI Service para extrair IDs (opcional)</label>
                <input type="text" id="embedUrlPasteInput" placeholder="https://app.fabric.microsoft.com/groups/{workspaceId}/reports/{reportId}?..." />
                <small class="admin-help">Cole a URL e os campos abaixo serão preenchidos automaticamente.</small>
            </div>
            <div class="form-group">
                <label>Workspace ID (GUID)</label>
                <input type="text" id="embedWorkspaceIdInput" placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div class="form-group">
                <label>Report ID (GUID)</label>
                <input type="text" id="embedReportIdInput" placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div class="form-group">
                <label class="admin-inline-row">
                    <input type="checkbox" id="showInHomeCheckbox">
                    <span>Mostrar na tela inicial (Acesso Rápido)</span>
                </label>
            </div>
            <div class="form-group">
                <label>Ícone do Card (opcional)</label>
                <div class="admin-inline-row">
                    <input type="text" id="pageIconInput" placeholder="Ex: 📊 ou escolha abaixo" class="admin-flex-1">
                    <div id="pageIconPreview" class="icon-preview" title="Preview do ícone"></div>
                </div>
                <div id="pageIconDropdown" class="admin-dropdown">
                    <div id="pageIconDropdownToggle" class="admin-dropdown-toggle">
                        <span id="pageIconDropdownSelected" class="admin-inline-row"><span class="admin-muted">Selecione um ícone...</span></span>
                        <span class="admin-dropdown-caret">›</span>
                    </div>
                    <div id="pageIconDropdownMenu" class="admin-dropdown-menu" style="display:none;"></div>
                </div>
            </div>
            <div class="admin-modal-actions">
                <button class="btn" onclick="closeAdminModal()">Cancelar</button>
                <button class="btn btn-admin" id="savePageBtn" onclick="savePage()">${isEdit ? 'Atualizar Página' : 'Salvar Página'}</button>
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
        if (isEdit && !item) return alert('Item não encontrado');

        window.PortalApp.editingMenuId = menuItemId || null;

        const overlay = document.createElement('div');
        overlay.id = 'adminModalOverlay';
        overlay.className = 'admin-modal-overlay';
        overlay.addEventListener('click', (e) => { e.stopPropagation(); });

        overlay.innerHTML = `
        <div class="admin-modal">
            <div class="admin-modal-header">
                <h3>${isEdit ? 'Editar Item do Menu' : 'Novo Item do Menu'}</h3>
                <button class="admin-modal-close" onclick="closeAdminModal()">&times;</button>
            </div>
            <div class="form-group">
                <label>Nome do Item</label>
                <input type="text" id="menuItemInput" placeholder="Ex: Financeiro">
            </div>
            <div class="form-group">
                <label>Tipo</label>
                <select id="menuTypeSelect">
                    <option value="item">Item Simples</option>
                    <option value="category">Categoria (com subitens)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Ícone (emoji ou classe)</label>
                <div class="admin-inline-row">
                    <input type="text" id="menuIconInput" placeholder="Ex: 📊 ou fas fa-chart" class="admin-flex-1">
                    <div id="menuIconPreview" class="icon-preview" title="Preview do ícone"></div>
                </div>
                <div id="iconDropdown" class="admin-dropdown">
                    <div id="iconDropdownToggle" class="admin-dropdown-toggle">
                        <span id="iconDropdownSelected" class="admin-inline-row"><span class="admin-muted">Selecione um ícone...</span></span>
                        <span class="admin-dropdown-caret">›</span>
                    </div>
                    <div id="iconDropdownMenu" class="admin-dropdown-menu" style="display:none;"></div>
                </div>
            </div>
            <div class="form-group" id="parentSelectGroup" style="display:none;">
                <label>Item Pai (Categoria)</label>
                <select id="parentSelect">
                    <option value="">Nenhum (Nível Principal)</option>
                </select>
                <small class="admin-help">Selecione uma categoria existente para criar subitens.</small>
            </div>
            <div class="form-group" id="pageSelectGroup">
                <label>Página Associada</label>
                <input type="hidden" id="pageSelect" value="">
                <div class="page-search-select" id="pageSearchSelect">
                    <input type="text" id="pageSearchInput" class="page-search-input" placeholder="Buscar página..." autocomplete="off">
                    <div id="pageSearchResults" class="page-search-results"></div>
                </div>
                <small class="admin-help">Apenas itens simples podem ter páginas associadas.</small>
            </div>
            <div class="admin-modal-actions">
                <button class="btn" onclick="closeAdminModal()">Cancelar</button>
                <button class="btn btn-admin" id="saveMenuBtn" onclick="saveMenuItem()">${isEdit ? 'Atualizar Item' : 'Adicionar ao Menu'}</button>
            </div>
        </div>`;

        // Inserir dentro do adminPanel para herdar estilos CSS dos dropdowns
        const adminPanel = document.getElementById('adminPanel');
        (adminPanel || document.body).appendChild(overlay);

        // Preencher selects
        this._populateModalParentSelect();
        this.updatePageSelect();

        // Configurar handler do tipo
        const typeSelect = document.getElementById('menuTypeSelect');
        typeSelect.addEventListener('change', function() {
            const psg = document.getElementById('parentSelectGroup');
            const pgsg = document.getElementById('pageSelectGroup');
            if (this.value === 'category') {
                if (psg) psg.style.display = 'block';
                if (pgsg) { pgsg.style.display = 'none'; const ps = document.getElementById('pageSelect'); if (ps) ps.value = ''; }
            } else {
                if (psg) psg.style.display = 'block';
                if (pgsg) pgsg.style.display = 'block';
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

        container.innerHTML = '';

        const parentSelect = document.getElementById('parentSelect');
        if (parentSelect) parentSelect.innerHTML = '<option value="">Nenhum (Nível Principal)</option>';

        const rootItems = [...window.PortalApp.menuData].sort((a, b) => {
            const ao = a.order ?? 0, bo = b.order ?? 0;
            return ao !== bo ? ao - bo : a.id - b.id;
        });

        this._renderMenuItems(container, rootItems, 0);
        if (parentSelect) this._populateParentSelect(parentSelect, rootItems, 0);
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

    _initMenuDragDrop(rootContainer) {
        let draggedWrapper = null;
        let dropTarget = null;
        let dropPos = null;
        const self = this;

        const clearDropHighlight = () => {
            rootContainer.querySelectorAll('.drag-drop-before, .drag-drop-after').forEach(el => {
                el.classList.remove('drag-drop-before', 'drag-drop-after');
            });
            dropTarget = null;
            dropPos = null;
        };

        rootContainer.addEventListener('dragstart', (e) => {
            const wrapper = e.target.closest('.menu-item-wrapper');
            if (!wrapper) return;
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
            if (target.parentNode !== draggedWrapper.parentNode) { clearDropHighlight(); return; }
            if (draggedWrapper.contains(target)) { clearDropHighlight(); return; }

            const itemEl = target.querySelector(':scope > .menu-list-item');
            const rect = (itemEl || target).getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const pos = e.clientY < midY ? 'before' : 'after';

            // So atualizar classe se mudou
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
            if (dropContainer !== draggedWrapper.parentNode) { clearDropHighlight(); return; }

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

            self._applyMenuDragOrder(orderUpdates);
        });
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
            alert(`Erro ao reordenar: ${err.message}`);
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

            if (!Array.isArray(users) || users.length === 0) {
                container.innerHTML = '<div class="admin-placeholder">Nenhum usuário encontrado.</div>';
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
                    adminBadge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #14532d; color: white; border-radius: 10px; font-size: 10px;';
                    adminBadge.textContent = 'ADMIN';
                    infoDiv.appendChild(adminBadge);
                }

                if (!user.isActive) {
                    const inactiveBadge = document.createElement('span');
                    inactiveBadge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #6b7280; color: white; border-radius: 10px; font-size: 10px;';
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
                    <button class="btn-small btn-edit" onclick="editUser(${user.id})">Editar</button>
                    <button class="btn-small btn-delete" onclick="deleteUser(${user.id}, '${String(user.username).replace(/'/g, "\\'")}')">Excluir</button>
                `;

                item.appendChild(infoDiv);
                item.appendChild(actionsDiv);
                container.appendChild(item);
            });
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            container.innerHTML = `<div class="admin-placeholder">${error.message || 'Erro ao carregar usuários.'}</div>`;
        }
    },

    clearUserForm() {
        document.getElementById('userUsernameInput').value = '';
        document.getElementById('userFullNameInput').value = '';
        document.getElementById('userEmailInput').value = '';
        document.getElementById('userPasswordInput').value = '';
        document.getElementById('userIsAdminCheckbox').checked = false;
        document.getElementById('userIsActiveCheckbox').checked = true;
    },

    cancelUserEdit() {
        window.PortalApp.editingUserId = null;
        this.clearUserForm();
        document.getElementById('saveUserBtn').textContent = 'Salvar Usuário';
        document.getElementById('cancelUserEditBtn').style.display = 'none';
    },

    async editUser(id) {
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/users`, {
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Erro ao carregar dados do usuário');
            }

            const users = await response.json();
            const user = Array.isArray(users) ? users.find((item) => item.id === id) : null;
            if (!user) {
                alert('Usuário não encontrado.');
                return;
            }

            window.PortalApp.editingUserId = id;
            document.getElementById('userUsernameInput').value = user.username || '';
            document.getElementById('userFullNameInput').value = user.fullName || '';
            document.getElementById('userEmailInput').value = user.email || '';
            document.getElementById('userPasswordInput').value = '';
            document.getElementById('userIsAdminCheckbox').checked = !!user.isAdmin;
            document.getElementById('userIsActiveCheckbox').checked = !!user.isActive;
            document.getElementById('saveUserBtn').textContent = 'Atualizar Usuário';
            document.getElementById('cancelUserEditBtn').style.display = 'inline-block';
        } catch (error) {
            console.error('Erro ao editar usuário:', error);
            alert(error.message || 'Erro ao carregar usuário');
        }
    },

    async saveUser() {
        if (!window.PortalApp.authToken || !window.PortalApp.isAdmin) {
            alert('Faça login como administrador para gerenciar usuários.');
            return;
        }

        const username = document.getElementById('userUsernameInput').value.trim();
        const fullName = document.getElementById('userFullNameInput').value.trim();
        const email = document.getElementById('userEmailInput').value.trim();
        const password = document.getElementById('userPasswordInput').value;
        const isAdmin = document.getElementById('userIsAdminCheckbox').checked;
        const isActive = document.getElementById('userIsActiveCheckbox').checked;

        if (!username) {
            alert('Informe o usuário.');
            return;
        }

        if (!window.PortalApp.editingUserId && !password) {
            alert('Informe a senha para criar o usuário.');
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
                        isActive
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || 'Erro ao salvar usuário');
            }

            this.cancelUserEdit();
            await this.loadUsersList();
            alert(isEditing ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            alert(error.message || 'Erro ao salvar usuário');
        }
    },

    async deleteUser(id, username) {
        if (!confirm(`Deseja realmente remover o usuário "${username}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${window.PortalApp.API_URL}/users/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(errorData.error || 'Erro ao excluir usuário');
            }

            if (window.PortalApp.editingUserId === id) {
                this.cancelUserEdit();
            }

            await this.loadUsersList();
            alert('Usuário removido com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            alert(error.message || 'Erro ao excluir usuário');
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
            alert('Por favor, preencha o título da página'); 
            return; 
        }
        if (!window.PortalApp.authToken) { 
            alert('Faça login como administrador para salvar páginas'); 
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
            const proceed = confirm(`Alguns campos excedem o tamanho suportado pelo banco e serão truncados: ${truncatedFields.join(', ')}.\nDeseja continuar?`);
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
                try { 
                    const json = await response.json(); 
                    bodyText = json.error || JSON.stringify(json); 
                } catch(e) { 
                    bodyText = await response.text().catch(() => response.statusText); 
                }
                console.error('savePage failed', response.status, bodyText);
                alert(`Erro ao salvar página: ${bodyText} (status ${response.status})`);
                return;
            }

            this._closeAdminModal();

            await window.PortalData.loadDataFromAPI();

            if (window.PortalApp.selectedPageId === null && window.PortalPages) {
                window.PortalPages.loadQuickAccessCards();
            }

            alert('Página salva com sucesso!');
            
        } catch (err) {
            console.error('Erro ao finalizar salvamento de página:', err);
            alert(`Erro ao salvar página: ${err.message || err}`);
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
            alert('Por favor, preencha o nome do item'); 
            return; 
        }

        if (!window.PortalApp.authToken) { 
            alert('Faça login como administrador para alterar o menu'); 
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
            
            if (response.ok) {
                this._closeAdminModal();
                await window.PortalData.loadDataFromAPI();
                alert(method === 'PUT' ? 'Item atualizado com sucesso!' : 'Item adicionado ao menu!');
            } else {
                let bodyText = '';
                try { 
                    const json = await response.json(); 
                    bodyText = json.error || JSON.stringify(json); 
                } catch(e) { 
                    bodyText = await response.text().catch(() => response.statusText); 
                }
                alert(`Erro ao salvar item: ${bodyText}`);
            }
        } catch (err) {
            alert('Erro de conexão ao salvar item do menu.');
        }
    },

    async deletePage(id) {
        if (!confirm('Tem certeza que deseja excluir esta página?')) return;
        if (!window.PortalApp.authToken) { 
            alert('Faça login como administrador para excluir páginas'); 
            return; 
        }
        
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/pages/${id}`, { 
                method: 'DELETE', 
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            
            if (response.ok) { 
                await window.PortalData.loadDataFromAPI(); 
                alert('Página excluída!'); 
            } else {
                let bodyText = '';
                try { 
                    const json = await response.json(); 
                    bodyText = json.error || JSON.stringify(json); 
                } catch(e) { 
                    bodyText = await response.text().catch(() => response.statusText); 
                }
                alert(`Erro ao excluir página: ${bodyText}`);
            }
        } catch (err) {
            alert('Erro de conexão ao excluir página.');
        }
    },

    async deleteMenuItem(id) {
        if (!confirm('Tem certeza que deseja excluir este item?')) return;
        if (!window.PortalApp.authToken) {
            alert('Faça login como administrador para excluir itens do menu');
            return;
        }
        
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/menu/${id}`, { 
                method: 'DELETE', 
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            
            if (response.ok) { 
                await window.PortalData.loadDataFromAPI(); 
                alert('Item excluído com sucesso!'); 
            } else {
                let errorMessage = 'Erro desconhecido';
                try { 
                    const errorData = await response.json(); 
                    errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
                } catch(e) { 
                    errorMessage = await response.text().catch(() => `Status ${response.status}: ${response.statusText}`);
                }
                
                if (response.status === 403) {
                    alert('Acesso negado. Verifique se você está logado como administrador.');
                } else if (response.status === 404) {
                    alert('Item não encontrado ou já foi excluído.');
                    await window.PortalData.loadDataFromAPI();
                } else {
                    alert(`Erro ao excluir item: ${errorMessage}`);
                }
            }
        } catch (err) {
            console.error('Network error deleting menu item:', err);
            alert('Erro de conexão ao excluir item do menu.');
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

    async movePageUp(id) {
        await this.movePage(id, -1);
    },

    async movePageDown(id) {
        await this.movePage(id, +1);
    },

    async movePage(id, direction) {
        if (!window.PortalApp.authToken) { 
            alert('Faça login como administrador'); 
            return; 
        }
        
        const pg = window.PortalApp.pagesData.find(p => p.id === id);
        if (!pg) { 
            alert('Página não encontrada'); 
            return; 
        }

        const plan = this.computePageReorderPlan(window.PortalApp.pagesData, id, direction);
        if (!plan) return;

        const btns = document.querySelectorAll(`[data-page-move="${id}"]`);
        btns.forEach(b => {
            b.disabled = true;
            b.textContent = '⏳';
        });

        try {
            await this.applyPageReorderPlan(plan);
            await window.PortalData.loadDataFromAPI();
            if (window.PortalApp.selectedPageId === null && window.PortalPages) {
                window.PortalPages.loadQuickAccessCards();
            }
        } catch (err) {
            console.error('Erro ao reordenar páginas:', err);
            alert(`Erro ao reordenar "${pg.title || 'página'}": ${err.message}`);
            await window.PortalData.loadDataFromAPI();
        }
    },

    async moveMenuItemUp(id) {
        await this.moveMenuItem(id, -1);
    },

    async moveMenuItemDown(id) {
        await this.moveMenuItem(id, +1);
    },

    async moveMenuItem(id, direction) {
        if (!window.PortalApp.authToken) { 
            alert('Faça login como administrador'); 
            return; 
        }
        
        const item = this.findMenuItemById(window.PortalApp.menuData, id);
        if (!item) {
            alert('Item não encontrado');
            return;
        }
        
        const plan = this.computeReorderPlan(window.PortalApp.menuData, id, direction);
        if (!plan) return;
        
        try {
            const buttons = document.querySelectorAll(`[onclick*="moveMenuItemUp(${id})"], [onclick*="moveMenuItemDown(${id})"]`);
            buttons.forEach(btn => {
                btn.disabled = true;
                btn.textContent = '⏳';
            });
            
            await this.applyReorderPlan(plan);
            await window.PortalData.loadDataFromAPI();
            
        } catch (err) {
            console.error('Error moving item:', err);
            alert(`Erro ao reordenar item "${item.name}": ${err.message}`);
            await window.PortalData.loadDataFromAPI();
        }
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

    computeReorderPlan(rootMenu, itemId, direction) {
        const parent = this.findParentOfMenuItem(rootMenu, itemId);
        const siblings = parent ? parent.children : rootMenu;
        if (!Array.isArray(siblings) || siblings.length < 2) return null;

        const sorted = [...siblings].sort((a, b) => {
            const aOrder = a.order ?? 0;
            const bOrder = b.order ?? 0;
            if (aOrder === bOrder) {
                return a.id - b.id;
            }
            return aOrder - bOrder;
        });
        
        const currentIndex = sorted.findIndex(x => x.id === itemId);
        if (currentIndex < 0) return null;

        const targetIndex = currentIndex + direction;
        if (targetIndex < 0 || targetIndex >= sorted.length) return null;

        const currentItem = sorted[currentIndex];
        const targetItem = sorted[targetIndex];
        
        const newOrders = [];
        sorted.forEach((item, index) => {
            newOrders.push({
                id: item.id,
                originalIndex: index,
                newOrder: (index + 1) * 10
            });
        });
        
        const temp = newOrders[currentIndex];
        newOrders[currentIndex] = newOrders[targetIndex];
        newOrders[targetIndex] = temp;
        
        newOrders[currentIndex].newOrder = (targetIndex + 1) * 10;
        newOrders[targetIndex].newOrder = (currentIndex + 1) * 10;
        
        return [
            { id: currentItem.id, newOrder: newOrders[currentIndex].newOrder },
            { id: targetItem.id, newOrder: newOrders[targetIndex].newOrder }
        ];
    },

    async applyReorderPlan(plan) {
        if (!Array.isArray(plan) || plan.length === 0) return;

        try {
            const results = [];
            for (const update of plan) {
                const response = await fetch(`${window.PortalApp.API_URL}/menu/${update.id}/order`, {
                    method: 'PUT',
                    headers: { 
                        'Authorization': `Bearer ${window.PortalApp.authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ order: update.newOrder })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    results.push({ success: true, id: update.id, data });
                } else {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    results.push({ success: false, id: update.id, error: errorText });
                }
            }
            
            const failureCount = results.filter(r => !r.success).length;
            
            if (failureCount > 0) {
                const failedIds = results.filter(r => !r.success).map(r => r.id);
                throw new Error(`Falha ao atualizar alguns itens: ${failedIds.join(', ')}`);
            }
            
        } catch (err) {
            console.error('Error applying plan:', err);
            throw err;
        }
    },

    findParentOfMenuItem(items, id, parent = null) {
        for (const it of items) {
            if (it.id === id) return parent;
            if (it.children && it.children.length) {
                const found = this.findParentOfMenuItem(it.children, id, it);
                if (found !== null) return found;
            }
        }
        return null;
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
        container.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Carregando dicionários...</div>';
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
                <div style="text-align: center; color: #d32f2f; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                    <p>Erro ao carregar dicionários</p>
                    <p style="font-size: 12px; color: #666;">${error.message}</p>
                    <button onclick="window.PortalAdmin.loadDataDictionaries()" style="margin-top: 10px; padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer;">Tentar Novamente</button>
                </div>
            `;
        }
    },

    renderDataDictionaries(dictionaries) {
        const container = document.getElementById('dictionariesList');
        if (!container) return;

        if (!Array.isArray(dictionaries) || dictionaries.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #666; padding: 40px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
                    <p>Nenhum dicionário encontrado</p>
                    <button onclick="window.PortalAdmin.showCreateDictionaryForm()" class="btn-primary" style="margin-top: 10px;">Criar Primeiro Dicionário</button>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        dictionaries.forEach((dict) => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';

            const infoDiv = document.createElement('div');
            const strong = document.createElement('strong');
            strong.textContent = dict.name || 'Sem nome';
            infoDiv.appendChild(strong);

            if (dict.isDefault) {
                const badge = document.createElement('span');
                badge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #0066cc; color: white; border-radius: 10px; font-size: 10px;';
                badge.textContent = 'PADRÃO';
                infoDiv.appendChild(badge);
            }
            if (dict.isActive === false) {
                const inactive = document.createElement('span');
                inactive.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #757575; color: white; border-radius: 10px; font-size: 10px;';
                inactive.textContent = 'INATIVO';
                infoDiv.appendChild(inactive);
            }

            infoDiv.appendChild(document.createElement('br'));
            const small = document.createElement('small');
            small.style.color = 'var(--text-secondary)';
            const tableCount = (typeof dict.tableCount === 'number')
                ? dict.tableCount
                : (Array.isArray(dict.tables) ? dict.tables.length : 0);
            small.textContent = `${dict.description || 'Sem descrição'} • ${tableCount} tabela(s)`;
            infoDiv.appendChild(small);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'menu-list-item-actions';

            const manageBtn = document.createElement('button');
            manageBtn.className = 'btn-small';
            manageBtn.style.cssText = 'background: #FF9800; color: white;';
            manageBtn.title = 'Gerenciar Tabelas';
            manageBtn.textContent = '📋';
            manageBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                window.PortalAdmin.manageDictionaryStructure(dict.id);
            });

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-small btn-edit';
            editBtn.title = 'Editar';
            editBtn.textContent = '✏️';
            editBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                window.PortalAdmin.editDictionary(dict.id);
            });

            actionsDiv.appendChild(manageBtn);
            actionsDiv.appendChild(editBtn);

            if (!dict.isDefault) {
                const defaultBtn = document.createElement('button');
                defaultBtn.className = 'btn-small btn-primary';
                defaultBtn.title = 'Definir como padrão';
                defaultBtn.textContent = '⭐';
                defaultBtn.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    window.PortalAdmin.setDefaultDictionary(dict.id);
                });
                actionsDiv.appendChild(defaultBtn);
            }

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-small btn-toggle';
            toggleBtn.dataset.active = String(!!dict.isActive);
            
            this.setToggleButtonVisual(toggleBtn, !!dict.isActive);
            
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                console.log(`Toggle clicked for dictionary ${dict.id}, current active: ${dict.isActive}`);
                window.PortalAdmin.toggleDictionaryStatus(dict.id, toggleBtn);
            });
            
            actionsDiv.appendChild(toggleBtn);

            if (!dict.isDefault) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-small btn-delete';
                deleteBtn.title = 'Excluir';
                deleteBtn.textContent = '🗑️';
                deleteBtn.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    window.PortalAdmin.deleteDictionary(dict.id);
                });
                actionsDiv.appendChild(deleteBtn);
            }

            item.appendChild(infoDiv);
            item.appendChild(actionsDiv);
            container.appendChild(item);
        });
    },

    setToggleButtonVisual(btn, isActive) {
        if (!btn) return;
        
        btn.dataset.active = String(!!isActive);
        
        if (isActive) {
            btn.textContent = '🔴';
            btn.title = 'Clique para desativar';
            btn.style.background = '#f44336';
            btn.style.color = '#fff';
            btn.style.border = '1px solid #d32f2f';
        } else {
            btn.textContent = '🟢';
            btn.title = 'Clique para ativar';
            btn.style.background = '#4caf50';
            btn.style.color = '#fff';
            btn.style.border = '1px solid #388e3c';
        }
        
        btn.style.cursor = 'pointer';
        btn.style.transition = 'all 0.2s ease';
    },

    async manageDictionaryStructure(id) {
        console.log('=== MANAGING DICTIONARY STRUCTURE ===');
        console.log('Dictionary ID:', id);
        
        try {
            this.closeDictionaryModal();
            this.closeDictionaryStructureManager();
            
            console.log('Fetching dictionary data from API...');
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}/full`, {
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`
                }
            });
            
            console.log('API Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error(`Erro ao carregar dicionário: ${response.status} - ${errorText}`);
            }
            
            const dictData = await response.json();
            console.log('Dictionary data loaded:', dictData);
            
            this.showDictionaryStructureManager(dictData);
            
        } catch (error) {
            console.error('=== ERROR IN MANAGE DICTIONARY STRUCTURE ===');
            console.error('Error details:', error);
            console.error('Stack trace:', error.stack);
            
            let errorMessage = error.message || 'Erro desconhecido';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Erro de conexão. Verifique se o servidor está rodando.';
            }
            
            alert(`Erro ao carregar estrutura do dicionário:\n${errorMessage}\n\nVerifique o console para mais detalhes.`);
        }
    },

    showDictionaryStructureManager(dictData) {
        console.log('=== SHOWING STRUCTURE MANAGER ===');
        this.closeDictionaryStructureManager();
        
        const modal = document.createElement('div');
        modal.id = 'dictionaryStructureModal';
        modal.className = 'modal-overlay';
        
        let tablesHtml = '';
        if (dictData.tables && dictData.tables.length > 0) {
            dictData.tables.forEach((table) => {
                let columnsHtml = '';
                if (table.columns && table.columns.length > 0) {
                    columnsHtml = `
                        <table style="width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px;">
                            <thead>
                                <tr style="background: #f1f3f4;">
                                    <th style="padding: 5px 8px; text-align: left; border: 1px solid #ddd; font-size: 11px;">Coluna</th>
                                    <th style="padding: 5px 8px; text-align: left; border: 1px solid #ddd; font-size: 11px;">Tipo</th>
                                    <th style="padding: 5px 8px; text-align: left; border: 1px solid #ddd; max-width: 250px; font-size: 11px;">Descrição</th>
                                    <th style="padding: 5px 8px; text-align: center; border: 1px solid #ddd; width: 80px; font-size: 11px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${table.columns.map((col) => {
                                    const displayDesc = (col.description || '-').length > 80 
                                        ? (col.description || '').substring(0, 77) + '...' 
                                        : (col.description || '-');
                                    
                                    return `
                                    <tr>
                                        <td style="padding: 4px 8px; border: 1px solid #ddd; font-weight: 600; font-size: 12px;">${this.escapeHtml(col.name)}</td>
                                        <td style="padding: 4px 8px; border: 1px solid #ddd; font-family: monospace; background: #f8f9fa; font-size: 11px;">${this.escapeHtml(col.type)}</td>
                                        <td style="padding: 4px 8px; border: 1px solid #ddd; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;" title="${this.escapeHtml(col.description || '-')}">${this.escapeHtml(displayDesc)}</td>
                                        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">
                                            <button class="btn-small btn-edit btn-edit-column" 
                                                    data-dict-id="${dictData.id}" 
                                                    data-table-id="${table.id}" 
                                                    data-col-id="${col.id || 0}" 
                                                    data-col-name="${this.escapeHtml(col.name || '')}" 
                                                    data-col-type="${this.escapeHtml(col.type || '')}" 
                                                    data-col-desc="${this.escapeHtml(col.description || '')}">✏️</button>
                                            <button class="btn-small btn-delete btn-delete-column" 
                                                    data-dict-id="${dictData.id}" 
                                                    data-table-id="${table.id}" 
                                                    data-col-id="${col.id || 0}" 
                                                    data-col-name="${this.escapeHtml(col.name || '')}">🗑️</button>
                                        </td>
                                    </tr>
                                `}).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    columnsHtml = '<p style="color: #666; font-style: italic; margin-top: 10px;">Nenhuma coluna definida</p>';
                }
                
                const displayTableDesc = (table.description || '').length > 150 
                    ? (table.description || '').substring(0, 147) + '...' 
                    : (table.description || '');
                
                tablesHtml += `
                    <div class="table-card" style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
                        <div class="table-header" style="background: #f8f9fa; padding: 8px 12px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1; min-width: 0;">
                                <h4 style="margin: 0; color: #333; font-size: 14px;">${this.escapeHtml(table.name)}</h4>
                                ${table.description ? `<p style="margin: 2px 0 0 0; color: #666; font-size: 12px; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(table.description)}">${this.escapeHtml(displayTableDesc)}</p>` : ''}
                                <small style="color: #999; font-size: 11px;">ID: ${table.id} | ${table.columns ? table.columns.length : 0} coluna(s)</small>
                            </div>
                            <div style="flex-shrink: 0; margin-left: 10px; display: flex; gap: 4px;">
                                <button class="btn-small" style="background: #0066cc; color: white; padding: 4px 8px; font-size: 11px;" onclick="event.stopPropagation(); window.PortalAdmin.showCreateColumnForm(${dictData.id}, ${table.id})">+ Coluna</button>
                                <button class="btn-small btn-edit btn-edit-table" style="padding: 4px 8px; font-size: 11px;"
                                        data-dict-id="${dictData.id}" 
                                        data-table-id="${table.id}" 
                                        data-table-name="${this.escapeHtml(table.name || '')}" 
                                        data-table-desc="${this.escapeHtml(table.description || '')}">✏️</button>
                                <button class="btn-small btn-delete btn-delete-table" style="padding: 4px 8px; font-size: 11px;"
                                        data-dict-id="${dictData.id}" 
                                        data-table-id="${table.id}" 
                                        data-table-name="${this.escapeHtml(table.name || '')}">🗑️</button>
                            </div>
                        </div>
                        <div class="table-columns" style="padding: 8px;">
                            ${columnsHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            tablesHtml = '<p style="text-align: center; color: #666; font-style: italic; padding: 20px;">Nenhuma tabela definida neste dicionário</p>';
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 80vh;">
                <div class="modal-header">
                    <div>
                        <h3 style="font-size: 16px; margin: 0;">📋 Estrutura: ${this.escapeHtml(dictData.name)}</h3>
                        ${dictData.description ? `<p style="margin: 2px 0 0 0; color: #666; font-size: 12px;">${this.escapeHtml(dictData.description)}</p>` : ''}
                    </div>
                    <button type="button" class="modal-close" onclick="window.PortalAdmin.closeDictionaryStructureManager()">×</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; gap: 12px; align-items: center; padding: 8px 12px; background: #e3f2fd; border-radius: 6px; flex: 1; min-width: 200px;">
                            <div style="font-size: 12px;">
                                <span style="font-weight: 600; color: #1565c0;">Status:</span>
                                <span style="color: ${dictData.isActive ? '#2e7d32' : '#d32f2f'};">
                                    ${dictData.isActive ? '✅ Ativo' : '❌ Inativo'}
                                </span>
                            </div>
                            ${dictData.isDefault ? '<div><span style="background: #0066cc; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">⭐ PADRÃO</span></div>' : ''}
                            <div>
                                <span style="font-weight: 600; color: #1565c0;">Tabelas:</span>
                                <span>${dictData.tables ? dictData.tables.length : 0}</span>
                            </div>
                            <div>
                                <span style="font-weight: 600; color: #1565c0;">ID:</span>
                                <span>${dictData.id}</span>
                            </div>
                        </div>
                        <button onclick="window.PortalAdmin.showCreateTableForm(${dictData.id})" style="background: #0066cc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; white-space: nowrap;">+ Nova Tabela</button>
                    </div>
                    
                    <h4 style="margin-bottom: 15px; color: #333;">📋 Tabelas e Colunas</h4>
                    ${tablesHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="window.PortalAdmin.closeDictionaryStructureManager()">Fechar</button>
                    <button type="button" class="btn-primary" onclick="window.PortalAdmin.editDictionary(${dictData.id})">✏️ Editar Dicionário</button>
                </div>
            </div>
            
            <style>
                #dictionaryStructureModal {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5); display: none; align-items: center;
                    justify-content: center; z-index: 10001;
                }
                #dictionaryStructureModal.show { display: flex; }
                #dictionaryStructureModal .modal-content {
                    background: white !important; 
                    color: #333 !important;
                    border-radius: 8px; width: 85%;
                    max-width: 900px;
                    max-height: 80vh; 
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                #dictionaryStructureModal .modal-header {
                    padding: 12px 16px; border-bottom: 1px solid #eee;
                    display: flex; justify-content: space-between; align-items: center;
                    background-color: #f8f9fa !important;
                    flex-shrink: 0;
                }
                #dictionaryStructureModal .modal-header h3 { 
                    margin: 0; 
                    color: #333 !important;
                    font-size: 16px;
                }
                #dictionaryStructureModal .modal-header p {
                    color: #666 !important;
                    font-size: 12px;
                    margin: 0;
                }
                #dictionaryStructureModal .modal-close {
                    background: none; border: none; font-size: 20px; cursor: pointer;
                    color: #999 !important; padding: 0; width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                }
                #dictionaryStructureModal .modal-close:hover { 
                    background: #f5f5f5 !important; 
                    color: #333 !important; 
                }
                #dictionaryStructureModal .modal-body { 
                    padding: 12px 16px; 
                    background: white !important;
                    overflow-y: auto;
                    flex: 1;
                    min-height: 0;
                }
                #dictionaryStructureModal .modal-footer {
                    padding: 10px 16px; border-top: 1px solid #eee;
                    display: flex; justify-content: flex-end; gap: 8px;
                    background-color: #f8f9fa !important;
                    flex-shrink: 0;
                }
                #dictionaryStructureModal .btn-primary {
                    background: #0066cc !important; color: white !important; border: none;
                    padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px;
                }
                #dictionaryStructureModal .btn-primary:hover { background: #0052a3 !important; }
                #dictionaryStructureModal .btn-secondary {
                    background: #6c757d !important; color: white !important; border: none;
                    padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px;
                }
                #dictionaryStructureModal .btn-secondary:hover { background: #545b62 !important; }
                #dictionaryStructureModal .table-card {
                    background: white !important;
                    border: 1px solid #ddd !important;
                    margin-bottom: 8px;
                }
                #dictionaryStructureModal .table-header {
                    background: #f8f9fa !important;
                    border-bottom: 1px solid #ddd !important;
                    padding: 8px 12px !important;
                }
                #dictionaryStructureModal .table-header h4 {
                    color: #333 !important;
                    font-size: 14px !important;
                    margin: 0 !important;
                }
                #dictionaryStructureModal .table-header p {
                    color: #666 !important;
                    font-size: 12px !important;
                    margin: 2px 0 0 0 !important;
                }
                #dictionaryStructureModal .table-header small {
                    color: #999 !important;
                    font-size: 11px !important;
                }
                #dictionaryStructureModal .table-columns {
                    background: white !important;
                    padding: 8px !important;
                }
                #dictionaryStructureModal table {
                    background: white !important;
                    font-size: 12px !important;
                }
                #dictionaryStructureModal thead {
                    background: #f1f3f4 !important;
                }
                #dictionaryStructureModal th {
                    color: #333 !important;
                    background: #f1f3f4 !important;
                    border: 1px solid #ddd !important;
                    padding: 6px 8px !important;
                    font-size: 11px !important;
                }
                #dictionaryStructureModal td {
                    color: #333 !important;
                    background: white !important;
                    border: 1px solid #ddd !important;
                    padding: 4px 8px !important;
                    font-size: 12px !important;
                }
                #dictionaryStructureModal tr:hover td {
                    background: #f8f9fa !important;
                }
                #dictionaryStructureModal .btn-small {
                    background: white !important;
                    color: #333 !important;
                    border: 1px solid #ddd !important;
                    padding: 4px 8px !important;
                    font-size: 11px !important;
                }
                #dictionaryStructureModal .btn-small:hover {
                    background: #f5f5f5 !important;
                }
                #dictionaryStructureModal .btn-edit {
                    background: #2196F3 !important;
                    color: white !important;
                }
                #dictionaryStructureModal .btn-delete {
                    background: #f44336 !important;
                    color: white !important;
                }
            </style>
        `;
        
        document.body.appendChild(modal);
        
        // Adicionar event listeners após inserir no DOM
        setTimeout(() => {
            // Listeners para botões de editar coluna
            modal.querySelectorAll('.btn-edit-column').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dictId = btn.dataset.dictId;
                    const tableId = btn.dataset.tableId;
                    const colId = btn.dataset.colId;
                    const colName = btn.dataset.colName;
                    const colType = btn.dataset.colType;
                    const colDesc = btn.dataset.colDesc;
                    window.PortalAdmin.editColumn(dictId, tableId, colId, colName, colType, colDesc);
                });
            });
            
            // Listeners para botões de deletar coluna
            modal.querySelectorAll('.btn-delete-column').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dictId = btn.dataset.dictId;
                    const tableId = btn.dataset.tableId;
                    const colId = btn.dataset.colId;
                    const colName = btn.dataset.colName;
                    window.PortalAdmin.deleteColumn(dictId, tableId, colId, colName);
                });
            });
            
            // Listeners para botões de editar tabela
            modal.querySelectorAll('.btn-edit-table').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dictId = btn.dataset.dictId;
                    const tableId = btn.dataset.tableId;
                    const tableName = btn.dataset.tableName;
                    const tableDesc = btn.dataset.tableDesc;
                    window.PortalAdmin.editTable(dictId, tableId, tableName, tableDesc);
                });
            });
            
            // Listeners para botões de deletar tabela
            modal.querySelectorAll('.btn-delete-table').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dictId = btn.dataset.dictId;
                    const tableId = btn.dataset.tableId;
                    const tableName = btn.dataset.tableName;
                    window.PortalAdmin.deleteTable(dictId, tableId, tableName);
                });
            });
            
            modal.classList.add('show');
        }, 100);
    },

    // Função helper para escapar HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    createDictionaryModal() {
        const existing = document.getElementById('dictionaryModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'dictionaryModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3 id="dictModalTitle">Dicionário</h3>
                    <button type="button" class="modal-close" onclick="window.PortalAdmin.closeDictionaryModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="dictName">Nome do Dicionário *</label>
                        <input type="text" id="dictName" class="form-control" placeholder="Ex: Dicionário de Atendimentos" maxlength="200">
                    </div>
                    <div class="form-group">
                        <label for="dictDescription">Descrição</label>
                        <textarea id="dictDescription" class="form-control" rows="3" placeholder="Descreva o propósito deste dicionário..." maxlength="1000"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="dictIsDefault">
                            <span class="checkmark"></span>
                            Definir como dicionário padrão
                        </label>
                        <small class="form-help">O dicionário padrão será usado pelo chatbot IA quando ativo</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="window.PortalAdmin.closeDictionaryModal()">Cancelar</button>
                    <button type="button" id="saveDictBtn" class="btn-primary">Salvar</button>
                </div>
            </div>
            <style>
                .modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:10000}
                .modal-overlay.show{display:flex}
                .modal-content{background:#fff;border-radius:8px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,.2)}
                .modal-header{padding:20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
                .modal-header h3{margin:0;color:#333}
                .modal-close{background:none;border:none;font-size:24px;cursor:pointer;color:#999;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%}
                .modal-close:hover{background:#f5f5f5;color:#333}
                .modal-body{padding:20px}
                .modal-footer{padding:20px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:10px}
                .form-group{margin-bottom:20px}
                .form-group label{display:block;margin-bottom:5px;font-weight:600;color:#333}
                .form-control{width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;box-sizing:border-box}
                .form-control:focus{outline:none;border-color:#0066cc;box-shadow:0 0 0 2px rgba(0,102,204,.2)}
                .checkbox-label{display:flex;align-items:center;cursor:pointer;font-weight:normal!important}
                .checkbox-label input[type="checkbox"]{margin-right:8px}
                .form-help{display:block;margin-top:5px;font-size:12px;color:#666}
                .btn-primary{background:#0066cc;color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-size:14px}
                .btn-primary:hover{background:#0052a3}
                .btn-secondary{background:#6c757d;color:#fff;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-size:14px}
                .btn-secondary:hover{background:#545b62}
            </style>
        `;
        return modal;
    },

    // Criar novo dicionário
    showCreateDictionaryForm() {
        this.closeDictionaryModal();
        const modal = this.createDictionaryModal();
        document.body.appendChild(modal);
        
        document.getElementById('dictModalTitle').textContent = 'Novo Dicionário';
        document.getElementById('dictName').value = '';
        document.getElementById('dictDescription').value = '';
        document.getElementById('dictIsDefault').checked = false;
        
        const saveBtn = document.getElementById('saveDictBtn');
        saveBtn.textContent = 'Criar Dicionário';
        saveBtn.onclick = () => this.saveDictionary(null);
        
        requestAnimationFrame(() => modal.classList.add('show'));
    },

    // Salvar dicionário
    async saveDictionary(id) {
        const name = document.getElementById('dictName').value.trim();
        const description = document.getElementById('dictDescription').value.trim();
        const isDefault = document.getElementById('dictIsDefault').checked;
        
        if (!name) {
            alert('Nome é obrigatório');
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
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao salvar');
            }
            
            this.closeDictionaryModal();
            await this.loadDataDictionaries();
            alert(id ? 'Dicionário atualizado!' : 'Dicionário criado!');
            
        } catch (error) {
            console.error('Erro ao salvar dicionário:', error);
            alert(error.message || 'Erro ao salvar dicionário');
        }
    },

    // Excluir dicionário
    async deleteDictionary(id) {
        if (!confirm('Excluir este dicionário permanentemente?')) return;
        
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao excluir');
            }
            
            await this.loadDataDictionaries();
            alert('Dicionário excluído!');
            
        } catch (error) {
            console.error('Erro ao excluir dicionário:', error);
            alert(error.message || 'Erro ao excluir dicionário');
        }
    },

    async editDictionary(id) {
        console.log('Editing dictionary:', id);
        try {
            this.closeDictionaryModal();
            this.closeDictionaryStructureManager();

            if (!window.PortalApp?.authToken) {
                alert('Faça login como administrador');
                return;
            }

            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}`, {
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) throw new Error(`Erro ao carregar dicionário (HTTP ${response.status})`);

            const dict = await response.json();

            const modal = this.createDictionaryModal();
            document.body.appendChild(modal);

            document.getElementById('dictName').value = dict.name || '';
            document.getElementById('dictDescription').value = dict.description || '';
            document.getElementById('dictIsDefault').checked = !!dict.isDefault;

            document.getElementById('dictModalTitle').textContent = 'Editar Dicionário';
            const saveBtn = document.getElementById('saveDictBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Atualizar Dicionário';
                saveBtn.onclick = () => this.saveDictionary(id);
            }

            requestAnimationFrame(() => modal.classList.add('show'));
        } catch (error) {
            console.error('Erro ao editar dicionário:', error);
            alert('Erro ao carregar dados do dicionário para edição');
        }
    },

    async viewDictionary(id) {
        await this.manageDictionaryStructure(id);
    },

    async setDefaultDictionary(id) {
        if (!confirm('Deseja definir este dicionário como padrão?')) return;
        
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}/set-default`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`
                }
            });
            
            if (!response.ok) throw new Error('Erro ao definir dicionário padrão');
            
            await this.loadDataDictionaries();
            alert('Dicionário definido como padrão!');
            
        } catch (error) {
            console.error('Erro ao definir dicionário padrão:', error);
            alert('Erro ao definir dicionário padrão');
        }
    },

    async toggleDictionaryStatus(id, btn) {
        if (!window.PortalApp?.authToken) {
            alert('Faça login como administrador');
            return;
        }

        if (!btn) {
            console.error('Toggle button not found');
            return;
        }

        const wasActive = btn.dataset.active === 'true';

        btn.disabled = true;
        btn.textContent = '⏳';
        btn.title = 'Alterando status...';
        btn.style.background = '#757575';

        try {
            console.log(`Toggling dictionary ${id} from ${wasActive ? 'active' : 'inactive'} to ${!wasActive ? 'active' : 'inactive'}`);
            
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${id}/toggle-status`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${window.PortalApp.authToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                let errorMessage = `Erro HTTP ${response.status}`;

                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = await response.text().catch(() => errorMessage);
                }
                
                if (response.status === 401 || response.status === 403) {
                    alert('Acesso negado. Faça login como administrador novamente.');
                } else if (response.status === 400) {
                    alert('Não é possível desativar o dicionário padrão.');
                } else if (response.status >= 500) {
                    alert('Erro interno do servidor. Tente novamente em alguns segundos.');
                } else {
                    alert(`Erro ao alterar status: ${errorMessage}`);
                }
                
                return;
            }

            const result = await response.json();
            console.log('Toggle result:', result);

            const newActive = !wasActive;
            btn.dataset.active = String(newActive);
            this.setToggleButtonVisual(btn, newActive);

            await this.loadDataDictionaries();
            
            const statusText = newActive ? 'ativado' : 'desativado';
            console.log(`Dictionary ${id} successfully ${statusText}`);

        } catch (error) {
            console.error('Error toggling dictionary status:', error);
            
            if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
                alert('Erro de conexão. Verifique sua internet e tente novamente.');
            } else {
                alert('Erro inesperado. Verifique o console para mais detalhes.');
            }
            
            btn.dataset.active = String(wasActive);
            this.setToggleButtonVisual(btn, wasActive);
            
        } finally {
            btn.disabled = false;
        }
    },

    closeDictionaryStructureManager() {
        const modal = document.getElementById('dictionaryStructureModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    },

    closeDictionaryModal() {
        const modal = document.getElementById('dictionaryModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    },

    // GERENCIAMENTO DE TABELAS
    showCreateTableForm(dictionaryId) {
        const modal = document.createElement('div');
        modal.id = 'tableModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <style>
                #tableModal, #columnModal {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0,0,0,0.5) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    z-index: 10002 !important;
                }
                #tableModal .modal-content,
                #columnModal .modal-content {
                    background: white;
                    border-radius: 8px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }
                #tableModal .modal-header,
                #columnModal .modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #f8f9fa;
                }
                #tableModal .modal-header h3,
                #columnModal .modal-header h3 {
                    margin: 0;
                    color: #333;
                }
                #tableModal .modal-close,
                #columnModal .modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #999;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                #tableModal .modal-close:hover,
                #columnModal .modal-close:hover {
                    background: #f5f5f5;
                    color: #333;
                }
                #tableModal .modal-body,
                #columnModal .modal-body {
                    padding: 20px;
                }
                #tableModal .modal-footer,
                #columnModal .modal-footer {
                    padding: 20px;
                    border-top: 1px solid #eee;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    background-color: #f8f9fa;
                }
                #tableModal .form-group,
                #columnModal .form-group {
                    margin-bottom: 20px;
                }
                #tableModal .form-group label,
                #columnModal .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 600;
                    color: #333;
                }
                #tableModal .form-control,
                #columnModal .form-control {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                #tableModal .form-control:focus,
                #columnModal .form-control:focus {
                    outline: none;
                    border-color: #0066cc;
                    box-shadow: 0 0 0 2px rgba(0,102,204,.2);
                }
                #tableModal .btn-primary,
                #columnModal .btn-primary {
                    background: #0066cc;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #tableModal .btn-primary:hover,
                #columnModal .btn-primary:hover {
                    background: #0052a3;
                }
                #tableModal .btn-secondary,
                #columnModal .btn-secondary {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #tableModal .btn-secondary:hover,
                #columnModal .btn-secondary:hover {
                    background: #545b62;
                }
            </style>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Nova Tabela</h3>
                    <button type="button" class="modal-close" onclick="document.getElementById('tableModal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="tableName">Nome da Tabela *</label>
                        <input type="text" id="tableName" class="form-control" placeholder="Ex: Atendimentos" maxlength="200">
                    </div>
                    <div class="form-group">
                        <label for="tableDescription">Descrição</label>
                        <textarea id="tableDescription" class="form-control" rows="3" placeholder="Descreva o propósito desta tabela..." maxlength="1000"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('tableModal').remove()">Cancelar</button>
                    <button type="button" class="btn-primary" onclick="window.PortalAdmin.saveTable(${dictionaryId})">Criar Tabela</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('tableName')?.focus(), 100);
    },

    editTable(dictionaryId, tableId, name, description) {
        const modal = document.createElement('div');
        modal.id = 'tableModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <style>
                #tableModal, #columnModal {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0,0,0,0.5) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    z-index: 10002 !important;
                }
                #tableModal .modal-content,
                #columnModal .modal-content {
                    background: white;
                    border-radius: 8px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }
                #tableModal .modal-header,
                #columnModal .modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #f8f9fa;
                }
                #tableModal .modal-header h3,
                #columnModal .modal-header h3 {
                    margin: 0;
                    color: #333;
                }
                #tableModal .modal-close,
                #columnModal .modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #999;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                #tableModal .modal-close:hover,
                #columnModal .modal-close:hover {
                    background: #f5f5f5;
                    color: #333;
                }
                #tableModal .modal-body,
                #columnModal .modal-body {
                    padding: 20px;
                }
                #tableModal .modal-footer,
                #columnModal .modal-footer {
                    padding: 20px;
                    border-top: 1px solid #eee;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    background-color: #f8f9fa;
                }
                #tableModal .form-group,
                #columnModal .form-group {
                    margin-bottom: 20px;
                }
                #tableModal .form-group label,
                #columnModal .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 600;
                    color: #333;
                }
                #tableModal .form-control,
                #columnModal .form-control {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                #tableModal .form-control:focus,
                #columnModal .form-control:focus {
                    outline: none;
                    border-color: #0066cc;
                    box-shadow: 0 0 0 2px rgba(0,102,204,.2);
                }
                #tableModal .btn-primary,
                #columnModal .btn-primary {
                    background: #0066cc;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #tableModal .btn-primary:hover,
                #columnModal .btn-primary:hover {
                    background: #0052a3;
                }
                #tableModal .btn-secondary,
                #columnModal .btn-secondary {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #tableModal .btn-secondary:hover,
                #columnModal .btn-secondary:hover {
                    background: #545b62;
                }
            </style>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Editar Tabela</h3>
                    <button type="button" class="modal-close" onclick="document.getElementById('tableModal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="tableName">Nome da Tabela *</label>
                        <input type="text" id="tableName" class="form-control" value="${name}" maxlength="200">
                    </div>
                    <div class="form-group">
                        <label for="tableDescription">Descrição</label>
                        <textarea id="tableDescription" class="form-control" rows="3" maxlength="1000">${description}</textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('tableModal').remove()">Cancelar</button>
                    <button type="button" class="btn-primary" onclick="window.PortalAdmin.saveTable(${dictionaryId}, ${tableId})">Atualizar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('tableName')?.focus(), 100);
    },

    async saveTable(dictionaryId, tableId) {
        const name = document.getElementById('tableName')?.value?.trim();
        const description = document.getElementById('tableDescription')?.value?.trim();
        if (!name) { alert('Nome obrigatório'); return; }
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
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao salvar');
            }
            const modal = document.getElementById('tableModal');
            if (modal) modal.remove();
            alert(tableId ? 'Tabela atualizada!' : 'Tabela criada!');
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('Erro:', error);
            alert(error.message || 'Erro ao salvar');
        }
    },

    async deleteTable(dictionaryId, tableId, tableName) {
        if (!confirm(`Excluir "${tableName}" e suas colunas?`)) return;
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao excluir');
            }
            alert('Tabela excluída!');
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('Erro:', error);
            alert(error.message || 'Erro ao excluir');
        }
    },

    // GERENCIAMENTO DE COLUNAS
    showCreateColumnForm(dictionaryId, tableId) {
        const modal = document.createElement('div');
        modal.id = 'columnModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <style>
                #columnModal {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0,0,0,0.5) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    z-index: 10002 !important;
                }
                #columnModal .modal-content {
                    background: white;
                    border-radius: 8px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }
                #columnModal .modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #f8f9fa;
                }
                #columnModal .modal-header h3 {
                    margin: 0;
                    color: #333;
                }
                #columnModal .modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #999;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                #columnModal .modal-close:hover {
                    background: #f5f5f5;
                    color: #333;
                }
                #columnModal .modal-body {
                    padding: 20px;
                }
                #columnModal .modal-footer {
                    padding: 20px;
                    border-top: 1px solid #eee;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    background-color: #f8f9fa;
                }
                #columnModal .form-group {
                    margin-bottom: 20px;
                }
                #columnModal .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 600;
                    color: #333;
                }
                #columnModal .form-control {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                #columnModal .form-control:focus {
                    outline: none;
                    border-color: #0066cc;
                    box-shadow: 0 0 0 2px rgba(0,102,204,.2);
                }
                #columnModal .btn-primary {
                    background: #0066cc;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #columnModal .btn-primary:hover {
                    background: #0052a3;
                }
                #columnModal .btn-secondary {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #columnModal .btn-secondary:hover {
                    background: #545b62;
                }
            </style>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Nova Coluna</h3>
                    <button type="button" class="modal-close" onclick="document.getElementById('columnModal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="columnName">Nome *</label>
                        <input type="text" id="columnName" class="form-control" placeholder="Ex: DataAtendimento">
                    </div>
                    <div class="form-group">
                        <label for="columnType">Tipo *</label>
                        <select id="columnType" class="form-control">
                            <option value="">Selecione</option>
                            <option value="INT">INT</option>
                            <option value="BIGINT">BIGINT</option>
                            <option value="VARCHAR(50)">VARCHAR(50)</option>
                            <option value="VARCHAR(200)">VARCHAR(200)</option>
                            <option value="VARCHAR(MAX)">VARCHAR(MAX)</option>
                            <option value="NVARCHAR(200)">NVARCHAR(200)</option>
                            <option value="DATE">DATE</option>
                            <option value="DATETIME">DATETIME</option>
                            <option value="DECIMAL(18,2)">DECIMAL(18,2)</option>
                            <option value="BIT">BIT</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="columnDescription">Descrição</label>
                        <textarea id="columnDescription" class="form-control" rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('columnModal').remove()">Cancelar</button>
                    <button type="button" class="btn-primary" onclick="window.PortalAdmin.saveColumn(${dictionaryId}, ${tableId})">Criar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('columnName')?.focus(), 100);
    },

    editColumn(dictionaryId, tableId, columnId, name, type, description) {
        const modal = document.createElement('div');
        modal.id = 'columnModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <style>
                #columnModal {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0,0,0,0.5) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    z-index: 10002 !important;
                }
                #columnModal .modal-content {
                    background: white;
                    border-radius: 8px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }
                #columnModal .modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #f8f9fa;
                }
                #columnModal .modal-header h3 {
                    margin: 0;
                    color: #333;
                }
                #columnModal .modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #999;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                #columnModal .modal-close:hover {
                    background: #f5f5f5;
                    color: #333;
                }
                #columnModal .modal-body {
                    padding: 20px;
                }
                #columnModal .modal-footer {
                    padding: 20px;
                    border-top: 1px solid #eee;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    background-color: #f8f9fa;
                }
                #columnModal .form-group {
                    margin-bottom: 20px;
                }
                #columnModal .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 600;
                    color: #333;
                }
                #columnModal .form-control {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                #columnModal .form-control:focus {
                    outline: none;
                    border-color: #0066cc;
                    box-shadow: 0 0 0 2px rgba(0,102,204,.2);
                }
                #columnModal .btn-primary {
                    background: #0066cc;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #columnModal .btn-primary:hover {
                    background: #0052a3;
                }
                #columnModal .btn-secondary {
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                #columnModal .btn-secondary:hover {
                    background: #545b62;
                }
            </style>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Editar Coluna</h3>
                    <button type="button" class="modal-close" onclick="document.getElementById('columnModal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="columnName">Nome *</label>
                        <input type="text" id="columnName" class="form-control" value="${name}">
                    </div>
                    <div class="form-group">
                        <label for="columnType">Tipo *</label>
                        <select id="columnType" class="form-control">
                            <option value="INT" ${type==='INT'?'selected':''}>INT</option>
                            <option value="BIGINT" ${type==='BIGINT'?'selected':''}>BIGINT</option>
                            <option value="VARCHAR(50)" ${type==='VARCHAR(50)'?'selected':''}>VARCHAR(50)</option>
                            <option value="VARCHAR(200)" ${type==='VARCHAR(200)'?'selected':''}>VARCHAR(200)</option>
                            <option value="VARCHAR(MAX)" ${type==='VARCHAR(MAX)'?'selected':''}>VARCHAR(MAX)</option>
                            <option value="NVARCHAR(200)" ${type==='NVARCHAR(200)'?'selected':''}>NVARCHAR(200)</option>
                            <option value="DATE" ${type==='DATE'?'selected':''}>DATE</option>
                            <option value="DATETIME" ${type==='DATETIME'?'selected':''}>DATETIME</option>
                            <option value="DECIMAL(18,2)" ${type==='DECIMAL(18,2)'?'selected':''}>DECIMAL(18,2)</option>
                            <option value="BIT" ${type==='BIT'?'selected':''}>BIT</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="columnDescription">Descrição</label>
                        <textarea id="columnDescription" class="form-control" rows="2">${description}</textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('columnModal').remove()">Cancelar</button>
                    <button type="button" class="btn-primary" onclick="window.PortalAdmin.saveColumn(${dictionaryId}, ${tableId}, ${columnId})">Atualizar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('columnName')?.focus(), 100);
    },

    async saveColumn(dictionaryId, tableId, columnId) {
        const name = document.getElementById('columnName')?.value?.trim();
        const type = document.getElementById('columnType')?.value;
        const description = document.getElementById('columnDescription')?.value?.trim();
        if (!name || !type) { alert('Nome e Tipo obrigatórios'); return; }
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
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao salvar');
            }
            const modal = document.getElementById('columnModal');
            if (modal) modal.remove();
            alert(columnId ? 'Coluna atualizada!' : 'Coluna criada!');
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('Erro:', error);
            alert(error.message || 'Erro');
        }
    },

    async deleteColumn(dictionaryId, tableId, columnId, columnName) {
        if (!confirm(`Excluir coluna "${columnName}"?`)) return;
        try {
            const response = await fetch(`${window.PortalApp.API_URL}/data-dictionaries/${dictionaryId}/tables/${tableId}/columns/${columnId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.PortalApp.authToken}` }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erro ao excluir');
            }
            alert('Coluna excluída!');
            await this.manageDictionaryStructure(dictionaryId);
        } catch (error) {
            console.error('Erro:', error);
            alert(error.message || 'Erro');
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
window.movePageUp = (id) => window.PortalAdmin.movePageUp(id);
window.movePageDown = (id) => window.PortalAdmin.movePageDown(id);
window.moveMenuItemUp = (id) => window.PortalAdmin.moveMenuItemUp(id);
window.moveMenuItemDown = (id) => window.PortalAdmin.moveMenuItemDown(id);
window.expandAllMenuCategories = () => window.PortalAdmin.expandAllMenuCategories();
window.collapseAllMenuCategories = () => window.PortalAdmin.collapseAllMenuCategories();
window.loadUsersList = () => window.PortalAdmin.loadUsersList();
window.saveUser = () => window.PortalAdmin.saveUser();
window.editUser = (id) => window.PortalAdmin.editUser(id);
window.deleteUser = (id, username) => window.PortalAdmin.deleteUser(id, username);
window.cancelUserEdit = () => window.PortalAdmin.cancelUserEdit();
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