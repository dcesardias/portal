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
        
        // NOVO: Valores de opacidade
        this.overlayOpacity = 0.75; // 75% de escurecimento fora do highlight
        this.highlightOpacity = 0.20; // 20% de transparência dentro do highlight
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadPageData();
        await this.loadExistingTutorial();

        const iframe = document.getElementById('powerbiFrame');
        if (iframe && 'ResizeObserver' in window) {
            this._resizeObserver = new ResizeObserver(() => {
                this.renderAllHighlights();
                if (this.tempHighlight) this.renderTempHighlight(this.tempHighlight);
            });
            this._resizeObserver.observe(iframe);
        }
    }

    // Detectar offset proporcional para qualquer resolução
    detectPowerBIOffset(iframe) {
        const rect = iframe.getBoundingClientRect();
        
        // Calcular offset proporcional à resolução
        const topOffset = Math.max(45, Math.min(60, rect.height * 0.06)); // 6% da altura ou 45-60px
        const sideOffset = Math.max(6, rect.width * 0.008); // 0.8% da largura ou mínimo 6px
        const bottomOffset = Math.max(6, rect.height * 0.01); // 1% da altura ou mínimo 6px
        
        console.log('[OFFSET-BUILDER] Calculado para resolução:', {
            iframeSize: { w: rect.width, h: rect.height },
            offsets: { top: topOffset, left: sideOffset, right: sideOffset, bottom: bottomOffset }
        });
        
        return {
            top: topOffset,
            left: sideOffset,
            right: sideOffset,
            bottom: bottomOffset
        };
    }

    async loadPageData() {
        if (!this.pageId) {
            alert('❌ ID da página não encontrado na URL');
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
                document.getElementById('selectAreaBtn').disabled = false;
            } else {
                alert('⚠️ Esta página não possui URL do Power BI configurada');
            }

        } catch (error) {
            console.error('Erro ao carregar página:', error);
            alert('❌ Erro ao carregar dados da página');
        }
    }

    async loadExistingTutorial() {
        try {
            console.log('[LOAD-TUTORIAL] Carregando tutorial existente para página:', this.pageId);
            
            const response = await fetch(`/api/tutorials/page/${this.pageId}`);
            if (response.ok) {
                const tutorial = await response.json();
                console.log('[LOAD-TUTORIAL] Tutorial encontrado:', tutorial);
                
                if (tutorial.steps && Array.isArray(tutorial.steps)) {
                    this.steps = tutorial.steps;
                    console.log('[LOAD-TUTORIAL] Steps carregados:', this.steps.length);
                    
                    this.renderStepsList();
                    this.renderAllHighlights();
                    this.updateButtons();
                }
            } else {
                console.log('[LOAD-TUTORIAL] Nenhum tutorial existente (404)');
            }
        } catch (error) {
            console.error('[LOAD-TUTORIAL] Erro ao carregar tutorial:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('selectAreaBtn').addEventListener('click', () => this.startSelection());
        document.getElementById('saveStepBtn').addEventListener('click', () => this.saveCurrentStep());
        
        const redoBtn = document.getElementById('redoSelectionBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (redoBtn) redoBtn.addEventListener('click', () => this.redoSelection());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.cancelEdit());

        const overlay = document.getElementById('canvasOverlay');
        overlay.addEventListener('mousedown', (e) => this.onMouseDown(e));
        overlay.addEventListener('mousemove', (e) => this.onMouseMove(e));
        overlay.addEventListener('mouseup', (e) => this.onMouseUp(e));

        document.getElementById('previewBtn').addEventListener('click', () => this.startPreview());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveTutorial());

        const onViewportChange = () => {
            this.renderAllHighlights();
            if (this.tempHighlight) this.renderTempHighlight(this.tempHighlight);
            this.renderSelectionBox();
        };
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);
        this._onViewportChange = onViewportChange;
    }

    // NOVO: Atualizar opacidade do overlay (área escura)
    updateOverlayOpacity(value) {
        this.overlayOpacity = value / 100;
        document.getElementById('overlayOpacityValue').textContent = value + '%';
        
        if (this.tempHighlight) {
            this.renderTempHighlight(this.tempHighlight);
        }
        
        this.renderAllHighlights();
    }

    // NOVO: Atualizar opacidade do highlight (fundo colorido)
    updateHighlightOpacity(value) {
        this.highlightOpacity = value / 100;
        document.getElementById('highlightOpacityValue').textContent = value + '%';
        
        if (this.tempHighlight) {
            this.renderTempHighlight(this.tempHighlight);
        }
        
        this.renderAllHighlights();
    }

    startSelection() {
        const title = document.getElementById('stepTitle').value.trim();
        const description = document.getElementById('stepDescription').value.trim();
        if (!title || !description) { 
            alert('❌ Preencha título e descrição antes de selecionar a área'); 
            return; 
        }

        this.isSelecting = true;
        const overlay = document.getElementById('canvasOverlay');
        overlay.classList.add('selecting');
        document.getElementById('selectBtnText').textContent = '🎯 Clique e arraste no dashboard...';
        document.getElementById('selectAreaBtn').style.background = '#4CAF50';
        document.getElementById('selectionStatus').textContent = '🖱️ Clique e arraste para selecionar a área DENTRO do conteúdo do Power BI';
    }

    // NOVO: Refazer seleção durante edição
    redoSelection() {
        console.log('[REDO-SELECTION] Iniciando nova seleção durante edição');
        
        this.tempHighlight = null;
        const tempHighlights = document.querySelectorAll('.highlight-area.active');
        tempHighlights.forEach(h => h.remove());
        
        this.startSelection();
    }

    // NOVO: Cancelar edição
    cancelEdit() {
        console.log('[CANCEL-EDIT] Cancelando edição');
        
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
        document.getElementById('selectAreaBtn').style.background = '';
        document.getElementById('selectBtnText').textContent = 'Selecionar Área no Canvas';
        document.getElementById('selectionStatus').textContent = '';
        
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
        
        const tempHighlights = document.querySelectorAll('.highlight-area.active');
        tempHighlights.forEach(h => h.remove());
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
            console.log('[SELECTION] Clique fora da área útil do Power BI');
            alert('⚠️ Clique DENTRO da área do dashboard (evite a barra de ferramentas e margens)');
            return;
        }

        const usableWidth = rect.width - offset.left - offset.right;
        const usableHeight = rect.height - offset.top - offset.bottom;
        
        const x = ((e.clientX - usableLeft) / usableWidth) * 100;
        const y = ((e.clientY - usableTop) / usableHeight) * 100;

        this.selectionStart = { x, y };
        this.selectionCurrent = { x, y };
        
        console.log('[SELECTION] ✅ Mouse Down (área útil):', { 
            x: x.toFixed(2), 
            y: y.toFixed(2),
            offset 
        });
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
            `📏 Área: ${width.toFixed(1)}% × ${height.toFixed(1)}% (área útil do Power BI)`;
    }

    onMouseUp(e) {
        if (!this.isSelecting || !this.selectionStart) {
            console.log('[SELECTION] ❌ Mouse up sem seleção ativa');
            return;
        }

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
        
        console.log('[SELECTION] 📊 Dimensões (% área útil):', { 
            width: width.toFixed(2), 
            height: height.toFixed(2),
            offset
        });
        
        const minSize = 0.5;
        
        if (width < minSize || height < minSize) {
            alert(`⚠️ Área muito pequena!\n\nLargura: ${width.toFixed(2)}%\nAltura: ${height.toFixed(2)}%\n\nMínimo: ${minSize}%`);
            this.resetSelection();
            return;
        }

        const highlight = {
            top: `${Math.min(this.selectionStart.y, this.selectionCurrent.y).toFixed(2)}%`,
            left: `${Math.min(this.selectionStart.x, this.selectionCurrent.x).toFixed(2)}%`,
            width: `${width.toFixed(2)}%`,
            height: `${height.toFixed(2)}%`
        };

        console.log('[SELECTION] ✅ Highlight válido:', highlight);

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
            box.style.cssText = `
                position: absolute;
                border: 3px dashed #667eea;
                background: rgba(102, 126, 234, 0.1);
                pointer-events: none;
                z-index: 20;
            `;
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
        const oldTemp = document.querySelector('.highlight-area.active');
        if (oldTemp) oldTemp.remove();

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
        label.style.cssText = `
            position: absolute;
            top: -30px;
            left: 0;
            background: ${this.isEditing ? '#FF9800' : '#4CAF50'};
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
        `;
        tempHighlight.appendChild(label);

        overlayEl.appendChild(tempHighlight);
    }

    saveCurrentStep() {
        const title = document.getElementById('stepTitle')?.value?.trim();
        const description = document.getElementById('stepDescription')?.value?.trim();

        console.log('[SAVE-STEP] Tentando salvar:', { 
            title, 
            description, 
            tempHighlight: this.tempHighlight,
            isEditing: this.isEditing,
            editingIndex: this.editingIndex
        });

        if (!title || !description) {
            alert('❌ Preencha o título e descrição');
            return;
        }

        if (!this.tempHighlight) {
            alert('❌ Selecione uma área no canvas antes de salvar');
            return;
        }

        // MODIFICADO: Incluir opacidades no step
        const step = {
            id: this.isEditing ? this.editingStep.id : Date.now(),
            title,
            description,
            highlight: { ...this.tempHighlight },
            // NOVO: Salvar configurações de opacidade
            overlayOpacity: this.overlayOpacity,
            highlightOpacity: this.highlightOpacity
        };

        console.log('[SAVE-STEP] Step criado com opacidades:', step);

        if (this.isEditing && this.editingIndex !== null) {
            this.steps.splice(this.editingIndex, 0, step);
            console.log('[SAVE-STEP] Step atualizado na posição:', this.editingIndex);
        } else {
            this.steps.push(step);
            console.log('[SAVE-STEP] Novo step adicionado');
        }

        document.getElementById('stepTitle').value = '';
        document.getElementById('stepDescription').value = '';
        
        const saveBtn = document.getElementById('saveStepBtn');
        const selectBtn = document.getElementById('selectAreaBtn');
        const redoBtn = document.getElementById('redoSelectionBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');
        
        if (saveBtn) saveBtn.style.display = 'none';
        if (redoBtn) redoBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (selectBtn) {
            selectBtn.style.display = 'block';
            selectBtn.style.background = '';
        }
        
        document.getElementById('selectBtnText').textContent = 'Selecionar Área no Canvas';
        document.getElementById('selectionStatus').textContent = '';

        const tempHighlights = document.querySelectorAll('.highlight-area.active');
        tempHighlights.forEach(h => h.remove());
        
        this.tempHighlight = null;
        this.isEditing = false;
        this.editingIndex = null;
        this.editingStep = null;
        this.resetSelection();

        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();

        alert('✅ Passo salvo com sucesso!');
        
        console.log('[SAVE-STEP] ✅ Concluído. Steps atuais:', this.steps);
    }

    resetSelection() {
        this.selectionStart = null;
        this.selectionCurrent = null;
        this.isSelecting = false;
        
        const selectionBox = document.querySelector('.selection-box');
        if (selectionBox) selectionBox.remove();
        
        const overlay = document.getElementById('canvasOverlay');
        if (overlay) overlay.classList.remove('selecting');
        
        const selectBtn = document.getElementById('selectAreaBtn');
        if (selectBtn) selectBtn.style.background = '';
        
        document.getElementById('selectBtnText').textContent = 'Selecionar Área no Canvas';
        document.getElementById('selectionStatus').textContent = '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderStepsList() {
        const container = document.getElementById('stepsList');
        if (!container) {
            console.error('[RENDER-STEPS] Container stepsList não encontrado');
            return;
        }

        console.log('[RENDER-STEPS] Renderizando', this.steps.length, 'passos');

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
            
            stepItem.innerHTML = `
                <div class="step-header">
                    <span class="step-number">Passo ${index + 1}</span>
                    <div class="step-actions">
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
            `;
            
            container.appendChild(stepItem);
        });

        const stepCount = document.getElementById('stepCount');
        if (stepCount) stepCount.textContent = this.steps.length;

        console.log('[RENDER-STEPS] ✅ Renderização concluída');
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
            const highlight = document.createElement('div');
            highlight.className = 'highlight-area';
            highlight.style.cssText = `
                position: absolute;
                border: 3px solid #667eea;
                background: rgba(102, 126, 234, ${this.highlightOpacity});
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
            label.style.cssText = `
                position: absolute;
                top: -30px;
                left: 0;
                background: #667eea;
                color: white;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                white-space: nowrap;
            `;
            highlight.appendChild(label);

            highlight.onmouseenter = () => {
                highlight.style.background = `rgba(102, 126, 234, ${Math.min(this.highlightOpacity + 0.1, 1)})`;
                highlight.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.5)';
            };
            highlight.onmouseleave = () => {
                highlight.style.background = `rgba(102, 126, 234, ${this.highlightOpacity})`;
                highlight.style.boxShadow = '';
            };

            overlayEl.appendChild(highlight);
        });
    }

    updateButtons() {
        const hasSteps = this.steps.length > 0;
        
        const previewBtn = document.getElementById('previewBtn');
        const saveBtn = document.getElementById('saveBtn');
        
        if (previewBtn) {
            previewBtn.disabled = !hasSteps;
            console.log('[UPDATE-BUTTONS] Preview button:', hasSteps ? 'enabled' : 'disabled');
        }
        
        if (saveBtn) {
            saveBtn.disabled = !hasSteps;
            console.log('[UPDATE-BUTTONS] Save button:', hasSteps ? 'enabled' : 'disabled');
        }
        
        console.log('[UPDATE-BUTTONS] Total steps:', this.steps.length);
    }

    editStep(index) {
        console.log('[EDIT-STEP] Editando passo:', index);
        
        const step = this.steps[index];
        if (!step) {
            console.error('[EDIT-STEP] Passo não encontrado');
            return;
        }

        this.isEditing = true;
        this.editingIndex = index;
        this.editingStep = { ...step };

        document.getElementById('stepTitle').value = step.title;
        document.getElementById('stepDescription').value = step.description;

        // NOVO: Carregar opacidades salvas do step
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
        
        alert('📝 Modo de edição ativado!\n\n✏️ Edite o texto ou clique em "Refazer Seleção" para remarcar a área.');
    }

    deleteStep(index) {
        if (!confirm('Excluir este passo?')) return;

        console.log('[DELETE-STEP] Excluindo passo:', index);

        this.steps.splice(index, 1);
        
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
    }

    startPreview() {
        if (this.steps.length === 0) return;
        
        document.getElementById('previewOverlay').style.display = 'block';
    }

    async saveTutorial() {
        if (!this.pageId) {
            alert('❌ ID da página não encontrado na URL');
            return;
        }

        if (this.steps.length === 0) {
            alert('❌ Adicione pelo menos um passo');
            return;
        }

        try {
            const token = localStorage.getItem('authToken');
            if (!token) {
                alert('❌ Você precisa estar logado como admin para salvar tutoriais');
                return;
            }

            console.log('[SAVE-TUTORIAL] Salvando tutorial...');
            console.log('[SAVE-TUTORIAL] PageId:', this.pageId);
            console.log('[SAVE-TUTORIAL] Número de passos:', this.steps.length);
            console.log('[SAVE-TUTORIAL] Steps:', this.steps);

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
                console.error('[SAVE-TUTORIAL] Erro do servidor:', errorText);
                throw new Error(errorText || 'Erro ao salvar');
            }

            console.log('[SAVE-TUTORIAL] ✅ Tutorial salvo com sucesso');
            alert('✅ Tutorial salvo com sucesso!');

        } catch (error) {
            console.error('[SAVE-TUTORIAL] Erro ao salvar tutorial:', error);
            alert('❌ Erro ao salvar tutorial: ' + error.message);
        }
    }
}

// Inicializar app
const app = new TutorialBuilderApp();

function closePreview() {
    document.getElementById('previewOverlay').style.display = 'none';
}