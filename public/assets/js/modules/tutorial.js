window.PortalTutorial = {
    currentTutorial: null,
    currentStep: 0,
    overlay: null,
    highlight: null,
    tooltip: null,

    getScreenName(url) {
        if (!url) return 'Tela Inicial';
        try {
            const urlObj = new URL(url);

            const pageName = urlObj.searchParams.get('pageName');
            if (pageName) {
                if (pageName.startsWith('ReportSection')) {
                    const match = pageName.match(/ReportSection(\d+)/);
                    return match ? `Página ${match[1]}` : pageName;
                }
                if (/^[a-f0-9]{16,20}$/i.test(pageName)) {
                    return `Página ${pageName.substring(0, 8)}...`;
                }
                return pageName;
            }

            const pathParts = urlObj.pathname.split('/').filter(p => p);
            const reportsIndex = pathParts.indexOf('reports');
            if (reportsIndex !== -1 && reportsIndex + 2 < pathParts.length) {
                const pageId = pathParts[reportsIndex + 2];
                if (pageId.startsWith('ReportSection')) {
                    const match = pageId.match(/ReportSection(\d+)/);
                    return match ? `Página ${match[1]}` : pageId;
                }
                if (/^[a-f0-9]{16,20}$/i.test(pageId)) {
                    return `Página ${pageId.substring(0, 8)}...`;
                }
                return pageId;
            }

            return 'Tela Inicial';
        } catch {
            return 'Tela Inicial';
        }
    },

    getGroupDisplayNameForUrl(url) {
        const steps = this.currentTutorial?.steps || [];
        const nameFromStep = steps.find(s => ((s._resolvedScreenUrl || s.screenUrl || '') === (url || '')) && s.groupName)?.groupName;
        if (nameFromStep && String(nameFromStep).trim() !== '') return String(nameFromStep).trim();
        return this.getScreenName(url);
    },

    // Normaliza steps para suportar tutoriais antigos sem screenUrl.
    // Regra: usa o screenUrl do step quando existir; caso contrário, herda a tela atual.
    // Quando encontra um step de navigation com powerBIUrl, a tela atual passa a ser powerBIUrl para os próximos steps.
    normalizeTutorialSteps(rawSteps) {
        const steps = Array.isArray(rawSteps) ? rawSteps : [];
        let currentUrl = (steps[0]?.screenUrl || '').toString();

        return steps.map((step) => {
            const ownUrl = (step?.screenUrl || '').toString();
            const resolvedUrl = ownUrl || currentUrl || '';

            // Atualizar currentUrl após step de navegação (para os próximos)
            if (step?.type === 'navigation' && step?.powerBIUrl) {
                currentUrl = step.powerBIUrl;
            } else if (ownUrl) {
                currentUrl = ownUrl;
            }

            return {
                ...step,
                _resolvedScreenUrl: resolvedUrl
            };
        });
    },

    // Grupos em ordem de aparição
    getTutorialGroups() {
        const steps = this.currentTutorial?.steps || [];
        const groups = [];
        const indexByUrl = new Map();

        steps.forEach((step, index) => {
            const url = step._resolvedScreenUrl || step.screenUrl || '';
            if (!indexByUrl.has(url)) {
                indexByUrl.set(url, groups.length);
                groups.push({
                    url,
                    name: this.getGroupDisplayNameForUrl(url),
                    firstIndex: index,
                    count: 0
                });
            }
            const g = groups[indexByUrl.get(url)];
            g.count += 1;
        });

        return groups;
    },

    getPowerBIIframe() {
        return document.querySelector('#powerbiContainer iframe');
    },

    async ensureScreen(screenUrl) {
        const url = screenUrl || '';
        if (!url) return;

        const iframe = this.getPowerBIIframe();
        if (!iframe) {
            console.error('[TUTORIAL] Iframe do Power BI não encontrado');
            return;
        }

        if (iframe.src === url) return;

        console.log('[TUTORIAL] Navegando para tela:', url);
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                iframe.removeEventListener('load', onLoad);
                clearTimeout(timeoutId);
                resolve();
            };
            const onLoad = () => finish();
            const timeoutId = setTimeout(() => finish(), 6000);
            iframe.addEventListener('load', onLoad);
            iframe.src = url;
        });
    },

    // Carregar e iniciar tutorial de uma página
    async startTutorial(pageId) {
        try {
            console.log('[TUTORIAL] Iniciando tutorial para página:', pageId);
            
            const response = await fetch(`${window.PortalApp.API_URL}/tutorials/page/${pageId}`);
            if (!response.ok) {
                console.error('[TUTORIAL] Tutorial não encontrado');
                alert('Tutorial não disponível para esta página');
                return;
            }
            
            const tutorial = await response.json();
            console.log('[TUTORIAL] Tutorial carregado:', tutorial);
            
            if (!tutorial.steps || tutorial.steps.length === 0) {
                alert('Este tutorial não possui passos configurados');
                return;
            }

            // Normalizar steps para garantir screenUrl resolvida (compatibilidade)
            tutorial.steps = this.normalizeTutorialSteps(tutorial.steps);
            this.currentTutorial = tutorial;

            this.createOverlay();

            const groups = this.getTutorialGroups();
            if (groups.length > 1) {
                console.log('[TUTORIAL] Exibindo seleção de grupos:', groups.length);
                this.showGroupPicker(groups);
                return;
            }

            this.currentStep = 0;
            await this.showStep(0);
            
        } catch (error) {
            console.error('[TUTORIAL] Erro ao carregar tutorial:', error);
            alert('Erro ao carregar tutorial');
        }
    },

    showGroupPicker(groups) {
        if (!this.tooltip) return;

        // Ocultar highlight durante seleção
        if (this.highlight) this.highlight.style.display = 'none';

        const itemsHtml = groups.map((g, idx) => {
            const safeName = this.escapeHtml(g.name);
            return `
                <button class="btn-tutorial" style="width:100%;margin-top:8px;" onclick="window.PortalTutorial.startFromGroupIndex(${idx})">
                    Grupo ${idx + 1}: ${safeName} (${g.count} ${g.count === 1 ? 'passo' : 'passos'})
                </button>
            `;
        }).join('');

        this.tooltip.innerHTML = `
            <div class="tutorial-tooltip-content">
                <button class="btn-tutorial-close" onclick="window.PortalTutorial.endTutorial()">×</button>
                <h3>Escolha por qual grupo começar</h3>
                <p>Você pode iniciar o tutorial em qualquer página/grupo.</p>
                <div style="margin-top:10px;">${itemsHtml}</div>
            </div>
        `;

        // Centralizar tooltip
        const margin = 20;
        const rect = this.tooltip.getBoundingClientRect();
        const left = Math.max(margin, Math.min((window.innerWidth - rect.width) / 2, window.innerWidth - rect.width - margin));
        const top = Math.max(margin, Math.min((window.innerHeight - rect.height) / 2, window.innerHeight - rect.height - margin));
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
    },

    async startFromGroupIndex(groupIndex) {
        const groups = this.getTutorialGroups();
        const group = groups[groupIndex];
        if (!group) return;

        this.currentStep = group.firstIndex;
        await this.showStep(this.currentStep);
    },

    // Criar overlay escuro de fundo
    createOverlay() {
        // Criar overlay escuro
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';
        document.body.appendChild(this.overlay);
        
        // Criar highlight
        this.highlight = document.createElement('div');
        this.highlight.className = 'tutorial-highlight';
        document.body.appendChild(this.highlight);
        
        // Criar tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tutorial-tooltip';
        document.body.appendChild(this.tooltip);
    },

    // Mostrar passo específico
    async showStep(stepIndex) {
        if (!this.currentTutorial || !this.currentTutorial.steps[stepIndex]) {
            console.error('[TUTORIAL] Passo inválido:', stepIndex);
            return;
        }
        
        const step = this.currentTutorial.steps[stepIndex];
        this.currentStep = stepIndex;
        
        console.log('[TUTORIAL] Mostrando passo:', stepIndex, step);

        // Garantir que está na tela correta antes de posicionar highlight
        const targetScreen = step._resolvedScreenUrl || step.screenUrl || '';
        if (targetScreen) {
            await this.ensureScreen(targetScreen);
        }
        
        // Posicionar highlight RELATIVO AO IFRAME (se houver)
        if (step.highlight) {
            if (this.highlight) this.highlight.style.display = 'block';
            this.positionHighlight(step.highlight);
        } else {
            if (this.highlight) this.highlight.style.display = 'none';
        }
        
        // Posicionar tooltip
        this.positionTooltip(step);
    },

    // Posicionar destaque da área - CORRIGIDO PARA USAR COORDENADAS DO IFRAME
    positionHighlight(highlight) {
        if (!highlight) return;
        // CORRIGIDO: Obter posição do iframe do Power BI
        const iframe = document.querySelector('#powerbiContainer iframe');
        if (!iframe) {
            console.error('[TUTORIAL] Iframe do Power BI não encontrado');
            return;
        }
        
        const iframeRect = iframe.getBoundingClientRect();
        
        // Converter porcentagens para pixels relativos ao iframe
        const top = iframeRect.top + (parseFloat(highlight.top) * iframeRect.height / 100);
        const left = iframeRect.left + (parseFloat(highlight.left) * iframeRect.width / 100);
        const width = parseFloat(highlight.width) * iframeRect.width / 100;
        const height = parseFloat(highlight.height) * iframeRect.height / 100;
        
        console.log('[TUTORIAL] Posicionando highlight:', {
            iframe: { top: iframeRect.top, left: iframeRect.left, width: iframeRect.width, height: iframeRect.height },
            highlight: { top, left, width, height },
            percentages: highlight
        });
        
        this.highlight.style.top = `${top}px`;
        this.highlight.style.left = `${left}px`;
        this.highlight.style.width = `${width}px`;
        this.highlight.style.height = `${height}px`;
    },

    // Posicionar tooltip com instruções
    positionTooltip(step) {
        const iframe = document.querySelector('#powerbiContainer iframe');
        if (!iframe) return;
        
        const iframeRect = iframe.getBoundingClientRect();
        const hasHighlight = !!step.highlight;
        const highlightTop = hasHighlight ? iframeRect.top + (parseFloat(step.highlight.top) * iframeRect.height / 100) : iframeRect.top + 20;
        const highlightLeft = hasHighlight ? iframeRect.left + (parseFloat(step.highlight.left) * iframeRect.width / 100) : iframeRect.left + 20;
        const highlightHeight = hasHighlight ? parseFloat(step.highlight.height) * iframeRect.height / 100 : 0;
        
        // Criar conteúdo do tooltip
        this.tooltip.innerHTML = `
            <div class="tutorial-tooltip-content">
                <button class="btn-tutorial-close" onclick="window.PortalTutorial.endTutorial()">×</button>
                <h3>${this.escapeHtml(step.title)}</h3>
                <p>${this.escapeHtml(step.description)}</p>
                <div class="tutorial-footer">
                    <div class="tutorial-progress">
                        Passo ${this.currentStep + 1} de ${this.currentTutorial.steps.length}
                    </div>
                    <div class="tutorial-buttons">
                        ${this.currentStep > 0 ? 
                            '<button class="btn-tutorial btn-tutorial-prev" onclick="window.PortalTutorial.previousStep()">Anterior</button>' : 
                            ''
                        }
                        ${this.currentStep < this.currentTutorial.steps.length - 1 ? 
                            '<button class="btn-tutorial btn-tutorial-next" onclick="window.PortalTutorial.nextStep()">Próximo</button>' : 
                            '<button class="btn-tutorial btn-tutorial-finish" onclick="window.PortalTutorial.endTutorial()">Finalizar</button>'
                        }
                    </div>
                </div>
            </div>
        `;
        
        // Posicionar tooltip (abaixo do highlight, centralizado)
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const tooltipTop = highlightTop + highlightHeight + 20;
        let tooltipLeft = highlightLeft - (tooltipRect.width / 2) + (hasHighlight ? (parseFloat(step.highlight.width) * iframeRect.width / 200) : 0);
        
        // Garantir que tooltip não saia da tela
        const margin = 20;
        if (tooltipLeft < margin) tooltipLeft = margin;
        if (tooltipLeft + tooltipRect.width > window.innerWidth - margin) {
            tooltipLeft = window.innerWidth - tooltipRect.width - margin;
        }
        
        // Se tooltip não couber embaixo, colocar em cima
        let finalTop = tooltipTop;
        if (tooltipTop + tooltipRect.height > window.innerHeight - margin) {
            finalTop = highlightTop - tooltipRect.height - 20;
        }
        
        this.tooltip.style.top = `${finalTop}px`;
        this.tooltip.style.left = `${tooltipLeft}px`;
    },

    // Próximo passo
    nextStep() {
        if (this.currentStep < this.currentTutorial.steps.length - 1) {
            void this.showStep(this.currentStep + 1);
        }
    },

    // Passo anterior
    previousStep() {
        if (this.currentStep > 0) {
            void this.showStep(this.currentStep - 1);
        }
    },

    // Fechar tutorial
    endTutorial() {
        if (this.overlay) this.overlay.remove();
        if (this.highlight) this.highlight.remove();
        if (this.tooltip) this.tooltip.remove();
        
        this.overlay = null;
        this.highlight = null;
        this.tooltip = null;
        this.currentTutorial = null;
        this.currentStep = 0;
        
        console.log('[TUTORIAL] Tutorial finalizado');
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Registrar eventos de redimensionamento para reposicionar elementos
window.addEventListener('resize', () => {
    if (window.PortalTutorial.currentTutorial && window.PortalTutorial.currentStep >= 0) {
        const step = window.PortalTutorial.currentTutorial.steps[window.PortalTutorial.currentStep];
        if (step) {
            window.PortalTutorial.positionHighlight(step.highlight);
            window.PortalTutorial.positionTooltip(step);
        }
    }
});

console.log('[TUTORIAL] Módulo carregado');
