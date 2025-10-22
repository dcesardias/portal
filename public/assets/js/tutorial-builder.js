class TutorialBuilderApp {
    constructor() {
        this.pageId = new URLSearchParams(window.location.search).get('pageId');
        this.pageData = null;
        this.steps = [];
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionCurrent = null;
        this.tempHighlight = null;
        // removido: this._onFsChange e fullscreen
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

        // removido: listeners de fullscreen
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
            
            // Atualizar informações da página
            document.getElementById('pageInfo').innerHTML = `
                <strong>${this.pageData.Title}</strong>
                ${this.pageData.Subtitle || ''}
            `;

            // Carregar iframe do Power BI
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
                    
                    // CORRIGIDO: Renderizar e atualizar botões após carregar
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

        // removido: botões/handlers de fullscreen
    }

    startSelection() {
        const title = document.getElementById('stepTitle').value.trim();
        const description = document.getElementById('stepDescription').value.trim();
        if (!title || !description) { alert('❌ Preencha título e descrição antes de selecionar a área'); return; }

        // Sem fullscreen: começa direto
        this.isSelecting = true;
        const overlay = document.getElementById('canvasOverlay');
        overlay.classList.add('selecting');
        document.getElementById('selectBtnText').textContent = '🎯 Clique e arraste no dashboard...';
        document.getElementById('selectAreaBtn').style.background = '#4CAF50';
        document.getElementById('selectionStatus').textContent = '🖱️ Clique e arraste para selecionar a área';
    }

    onMouseDown(e) {
        if (!this.isSelecting) return;

        // CORRIGIDO: Pegar coordenadas relativas ao IFRAME, não ao canvas inteiro
        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        
        // Verificar se o clique está dentro do iframe
        if (e.clientX < rect.left || e.clientX > rect.right || 
            e.clientY < rect.top || e.clientY > rect.bottom) {
            console.log('[SELECTION] Clique fora do iframe');
            return;
        }

        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        this.selectionStart = { x, y };
        this.selectionCurrent = { x, y };
        
        console.log('[SELECTION] ✅ Mouse Down (relativo ao iframe):', { x: x.toFixed(2), y: y.toFixed(2) });
    }

    onMouseMove(e) {
        if (!this.isSelecting || !this.selectionStart) return;

        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        
        // Limitar movimento dentro do iframe
        let clientX = Math.max(rect.left, Math.min(e.clientX, rect.right));
        let clientY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));
        
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        this.selectionCurrent = { x, y };
        this.renderSelectionBox();
        
        // Atualizar status com dimensões
        const width = Math.abs(this.selectionCurrent.x - this.selectionStart.x);
        const height = Math.abs(this.selectionCurrent.y - this.selectionStart.y);
        document.getElementById('selectionStatus').textContent = 
            `📏 Área: ${width.toFixed(1)}% × ${height.toFixed(1)}% (relativo ao Power BI)`;
    }

    onMouseUp(e) {
        if (!this.isSelecting || !this.selectionStart) {
            console.log('[SELECTION] ❌ Mouse up sem seleção ativa');
            return;
        }

        // CORRIGIDO: Atualizar selectionCurrent uma última vez relativo ao iframe
        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) return;

        const rect = iframe.getBoundingClientRect();
        let clientX = Math.max(rect.left, Math.min(e.clientX, rect.right));
        let clientY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));
        
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        this.selectionCurrent = { x, y };

        this.isSelecting = false;
        document.getElementById('canvasOverlay').classList.remove('selecting');
        
        // Calcular highlight
        const width = Math.abs(this.selectionCurrent.x - this.selectionStart.x);
        const height = Math.abs(this.selectionCurrent.y - this.selectionStart.y);
        
        console.log('[SELECTION] 📊 Dimensões calculadas (% do iframe):', { 
            width: width.toFixed(2), 
            height: height.toFixed(2),
            start: this.selectionStart,
            current: this.selectionCurrent
        });
        
        // Validação: área mínima de 0.5%
        const minSize = 0.5;
        
        if (width < minSize || height < minSize) {
            alert(`⚠️ Área muito pequena!\n\nLargura: ${width.toFixed(2)}%\nAltura: ${height.toFixed(2)}%\n\nMínimo necessário: ${minSize}%\n\nDica: Arraste o mouse por uma área maior.`);
            this.resetSelection();
            return;
        }

        const highlight = {
            top: `${Math.min(this.selectionStart.y, this.selectionCurrent.y).toFixed(2)}%`,
            left: `${Math.min(this.selectionStart.x, this.selectionCurrent.x).toFixed(2)}%`,
            width: `${width.toFixed(2)}%`,
            height: `${height.toFixed(2)}%`
        };

        console.log('[SELECTION] ✅ Highlight válido (% do iframe):', highlight);

        // Salvar temporariamente
        this.tempHighlight = highlight;

        // Mostrar botão de salvar
        document.getElementById('saveStepBtn').style.display = 'block';
        document.getElementById('selectAreaBtn').style.display = 'none';
        document.getElementById('selectionStatus').textContent = '✅ Área selecionada! Clique em "Salvar Passo"';

        // Limpar seleção visual
        const selectionBox = document.querySelector('.selection-box');
        if (selectionBox) selectionBox.remove();

        // Mostrar preview da área selecionada
        this.renderTempHighlight(highlight);
    }

    renderSelectionBox() {
        if (!this.selectionStart || !this.selectionCurrent) return;
        const iframe = document.getElementById('powerbiFrame');
        const overlayEl = document.getElementById('canvasOverlay');
        if (!iframe || !overlayEl) return;

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

        // Agora usamos percentuais diretamente porque o overlay cobre 100% do frame
        box.style.top = `${top}%`;
        box.style.left = `${left}%`;
        box.style.width = `${width}%`;
        box.style.height = `${height}%`;
    }

    renderTempHighlight(highlight) {
        const oldTemp = document.querySelector('.highlight-area.active');
        if (oldTemp) oldTemp.remove();

        const overlayEl = document.getElementById('canvasOverlay');
        if (!overlayEl) return;

        const tempHighlight = document.createElement('div');
        tempHighlight.className = 'highlight-area active';
        tempHighlight.style.cssText = `
            position: absolute;
            border: 3px solid #4CAF50;
            background: rgba(76, 175, 80, 0.2);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            z-index: 15;
            pointer-events: none;
        `;

        // Percentuais diretos no overlay
        tempHighlight.style.top = highlight.top;
        tempHighlight.style.left = highlight.left;
        tempHighlight.style.width = highlight.width;
        tempHighlight.style.height = highlight.height;

        const label = document.createElement('div');
        label.className = 'highlight-label';
        label.textContent = `Passo ${this.steps.length + 1} (Preview)`;
        label.style.cssText = `
            position: absolute;
            top: -30px;
            left: 0;
            background: #4CAF50;
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

        console.log('[SAVE-STEP] Tentando salvar:', { title, description, tempHighlight: this.tempHighlight });

        if (!title || !description) {
            alert('❌ Preencha o título e descrição');
            return;
        }

        if (!this.tempHighlight) {
            alert('❌ Selecione uma área no canvas antes de salvar');
            return;
        }

        const step = {
            id: Date.now(),
            title,
            description,
            // NOVO: indicar que as medidas são relativas ao iframe
            highlight: { ...this.tempHighlight, relativeTo: 'iframe' }
        };

        console.log('[SAVE-STEP] Step criado:', step);

        this.steps.push(step);

        console.log('[SAVE-STEP] Total de steps após adicionar:', this.steps.length);

        // Limpar formulário
        document.getElementById('stepTitle').value = '';
        document.getElementById('stepDescription').value = '';
        
        // Esconder botão de salvar e mostrar botão de selecionar novamente
        const saveBtn = document.getElementById('saveStepBtn');
        const selectBtn = document.getElementById('selectAreaBtn');
        
        if (saveBtn) saveBtn.style.display = 'none';
        if (selectBtn) {
            selectBtn.style.display = 'block';
            selectBtn.style.background = '';
        }
        
        document.getElementById('selectBtnText').textContent = 'Selecionar Área no Canvas';
        document.getElementById('selectionStatus').textContent = '';

        // Remover preview temporário
        const tempHighlights = document.querySelectorAll('.highlight-area.active');
        tempHighlights.forEach(h => h.remove());
        
        // Limpar variáveis de seleção
        this.tempHighlight = null;
        this.resetSelection();

        // Atualizar UI
        console.log('[SAVE-STEP] Atualizando UI...');
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();

        alert('✅ Passo adicionado com sucesso!');
        
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
        if (selectBtn) {
            selectBtn.style.background = '';
        }
        
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

        // Atualizar contador
        const stepCount = document.getElementById('stepCount');
        if (stepCount) {
            stepCount.textContent = this.steps.length;
        }

        console.log('[RENDER-STEPS] ✅ Renderização concluída');
    }

    renderAllHighlights() {
        // Remover highlights anteriores (exceto temp)
        document.querySelectorAll('.highlight-area:not(.active)').forEach(el => el.remove());

        if (this.steps.length === 0) return;

        const overlayEl = document.getElementById('canvasOverlay');
        if (!overlayEl) return;

        this.steps.forEach((step, index) => {
            const highlight = document.createElement('div');
            highlight.className = 'highlight-area';
            highlight.style.cssText = `
                position: absolute;
                border: 3px solid #667eea;
                background: rgba(102, 126, 234, 0.15);
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
                z-index: 15;
            `;

            // Percentuais diretos
            highlight.style.top = step.highlight.top;
            highlight.style.left = step.highlight.left;
            highlight.style.width = step.highlight.width;
            highlight.style.height = step.highlight.height;

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
                highlight.style.background = 'rgba(102, 126, 234, 0.25)';
                highlight.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.5)';
            };
            highlight.onmouseleave = () => {
                highlight.style.background = 'rgba(102, 126, 234, 0.15)';
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

        // Preencher formulário
        document.getElementById('stepTitle').value = step.title;
        document.getElementById('stepDescription').value = step.description;

        // Remover passo da lista (será readicionado ao salvar)
        this.steps.splice(index, 1);
        
        // Definir highlight temporário
        this.tempHighlight = step.highlight;

        // Atualizar UI
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();

        // Mostrar preview do highlight
        this.renderTempHighlight(step.highlight);

        // Mostrar botão de salvar
        document.getElementById('saveStepBtn').style.display = 'block';
        document.getElementById('selectAreaBtn').style.display = 'none';
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
            
            // Opcional: fechar janela após salvar
            // window.close();

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
