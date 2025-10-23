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
        document.getElementById('overlay').classList.add('show');
        
        const savedWidth = localStorage.getItem('adminPanelWidth');
        if (savedWidth) {
            panel.style.width = savedWidth + 'px';
        }
        
        this.loadPagesList();
        this.loadMenuStructure();
        this.updatePageSelect();
        this.loadDataDictionaries();
        
        // Inicializar dropdowns de ícones - com delay maior para garantir que o DOM está pronto
        if (window.PortalIcons) {
            setTimeout(() => {
                console.log('[Admin] Inicializando paletas de ícones...');
                if (typeof window.PortalIcons.buildAllPalettes === 'function') {
                    window.PortalIcons.buildAllPalettes();
                    console.log('[Admin] Paletas de ícones inicializadas');
                } else {
                    console.warn('[Admin] PortalIcons.buildAllPalettes não é uma função');
                }
            }, 200);
        } else {
            console.warn('[Admin] PortalIcons não está disponível');
        }
        
        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo && sidebarLogo.src && sidebarLogo.style.display !== 'none' && window.PortalConfig) {
            window.PortalConfig.updateLogoPreview(sidebarLogo.src);
        }
        
        document.getElementById('overlay').onclick = () => this.closeAdminPanel();
    },

    closeAdminPanel() {
        document.getElementById('adminPanel').classList.remove('show');
        document.getElementById('overlay').classList.remove('show');
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
        tutorialBtn.style.cssText = 'background: #9C27B0; color: white;';
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
        
        container.innerHTML = '';
        
        const sortedPages = [...window.PortalApp.pagesData].sort((a, b) => {
            const aOrder = a.order ?? 0;
            const bOrder = b.order ?? 0;
            if (aOrder === bOrder) {
                return a.id - b.id;
            }
            return aOrder - bOrder;
        });
        
        sortedPages.forEach((page, index) => {
            const item = document.createElement('div');
            item.className = 'menu-list-item';
            const titleDiv = document.createElement('div');
            const titleStrong = document.createElement('strong');
            titleStrong.textContent = page.title || 'Sem título';
            titleDiv.appendChild(titleStrong);
            
            if (page.showInHome !== false) {
                const badge = document.createElement('span');
                badge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #4CAF50; color: white; border-radius: 10px; font-size: 10px;';
                badge.textContent = 'HOME';
                titleDiv.appendChild(badge);
            }
            
            if (page.icon) {
                const iconBadge = document.createElement('span');
                iconBadge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #2196F3; color: white; border-radius: 10px; font-size: 10px;';
                iconBadge.textContent = '🎨';
                iconBadge.title = 'Tem ícone personalizado';
                titleDiv.appendChild(iconBadge);
            }
            
            titleDiv.appendChild(document.createElement('br'));
            const subtitleSmall = document.createElement('small');
            subtitleSmall.style.color = '#666';
            subtitleSmall.textContent = (page.subtitle || 'Sem subtítulo') + ` - Ordem: ${page.order ?? 0}`;
            titleDiv.appendChild(subtitleSmall);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'menu-list-item-actions';
            
            const isFirst = index === 0;
            const isLast = index === (sortedPages.length - 1);
            
            actionsDiv.innerHTML = `
                <button class="btn-small btn-move" title="Mover para cima" onclick="movePageUp(${page.id})" ${isFirst ? 'disabled' : ''}>↑</button>
                <button class="btn-small btn-move" title="Mover para baixo" onclick="movePageDown(${page.id})" ${isLast ? 'disabled' : ''}>↓</button>
                <button class="btn-small btn-edit" onclick="editPage(${page.id})">Editar</button>
                <button class="btn-small btn-delete" onclick="deletePage(${page.id})">Excluir</button>
            `;
            
            // ADICIONA o botão de Tutorial Builder
            this.addTutorialButtonToPage(page.id, actionsDiv);
            
            item.appendChild(titleDiv);
            item.appendChild(actionsDiv);
            container.appendChild(item);
        });
    },

    loadMenuStructure() {
        console.log('[Menu Structure] Loading menu structure...');
        const container = document.getElementById('menuStructure');
        if (!container) return;
        
        container.innerHTML = '';
        const parentSelect = document.getElementById('parentSelect');
        if (parentSelect) parentSelect.innerHTML = '<option value="">Nenhum (Nível Principal)</option>';

        const sortedMenu = [...window.PortalApp.menuData].sort((a, b) => {
            const aOrder = a.order ?? 0;
            const bOrder = b.order ?? 0;
            if (aOrder === bOrder) {
                return a.id - b.id;
            }
            return aOrder - bOrder;
        });
        
        const renderList = (items, level = 0) => {
            const sortedItems = [...items].sort((a, b) => {
                const aOrder = a.order ?? 0;
                const bOrder = b.order ?? 0;
                if (aOrder === bOrder) {
                    return a.id - b.id;
                }
                return aOrder - bOrder;
            });
            
            sortedItems.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'menu-list-item';
                div.style.paddingLeft = (level * 15) + 'px';
                
                const infoDiv = document.createElement('div');
                const iconHtml = window.PortalIcons ? window.PortalIcons.renderIconHTML(item.icon) : `<span class="menu-icon">${item.icon || ''}</span>`;
                infoDiv.innerHTML = iconHtml;
                const nameStrong = document.createElement('strong');
                nameStrong.textContent = ' ' + item.name;
                infoDiv.appendChild(nameStrong);
                const typeSmall = document.createElement('small');
                typeSmall.style.color = '#666';
                typeSmall.textContent = ` (${item.type === 'category' ? 'Categoria' : 'Item'})`;
                if (level > 0) {
                    typeSmall.textContent += ` - Nível ${level + 1}`;
                }
                typeSmall.textContent += ` - Ordem: ${item.order ?? 0}`;
                infoDiv.appendChild(typeSmall);
                
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'menu-list-item-actions';
                
                const isFirst = index === 0;
                const isLast = index === (sortedItems.length - 1);
                
                actionsDiv.innerHTML = `
                    <button class="btn-small btn-move" title="Mover para cima" onclick="moveMenuItemUp(${item.id})" ${isFirst ? 'disabled' : ''}>↑</button>
                    <button class="btn-small btn-move" title="Mover para baixo" onclick="moveMenuItemDown(${item.id})" ${isLast ? 'disabled' : ''}>↓</button>
                    <button class="btn-small btn-edit" onclick="editMenuItem(${item.id})">Editar</button>
                    <button class="btn-small btn-delete" onclick="deleteMenuItem(${item.id})">Excluir</button>
                `;
                
                div.appendChild(infoDiv);
                div.appendChild(actionsDiv);
                container.appendChild(div);

                if (parentSelect && item.type === 'category') {
                    const opt = document.createElement('option');
                    opt.value = item.id;
                    const indent = '  '.repeat(level);
                    opt.textContent = `${indent}${item.name} (Nível ${level + 1})`;
                    parentSelect.appendChild(opt);
                }

                if (item.children && item.children.length) {
                    renderList(item.children, level + 1);
                }
            });
        };
        
        renderList(sortedMenu);
        console.log('[Menu Structure] Menu structure loaded');
    },

    updatePageSelect() {
        const sel = document.getElementById('pageSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione uma página</option>';
        if (!Array.isArray(window.PortalApp.pagesData)) return;
        window.PortalApp.pagesData.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.title || (`Página ${p.id}`);
            sel.appendChild(opt);
        });
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
        const page = window.PortalApp.pagesData.find(p => p.id === id);
        if (!page) return alert('Página não encontrada para edição');
        
        window.PortalApp.editingPageId = id;
        document.getElementById('pageNameInput').value = page.title || '';
        document.getElementById('pageSubtitleInput').value = page.subtitle || '';
        document.getElementById('pageDescInput').value = page.description || '';
        document.getElementById('powerbiUrlInput').value = page.powerbiUrl || '';
        document.getElementById('showInHomeCheckbox').checked = page.showInHome !== false;
        
        const iconInput = document.getElementById('pageIconInput');
        if (iconInput) {
            iconInput.value = page.icon || '';
            
            // Atualizar preview e dropdown de ícones
            if (window.PortalIcons) {
                setTimeout(() => {
                    if (typeof window.PortalIcons.updatePageIconPreview === 'function') {
                        window.PortalIcons.updatePageIconPreview(page.icon);
                    }
                    if (typeof window.PortalIcons.setPageDropdownValueForIcon === 'function') {
                        window.PortalIcons.setPageDropdownValueForIcon(page.icon);
                    }
                }, 100);
            }
        }
        
        document.getElementById('savePageBtn').textContent = 'Atualizar Página';
        document.getElementById('cancelPageEditBtn').style.display = 'inline-block';
    },

    editMenuItem(id) {
        const item = this.findMenuItemById(window.PortalApp.menuData, id);
        if (!item) return alert('Item não encontrado para edição');
        
        window.PortalApp.editingMenuId = id;
        document.getElementById('menuItemInput').value = item.name || '';
        document.getElementById('menuTypeSelect').value = item.type || 'item';
        
        document.getElementById('menuTypeSelect').dispatchEvent(new Event('change'));
        
        const parentSelect = document.getElementById('parentSelect');
        if (parentSelect) {
            parentSelect.value = item.parentId || '';
        }
        
        const pageSelect = document.getElementById('pageSelect');
        if (pageSelect) {
            pageSelect.value = item.pageId || '';
        }
        
        const iconInput = document.getElementById('menuIconInput');
        if (iconInput) {
            iconInput.value = item.icon || '';
            
            // Atualizar preview e dropdown de ícones
            if (window.PortalIcons) {
                setTimeout(() => {
                    if (typeof window.PortalIcons.updateIconPreview === 'function') {
                        window.PortalIcons.updateIconPreview(item.icon);
                    }
                    if (typeof window.PortalIcons.setDropdownValueForIcon === 'function') {
                        window.PortalIcons.setDropdownValueForIcon(item.icon);
                    }
                }, 100);
            }
        }
        
        document.getElementById('saveMenuBtn').textContent = 'Atualizar Item';
        document.getElementById('cancelMenuEditBtn').style.display = 'inline-block';
    },

    async savePage() {
        const rawTitle = document.getElementById('pageNameInput').value;
        const rawSubtitle = document.getElementById('pageSubtitleInput').value;
        const rawDescription = document.getElementById('pageDescInput').value;
        const rawPowerBIUrl = document.getElementById('powerbiUrlInput').value;
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
                    showInHome: showInHome,
                    icon: prepared.icon.value || null,
                    order: pageOrder
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

            this.clearPageForm();
            window.PortalApp.editingPageId = null;
            const saveBtn = document.getElementById('savePageBtn');
            if (saveBtn) saveBtn.textContent = 'Salvar Página';
            const cancelBtn = document.getElementById('cancelPageEditBtn');
            if (cancelBtn) cancelBtn.style.display = 'none';

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
                document.getElementById('menuItemInput').value = '';
                document.getElementById('menuIconInput').value = '';
                if (window.PortalIcons) {
                    window.PortalIcons.updateIconPreview('');
                }
                window.PortalApp.editingMenuId = null;
                document.getElementById('saveMenuBtn').textContent = 'Adicionar ao Menu';
                document.getElementById('cancelMenuEditBtn').style.display = 'none';
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
        document.getElementById('pageNameInput').value = '';
        document.getElementById('pageSubtitleInput').value = '';
        document.getElementById('pageDescInput').value = '';
        document.getElementById('powerbiUrlInput').value = '';
        document.getElementById('showInHomeCheckbox').checked = true;
        const iconInput = document.getElementById('pageIconInput');
        if (iconInput) {
            iconInput.value = '';
            if (window.PortalIcons) {
                setTimeout(() => {
                    if (typeof window.PortalIcons.updatePageIconPreview === 'function') {
                        window.PortalIcons.updatePageIconPreview('');
                    }
                    if (typeof window.PortalIcons.setPageDropdownValueForIcon === 'function') {
                        window.PortalIcons.setPageDropdownValueForIcon('');
                    }
                }, 50);
            }
        }
    },

    cancelPageEdit() {
        window.PortalApp.editingPageId = null;
        this.clearPageForm();
        document.getElementById('savePageBtn').textContent = 'Salvar Página';
        document.getElementById('cancelPageEditBtn').style.display = 'none';
        
        // Reinicializar dropdowns de ícones após limpar
        if (window.PortalIcons && typeof window.PortalIcons.buildAllPalettes === 'function') {
            setTimeout(() => {
                window.PortalIcons.buildAllPalettes();
            }, 100);
        }
    },

    cancelMenuEdit() {
        window.PortalApp.editingMenuId = null;
        document.getElementById('menuItemInput').value = '';
        document.getElementById('menuIconInput').value = '';
        if (window.PortalIcons) {
            if (typeof window.PortalIcons.updateIconPreview === 'function') {
                window.PortalIcons.updateIconPreview('');
            }
            if (typeof window.PortalIcons.setDropdownValueForIcon === 'function') {
                window.PortalIcons.setDropdownValueForIcon('');
            }
        }
        document.getElementById('saveMenuBtn').textContent = 'Adicionar ao Menu';
        document.getElementById('cancelMenuEditBtn').style.display = 'none';
        
        // Reinicializar dropdowns de ícones após limpar
        if (window.PortalIcons && typeof window.PortalIcons.buildAllPalettes === 'function') {
            setTimeout(() => {
                window.PortalIcons.buildAllPalettes();
            }, 100);
        }
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

        const btns = document.querySelectorAll(`[onclick*="movePageUp(${id})"], [onclick*="movePageDown(${id})"]`);
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
                badge.style.cssText = 'margin-left: 8px; padding: 2px 6px; background: #4CAF50; color: white; border-radius: 10px; font-size: 10px;';
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
            small.style.color = '#666';
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
                        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                            <thead>
                                <tr style="background: #f1f3f4;">
                                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Coluna</th>
                                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Tipo</th>
                                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd; max-width: 300px;">Descrição</th>
                                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd; width: 120px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${table.columns.map((col) => {
                                    const displayDesc = (col.description || '-').length > 100 
                                        ? (col.description || '').substring(0, 97) + '...' 
                                        : (col.description || '-');
                                    
                                    return `
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: 600;">${this.escapeHtml(col.name)}</td>
                                        <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; background: #f8f9fa;">${this.escapeHtml(col.type)}</td>
                                        <td style="padding: 8px; border: 1px solid #ddd; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(col.description || '-')}">${this.escapeHtml(displayDesc)}</td>
                                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
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
                    <div class="table-card" style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                        <div class="table-header" style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1; min-width: 0;">
                                <h4 style="margin: 0; color: #333;">${this.escapeHtml(table.name)}</h4>
                                ${table.description ? `<p style="margin: 5px 0 0 0; color: #666; font-size: 14px; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(table.description)}">${this.escapeHtml(displayTableDesc)}</p>` : ''}
                                <small style="color: #999;">ID: ${table.id} | ${table.columns ? table.columns.length : 0} coluna(s)</small>
                            </div>
                            <div style="flex-shrink: 0; margin-left: 15px;">
                                <button class="btn-small" style="background: #4CAF50; color: white;" onclick="event.stopPropagation(); window.PortalAdmin.showCreateColumnForm(${dictData.id}, ${table.id})">+ Coluna</button>
                                <button class="btn-small btn-edit btn-edit-table" 
                                        data-dict-id="${dictData.id}" 
                                        data-table-id="${table.id}" 
                                        data-table-name="${this.escapeHtml(table.name || '')}" 
                                        data-table-desc="${this.escapeHtml(table.description || '')}">✏️ Editar</button>
                                <button class="btn-small btn-delete btn-delete-table" 
                                        data-dict-id="${dictData.id}" 
                                        data-table-id="${table.id}" 
                                        data-table-name="${this.escapeHtml(table.name || '')}">🗑️ Excluir</button>
                            </div>
                        </div>
                        <div class="table-columns" style="padding: 15px;">
                            ${columnsHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            tablesHtml = '<p style="text-align: center; color: #666; font-style: italic; padding: 40px;">Nenhuma tabela definida neste dicionário</p>';
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 90vh;">
                <div class="modal-header">
                    <div>
                        <h3>📋 Estrutura: ${this.escapeHtml(dictData.name)}</h3>
                        ${dictData.description ? `<p style="margin: 5px 0 0 0; color: #666;">${this.escapeHtml(dictData.description)}</p>` : ''}
                    </div>
                    <button type="button" class="modal-close" onclick="window.PortalAdmin.closeDictionaryStructureManager()">×</button>
                </div>
                <div class="modal-body" style="max-height: calc(90vh - 140px); overflow-y: auto;">
                    <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; gap: 15px; align-items: center; padding: 15px; background: #e3f2fd; border-radius: 8px; flex: 1; margin-right: 15px;">
                            <div>
                                <span style="font-weight: 600; color: #1565c0;">Status:</span>
                                <span style="color: ${dictData.isActive ? '#2e7d32' : '#d32f2f'};">
                                    ${dictData.isActive ? '✅ Ativo' : '❌ Inativo'}
                                </span>
                            </div>
                            ${dictData.isDefault ? '<div><span style="background: #4caf50; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">⭐ PADRÃO</span></div>' : ''}
                            <div>
                                <span style="font-weight: 600; color: #1565c0;">Tabelas:</span>
                                <span>${dictData.tables ? dictData.tables.length : 0}</span>
                            </div>
                            <div>
                                <span style="font-weight: 600; color: #1565c0;">ID:</span>
                                <span>${dictData.id}</span>
                            </div>
                        </div>
                        <button onclick="window.PortalAdmin.showCreateTableForm(${dictData.id})" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; white-space: nowrap;">+ Nova Tabela</button>
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
                    border-radius: 8px; width: 90%;
                    max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                #dictionaryStructureModal .modal-header {
                    padding: 20px; border-bottom: 1px solid #eee;
                    display: flex; justify-content: space-between; align-items: center;
                    background-color: #f8f9fa !important;
                }
                #dictionaryStructureModal .modal-header h3 { 
                    margin: 0; 
                    color: #333 !important; 
                }
                #dictionaryStructureModal .modal-header p {
                    color: #666 !important;
                }
                #dictionaryStructureModal .modal-close {
                    background: none; border: none; font-size: 24px; cursor: pointer;
                    color: #999 !important; padding: 0; width: 30px; height: 30px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                }
                #dictionaryStructureModal .modal-close:hover { 
                    background: #f5f5f5 !important; 
                    color: #333 !important; 
                }
                #dictionaryStructureModal .modal-body { 
                    padding: 20px; 
                    background: white !important;
                }
                #dictionaryStructureModal .modal-footer {
                    padding: 20px; border-top: 1px solid #eee;
                    display: flex; justify-content: flex-end; gap: 10px;
                    background-color: #f8f9fa !important;
                }
                #dictionaryStructureModal .btn-primary {
                    background: #0066cc !important; color: white !important; border: none;
                    padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;
                }
                #dictionaryStructureModal .btn-primary:hover { background: #0052a3 !important; }
                #dictionaryStructureModal .btn-secondary {
                    background: #6c757d !important; color: white !important; border: none;
                    padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;
                }
                #dictionaryStructureModal .btn-secondary:hover { background: #545b62 !important; }
                #dictionaryStructureModal .table-card {
                    background: white !important;
                    border: 1px solid #ddd !important;
                }
                #dictionaryStructureModal .table-header {
                    background: #f8f9fa !important;
                    border-bottom: 1px solid #ddd !important;
                }
                #dictionaryStructureModal .table-header h4 {
                    color: #333 !important;
                }
                #dictionaryStructureModal .table-header p {
                    color: #666 !important;
                }
                #dictionaryStructureModal .table-header small {
                    color: #999 !important;
                }
                #dictionaryStructureModal .table-columns {
                    background: white !important;
                }
                #dictionaryStructureModal table {
                    background: white !important;
                }
                #dictionaryStructureModal thead {
                    background: #f1f3f4 !important;
                }
                #dictionaryStructureModal th {
                    color: #333 !important;
                    background: #f1f3f4 !important;
                    border: 1px solid #ddd !important;
                }
                #dictionaryStructureModal td {
                    color: #333 !important;
                    background: white !important;
                    border: 1px solid #ddd !important;
                }
                #dictionaryStructureModal tr:hover td {
                    background: #f8f9fa !important;
                }
                #dictionaryStructureModal .btn-small {
                    background: white !important;
                    color: #333 !important;
                    border: 1px solid #ddd !important;
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
window.movePageUp = (id) => window.PortalAdmin.movePageUp(id);
window.movePageDown = (id) => window.PortalAdmin.movePageDown(id);
window.moveMenuItemUp = (id) => window.PortalAdmin.moveMenuItemUp(id);
window.moveMenuItemDown = (id) => window.PortalAdmin.moveMenuItemDown(id);
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