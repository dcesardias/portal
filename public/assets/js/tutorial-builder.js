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
        this.currentStepType = 'highlight';
        
        // Temporários para navegação
        this.tempNavigationUrl = null;
        this.tempNavigationPageName = null;
        
        // Configuração do relatório Power BI
        this.reportId = null;
        this.tenantId = null;
        this.embedUrlBase = null;
        this.reportConfigured = false;
        
        // URL da tela atual (para agrupamento)
        this.currentScreenUrl = null;
        
        this.overlayOpacity = 0.75;
        this.highlightOpacity = 0.20;
        
        this.init();
    }

    // Callback quando tipo de step muda
    onStepTypeChange(type) {
        this.currentStepType = type;
        
        const highlightArea = document.getElementById('highlightSelectionArea');
        const navigationArea = document.getElementById('navigationSaveArea');
        const navPageDisplay = document.getElementById('navPageNameDisplay');
        
        if (type === 'navigation') {
            highlightArea.style.display = 'none';
            navigationArea.style.display = 'block';
            
            // Limpar URL anterior se houver
            document.getElementById('stepPowerBIUrl').value = '';
            if (navPageDisplay) navPageDisplay.style.display = 'none';
        } else {
            highlightArea.style.display = 'block';
            navigationArea.style.display = 'none';
            if (navPageDisplay) navPageDisplay.style.display = 'none';
        }
    }

    async init() {
        console.log('[INIT] Iniciando tutorial builder para pageId:', this.pageId);
        
        await this.loadPageData();
        await this.loadExistingTutorial(); // Aguardar carregar steps
        
        console.log('[INIT] Steps após carregamento:', this.steps.length);
        
        // Agora que os steps foram carregados, verificar configuração
        if (this.steps.length === 0) {
            // Novo tutorial - mostrar modal de configuração
            console.log('[INIT] Novo tutorial - mostrando modal de configuração');
            this.showReportConfigModal();
        } else {
            // Tutorial existente - tentar extrair config
            console.log('[INIT] Tutorial existente - tentando extrair configuração');
            this.tryExtractExistingConfig();
        }
        
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.monitorIframeLoad();
        
        // Aguardar um pouco para o iframe carregar e então detectar URL
        setTimeout(() => {
            this.detectCurrentScreenUrl();
            console.log('[INIT] ✅ currentScreenUrl definida:', this.currentScreenUrl);
            
            // Renderizar highlights e navegação após detectar URL
            this.renderAllHighlights();
            this.renderGroupNavigation();
        }, 1000);
    }

    // Detectar URL da tela atual do Power BI
    detectCurrentScreenUrl() {
        const iframe = document.getElementById('powerbiFrame');
        
        // Prioridade: iframe.src > pageData.PowerBIUrl > embedUrlBase
        if (iframe && iframe.src && iframe.src !== 'about:blank' && iframe.src !== '') {
            this.currentScreenUrl = iframe.src;
            console.log('[SCREEN] URL detectada do iframe:', this.currentScreenUrl);
        } else if (this.pageData && this.pageData.PowerBIUrl) {
            this.currentScreenUrl = this.pageData.PowerBIUrl;
            console.log('[SCREEN] URL detectada do pageData:', this.currentScreenUrl);
        } else if (this.embedUrlBase) {
            this.currentScreenUrl = this.embedUrlBase;
            console.log('[SCREEN] URL detectada do embedUrlBase:', this.currentScreenUrl);
        } else {
            console.warn('[SCREEN] ⚠️ Nenhuma URL detectada!');
        }
        
        // Se ainda está undefined, forçar para string vazia
        if (!this.currentScreenUrl) {
            this.currentScreenUrl = '';
            console.warn('[SCREEN] Usando string vazia como fallback');
        }
    }

    // Obter nome da tela de uma URL
    getScreenName(url) {
        if (!url) return 'Tela Inicial';
        
        try {
            const urlObj = new URL(url);
            const pageName = urlObj.searchParams.get('pageName');
            return pageName || 'Tela Inicial';
        } catch (e) {
            return 'Tela Inicial';
        }
    }

    // Obter grupos de telas únicos dos steps
    getScreenGroups() {
        const groups = new Map();
        
        this.steps.forEach((step, index) => {
            const screenUrl = step.screenUrl || this.embedUrlBase || '';
            const screenName = this.getScreenName(screenUrl);
            
            if (!groups.has(screenUrl)) {
                groups.set(screenUrl, {
                    url: screenUrl,
                    name: screenName,
                    steps: []
                });
            }
            
            groups.get(screenUrl).steps.push({ step, index });
        });
        
        return Array.from(groups.values());
    }

    // Renderizar navegação de grupos
    renderGroupNavigation() {
        const container = document.getElementById('groupNavigation');
        if (!container) return;
        
        const groups = this.getScreenGroups();
        
        if (groups.length <= 1) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        container.innerHTML = '<h3 style="margin: 0 0 12px 0; font-size: 14px; color: #333;">📂 Navegação de Grupos</h3>';
        
        groups.forEach((group, index) => {
            const isActive = group.url === this.currentScreenUrl;
            const button = document.createElement('button');
            button.className = 'group-nav-btn';
            button.style.cssText = `
                display: block;
                width: 100%;
                padding: 10px 12px;
                margin-bottom: 8px;
                border: 2px solid ${isActive ? '#667eea' : '#e0e0e0'};
                background: ${isActive ? '#f0f3ff' : 'white'};
                border-radius: 6px;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 13px;
            `;
            
            button.innerHTML = `
                <div style="font-weight: 600; color: ${isActive ? '#667eea' : '#333'}; margin-bottom: 4px;">
                    ${isActive ? '▶' : '○'} Grupo ${index + 1}: ${group.name}
                </div>
                <div style="font-size: 11px; color: #666;">
                    ${group.steps.length} ${group.steps.length === 1 ? 'passo' : 'passos'}
                </div>
            `;
            
            button.onclick = () => this.switchToGroup(group.url);
            
            button.onmouseenter = () => {
                if (!isActive) {
                    button.style.borderColor = '#667eea';
                    button.style.background = '#f8f9fa';
                }
            };
            
            button.onmouseleave = () => {
                if (!isActive) {
                    button.style.borderColor = '#e0e0e0';
                    button.style.background = 'white';
                }
            };
            
            container.appendChild(button);
        });
    }

    // Trocar para um grupo específico
    switchToGroup(screenUrl) {
        if (screenUrl === this.currentScreenUrl) return;
        
        console.log('[GROUP] Trocando para grupo:', screenUrl);
        
        this.currentScreenUrl = screenUrl;
        
        const iframe = document.getElementById('powerbiFrame');
        if (iframe && screenUrl) {
            iframe.src = screenUrl;
        }
        
        // Atualizar highlights e navegação
        this.renderAllHighlights();
        this.renderGroupNavigation();
        
        const screenName = this.getScreenName(screenUrl);
        this.showToast(`📂 Grupo: ${screenName}`, 'info');
    }

    showReportConfigModal() {
        const modal = document.getElementById('reportConfigModal');
        if (modal) modal.style.display = 'flex';
    }

    hideReportConfigModal() {
        const modal = document.getElementById('reportConfigModal');
        if (modal) modal.style.display = 'none';
    }

    // Extrair configuração de tutorial existente
    tryExtractExistingConfig() {
        console.log('[CONFIG] Tentando extrair configuração existente...');
        console.log('[CONFIG] Steps disponíveis:', this.steps.length);
        
        // 1. Tentar carregar config salva no localStorage (mais recente)
        const savedConfig = localStorage.getItem(`tutorial_config_${this.pageId}`);
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                this.reportId = config.reportId;
                this.tenantId = config.tenantId;
                this.embedUrlBase = config.embedUrlBase;
                this.reportConfigured = true;
                
                // IMPORTANTE: Definir currentScreenUrl
                if (!this.currentScreenUrl && this.embedUrlBase) {
                    this.currentScreenUrl = this.embedUrlBase;
                }
                
                console.log('[CONFIG] ✅ Restaurado do localStorage:', config);
                console.log('[CONFIG] currentScreenUrl:', this.currentScreenUrl);
                return;
            } catch (e) {
                console.warn('[CONFIG] Erro ao parsear localStorage:', e);
            }
        }
        
        // 2. Tentar extrair de qualquer step com powerBIUrl
        const stepWithUrl = this.steps.find(s => s.powerBIUrl);
        if (stepWithUrl) {
            console.log('[CONFIG] Encontrado step com URL:', stepWithUrl.powerBIUrl);
            const success = this.parseEmbedUrl(stepWithUrl.powerBIUrl);
            if (success) {
                // Salvar no localStorage para próxima vez
                this.saveReportConfig();
                
                // Definir currentScreenUrl
                if (!this.currentScreenUrl && this.embedUrlBase) {
                    this.currentScreenUrl = this.embedUrlBase;
                }
                
                console.log('[CONFIG] ✅ Extraído de step com URL');
                console.log('[CONFIG] currentScreenUrl:', this.currentScreenUrl);
                return;
            }
        }
        
        // 3. Tentar do pageData
        if (this.pageData && this.pageData.PowerBIUrl) {
            console.log('[CONFIG] Tentando extrair do pageData:', this.pageData.PowerBIUrl);
            const success = this.parseEmbedUrl(this.pageData.PowerBIUrl);
            if (success) {
                this.saveReportConfig();
                
                // Definir currentScreenUrl
                if (!this.currentScreenUrl && this.embedUrlBase) {
                    this.currentScreenUrl = this.embedUrlBase;
                }
                
                console.log('[CONFIG] ✅ Extraído do pageData');
                console.log('[CONFIG] currentScreenUrl:', this.currentScreenUrl);
                return;
            }
        }
        
        // 4. Se não conseguiu de nenhuma forma, mostrar modal
        console.log('[CONFIG] ❌ Não foi possível extrair config - mostrando modal');
        this.showReportConfigModal();
    }

    // Salvar configuração do relatório no localStorage
    saveReportConfig() {
        if (!this.reportId || !this.tenantId || !this.embedUrlBase) return;
        
        const config = {
            reportId: this.reportId,
            tenantId: this.tenantId,
            embedUrlBase: this.embedUrlBase
        };
        
        localStorage.setItem(`tutorial_config_${this.pageId}`, JSON.stringify(config));
        console.log('[CONFIG] Salvo no localStorage:', config);
    }

    // Parser de URL normal do Power BI
    parseReportUrl() {
        const input = document.getElementById('reportUrlInput');
        const url = input.value.trim();
        
        if (!url) {
            this.showToast('❌ Cole uma URL do Power BI', 'error');
            return;
        }

        try {
            const urlObj = new URL(url);
            
            // Extrair Report ID
            const pathParts = urlObj.pathname.split('/');
            const reportsIndex = pathParts.indexOf('reports');
            
            if (reportsIndex === -1 || reportsIndex + 1 >= pathParts.length) {
                throw new Error('URL não contém /reports/');
            }
            
            this.reportId = pathParts[reportsIndex + 1];
            
            // Extrair Tenant ID do embed URL atual ou usar padrão
            // Tentamos extrair do Power BI URL da página carregada
            const iframe = document.getElementById('powerbiFrame');
            if (iframe && iframe.src) {
                const iframeUrl = new URL(iframe.src);
                this.tenantId = iframeUrl.searchParams.get('ctid');
            }
            
            // Se não conseguiu do iframe, tentar da URL fornecida
            if (!this.tenantId) {
                this.tenantId = urlObj.searchParams.get('ctid');
            }
            
            // Se ainda não tem, pedir ao usuário
            if (!this.tenantId) {
                const userTenantId = prompt(
                    'Não foi possível detectar o Tenant ID automaticamente.\n\n' +
                    'Por favor, informe o Tenant ID (ctid) do seu Power BI:\n\n' +
                    '(Você pode encontrar na URL embed configurada na página do portal)'
                );
                
                if (!userTenantId || userTenantId.trim() === '') {
                    throw new Error('Tenant ID é obrigatório');
                }
                
                this.tenantId = userTenantId.trim();
            }
            
            // Gerar URL embed base com action bar
            this.embedUrlBase = `https://app.powerbi.com/reportEmbed?reportId=${this.reportId}&autoAuth=true&ctid=${this.tenantId}&actionBarEnabled=true`;
            
            // Mostrar resultado
            document.getElementById('extractedReportId').textContent = this.reportId;
            document.getElementById('extractedTenantId').textContent = this.tenantId;
            document.getElementById('extractedEmbedUrl').textContent = this.embedUrlBase;
            document.getElementById('reportConfigResult').style.display = 'block';
            document.getElementById('confirmReportConfigBtn').disabled = false;
            document.getElementById('confirmReportConfigBtn').style.opacity = '1';
            
            this.showToast('✅ Relatório configurado com sucesso!', 'success');
            
        } catch (error) {
            console.error('Erro ao fazer parse da URL:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // Parser de URL embed (para edição)
    parseEmbedUrl(embedUrl) {
        try {
            const urlObj = new URL(embedUrl);
            this.reportId = urlObj.searchParams.get('reportId');
            this.tenantId = urlObj.searchParams.get('ctid');
            
            if (this.reportId && this.tenantId) {
                this.embedUrlBase = `https://app.powerbi.com/reportEmbed?reportId=${this.reportId}&autoAuth=true&ctid=${this.tenantId}&actionBarEnabled=true`;
                this.reportConfigured = true;
                console.log('[CONFIG] Extraído de embed:', { reportId: this.reportId, tenantId: this.tenantId });
                return true;
            }
            return false;
        } catch (e) {
            console.warn('[CONFIG] Não foi possível extrair config da URL embed:', e);
            return false;
        }
    }

    confirmReportConfig() {
        if (!this.reportId || !this.tenantId) {
            this.showToast('❌ Configure o relatório primeiro', 'error');
            return;
        }
        
        this.reportConfigured = true;
        this.hideReportConfigModal();
        
        // Salvar configuração no localStorage
        this.saveReportConfig();
        
        // Atualizar iframe com URL base (sem página específica)
        const iframe = document.getElementById('powerbiFrame');
        if (iframe && this.embedUrlBase) {
            iframe.src = this.embedUrlBase;
            
            // IMPORTANTE: Definir currentScreenUrl aqui
            this.currentScreenUrl = this.embedUrlBase;
            console.log('[CONFIG] currentScreenUrl definida após confirmar:', this.currentScreenUrl);
        }
        
        this.showToast('✅ Pronto para criar tutorial!', 'success');
    }

    // Abrir modal de configuração de página para navegação
    openNavigationPageConfig() {
        if (!this.reportConfigured) {
            this.showToast('❌ Configure o relatório primeiro', 'error');
            this.showReportConfigModal();
            return;
        }
        
        const modal = document.getElementById('navigationPageModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('navPageUrlInput').value = '';
            document.getElementById('navPageResult').style.display = 'none';
        }
    }

    closeNavigationPageModal() {
        const modal = document.getElementById('navigationPageModal');
        if (modal) modal.style.display = 'none';
    }

    // Parser de URL para step de navegação
    parseNavigationPageUrl() {
        const input = document.getElementById('navPageUrlInput');
        const url = input.value.trim();
        
        if (!url) {
            this.showToast('❌ Cole uma URL do Power BI', 'error');
            return;
        }

        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            
            // Encontrar ReportSection
            const reportSection = pathParts.find(part => part.startsWith('ReportSection'));
            
            if (!reportSection) {
                throw new Error('URL não contém ReportSection (página do relatório)');
            }
            
            // Montar URL embed completa
            const fullEmbedUrl = `${this.embedUrlBase}&pageName=${reportSection}`;
            
            // Armazenar temporariamente
            this.tempNavigationUrl = fullEmbedUrl;
            this.tempNavigationPageName = reportSection;
            
            // Mostrar resultado
            document.getElementById('navPageName').textContent = reportSection;
            document.getElementById('navEmbedUrl').textContent = fullEmbedUrl;
            document.getElementById('navPageResult').style.display = 'block';
            document.getElementById('confirmNavPageBtn').disabled = false;
            document.getElementById('confirmNavPageBtn').style.opacity = '1';
            
            this.showToast('✅ Página configurada!', 'success');
            
        } catch (error) {
            console.error('Erro ao fazer parse da URL:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    confirmNavigationPage() {
        if (!this.tempNavigationUrl) {
            this.showToast('❌ Configure a página primeiro', 'error');
            return;
        }
        
        // Preencher campo oculto
        document.getElementById('stepPowerBIUrl').value = this.tempNavigationUrl;
        document.getElementById('navPageNameDisplay').style.display = 'block';
        document.getElementById('navPageNameValue').textContent = this.tempNavigationPageName;
        
        this.closeNavigationPageModal();
        this.showToast(`✅ Página ${this.tempNavigationPageName} selecionada`, 'success');
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
            console.log('[LOAD-PAGE] Dados da página carregados:', this.pageData);
            
            document.getElementById('pageInfo').innerHTML = `
                <strong>${this.pageData.Title}</strong>
                ${this.pageData.Subtitle || ''}
            `;

            if (this.pageData.PowerBIUrl) {
                console.log('[LOAD-PAGE] PowerBIUrl encontrada:', this.pageData.PowerBIUrl);
                document.getElementById('powerbiFrame').src = this.pageData.PowerBIUrl;
                document.getElementById('selectionStatus').textContent = '⏳ Aguardando carregamento do Power BI...';
            } else {
                console.warn('[LOAD-PAGE] Página sem PowerBIUrl configurada');
                this.showToast('⚠️ Esta página não possui URL do Power BI configurada', 'error');
            }

        } catch (error) {
            console.error('[LOAD-PAGE] Erro ao carregar página:', error);
            this.showToast('❌ Erro ao carregar dados da página', 'error');
        }
    }

    async loadExistingTutorial() {
        try {
            const response = await fetch(`/api/tutorials/page/${this.pageId}`);
            if (response.ok) {
                const tutorial = await response.json();
                
                if (tutorial.steps) {
                    // Se steps é string JSON, fazer parse
                    let steps = tutorial.steps;
                    if (typeof steps === 'string') {
                        try {
                            steps = JSON.parse(steps);
                        } catch (e) {
                            console.error('[LOAD-TUTORIAL] Erro ao parsear steps:', e);
                            return;
                        }
                    }
                    
                    if (Array.isArray(steps)) {
                        this.steps = steps;
                        console.log('[LOAD-TUTORIAL] Steps carregados:', this.steps.length);
                        
                        this.renderStepsList();
                        this.renderAllHighlights();
                        this.updateButtons();
                    }
                }
            } else {
                console.log('[LOAD-TUTORIAL] Nenhum tutorial existente para esta página');
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
        console.log('[SAVE] Tentando salvar step...');
        console.log('[SAVE] currentScreenUrl:', this.currentScreenUrl);
        
        const title = document.getElementById('stepTitle')?.value?.trim();
        const description = document.getElementById('stepDescription')?.value?.trim();

        console.log('[SAVE] Title:', title);
        console.log('[SAVE] Description:', description);

        if (!title || !description) {
            this.showToast('❌ Preencha o título e descrição', 'error');
            return;
        }

        if (!this.tempHighlight) {
            console.log('[SAVE] ❌ Sem tempHighlight');
            this.showToast('❌ Selecione uma área no canvas', 'error');
            return;
        }

        console.log('[SAVE] tempHighlight:', this.tempHighlight);

        const powerBIUrl = document.getElementById('stepPowerBIUrl')?.value?.trim() || null;

        // Ao editar, preservar screenUrl original; ao criar novo, usar URL atual
        const screenUrl = this.isEditing && this.editingStep ? 
            this.editingStep.screenUrl : 
            this.currentScreenUrl;

        console.log('[SAVE] screenUrl final:', screenUrl);

        const step = {
            id: this.isEditing ? this.editingStep.id : Date.now(),
            type: 'highlight',
            title,
            description,
            highlight: { ...this.tempHighlight },
            powerBIUrl,
            screenUrl: screenUrl,
            overlayOpacity: this.overlayOpacity,
            highlightOpacity: this.highlightOpacity
        };

        console.log('[SAVE] Step criado:', step);

        if (this.isEditing && this.editingIndex !== null) {
            this.steps.splice(this.editingIndex, 0, step);
            console.log('[SAVE] Step inserido na posição:', this.editingIndex);
        } else {
            this.steps.push(step);
            console.log('[SAVE] Step adicionado ao final. Total:', this.steps.length);
        }

        document.getElementById('stepTitle').value = '';
        document.getElementById('stepDescription').value = '';
        document.getElementById('stepPowerBIUrl').value = '';
        
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

        console.log('[SAVE] Renderizando lista e highlights...');
        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();

        this.showToast('✅ Passo salvo com sucesso!', 'success');
        console.log('[SAVE] ✅ Processo concluído');
    }

    // Salvar step de navegação (COM URL obrigatória)
    saveNavigationStep() {
        const title = document.getElementById('stepTitle')?.value?.trim();
        const description = document.getElementById('stepDescription')?.value?.trim();

        if (!title || !description) {
            this.showToast('❌ Preencha o título e descrição', 'error');
            return;
        }

        const powerBIUrl = document.getElementById('stepPowerBIUrl')?.value?.trim();
        
        if (!powerBIUrl) {
            this.showToast('❌ Configure a página de destino', 'error');
            return;
        }

        // Ao editar, preservar screenUrl original; ao criar novo, usar URL atual
        const screenUrl = this.isEditing && this.editingStep ? 
            this.editingStep.screenUrl : 
            this.currentScreenUrl;

        // Navegação pode ter highlight opcional (para apontar botão) ou não ter
        const step = {
            id: this.isEditing ? this.editingStep.id : Date.now(),
            type: 'navigation',
            title,
            description,
            highlight: this.tempHighlight ? { ...this.tempHighlight } : null,
            powerBIUrl,
            screenUrl: screenUrl,
            overlayOpacity: this.overlayOpacity,
            highlightOpacity: this.highlightOpacity
        };

        if (this.isEditing && this.editingIndex !== null) {
            this.steps.splice(this.editingIndex, 0, step);
        } else {
            this.steps.push(step);
        }

        // IMPORTANTE: Atualizar URL da tela atual para a tela de destino
        // porque os próximos steps serão dessa nova tela (apenas se não estiver editando)
        if (!this.isEditing) {
            this.currentScreenUrl = powerBIUrl;
            console.log('[SCREEN] Mudando para próxima tela:', powerBIUrl);
            
            // Trocar iframe para a nova tela
            const iframe = document.getElementById('powerbiFrame');
            if (iframe) {
                iframe.src = powerBIUrl;
            }
        }

        document.getElementById('stepTitle').value = '';
        document.getElementById('stepDescription').value = '';
        document.getElementById('stepPowerBIUrl').value = '';
        document.getElementById('navPageNameDisplay').style.display = 'none';
        
        document.getElementById('navigationSaveArea').style.display = 'none';
        document.getElementById('highlightSelectionArea').style.display = 'block';
        document.getElementById('redoSelectionBtn').style.display = 'none';
        document.getElementById('cancelEditBtn').style.display = 'none';
        
        // Resetar radio para highlight
        document.querySelector('input[name="stepType"][value="highlight"]').checked = true;
        this.currentStepType = 'highlight';

        document.querySelectorAll('.highlight-area.active').forEach(h => h.remove());
        
        this.tempHighlight = null;
        this.tempNavigationUrl = null;
        this.tempNavigationPageName = null;
        this.isEditing = false;
        this.editingIndex = null;
        this.editingStep = null;
        this.resetSelection();

        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();

        const message = this.isEditing ? 
            '✅ Passo de navegação atualizado!' : 
            '✅ Passo de navegação salvo! Agora crie steps da próxima tela.';
        this.showToast(message, 'success');
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
        console.log('[RENDER-LIST] Iniciando renderização...');
        console.log('[RENDER-LIST] Total de steps:', this.steps.length);
        
        const container = document.getElementById('stepsList');
        if (!container) {
            console.error('[RENDER-LIST] Container não encontrado!');
            return;
        }

        container.innerHTML = '';

        if (this.steps.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>Nenhum passo criado ainda</p>
                </div>
            `;
            this.renderGroupNavigation();
            console.log('[RENDER-LIST] Nenhum step para renderizar');
            return;
        }

        let lastScreenUrl = null;
        let screenGroupNumber = 1;

        this.steps.forEach((step, index) => {
            const stepScreenUrl = step.screenUrl || this.embedUrlBase || '';
            console.log(`[RENDER-LIST] Step ${index}: screenUrl="${stepScreenUrl}"`);
            
            const isNewScreen = lastScreenUrl && stepScreenUrl !== lastScreenUrl;
            
            const nextStep = this.steps[index + 1];
            const nextScreenChange = step.type === 'navigation' && nextStep;
            
            if (isNewScreen) {
                screenGroupNumber++;
                console.log('[RENDER-LIST] Nova tela detectada, grupo:', screenGroupNumber);
                
                const separator = document.createElement('div');
                separator.style.cssText = `
                    margin: 20px 0;
                    padding: 12px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 8px;
                    color: white;
                    font-weight: 600;
                    text-align: center;
                    font-size: 13px;
                `;
                separator.innerHTML = `
                    <i class="fas fa-layer-group"></i> 
                    Grupo ${screenGroupNumber}: ${this.getScreenName(stepScreenUrl)}
                `;
                container.appendChild(separator);
            }
            
            if (index === 0) {
                console.log('[RENDER-LIST] Primeiro step, criando cabeçalho grupo 1');
                const separator = document.createElement('div');
                separator.style.cssText = `
                    margin-bottom: 16px;
                    padding: 12px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 8px;
                    color: white;
                    font-weight: 600;
                    text-align: center;
                    font-size: 13px;
                `;
                separator.innerHTML = `
                    <i class="fas fa-layer-group"></i> 
                    Grupo ${screenGroupNumber}: ${this.getScreenName(stepScreenUrl)}
                `;
                container.appendChild(separator);
            }
            
            lastScreenUrl = stepScreenUrl;
            
            const stepItem = document.createElement('div');
            stepItem.className = 'step-item';
            stepItem.draggable = true;
            stepItem.dataset.index = index;
            
            const overlayPct = Math.round((step.overlayOpacity || 0.75) * 100);
            const highlightPct = Math.round((step.highlightOpacity || 0.20) * 100);
            
            const typeIcon = step.type === 'navigation' ? '🔗' : '🎯';
            const typeName = step.type === 'navigation' ? 'Navegação' : 'Highlight';
            const typeColor = step.type === 'navigation' ? '#2196F3' : '#667eea';
            
            let destInfo = '';
            if (step.type === 'navigation' && step.powerBIUrl) {
                const destName = this.getScreenName(step.powerBIUrl);
                destInfo = `<span style="color:#666;font-size:11px;">→ Vai para: ${destName}</span>`;
            }
            
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
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                    <span style="background:${typeColor};color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">
                        ${typeIcon} ${typeName}
                    </span>
                    ${destInfo}
                </div>
                <div class="step-title">${this.escapeHtml(step.title)}</div>
                <div class="step-description">${this.escapeHtml(step.description)}</div>
                ${step.highlight ? `
                    <div style="font-size:11px;color:#999;margin-top:8px;">
                        🌑 Escurecimento: ${overlayPct}% | ✨ Claridade: ${highlightPct}%
                    </div>
                ` : `
                    <div style="font-size:11px;color:#999;margin-top:8px;font-style:italic;">
                        Sem área destacada (apenas instrução)
                    </div>
                `}
            `;
            
            if (step.type === 'navigation' && nextScreenChange) {
                stepItem.style.borderLeft = '4px solid #2196F3';
                stepItem.style.borderBottom = '2px solid #2196F3';
            }
            
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
        
        console.log('[RENDER-LIST] ✅ Lista renderizada, atualizando navegação...');
        this.renderGroupNavigation();
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

        const currentSteps = this.steps.filter(step => {
            if (!step.highlight) return false;
            
            const stepScreen = step.screenUrl || this.embedUrlBase || '';
            const currentScreen = this.currentScreenUrl || this.embedUrlBase || '';
            
            return stepScreen === currentScreen;
        });

        console.log('[RENDER] Tela atual:', this.currentScreenUrl);
        console.log('[RENDER] Steps da tela atual:', currentSteps.length, 'de', this.steps.length, 'total');

        currentSteps.forEach((step) => {
            const stepIndex = this.steps.indexOf(step);
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
            label.textContent = `Passo ${stepIndex + 1}`;
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
            type: step.type || 'highlight',
            title: step.title + ' (cópia)',
            description: step.description,
            highlight: step.highlight ? { ...step.highlight } : null,
            powerBIUrl: step.powerBIUrl || null,
            screenUrl: step.screenUrl || this.currentScreenUrl,
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
        document.getElementById('stepPowerBIUrl').value = step.powerBIUrl || '';

        const stepType = step.type || 'highlight';
        document.querySelector(`input[name="stepType"][value="${stepType}"]`).checked = true;
        this.currentStepType = stepType;
        this.onStepTypeChange(stepType);

        if (stepType === 'navigation' && step.powerBIUrl) {
            try {
                const urlObj = new URL(step.powerBIUrl);
                const pageName = urlObj.searchParams.get('pageName');
                if (pageName) {
                    const navDisplay = document.getElementById('navPageNameDisplay');
                    const navValue = document.getElementById('navPageNameValue');
                    if (navDisplay && navValue) {
                        navDisplay.style.display = 'block';
                        navValue.textContent = pageName;
                    }
                }
            } catch (e) {
                console.warn('Erro ao extrair pageName:', e);
            }
        }

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

        if (step.screenUrl) {
            const iframe = document.getElementById('powerbiFrame');
            if (iframe && iframe.src !== step.screenUrl) {
                console.log('[EDIT] Mudando para tela do step:', step.screenUrl);
                iframe.src = step.screenUrl;
                this.currentScreenUrl = step.screenUrl;
            }
        }

        this.steps.splice(index, 1);
        this.tempHighlight = step.highlight;

        this.renderStepsList();
        this.renderAllHighlights();
        this.updateButtons();
        
        if (step.highlight) {
            this.renderTempHighlight(step.highlight);
        }

        document.getElementById('redoSelectionBtn').style.display = 'inline-block';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        
        if (stepType === 'navigation') {
            document.getElementById('navigationSaveArea').style.display = 'block';
        } else {
            document.getElementById('saveStepBtn').style.display = 'block';
            document.getElementById('selectAreaBtn').style.display = 'none';
        }
        
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

    startPreview() {
        if (this.steps.length === 0) return;
        
        document.querySelectorAll('.highlight-area:not(.active)').forEach(el => el.remove());
        
        this.previewIndex = 0;
        this.createPreviewOverlay();
        this.renderPreviewStep();
    }

    createPreviewOverlay() {
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
        
        document.getElementById('previewCloseBtn').onclick = () => this.closePreview();
        document.getElementById('previewPrevBtn').onclick = () => this.previewNavigate(-1);
        document.getElementById('previewNextBtn').onclick = () => this.previewNavigate(1);
        
        const prevBtn = document.getElementById('previewPrevBtn');
        const nextBtn = document.getElementById('previewNextBtn');
        const closeBtn = document.getElementById('previewCloseBtn');
        
        prevBtn.onmouseenter = () => prevBtn.style.background = '#d0d0d0';
        prevBtn.onmouseleave = () => prevBtn.style.background = '#e5e5e5';
        nextBtn.onmouseenter = () => nextBtn.style.background = '#5568d3';
        nextBtn.onmouseleave = () => nextBtn.style.background = '#667eea';
        closeBtn.onmouseenter = () => { closeBtn.style.background = '#f0f0f0'; closeBtn.style.color = '#333'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; closeBtn.style.color = '#999'; };
        
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
        
        console.log('[PREVIEW] Renderizando step', this.previewIndex, '- Tipo:', step.type || 'undefined');
        
        const isNavigationStep = step.type === 'navigation';
        
        if (isNavigationStep && step.powerBIUrl) {
            console.log('[PREVIEW] ✅ Step de NAVEGAÇÃO confirmado - trocando página automaticamente');
            
            const iframe = document.getElementById('powerbiFrame');
            if (!iframe) {
                this.showToast('❌ Power BI não está carregado', 'error');
                this.closePreview();
                return;
            }
            
            if (step.powerBIUrl !== iframe.src) {
                this.showPreviewLoading();
                iframe.src = step.powerBIUrl;
                
                let loadHandled = false;
                
                const loadHandler = () => {
                    if (loadHandled) return;
                    loadHandled = true;
                    
                    iframe.removeEventListener('load', loadHandler);
                    clearTimeout(timeoutId);
                    
                    setTimeout(() => {
                        this.hidePreviewLoading();
                        console.log('[PREVIEW] Página carregada, avançando automaticamente...');
                        this.previewIndex++;
                        if (this.previewIndex < this.steps.length) {
                            this.renderPreviewStep();
                        } else {
                            this.closePreview();
                            this.showToast('🎉 Preview concluído!', 'success');
                            this.renderAllHighlights();
                        }
                    }, 500);
                };
                
                const timeoutId = setTimeout(() => {
                    if (loadHandled) return;
                    loadHandled = true;
                    
                    iframe.removeEventListener('load', loadHandler);
                    this.hidePreviewLoading();
                    console.log('[PREVIEW] Timeout - avançando automaticamente...');
                    this.previewIndex++;
                    if (this.previewIndex < this.steps.length) {
                        this.renderPreviewStep();
                    } else {
                        this.closePreview();
                        this.showToast('🎉 Preview concluído!', 'success');
                        this.renderAllHighlights();
                    }
                }, 5000);
                
                iframe.addEventListener('load', loadHandler);
                return;
            } else {
                console.log('[PREVIEW] Já na página correta, avançando...');
                this.previewIndex++;
                if (this.previewIndex < this.steps.length) {
                    this.renderPreviewStep();
                } else {
                    this.closePreview();
                    this.showToast('🎉 Preview concluído!', 'success');
                    this.renderAllHighlights();
                }
                return;
            }
        }
        
        console.log('[PREVIEW] ✅ Step NORMAL (highlight/indefinido) - mostrando card e AGUARDANDO clique');
        
        const iframe = document.getElementById('powerbiFrame');
        if (!iframe) {
            this.showToast('❌ Power BI não está carregado', 'error');
            this.closePreview();
            return;
        }

        const targetUrl = step.screenUrl || this.embedUrlBase;

        if (targetUrl && targetUrl !== iframe.src) {
            console.log('[PREVIEW] Mudando para tela do step:', targetUrl);
            this.showPreviewLoading();
            
            iframe.src = targetUrl;
            
            let loadHandled = false;
            
            const loadHandler = () => {
                if (loadHandled) return;
                loadHandled = true;
                
                iframe.removeEventListener('load', loadHandler);
                clearTimeout(timeoutId);
                
                setTimeout(() => {
                    this.hidePreviewLoading();
                    console.log('[PREVIEW] Tela carregada - renderizando card (SEM avançar)');
                    this.renderPreviewStepContent(step);
                }, 500);
            };
            
            const timeoutId = setTimeout(() => {
                if (loadHandled) return;
                loadHandled = true;
                
                iframe.removeEventListener('load', loadHandler);
                this.hidePreviewLoading();
                console.log('[PREVIEW] Timeout - renderizando card (SEM avançar)');
                this.renderPreviewStepContent(step);
            }, 5000);
            
            iframe.addEventListener('load', loadHandler);
            return;
        }
        
        console.log('[PREVIEW] Tela já correta - renderizando card (SEM avançar)');
        this.renderPreviewStepContent(step);
    }

    showPreviewLoading() {
        const highlight = document.getElementById('previewHighlight');
        const tooltip = document.getElementById('previewTooltip');
        
        if (highlight) highlight.style.display = 'none';
        if (tooltip) {
            tooltip.style.visibility = 'visible';
            tooltip.style.left = '50%';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
            tooltip.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⏳</div>
                    <h3 style="margin: 0 0 8px 0; color: #333;">Carregando página...</h3>
                    <p style="margin: 0; color: #666; font-size: 14px;">Aguarde enquanto o Power BI carrega a nova página</p>
                </div>
            `;
        }
    }

    hidePreviewLoading() {
        const highlight = document.getElementById('previewHighlight');
        if (highlight) highlight.style.display = 'block';
    }

    renderPreviewStepContent(step) {
        const iframe = document.getElementById('powerbiFrame');
        const highlight = document.getElementById('previewHighlight');
        const tooltip = document.getElementById('previewTooltip');
        
        const stepOverlayOpacity = step.overlayOpacity !== undefined ? step.overlayOpacity : 0.75;
        const stepHighlightOpacity = step.highlightOpacity !== undefined ? step.highlightOpacity : 0.20;
        
        if (!step.highlight) {
            highlight.style.display = 'none';
            
            tooltip.style.visibility = 'visible';
            tooltip.style.left = '50%';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
            tooltip.style.maxWidth = '500px';
            
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
                <div style="text-align: center; margin-bottom: 16px;">
                    <span style="font-size: 48px;">💡</span>
                </div>
                <h3 style="margin: 0 0 12px 0; font-size: 20px; color: #333; text-align: center;">${this.escapeHtml(step.title)}</h3>
                <p style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">${this.escapeHtml(step.description)}</p>
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 20px;
                    border-top: 2px solid #e5e5e5;
                ">
                    <span id="previewProgress" style="color: #666; font-weight: 600; font-size: 14px;">${this.previewIndex + 1} / ${this.steps.length}</span>
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
                        ">${this.previewIndex === this.steps.length - 1 ? 'Concluir' : 'Próximo'}</button>
                    </div>
                </div>
                <div style="margin-top: 12px; font-size: 11px; color: #999; text-align: center;">
                    Use as setas ← → do teclado ou clique nos botões
                </div>
            `;
            
            this.setupPreviewButtons();
            return;
        }
        
        highlight.style.display = 'block';
        
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
            <h3 id="previewTitle" style="margin: 0 0 12px 0; font-size: 20px; color: #333; padding-right: 30px;">${this.escapeHtml(step.title)}</h3>
            <p id="previewDesc" style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">${this.escapeHtml(step.description)}</p>
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 20px;
                border-top: 2px solid #e5e5e5;
            ">
                <span id="previewProgress" style="color: #666; font-weight: 600; font-size: 14px;">${this.previewIndex + 1} / ${this.steps.length}</span>
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
                    ">${this.previewIndex === this.steps.length - 1 ? 'Concluir' : 'Próximo'}</button>
                </div>
            </div>
            <div style="margin-top: 12px; font-size: 11px; color: #999; text-align: center;">
                Use as setas ← → do teclado ou clique nos botões
            </div>
        `;
        
        this.setupPreviewButtons();
        
        this.positionPreviewTooltip(hlTop, hlLeft, hlWidth, hlHeight);
    }

    setupPreviewButtons() {
        const prevBtn = document.getElementById('previewPrevBtn');
        const nextBtn = document.getElementById('previewNextBtn');
        const closeBtn = document.getElementById('previewCloseBtn');
        
        if (closeBtn) closeBtn.onclick = () => this.closePreview();
        if (prevBtn) {
            prevBtn.onclick = () => this.previewNavigate(-1);
            prevBtn.disabled = this.previewIndex === 0;
            prevBtn.style.opacity = this.previewIndex === 0 ? '0.5' : '1';
            prevBtn.style.cursor = this.previewIndex === 0 ? 'not-allowed' : 'pointer';
            
            prevBtn.onmouseenter = () => { if (!prevBtn.disabled) prevBtn.style.background = '#d0d0d0'; };
            prevBtn.onmouseleave = () => prevBtn.style.background = '#e5e5e5';
        }
        
        if (nextBtn) {
            nextBtn.onclick = () => this.previewNavigate(1);
            nextBtn.onmouseenter = () => nextBtn.style.background = '#5568d3';
            nextBtn.onmouseleave = () => nextBtn.style.background = '#667eea';
        }
        
        if (closeBtn) {
            closeBtn.onmouseenter = () => { closeBtn.style.background = '#f0f0f0'; closeBtn.style.color = '#333'; };
            closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; closeBtn.style.color = '#999'; };
        }
    }

    positionPreviewTooltip(hlTop, hlLeft, hlWidth, hlHeight) {
        const tooltip = document.getElementById('previewTooltip');
        if (!tooltip) return;
        
        tooltip.style.visibility = 'hidden';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        
        requestAnimationFrame(() => {
            const ttRect = tooltip.getBoundingClientRect();
            const margin = 20;
            
            let ttLeft = hlLeft + hlWidth + margin;
            let ttTop = hlTop;
            
            if (ttLeft + ttRect.width > window.innerWidth - 10) {
                ttLeft = hlLeft;
                ttTop = hlTop + hlHeight + margin;
            }
            
            if (ttTop + ttRect.height > window.innerHeight - 10) {
                ttTop = hlTop - ttRect.height - margin;
            }
            
            if (ttTop < 10) {
                ttLeft = hlLeft - ttRect.width - margin;
                ttTop = hlTop;
            }
            
            ttLeft = Math.max(10, Math.min(ttLeft, window.innerWidth - ttRect.width - 10));
            ttTop = Math.max(10, Math.min(ttTop, window.innerHeight - ttRect.height - 10));
            
            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
            tooltip.style.visibility = 'visible';
        });
    }

    previewNavigate(delta) {
        const currentStep = this.steps[this.previewIndex];
        
        this.previewIndex += delta;
        
        if (this.previewIndex < 0) {
            this.previewIndex = 0;
            return;
        }
        
        if (this.previewIndex >= this.steps.length) {
            this.closePreview();
            this.showToast('🎉 Preview concluído!', 'success');
            this.renderAllHighlights();
            return;
        }
        
        const nextStep = this.steps[this.previewIndex];
        
        const currentScreenUrl = currentStep?.screenUrl || this.embedUrlBase;
        const nextScreenUrl = nextStep?.screenUrl || this.embedUrlBase;
        
        if (nextScreenUrl && currentScreenUrl !== nextScreenUrl) {
            console.log('[PREVIEW] Mudança de tela detectada:', currentScreenUrl, '→', nextScreenUrl);
            
            const iframe = document.getElementById('powerbiFrame');
            if (iframe && iframe.src !== nextScreenUrl) {
                this.showPreviewLoading();
                iframe.src = nextScreenUrl;
                
                let loadHandled = false;
                
                const loadHandler = () => {
                    if (loadHandled) return;
                    loadHandled = true;
                    
                    iframe.removeEventListener('load', loadHandler);
                    clearTimeout(timeoutId);
                    
                    setTimeout(() => {
                        this.hidePreviewLoading();
                        this.renderPreviewStep();
                    }, 500);
                };
                
                const timeoutId = setTimeout(() => {
                    if (loadHandled) return;
                    loadHandled = true;
                    
                    iframe.removeEventListener('load', loadHandler);
                    this.hidePreviewLoading();
                    this.renderPreviewStep();
                }, 5000);
                
                iframe.addEventListener('load', loadHandler);
                return;
            }
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
        
        this.renderAllHighlights();
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