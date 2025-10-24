class TutorialBuilderApp {
    constructor() {
        this.pageId = new URLSearchParams(window.location.search).get('pageId');
        this.pageData = null;
        this.steps = [];
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionCurrent = null;
        this.tempHighlight = null;
        this.isEditing = false;
        this.editingIndex = null;
        this.editingStep = null;
        this.iframeLoaded = false;
        this.previewIndex = 0;
        
        this.overlayOpacity = 0.75;
        this.highlightOpacity = 0.20;
        
        this.init();
    }

    async init() {
        await this.loadPageData();
        await this.loadExistingTutorial();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.monitorIframeLoad();
    }

    monitorIframeLoad() {
        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const checkLoaded = () => {
            try {
                if (iframe.contentWindow) {
                    this.iframeLoaded = true;
                    console.log('[IFRAME] ✅ Power BI carregado');
                    document.getElementById('selectAreaBtn').disabled = false;
                    document.getElementById('selectionStatus').textContent = '';
                }
            } catch (e) {
                setTimeout(checkLoaded, 1000);
            }
        };

        iframe.addEventListener('load', () => {
            this.iframeLoaded = true;
            document.getElementById('selectAreaBtn').disabled = false;
            console.log('[IFRAME] ✅ Load event');
        });

        setTimeout(checkLoaded, 2000);

        if ('ResizeObserver' in window) {
            const ro = new ResizeObserver(() => {
                this.renderAllHighlights();
                if (this.tempHighlight) this.renderTempHighlight(this.tempHighlight);
            });
            ro.observe(iframe);
        }
    }

    detectPowerBIOffset(iframe) {
        const rect = iframe.getBoundingClientRect();
        const topOffset = Math.max(45, Math.min(60, rect.height * 0.06));
        const sideOffset = Math.max(6, rect.width * 0.008);
        const bottomOffset = Math.max(6, rect.height * 0.01);
        
        return {
            top: topOffset,
            left: sideOffset,
            right: sideOffset,
            bottom: bottomOffset
        };
    }

    async loadPageData() {
        if (!this.pageId) {
            this.showToast('❌ ID da página não encontrado na URL', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/pages/${this.pageId}`);
            if (!response.ok) throw new Error('Página não encontrada');
            
            this.pageData = await response.json();
            
            document.getElementById('pageInfo').innerHTML = `
                <strong>${this.pageData.Title}</strong>
                ${this.pageData.Subtitle || ''}
            `;

            if (this.pageData.PowerBIUrl) {
                document.getElementById('powerbiFrame').src = this.pageData.PowerBIUrl;
                document.getElementById('selectionStatus').textContent = '⏳ Aguardando carregamento do Power BI...';
            } else {
                this.showToast('⚠️ Esta página não possui URL do Power BI configurada', 'error');
            }

        } catch (error) {
            console.error('Erro ao carregar página:', error);
            this.showToast('❌ Erro ao carregar dados da página', 'error');
        }
    }

    async loadExistingTutorial() {
        try {
            const response = await fetch(`/api/tutorials/page/${this.pageId}`);
            if (response.ok) {
                const tutorial = await response.json();
                
                if (tutorial.steps && Array.isArray(tutorial.steps)) {
                    this.steps = tutorial.steps;
                    console.log('[LOAD-TUTORIAL] Steps carregados:', this.steps.length);
                    
                    this.renderStepsList();
                    this.renderAllHighlights();
                    this.updateButtons();
                }
            }
        } catch (error) {
            console.error('[LOAD-TUTORIAL] Erro:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('selectAreaBtn').onclick = () => this.startSelection();
        document.getElementById('saveStepBtn').onclick = () => this.saveCurrentStep();
        document.getElementById('redoSelectionBtn').onclick = () => this.redoSelection();
        document.getElementById('cancelEditBtn').onclick = () => this.cancelEdit();
        document.getElementById('previewBtn').onclick = () => this.startPreview();
        document.getElementById('saveBtn').onclick = () => this.saveTutorial();

        const overlay = document.getElementById('canvasOverlay');
        overlay.addEventListener('mousedown', (e) => this.onMouseDown(e));
        overlay.addEventListener('mousemove', (e) => this.onMouseMove(e));
        overlay.addEventListener('mouseup', (e) => this.onMouseUp(e));

        document.getElementById('overlayOpacity').oninput = (e) => this.updateOverlayOpacity(e.target.value);
        document.getElementById('highlightOpacity').oninput = (e) => this.updateHighlightOpacity(e.target.value);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S = Salvar tutorial
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (this.steps.length > 0) this.saveTutorial();
            }
            
            // Ctrl/Cmd + P = Preview
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                if (this.steps.length > 0) this.startPreview();
            }
            
            // Escape = Cancelar seleção
            if (e.key === 'Escape') {
                if (this.isSelecting) {
                    this.resetSelection();
                    this.showToast('Seleção cancelada', 'info');
                }
            }
        });
    }

    updateOverlayOpacity(value) {
        this.overlayOpacity = value / 100;
        document.getElementById('overlayOpacityValue').textContent = value + '%';
        
        if (this.tempHighlight) this.renderTempHighlight(this.tempHighlight);
        this.renderAllHighlights();
    }

    updateHighlightOpacity(value) {
        this.highlightOpacity = value / 100;
        document.getElementById('highlightOpacityValue').textContent = value + '%';
        
        if (this.tempHighlight) this.renderTempHighlight(this.tempHighlight);
        this.renderAllHighlights();
    }

    startSelection() {
        if (!this.iframeLoaded) {
            this.showToast('⏳ Aguarde o Power BI carregar completamente', 'error');
            return;
        }

        const title = document.getElementById('stepTitle').value.trim();
        const description = document.getElementById('stepDescription').value.trim();
        if (!title || !description) { 
            this.showToast('❌ Preencha título e descrição', 'error');
            return; 
        }

        this.isSelecting = true;
        const overlay = document.getElementById('canvasOverlay');
        overlay.classList.add('selecting');
        document.getElementById('selectBtnText').textContent = '🎯 Clique e arraste no dashboard...';
        document.getElementById('selectAreaBtn').style.background = '#4CAF50';
        document.getElementById('selectionStatus').textContent = '🖱️ Clique e arraste para selecionar a área';
    }

    redoSelection() {
        this.tempHighlight = null;
        document.querySelectorAll('.highlight-area.active').forEach(h => h.remove());
        this.startSelection();
    }

    cancelEdit() {
        if (this.isEditing && this.editingIndex !== null && this.editingStep) {
            this.steps.splice(this.editingIndex, 0, this.editingStep);
        }
        
        document.getElementById('stepTitle').value = '';
        document.getElementById('stepDescription').value = '';
        
        this.isEditing = false;
        this.editingIndex = null;
        this.editingStep = null;
        this.tempHighlight = null;
        this.resetSelection();
        
        document.getElementById('saveStepBtn').style.display = 'none';
        document.getElementById('redoSelectionBtn').style.display = 'none';
        document.getElementById('cancelEditBtn').style.display = 'none';
        document.getElementById('selectAreaBtn').style.display = 'block';
        
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
        
        document.querySelectorAll('.highlight-area.active').forEach(h => h.remove());
        this.showToast('Edição cancelada', 'info');
    }

    onMouseDown(e) {
        if (!this.isSelecting) return;

        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        const offset = this.detectPowerBIOffset(iframe);
        
        const usableTop = rect.top + offset.top;
        const usableLeft = rect.left + offset.left;
        const usableRight = rect.right - offset.right;
        const usableBottom = rect.bottom - offset.bottom;
        
        if (e.clientX < usableLeft || e.clientX > usableRight || 
            e.clientY < usableTop || e.clientY > usableBottom) {
            this.showToast('⚠️ Clique DENTRO da área do dashboard', 'error');
            return;
        }

        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;
        
        const x = ((e.clientX - usableLeft) / usableWidth) * 100;
        const y = ((e.clientY - usableTop) / usableHeight) * 100;

        this.selectionStart = { x, y };
        this.selectionCurrent = { x, y };
    }

    onMouseMove(e) {
        if (!this.isSelecting || !this.selectionStart) return;

        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        const offset = this.detectPowerBIOffset(iframe);
        
        const usableTop = rect.top + offset.top;
        const usableLeft = rect.left + offset.left;
        const usableRight = rect.right - offset.right;
        const usableBottom = rect.bottom - offset.bottom;
        
        let clientX = Math.max(usableLeft, Math.min(e.clientX, usableRight));
        let clientY = Math.max(usableTop, Math.min(e.clientY, usableBottom));
        
        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;
        
        const x = ((clientX - usableLeft) / usableWidth) * 100;
        const y = ((clientY - usableTop) / usableHeight) * 100;

        this.selectionCurrent = { x, y };
        this.renderSelectionBox();
        
        const width = Math.abs(this.selectionCurrent.x - this.selectionStart.x);
        const height = Math.abs(this.selectionCurrent.y - this.selectionStart.y);
        document.getElementById('selectionStatus').textContent = 
            `📏 Área: ${width.toFixed(1)}% × ${height.toFixed(1)}%`;
    }

    onMouseUp(e) {
        if (!this.isSelecting || !this.selectionStart) return;

        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        const offset = this.detectPowerBIOffset(iframe);
        
        const usableTop = rect.top + offset.top;
        const usableLeft = rect.left + offset.left;
        const usableRight = rect.right - offset.right;
        const usableBottom = rect.bottom - offset.bottom;
        
        let clientX = Math.max(usableLeft, Math.min(e.clientX, usableRight));
        let clientY = Math.max(usableTop, Math.min(e.clientY, usableBottom));
        
        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;
        
        const x = ((clientX - usableLeft) / usableWidth) * 100;
        const y = ((clientY - usableTop) / usableHeight) * 100;

        this.selectionCurrent = { x, y };
        this.isSelecting = false;
        document.getElementById('canvasOverlay').classList.remove('selecting');
        
        const width = Math.abs(this.selectionCurrent.x - this.selectionStart.x);
        const height = Math.abs(this.selectionCurrent.y - this.selectionStart.y);
        
        const minSize = 0.5;
        
        if (width < minSize || height < minSize) {
            this.showToast(`⚠️ Área muito pequena! Mínimo: ${minSize}%`, 'error');
            this.resetSelection();
            return;
        }

        const highlight = {
            top: `${Math.min(this.selectionStart.y, this.selectionCurrent.y).toFixed(2)}%`,
            left: `${Math.min(this.selectionStart.x, this.selectionCurrent.x).toFixed(2)}%`,
            width: `${width.toFixed(2)}%`,
            height: `${height.toFixed(2)}%`
        };

        this.tempHighlight = highlight;

        document.getElementById('saveStepBtn').style.display = 'block';
        document.getElementById('selectAreaBtn').style.display = 'none';
        
        if (this.isEditing) {
            document.getElementById('redoSelectionBtn').style.display = 'inline-block';
        }
        
        document.getElementById('selectionStatus').textContent = '✅ Área selecionada! Clique em "Salvar Passo"';

        const selectionBox = document.querySelector('.selection-box');
        if (selectionBox) selectionBox.remove();

        this.renderTempHighlight(highlight);
    }

    renderSelectionBox() {
        if (!this.selectionStart || !this.selectionCurrent) return;
        
        const iframe = document.getElementById('powerbiFrame');
        const overlayEl = document.getElementById('canvasOverlay');
        if (!iframe || !overlayEl) return;

        const offset = this.detectPowerBIOffset(iframe);

        let box = document.querySelector('.selection-box');
        if (!box) {
            box = document.createElement('div');
            box.className = 'selection-box';
            overlayEl.appendChild(box);
        }

        const top = Math.min(this.selectionStart.y, this.selectionCurrent.y);
        const left = Math.min(this.selectionStart.x, this.selectionCurrent.x);
        const width = Math.abs(this.selectionCurrent.x - this.selectionStart.x);
        const height = Math.abs(this.selectionCurrent.y - this.selectionStart.y);

        const rect = iframe.getBoundingClientRect();
        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;
        
        const topPx = (top / 100) * usableHeight + offset.top;
        const leftPx = (left / 100) * usableWidth + offset.left;
        const widthPx = (width / 100) * usableWidth;
        const heightPx = (height / 100) * usableHeight;

        box.style.top = `${topPx}px`;
        box.style.left = `${leftPx}px`;
        box.style.width = `${widthPx}px`;
        box.style.height = `${heightPx}px`;
    }

    renderTempHighlight(highlight) {
        document.querySelectorAll('.highlight-area.active').forEach(el => el.remove());

        const overlayEl = document.getElementById('canvasOverlay');
        const iframe = document.getElementById('powerbiFrame');
        if (!overlayEl || !iframe) return;

        const offset = this.detectPowerBIOffset(iframe);
        const rect = iframe.getBoundingClientRect();
        
        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;

        const tempHighlight = document.createElement('div');
        tempHighlight.className = 'highlight-area active';
        tempHighlight.style.cssText = `
            position: absolute;
            border: 3px solid #4CAF50;
            background: rgba(76, 175, 80, ${this.highlightOpacity});
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            z-index: 15;
            pointer-events: none;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, ${this.overlayOpacity});
        `;

        const topPct = parseFloat(highlight.top);
        const leftPct = parseFloat(highlight.left);
        const widthPct = parseFloat(highlight.width);
        const heightPct = parseFloat(highlight.height);
        
        const topPx = (topPct / 100) * usableHeight + offset.top;
        const leftPx = (leftPct / 100) * usableWidth + offset.left;
        const widthPx = (widthPct / 100) * usableWidth;
        const heightPx = (heightPct / 100) * usableHeight;

        tempHighlight.style.top = `${topPx}px`;
        tempHighlight.style.left = `${leftPx}px`;
        tempHighlight.style.width = `${widthPx}px`;
        tempHighlight.style.height = `${heightPx}px`;

        const label = document.createElement('div');
        label.className = 'highlight-label';
        label.textContent = this.isEditing ? `Passo ${this.editingIndex + 1} (Editando)` : `Passo ${this.steps.length + 1} (Preview)`;
        tempHighlight.appendChild(label);

        overlayEl.appendChild(tempHighlight);
    }

    saveCurrentStep() {
        const title = document.getElementById('stepTitle')?.value?.trim();
        const description = document.getElementById('stepDescription')?.value?.trim();

        if (!title || !description) {
            this.showToast('❌ Preencha o título e descrição', 'error');
            return;
        }

        if (!this.tempHighlight) {
            this.showToast('❌ Selecione uma área no canvas', 'error');
            return;
        }

        const step = {
            id: this.isEditing ? this.editingStep.id : Date.now(),
            title,
            description,
            highlight: { ...this.tempHighlight },
            overlayOpacity: this.overlayOpacity,
            highlightOpacity: this.highlightOpacity
        };

        if (this.isEditing && this.editingIndex !== null) {
            this.steps.splice(this.editingIndex, 0, step);
        } else {
            this.steps.push(step);
        }

        document.getElementById('stepTitle').value = '';
        document.getElementById('stepDescription').value = '';
        
        document.getElementById('saveStepBtn').style.display = 'none';
        document.getElementById('redoSelectionBtn').style.display = 'none';
        document.getElementById('cancelEditBtn').style.display = 'none';
        document.getElementById('selectAreaBtn').style.display = 'block';
        document.getElementById('selectAreaBtn').style.background = '';
        document.getElementById('selectBtnText').textContent = 'Selecionar Área no Canvas';
        document.getElementById('selectionStatus').textContent = '';

        document.querySelectorAll('.highlight-area.active').forEach(h => h.remove());
        
        this.tempHighlight = null;
        this.isEditing = false;
        this.editingIndex = null;
        this.editingStep = null;
        this.resetSelection();

        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();

        this.showToast('✅ Passo salvo com sucesso!', 'success');
    }

    resetSelection() {
        this.selectionStart = null;
        this.selectionCurrent = null;
        this.isSelecting = false;
        
        const selectionBox = document.querySelector('.selection-box');
        if (selectionBox) selectionBox.remove();
        
        const overlay = document.getElementById('canvasOverlay');
        if (overlay) overlay.classList.remove('selecting');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderStepsList() {
        const container = document.getElementById('stepsList');
        if (!container) return;

        container.innerHTML = '';

        if (this.steps.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>Nenhum passo criado ainda</p>
                </div>
            `;
            return;
        }

        this.steps.forEach((step, index) => {
            const stepItem = document.createElement('div');
            stepItem.className = 'step-item';
            stepItem.draggable = true;
            stepItem.dataset.index = index;
            
            const overlayPct = Math.round((step.overlayOpacity || 0.75) * 100);
            const highlightPct = Math.round((step.highlightOpacity || 0.20) * 100);
            
            stepItem.innerHTML = `
                <div class="step-header">
                    <span class="drag-handle" title="Arrastar para reordenar">⋮⋮</span>
                    <span class="step-number">Passo ${index + 1}</span>
                    <div class="step-actions">
                        <button class="btn-small" onclick="app.duplicateStep(${index})" title="Duplicar" style="background:#2196F3;">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn-small btn-edit" onclick="app.editStep(${index})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small btn-delete" onclick="app.deleteStep(${index})" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="step-title">${this.escapeHtml(step.title)}</div>
                <div class="step-description">${this.escapeHtml(step.description)}</div>
                <div style="font-size:11px;color:#999;margin-top:8px;">
                    🌑 Escurecimento: ${overlayPct}% | ✨ Claridade: ${highlightPct}%
                </div>
            `;
            
            // Drag events
            stepItem.addEventListener('dragstart', (e) => {
                stepItem.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index);
            });
            
            stepItem.addEventListener('dragend', () => {
                stepItem.classList.remove('dragging');
                document.querySelectorAll('.step-item').forEach(item => {
                    item.classList.remove('drag-over');
                });
            });
            
            stepItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const dragging = document.querySelector('.dragging');
                if (dragging && dragging !== stepItem) {
                    stepItem.classList.add('drag-over');
                }
            });
            
            stepItem.addEventListener('dragleave', () => {
                stepItem.classList.remove('drag-over');
            });
            
            stepItem.addEventListener('drop', (e) => {
                e.preventDefault();
                stepItem.classList.remove('drag-over');
                
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = parseInt(stepItem.dataset.index);
                
                if (draggedIndex !== targetIndex) {
                    this.reorderSteps(draggedIndex, targetIndex);
                }
            });
            
            container.appendChild(stepItem);
        });

        document.getElementById('stepCount').textContent = this.steps.length;
    }

    reorderSteps(fromIndex, toIndex) {
        const [movedStep] = this.steps.splice(fromIndex, 1);
        this.steps.splice(toIndex, 0, movedStep);
        
        this.renderStepsList();
        this.renderAllHighlights();
        this.showToast('✅ Ordem atualizada', 'success');
    }

    renderAllHighlights() {
        document.querySelectorAll('.highlight-area:not(.active)').forEach(el => el.remove());

        if (this.steps.length === 0) return;

        const overlayEl = document.getElementById('canvasOverlay');
        const iframe = document.getElementById('powerbiFrame');
        if (!overlayEl || !iframe) return;

        const offset = this.detectPowerBIOffset(iframe);
        const rect = iframe.getBoundingClientRect();
        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;

        this.steps.forEach((step, index) => {
            const stepOverlayOpacity = step.overlayOpacity !== undefined ? step.overlayOpacity : 0.75;
            const stepHighlightOpacity = step.highlightOpacity !== undefined ? step.highlightOpacity : 0.20;

            const highlight = document.createElement('div');
            highlight.className = 'highlight-area';
            highlight.style.cssText = `
                position: absolute;
                border: 3px solid #667eea;
                background: rgba(102, 126, 234, ${stepHighlightOpacity});
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
                z-index: 15;
            `;

            const topPct = parseFloat(step.highlight.top);
            const leftPct = parseFloat(step.highlight.left);
            const widthPct = parseFloat(step.highlight.width);
            const heightPct = parseFloat(step.highlight.height);
            
            const topPx = (topPct / 100) * usableHeight + offset.top;
            const leftPx = (leftPct / 100) * usableWidth + offset.left;
            const widthPx = (widthPct / 100) * usableWidth;
            const heightPx = (heightPct / 100) * usableHeight;

            highlight.style.top = `${topPx}px`;
            highlight.style.left = `${leftPx}px`;
            highlight.style.width = `${widthPx}px`;
            highlight.style.height = `${heightPx}px`;

            const label = document.createElement('div');
            label.className = 'highlight-label';
            label.textContent = `Passo ${index + 1}`;
            highlight.appendChild(label);

            highlight.onmouseenter = () => {
                highlight.style.background = `rgba(102, 126, 234, ${Math.min(stepHighlightOpacity + 0.1, 1)})`;
                highlight.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.5)';
            };
            highlight.onmouseleave = () => {
                highlight.style.background = `rgba(102, 126, 234, ${stepHighlightOpacity})`;
                highlight.style.boxShadow = '';
            };

            overlayEl.appendChild(highlight);
        });
    }

    updateButtons() {
        const hasSteps = this.steps.length > 0;
        document.getElementById('previewBtn').disabled = !hasSteps;
        document.getElementById('saveBtn').disabled = !hasSteps;
    }

    duplicateStep(index) {
        const step = this.steps[index];
        if (!step) return;

        const duplicated = {
            id: Date.now(),
            title: step.title + ' (cópia)',
            description: step.description,
            highlight: { ...step.highlight },
            overlayOpacity: step.overlayOpacity,
            highlightOpacity: step.highlightOpacity
        };

        this.steps.splice(index + 1, 0, duplicated);
        
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
        
        this.showToast('✅ Passo duplicado', 'success');
    }

    editStep(index) {
        const step = this.steps[index];
        if (!step) return;

        this.isEditing = true;
        this.editingIndex = index;
        this.editingStep = { ...step };

        document.getElementById('stepTitle').value = step.title;
        document.getElementById('stepDescription').value = step.description;

        if (step.overlayOpacity !== undefined) {
            this.overlayOpacity = step.overlayOpacity;
            document.getElementById('overlayOpacity').value = Math.round(step.overlayOpacity * 100);
            document.getElementById('overlayOpacityValue').textContent = Math.round(step.overlayOpacity * 100) + '%';
        }
        
        if (step.highlightOpacity !== undefined) {
            this.highlightOpacity = step.highlightOpacity;
            document.getElementById('highlightOpacity').value = Math.round(step.highlightOpacity * 100);
            document.getElementById('highlightOpacityValue').textContent = Math.round(step.highlightOpacity * 100) + '%';
        }

        this.steps.splice(index, 1);
        this.tempHighlight = step.highlight;

        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
        this.renderTempHighlight(step.highlight);

        document.getElementById('saveStepBtn').style.display = 'block';
        document.getElementById('redoSelectionBtn').style.display = 'inline-block';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        document.getElementById('selectAreaBtn').style.display = 'none';
        
        this.showToast('📝 Modo de edição ativado', 'info');
    }

    deleteStep(index) {
        if (!confirm('Excluir este passo?')) return;
        this.steps.splice(index, 1);
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
        this.showToast('🗑️ Passo excluído', 'info');
    }

    // PREVIEW VISUAL FUNCIONAL
    startPreview() {
        if (this.steps.length === 0) return;
        
        this.previewIndex = 0;
        this.createPreviewOverlay();
        this.renderPreviewStep();
    }

    createPreviewOverlay() {
        // Remover preview antigo se existir
        let overlay = document.getElementById('tutorialPreviewOverlay');
        if (overlay) overlay.remove();
        
        overlay = document.createElement('div');
        overlay.id = 'tutorialPreviewOverlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 10000;
            pointer-events: none;
        `;
        
        // Highlight box
        const highlight = document.createElement('div');
        highlight.id = 'previewHighlight';
        highlight.style.cssText = `
            position: fixed;
            border: 4px solid #4CAF50;
            border-radius: 8px;
            z-index: 10001;
            pointer-events: none;
            transition: all 0.3s ease;
        `;
        
        // Tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'previewTooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.3);
            z-index: 10002;
            pointer-events: auto;
        `;
        
        tooltip.innerHTML = `
            <button id="previewCloseBtn" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                font-size: 28px;
                color: #999;
                cursor: pointer;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            ">×</button>
            <h3 id="previewTitle" style="margin: 0 0 12px 0; font-size: 20px; color: #333; padding-right: 30px;"></h3>
            <p id="previewDesc" style="margin: 0 0 20px 0; color: #666; line-height: 1.6;"></p>
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 20px;
                border-top: 2px solid #e5e5e5;
            ">
                <span id="previewProgress" style="color: #666; font-weight: 600; font-size: 14px;"></span>
                <div style="display: flex; gap: 10px;">
                    <button id="previewPrevBtn" class="preview-btn" style="
                        padding: 10px 20px;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        background: #e5e5e5;
                        color: #333;
                        transition: all 0.2s;
                    ">Anterior</button>
                    <button id="previewNextBtn" class="preview-btn" style="
                        padding: 10px 20px;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        background: #667eea;
                        color: white;
                        transition: all 0.2s;
                    ">Próximo</button>
                </div>
            </div>
            <div style="margin-top: 12px; font-size: 11px; color: #999; text-align: center;">
                Use as setas ← → do teclado ou clique nos botões
            </div>
        `;
        
        overlay.appendChild(highlight);
        overlay.appendChild(tooltip);
        document.body.appendChild(overlay);
        
        // Event listeners
        document.getElementById('previewCloseBtn').onclick = () => this.closePreview();
        document.getElementById('previewPrevBtn').onclick = () => this.previewNavigate(-1);
        document.getElementById('previewNextBtn').onclick = () => this.previewNavigate(1);
        
        // Hover effects
        const prevBtn = document.getElementById('previewPrevBtn');
        const nextBtn = document.getElementById('previewNextBtn');
        const closeBtn = document.getElementById('previewCloseBtn');
        
        prevBtn.onmouseenter = () => prevBtn.style.background = '#d0d0d0';
        prevBtn.onmouseleave = () => prevBtn.style.background = '#e5e5e5';
        nextBtn.onmouseenter = () => nextBtn.style.background = '#5568d3';
        nextBtn.onmouseleave = () => nextBtn.style.background = '#667eea';
        closeBtn.onmouseenter = () => { closeBtn.style.background = '#f0f0f0'; closeBtn.style.color = '#333'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; closeBtn.style.color = '#999'; };
        
        // Keyboard navigation
        this._previewKeyHandler = (e) => {
            if (e.key === 'Escape') this.closePreview();
            if (e.key === 'ArrowLeft') this.previewNavigate(-1);
            if (e.key === 'ArrowRight') this.previewNavigate(1);
        };
        document.addEventListener('keydown', this._previewKeyHandler);
    }

    renderPreviewStep() {
        const step = this.steps[this.previewIndex];
        if (!step) return;
        
        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) {
            this.showToast('❌ Power BI não está carregado', 'error');
            this.closePreview();
            return;
        }
        
        const highlight = document.getElementById('previewHighlight');
        const tooltip = document.getElementById('previewTooltip');
        
        // Usar opacidades do step
        const stepOverlayOpacity = step.overlayOpacity !== undefined ? step.overlayOpacity : 0.75;
        const stepHighlightOpacity = step.highlightOpacity !== undefined ? step.highlightOpacity : 0.20;
        
        // Calcular posição do highlight
        const offset = this.detectPowerBIOffset(iframe);
        const rect = iframe.getBoundingClientRect();
        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;
        
        const topPct = parseFloat(step.highlight.top);
        const leftPct = parseFloat(step.highlight.left);
        const widthPct = parseFloat(step.highlight.width);
        const heightPct = parseFloat(step.highlight.height);
        
        const hlTop = rect.top + offset.top + (topPct / 100) * usableHeight;
        const hlLeft = rect.left + offset.left + (leftPct / 100) * usableWidth;
        const hlWidth = (widthPct / 100) * usableWidth;
        const hlHeight = (heightPct / 100) * usableHeight;
        
        // Aplicar estilo ao highlight com opacidades do step
        highlight.style.top = hlTop + 'px';
        highlight.style.left = hlLeft + 'px';
        highlight.style.width = hlWidth + 'px';
        highlight.style.height = hlHeight + 'px';
        highlight.style.background = `rgba(76, 175, 80, ${stepHighlightOpacity})`;
        highlight.style.boxShadow = `
            0 0 0 4px rgba(76, 175, 80, 0.4),
            0 0 0 9999px rgba(0, 0, 0, ${stepOverlayOpacity}),
            0 0 40px 5px rgba(76, 175, 80, 0.8)
        `;
        
        // Atualizar conteúdo do tooltip
        document.getElementById('previewTitle').textContent = step.title;
        document.getElementById('previewDesc').textContent = step.description;
        document.getElementById('previewProgress').textContent = `${this.previewIndex + 1} / ${this.steps.length}`;
        
        // Atualizar botões
        const prevBtn = document.getElementById('previewPrevBtn');
        const nextBtn = document.getElementById('previewNextBtn');
        
        prevBtn.disabled = this.previewIndex === 0;
        prevBtn.style.opacity = this.previewIndex === 0 ? '0.5' : '1';
        prevBtn.style.cursor = this.previewIndex === 0 ? 'not-allowed' : 'pointer';
        
        nextBtn.textContent = this.previewIndex === this.steps.length - 1 ? 'Concluir' : 'Próximo';
        
        // Posicionar tooltip
        this.positionPreviewTooltip(hlTop, hlLeft, hlWidth, hlHeight);
    }

    positionPreviewTooltip(hlTop, hlLeft, hlWidth, hlHeight) {
        const tooltip = document.getElementById('previewTooltip');
        if (!tooltip) return;
        
        // Reset para medir dimensões
        tooltip.style.visibility = 'hidden';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        
        requestAnimationFrame(() => {
            const ttRect = tooltip.getBoundingClientRect();
            const margin = 20;
            
            // Tentar posicionar à direita do highlight
            let ttLeft = hlLeft + hlWidth + margin;
            let ttTop = hlTop;
            
            // Se não couber à direita, tentar embaixo
            if (ttLeft + ttRect.width > window.innerWidth - 10) {
                ttLeft = hlLeft;
                ttTop = hlTop + hlHeight + margin;
            }
            
            // Se não couber embaixo, tentar em cima
            if (ttTop + ttRect.height > window.innerHeight - 10) {
                ttTop = hlTop - ttRect.height - margin;
            }
            
            // Se não couber em cima, tentar à esquerda
            if (ttTop < 10) {
                ttLeft = hlLeft - ttRect.width - margin;
                ttTop = hlTop;
            }
            
            // Garantir que está dentro da tela
            ttLeft = Math.max(10, Math.min(ttLeft, window.innerWidth - ttRect.width - 10));
            ttTop = Math.max(10, Math.min(ttTop, window.innerHeight - ttRect.height - 10));
            
            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
            tooltip.style.visibility = 'visible';
        });
    }

    previewNavigate(delta) {
        this.previewIndex += delta;
        
        if (this.previewIndex < 0) {
            this.previewIndex = 0;
            return;
        }
        
        if (this.previewIndex >= this.steps.length) {
            this.closePreview();
            this.showToast('🎉 Preview concluído!', 'success');
            return;
        }
        
        this.renderPreviewStep();
    }

    closePreview() {
        const overlay = document.getElementById('tutorialPreviewOverlay');
        if (overlay) overlay.remove();
        
        if (this._previewKeyHandler) {
            document.removeEventListener('keydown', this._previewKeyHandler);
            this._previewKeyHandler = null;
        }
    }

    async saveTutorial() {
        if (!this.pageId) {
            this.showToast('❌ ID da página não encontrado', 'error');
            return;
        }

        if (this.steps.length === 0) {
            this.showToast('❌ Adicione pelo menos um passo', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                this.showToast('❌ Você precisa estar logado como admin', 'error');
                return;
            }

            console.log('[SAVE-TUTORIAL] Salvando:', this.steps.length, 'passos');

            const response = await fetch(`/api/tutorials`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pageId: parseInt(this.pageId),
                    steps: this.steps
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Erro ao salvar');
            }

            this.showToast('✅ Tutorial salvo com sucesso!', 'success');

        } catch (error) {
            console.error('[SAVE-TUTORIAL] Erro:', error);
            this.showToast('❌ Erro ao salvar: ' + error.message, 'error');
        }
    }

    // Toast notifications
    showToast(message, type = 'info') {
        let toast = document.getElementById('toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

const app = new TutorialBuilderApp();

function closePreview() {
    const overlay = document.getElementById('previewOverlay');
    if (overlay) overlay.style.display = 'none';
}