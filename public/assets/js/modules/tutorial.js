window.PortalTutorial = {
    currentTutorial: null,
    currentStep: 0,
    overlay: null,
    highlight: null,
    tooltip: null,

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
            
            this.currentTutorial = tutorial;
            this.currentStep = 0;
            
            this.createOverlay();
            this.showStep(0);
            
        } catch (error) {
            console.error('[TUTORIAL] Erro ao carregar tutorial:', error);
            alert('Erro ao carregar tutorial');
        }
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
    showStep(stepIndex) {
        if (!this.currentTutorial || !this.currentTutorial.steps[stepIndex]) {
            console.error('[TUTORIAL] Passo inválido:', stepIndex);
            return;
        }
        
        const step = this.currentTutorial.steps[stepIndex];
        this.currentStep = stepIndex;
        
        console.log('[TUTORIAL] Mostrando passo:', stepIndex, step);
        
        // Posicionar highlight RELATIVO AO IFRAME
        this.positionHighlight(step.highlight);
        
        // Posicionar tooltip
        this.positionTooltip(step);
    },

    // Posicionar destaque da área - CORRIGIDO PARA USAR COORDENADAS DO IFRAME
    positionHighlight(highlight) {
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
        const highlightTop = iframeRect.top + (parseFloat(step.highlight.top) * iframeRect.height / 100);
        const highlightLeft = iframeRect.left + (parseFloat(step.highlight.left) * iframeRect.width / 100);
        const highlightHeight = parseFloat(step.highlight.height) * iframeRect.height / 100;
        
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
        let tooltipLeft = highlightLeft - (tooltipRect.width / 2) + (parseFloat(step.highlight.width) * iframeRect.width / 200);
        
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
            this.showStep(this.currentStep + 1);
        }
    },

    // Passo anterior
    previousStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
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
