// chatbot.js - DESIGN MELHORADO COM JANELA MAIOR + GRÁFICOS VIA COPILOT

(function() {
    'use strict';
    
    // Configurações do chatbot - TAMANHOS AUMENTADOS
    const CHATBOT_CONFIG = {
        width: {
            default: 720,
            min: 480,
            max: 1200
        },
        height: {
            default: 700,
            min: 500,
            max: 900
        },
        position: {
            bottom: 20,
            right: 20
        }
    };
    
    // Dicionário de dados
    const DATA_DICTIONARY = {
        tables: [
            {
                name: 'Atendimentos',
                description: 'Tabela de atendimentos realizados',
                columns: [
                    { name: 'Id', type: 'INT', description: 'ID único do atendimento' },
                    { name: 'DataAtendimento', type: 'DATETIME', description: 'Data e hora do atendimento' },
                    { name: 'PacienteId', type: 'INT', description: 'ID do paciente' },
                    { name: 'MedicoId', type: 'INT', description: 'ID do médico' },
                    { name: 'TipoAtendimento', type: 'VARCHAR', description: 'Tipo de atendimento (Consulta, Retorno, Urgência)' },
                    { name: 'Status', type: 'VARCHAR', description: 'Status do atendimento (Realizado, Cancelado, Agendado)' }
                ]
            },
            {
                name: 'Pacientes',
                description: 'Tabela de pacientes',
                columns: [
                    { name: 'Id', type: 'INT', description: 'ID único do paciente' },
                    { name: 'Nome', type: 'VARCHAR', description: 'Nome completo do paciente' },
                    { name: 'DataNascimento', type: 'DATE', description: 'Data de nascimento' },
                    { name: 'CPF', type: 'VARCHAR', description: 'CPF do paciente' }
                ]
            }
        ]
    };
    
    let chatMessages = [];
    let isProcessing = false;
    let currentWidth = CHATBOT_CONFIG.width.default;
    let currentHeight = CHATBOT_CONFIG.height.default;
    let isResizing = false;
    let isFullscreen = false;
    let chatContainer = null;
    let savedPosition = null;
    let forcedMode = false; // Forçar exibição via URL dedicada

    function isForcedMode() {
        try {
            const p = (location.pathname || '').toLowerCase();
            if (
                p === '/chatbot' ||
                p.endsWith('/chatbot') ||
                p.endsWith('/chatbot.html') ||
                p.endsWith('/public/chatbot') ||
                p.endsWith('/public/chatbot/')
            ) return true;
            const url = new URL(window.location.href);
            if (url.searchParams.get('chatbot') === '1') return true;
        } catch (_) {}
        return false;
    }

    function isChatbotEnabledByConfig() {
        // Padrão: habilitado se não houver configuração
        const enabled = (window.PortalConfig && typeof window.PortalConfig.chatbotEnabled !== 'undefined')
            ? !!window.PortalConfig.chatbotEnabled
            : true;
        return enabled;
    }

    function isChatbotAllowed() {
        return forcedMode || isChatbotEnabledByConfig();
    }
    
    function isOnHomeScreen() {
        const homeView = document.getElementById('homeView');
        const pageView = document.getElementById('pageView');
        
        if (!homeView || !pageView) return true;
        
        const homeVisible = homeView.style.display !== 'none';
        const pageVisible = pageView.style.display !== 'none';
        
        return homeVisible && !pageVisible;
    }
    
    function toggleChatbotVisibility() {
        if (!chatContainer) return;
        
        const shouldShow = forcedMode ? true : isOnHomeScreen();
        chatContainer.style.display = shouldShow ? 'block' : 'none';
        
        if (!shouldShow) {
            const chatWindow = document.getElementById('ai-chat-window');
            if (chatWindow && chatWindow.classList.contains('show')) {
                chatWindow.classList.remove('show');
            }
        }
    }
    
    // Criar HTML do chatbot com DESIGN MELHORADO
    function createChatbotHTML() {
        chatContainer = document.createElement('div');
        chatContainer.id = 'ai-chatbot-container';
        chatContainer.innerHTML = `
            <style>
                :root {
                    --ai-primary: linear-gradient(135deg, #6B73FF 0%, #000DFF 100%);
                    --ai-secondary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    --ai-dark: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%);
                    --ai-color-primary: #6B73FF;
                    --ai-text-primary: #1a1a2e;
                    --ai-bg-secondary: #f7f7fc;
                    --ai-bg-tertiary: #ededf5;
                }
                
                #ai-chatbot-container {
                    position: fixed;
                    bottom: ${CHATBOT_CONFIG.position.bottom}px;
                    right: ${CHATBOT_CONFIG.position.right}px;
                    z-index: 9999;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    display: none;
                }
                
                #ai-chat-button {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: var(--ai-primary);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4), 0 4px 6px -2px rgba(99, 102, 241, 0.05);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 28px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                }
                
                #ai-chat-button::before {
                    content: '';
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #c084fc 0%, #a78bfa 100%);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                #ai-chat-button:hover {
                    transform: scale(1.1) translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.5), 0 4px 6px -2px rgba(99, 102, 241, 0.1);
                }
                
                #ai-chat-button:hover::before {
                    opacity: 1;
                }
                
                #ai-chat-window {
                    position: absolute;
                    bottom: 80px;
                    right: 0;
                    width: ${currentWidth}px;
                    height: ${currentHeight}px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                    min-width: ${CHATBOT_CONFIG.width.min}px;
                    max-width: ${CHATBOT_CONFIG.width.max}px;
                    min-height: ${CHATBOT_CONFIG.height.min}px;
                    max-height: ${CHATBOT_CONFIG.height.max}px;
                    border: 1px solid rgba(0,0,0,0.05);
                    resize: none;
                }
                
                #ai-chat-window.show {
                    display: flex;
                    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                #ai-chat-window.fullscreen {
                    position: fixed !important;
                    top: 16px !important;
                    left: 16px !important;
                    right: 16px !important;
                    bottom: 16px !important;
                    width: auto !important;
                    height: auto !important;
                    max-width: none !important;
                    max-height: none !important;
                    border-radius: 16px;
                }
                
                .chat-resize-handle {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 20px;
                    height: 20px;
                    cursor: sw-resize;
                    background: repeating-linear-gradient(135deg, #d1d5db, #d1d5db 2px, transparent 2px, transparent 4px);
                    border-bottom-left-radius: 16px;
                    opacity: 0.4;
                    transition: opacity 0.2s;
                }
                
                #ai-chat-window.fullscreen .chat-resize-handle {
                    display: none;
                }
                
                .chat-resize-handle:hover {
                    opacity: 1;
                }
                
                #ai-chat-header {
                    background: var(--ai-dark);
                    color: white;
                    padding: 16px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    flex-shrink: 0;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                    position: relative;
                    overflow: hidden;
                }
                
                #ai-chat-header::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
                    animation: shimmer 8s linear infinite;
                }
                
                @keyframes shimmer {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                #ai-chat-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    position: relative;
                    z-index: 1;
                }
                
                .chat-controls {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    position: relative;
                    z-index: 1;
                }
                
                .chat-control-btn {
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    font-size: 16px;
                    backdrop-filter: blur(10px);
                }
                
                .chat-control-btn:hover {
                    background: rgba(255,255,255,0.2);
                    transform: translateY(-1px);
                }
                
                .chat-control-btn:active {
                    transform: translateY(0);
                }
                
                #ai-chat-close {
                    font-size: 20px;
                }
                
                #ai-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: linear-gradient(180deg, var(--ai-bg-secondary) 0%, white 100%);
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                #ai-chat-messages::-webkit-scrollbar {
                    width: 4px;
                }
                
                #ai-chat-messages::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                #ai-chat-messages::-webkit-scrollbar-thumb {
                    background: var(--ai-secondary);
                    border-radius: 2px;
                }
                
                .ai-message {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    animation: fadeIn 0.3s ease-out;
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .ai-message.user {
                    flex-direction: row-reverse;
                }
                
                .ai-message-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    flex-shrink: 0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                
                .ai-message.user .ai-message-avatar {
                    background: var(--ai-primary);
                }
                
                .ai-message.bot .ai-message-avatar {
                    background: var(--ai-secondary);
                }
                
                .ai-message-content {
                    max-width: 80%;
                    padding: 12px 16px;
                    border-radius: 12px;
                    word-wrap: break-word;
                    line-height: 1.5;
                    font-size: 14px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                
                .ai-message.user .ai-message-content {
                    background: var(--ai-primary);
                    color: white;
                    border-bottom-right-radius: 4px;
                }
                
                .ai-message.bot .ai-message-content {
                    background: white;
                    color: #333;
                    border-bottom-left-radius: 4px;
                    border: 1px solid var(--ai-bg-tertiary);
                }
                
                details {
                    margin: 8px 0;
                    border-radius: 8px;
                    overflow: hidden;
                    background: var(--ai-bg-secondary);
                    border: 1px solid var(--ai-bg-tertiary);
                    transition: all 0.2s;
                }

                details:hover {
                    background: var(--ai-bg-tertiary);
                }

                details[open] {
                    background: var(--ai-bg-secondary);
                }

                details[open] summary {
                    margin-bottom: 8px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--ai-bg-tertiary);
                }

                summary {
                    padding: 12px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    user-select: none;
                    font-weight: 500;
                    font-size: 13px;
                }

                summary:hover {
                    background: rgba(107, 115, 255, 0.05);
                }
                
                .ai-message-content pre {
                    background: var(--ai-bg-secondary);
                    padding: 12px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 8px 0;
                    font-size: 13px;
                    font-family: 'Monaco', monospace;
                    border: 1px solid var(--ai-bg-tertiary);
                }
                
                .ai-message.bot .ai-message-content pre {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                }
                
                .ai-message-content table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    margin: 8px 0;
                    font-size: 13px;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #e5e7eb;
                }
                
                .ai-message-content th,
                .ai-message-content td {
                    padding: 8px 12px;
                    border-bottom: 1px solid #e5e7eb;
                    text-align: left;
                }
                
                .ai-message-content th {
                    background: #f9fafb;
                    font-weight: 600;
                    color: #374151;
                }
                
                .ai-message-content tr:last-child td {
                    border-bottom: none;
                }
                
                .ai-message-content tr:hover {
                    background: #f3f4f6;
                }
                
                #ai-chat-input-container {
                    padding: 16px 20px;
                    background: white;
                    border-top: 1px solid #e5e7eb;
                    flex-shrink: 0;
                }
                
                #ai-chat-input-wrapper {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    background: var(--ai-bg-secondary);
                    border-radius: 9999px;
                    padding: 4px 4px 4px 16px;
                    transition: all 0.2s;
                    border: 1px solid #e5e7eb;
                }
                
                #ai-chat-input-wrapper:focus-within {
                    border-color: var(--ai-color-primary);
                    box-shadow: 0 0 0 3px rgba(107, 115, 255, 0.1);
                }
                
                #ai-chat-input {
                    flex: 1;
                    padding: 10px 0;
                    border: none;
                    background: transparent;
                    outline: none;
                    font-size: 14px;
                    color: var(--ai-text-primary);
                }
                
                #ai-chat-send {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: var(--ai-primary);
                    border: none;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    font-size: 18px;
                    box-shadow: 0 1px 3px rgba(107, 115, 255, 0.3);
                }
                
                #ai-chat-send:hover:not(:disabled) {
                    transform: scale(1.05);
                    box-shadow: 0 2px 4px rgba(107, 115, 255, 0.4);
                }
                
                #ai-chat-send:active:not(:disabled) {
                    transform: scale(0.98);
                }
                
                #ai-chat-send:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .ai-typing-indicator {
                    display: flex;
                    gap: 4px;
                    padding: 12px;
                }
                
                .ai-typing-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    animation: typing 1.2s infinite;
                }
                
                .ai-typing-dot:nth-child(2) {
                    animation-delay: 0.2s;
                }
                
                .ai-typing-dot:nth-child(3) {
                    animation-delay: 0.4s;
                }
                
                @keyframes typing {
                    0%, 60%, 100% {
                        opacity: 0.4;
                        transform: translateY(0);
                    }
                    30% {
                        opacity: 1;
                        transform: translateY(-6px);
                    }
                }
                
                .size-indicator {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(17,24,39,0.9);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 9999px;
                    font-size: 13px;
                    font-weight: 500;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s;
                    z-index: 10;
                    backdrop-filter: blur(8px);
                }
                
                .size-indicator.show {
                    opacity: 1;
                }
                
                @media (max-width: 768px) {
                    #ai-chat-window {
                        width: calc(100vw - 32px) !important;
                        height: calc(100vh - 96px) !important;
                        right: 16px !important;
                        max-width: none !important;
                        max-height: none !important;
                    }
                    
                    .chat-resize-handle {
                        display: none;
                    }
                    
                    #ai-chat-messages {
                        padding: 16px;
                    }
                    
                    .ai-message-content {
                        max-width: 90%;
                        font-size: 13px;
                    }
                }
                
                /* Melhorias visuais adicionais */
                .chart-expand-btn {
                    background: var(--ai-primary) !important;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .chart-expand-btn:hover {
                    transform: scale(1.05);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
            </style>
            
            <button id="ai-chat-button" title="Assistente de Dados IA">
                💬
            </button>
            
            <div id="ai-chat-window">
                <div class="size-indicator" id="sizeIndicator"></div>
                <div class="chat-resize-handle" id="chatResizeHandle" title="Arraste para redimensionar"></div>
                <div id="ai-chat-header">
                    <h3>🤖 Assistente de Dados IA</h3>
                    <div class="chat-controls">
                        <button class="chat-control-btn" id="fullscreenBtn" title="Tela cheia">⛶</button>
                        <button class="chat-control-btn" id="resetSizeBtn" title="Tamanho padrão">📏</button>
                        <button class="chat-control-btn" id="ai-chat-close" title="Fechar">×</button>
                    </div>
                </div>
                
                <div id="ai-chat-messages">
                    <div class="ai-message bot">
                        <div class="ai-message-avatar">🤖</div>
                        <div class="ai-message-content">
                            <strong style="display: block; margin-bottom: 8px; font-size: 16px;">Olá! Sou seu assistente de dados inteligente.</strong>
                            Faça perguntas em linguagem natural e receba análises automáticas dos dados.
                            <div style="margin-top: 12px; padding: 12px; background: rgba(107, 115, 255, 0.05); border-radius: 8px; font-size: 13px; border: 1px solid rgba(107, 115, 255, 0.1);">
                                💡 <strong>Dica:</strong> Você pode redimensionar esta janela arrastando o canto inferior esquerdo, ou usar o botão de tela cheia acima.
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="ai-chat-input-container">
                    <div id="ai-chat-input-wrapper">
                        <input type="text" id="ai-chat-input" placeholder="Digite sua pergunta sobre os dados..." />
                        <button id="ai-chat-send" title="Enviar">➤</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(chatContainer);
        try { chatContainer.style.zIndex = '2147483647'; } catch (e) {}
    }
    
    // Inicializar eventos
    function initializeEvents() {
        const chatButton = document.getElementById('ai-chat-button');
        const chatWindow = document.getElementById('ai-chat-window');
        const chatClose = document.getElementById('ai-chat-close');
        const chatInput = document.getElementById('ai-chat-input');
        const chatSend = document.getElementById('ai-chat-send');
        const resetSizeBtn = document.getElementById('resetSizeBtn');
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const sizeIndicator = document.getElementById('sizeIndicator');
        const resizeHandle = document.getElementById('chatResizeHandle');
        
        chatButton.addEventListener('click', () => {
            chatWindow.classList.toggle('show');
            if (chatWindow.classList.contains('show')) {
                chatInput.focus();
            }
        });
        
        chatClose.addEventListener('click', () => {
            chatWindow.classList.remove('show');
            if (isFullscreen) {
                toggleFullscreen();
            }
        });
        
        fullscreenBtn.addEventListener('click', () => {
            toggleFullscreen();
        });
        
        function toggleFullscreen() {
            isFullscreen = !isFullscreen;
            
            if (isFullscreen) {
                savedPosition = {
                    width: chatWindow.style.width,
                    height: chatWindow.style.height
                };
                chatWindow.classList.add('fullscreen');
                fullscreenBtn.innerHTML = '⛶';
                fullscreenBtn.title = 'Sair da tela cheia';
            } else {
                chatWindow.classList.remove('fullscreen');
                if (savedPosition) {
                    chatWindow.style.width = savedPosition.width;
                    chatWindow.style.height = savedPosition.height;
                }
                fullscreenBtn.innerHTML = '⛶';
                fullscreenBtn.title = 'Tela cheia';
            }
        }
        
        resetSizeBtn.addEventListener('click', () => {
            if (isFullscreen) {
                toggleFullscreen();
            }
            chatWindow.style.width = `${CHATBOT_CONFIG.width.default}px`;
            chatWindow.style.height = `${CHATBOT_CONFIG.height.default}px`;
            currentWidth = CHATBOT_CONFIG.width.default;
            currentHeight = CHATBOT_CONFIG.height.default;
            showSizeIndicator();
        });
        
        let isDragging = false;
        let startX, startY, startWidth, startHeight;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            if (isFullscreen) return;
            
            isDragging = true;
            isResizing = true;
            
            startX = e.clientX;
            startY = e.clientY;
            startWidth = chatWindow.offsetWidth;
            startHeight = chatWindow.offsetHeight;
            
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            
            e.preventDefault();
            showSizeIndicator();
        });
        
        function handleResize(e) {
            if (!isDragging) return;
            
            const deltaX = startX - e.clientX;
            const deltaY = e.clientY - startY;
            
            let newWidth = startWidth + deltaX;
            let newHeight = startHeight + deltaY;
            
            newWidth = Math.max(CHATBOT_CONFIG.width.min, Math.min(CHATBOT_CONFIG.width.max, newWidth));
            newHeight = Math.max(CHATBOT_CONFIG.height.min, Math.min(CHATBOT_CONFIG.height.max, newHeight));
            
            chatWindow.style.width = `${newWidth}px`;
            chatWindow.style.height = `${newHeight}px`;
            
            currentWidth = newWidth;
            currentHeight = newHeight;
            
            showSizeIndicator();
        }
        
        function stopResize() {
            if (isDragging) {
                isDragging = false;
                isResizing = false;
                document.removeEventListener('mousemove', handleResize);
                document.removeEventListener('mouseup', stopResize);
                hideSizeIndicator();
            }
        }
        
        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        function showSizeIndicator() {
            sizeIndicator.textContent = `${currentWidth} × ${currentHeight}`;
            sizeIndicator.classList.add('show');
            
            if (!isResizing) {
                setTimeout(() => {
                    hideSizeIndicator();
                }, 2000);
            }
        }
        
        function hideSizeIndicator() {
            sizeIndicator.classList.remove('show');
        }
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const target = mutation.target;
                    if (target.id === 'homeView' || target.id === 'pageView') {
                        setTimeout(toggleChatbotVisibility, 100);
                    }
                }
            });
        });
        
        const homeView = document.getElementById('homeView');
        const pageView = document.getElementById('pageView');
        
        if (homeView) {
            observer.observe(homeView, { attributes: true, attributeFilter: ['style'] });
        }
        if (pageView) {
            observer.observe(pageView, { attributes: true, attributeFilter: ['style'] });
        }
        
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            observer.observe(mainContent, { childList: true, subtree: true });
        }
        
        setTimeout(toggleChatbotVisibility, 500);
    }
    
    function isGreeting(message) {
        const normalized = message.toLowerCase().trim();
        const greetingPatterns = [
            /^(oi|olá|ola|oii|oie)$/i,
            /^(oi|olá|ola)\s*(tudo\s*bem|td\s*bem)?[!.?]*$/i,
            /^(bom\s*dia|boa\s*tarde|boa\s*noite)[!.?]*$/i,
            /^(e\s*ai|e\s*aí|eai)[!.?]*$/i,
            /^(hey|hi|hello)[!.?]*$/i,
            /^(tudo\s*bem|td\s*bem|beleza)[!.?]*$/i,
            /^(opa|opaa)[!.?]*$/i,
            /^(fala|salve)[!.?]*$/i
        ];
        return greetingPatterns.some(pattern => pattern.test(normalized));
    }

    function getGreetingResponse() {
        const hour = new Date().getHours();
        let greeting;
        
        if (hour >= 6 && hour < 12) {
            greeting = 'Bom dia';
        } else if (hour >= 12 && hour < 18) {
            greeting = 'Boa tarde';
        } else {
            greeting = 'Boa noite';
        }
        
        const responses = [
            `${greeting}! 👋 Sou seu assistente para consulta e análise de dados. Peça alguma informação que vou buscar para você se existir em nossas bases.`,
            `${greeting}! 🤖 Estou aqui para ajudar com consultas aos dados. Me pergunte algo e vou analisar as informações disponíveis.`,
            `${greeting}! 💡 Posso ajudar você a consultar e analisar dados do sistema. O que você gostaria de saber?`
        ];
        
        const selectedResponse = responses[Math.floor(Math.random() * responses.length)];
        
        return `
            <div style="background: linear-gradient(135deg, #6B73FF 0%, #000DFF 100%); color: white; padding: 16px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(107, 115, 255, 0.2);">
                <div style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">
                    ${selectedResponse}
                </div>
            </div>
            
            <div style="background: #e7f0ff; padding: 12px; border-radius: 8px; color: #0047ab; border: 1px solid #d0e3ff;">
                <strong style="font-size: 14px;">💡 Exemplos de perguntas que posso responder:</strong>
                <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.8; font-size: 13px;">
                    <li>Quantos atendimentos foram realizados hoje?</li>
                    <li>Liste os pacientes cadastrados em janeiro</li>
                    <li>Qual o total de consultas por médico este mês?</li>
                    <li>Mostre os atendimentos de urgência da última semana</li>
                    <li>Há crescimento no número de consultas este ano?</li>
                </ul>
            </div>
            
            <div style="background: #f8fbff; padding: 8px; border-radius: 8px; margin-top: 12px; font-size: 13px; color: #0052d4; border: 1px solid #d6e4ff;">
                <strong>✨ Dica:</strong> Faça perguntas em linguagem natural. Vou gerar a consulta SQL automaticamente e analisar os resultados para você!
            </div>
        `;
    }
    
    async function sendMessage() {
        const input = document.getElementById('ai-chat-input');
        const message = input.value.trim();
        
        if (!message || isProcessing) return;
        
        addMessage('user', message);
        input.value = '';
        
        if (isGreeting(message)) {
            const greetingResponse = getGreetingResponse();
            showTypingIndicator();
            setTimeout(() => {
                removeTypingIndicator();
                addMessage('bot', greetingResponse);
            }, 800);
            return;
        }
        
        isProcessing = true;
        document.getElementById('ai-chat-send').disabled = true;
        showTypingIndicator();
        
        try {
            const sqlQuery = await generateSQL(message);
            const results = await executeQuery(sqlQuery);
            const analysis = await analyzeResults(message, sqlQuery, results);
            const response = formatResponse(message, sqlQuery, results, analysis);
            
            removeTypingIndicator();
            addMessage('bot', response);
            
        } catch (error) {
            console.error('[CHATBOT] Erro:', error);
            removeTypingIndicator();

            const notUnderstood =
                (error && error.code === 'REQUEST_VALIDATION') ||
                /request_validation/i.test(error?.message || '') ||
                /not_data_request/i.test(error?.message || '') ||
                /Pergunta não relacionada a dados/i.test(error?.message || '');
                
            if (notUnderstood) {
                addMessage('bot', `
                    <div style="background:#fff7e6; padding:12px; border-radius:8px; color:#d46b08; border:1px solid #ffd591;">
                        Não consegui compreender seu pedido.
                        <div style="margin-top:8px; font-size:13px; color:#0052d4; background:#e7f0ff; padding:8px; border-radius:8px; border:1px solid #d0e3ff;">
                            <strong>Exemplos:</strong><br>
                            • Quantos atendimentos foram realizados hoje?<br>
                            • Liste os pacientes cadastrados em janeiro<br>
                            • Qual o total de consultas este mês?
                        </div>
                    </div>
                `.trim());
                return;
            }
            
            let errorIcon = '❌';
            let errorTitle = 'Erro no processamento';
            let errorMessage = error.message;
            
            if (error.message.includes('Pergunta não relacionada')) {
                errorIcon = '❓';
                errorTitle = 'Pergunta não compreendida';
            } else if (error.message.includes('Dados não encontrados')) {
                errorIcon = '🔍';
                errorTitle = 'Dados não encontrados';
            } else if (error.message.includes('Timeout')) {
                errorIcon = '⏱️';
                errorTitle = 'Tempo esgotado';
            } else if (error.message.includes('indisponível')) {
                errorIcon = '💾';
                errorTitle = 'Serviço indisponível';
            }
            
            let formattedError = `<div style="color: #c53030; padding: 12px; background: #fff5f5; border-radius: 8px; margin: 8px 0; border:1px solid #fed7d7;">
                <strong>${errorIcon} ${errorTitle}:</strong><br>
                ${errorMessage}
            </div>`;
            
            addMessage('bot', formattedError);
            
        } finally {
            isProcessing = false;
            document.getElementById('ai-chat-send').disabled = false;
        }
    }
    
    async function getDataDictionary() {
        try {
            const response = await fetch('/api/data-dictionaries/active', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                return DATA_DICTIONARY;
            }
            
            const data = await response.json();
            
            if (data && data.tables) {
                return {
                    tables: data.tables.map(table => ({
                        name: table.name,
                        description: table.description || '',
                        columns: table.columns ? table.columns.map(col => ({
                            name: col.name,
                            type: col.type,
                            description: col.description || ''
                        })) : []
                    }))
                };
            }
            
            return DATA_DICTIONARY;
            
        } catch (error) {
            console.error('[CHATBOT] Erro ao carregar dicionário:', error);
            return DATA_DICTIONARY;
        }
    }

    async function generateSQL(userQuery) {
        const currentDictionary = await getDataDictionary();
        
        const payload = {
            userQuery: userQuery,
            dataDictionary: currentDictionary
        };
        
        try {
            const resp = await fetch('/api/chat/ai-sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const responseText = await resp.text();
            let data;
            
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                throw new Error(`Resposta inválida: ${responseText.substring(0, 200)}`);
            }
            
            if (!resp.ok) {
                let detailedError = 'Falha na geração da SQL';
                
                if (data.reason === 'not_data_request' || data.stage === 'request_validation') {
                    detailedError = 'Pergunta não relacionada a dados';
                } else if (data.reason === 'table_not_found') {
                    detailedError = 'Dados solicitados não disponíveis';
                } else if (data.reason === 'data_not_found') {
                    detailedError = 'Dados não encontrados';
                }
                
                const err = new Error(`${detailedError}${data?.details ? `\n\n${data.details}` : ''}`);
                if (data.stage === 'request_validation' || data.reason === 'not_data_request') {
                    err.code = 'REQUEST_VALIDATION';
                }
                throw err;
            }
            
            const sql = (data.sql || '').trim();
            
            if (!sql) {
                throw new Error('SQL vazia retornada');
            }
            
            if (!/^(select|with)/i.test(sql)) {
                throw new Error(`Consulta inválida: "${sql}"`);
            }
            
            return sql;
            
        } catch (error) {
            console.error('[generateSQL] Erro:', error);
            throw error;
        }
    }

    async function analyzeResults(userQuery, sqlQuery, results) {
        if (!results || results.length === 0) {
            return null;
        }
        
        try {
            const response = await fetch('/api/chat/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: userQuery,
                    sqlQuery: sqlQuery,
                    results: results
                })
            });
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            return data.analysis || null;
            
        } catch (error) {
            console.error('[analyzeResults] Erro:', error);
            return null;
        }
    }
    
    async function executeQuery(sqlQuery) {
        const authToken = sessionStorage.getItem('authToken');
        
        try {
            const response = await fetch('/api/chat/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken ? `Bearer ${authToken}` : ''
                },
                body: JSON.stringify({ query: sqlQuery })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: 'Erro na execução',
                    error: `Status: ${response.status}`
                }));
                
                let errorType = 'Erro na consulta';
                if (response.status === 403) errorType = 'Operação não permitida';
                else if (response.status === 503) errorType = 'Banco indisponível';
                
                throw new Error(`${errorType}: ${errorData.message || errorData.error}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Falha na execução');
            }
            
            return data.results || [];
            
        } catch (error) {
            console.error('[executeQuery] Erro:', error);
            throw error;
        }
    }
    
    function formatResponse(question, sqlQuery, results, analysis) {
        let response = '';
        
        if (analysis) {
            response += `<div style="background: linear-gradient(135deg, #6B73FF 0%, #000DFF 100%); color: white; padding: 16px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(107, 115, 255, 0.2);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 20px;">🔍</span>
                    <strong style="font-size: 15px;">Análise dos Dados</strong>
                </div>
                <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${analysis}</div>
            </div>`;
        }
        
        response += `<div style="background: #e7f0ff; padding: 8px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #6B73FF;">
            <strong style="font-size: 13px;">📝 Sua pergunta:</strong> <span style="font-size: 13px;">${question}</span>
        </div>`;
        
        response += `<details style="background: #f7f7fc; padding: 12px; border-radius: 8px; margin-bottom: 12px; cursor: pointer; border: 1px solid #ededf5;">
            <summary style="font-weight: 600; color: #1a1a2e; user-select: none; outline: none; font-size: 13px;">
                <span style="margin-right: 6px;">🔍</span>Consulta SQL gerada
                <span style="font-size: 12px; color: #6b7280; margin-left: 6px;">(clique para expandir)</span>
            </summary>
            <pre style="background: white; padding: 12px; border-radius: 8px; margin-top: 8px; font-size: 13px; border: 1px solid #ededf5; overflow-x: auto;">${sqlQuery}</pre>
        </details>`;
        
        if (!results || results.length === 0) {
            response += `<div style="background: #fff7e6; padding: 12px; border-radius: 8px; color: #d46b08; border: 1px solid #ffd591;">
                <strong>⚠️ Nenhum resultado encontrado</strong><br>
                <span style="font-size: 13px;">A consulta foi executada mas não retornou dados.</span>
            </div>`;
        } else if (results.length === 1 && Object.keys(results[0]).length === 1) {
            const value = Object.values(results[0])[0];
            const key = Object.keys(results[0])[0];
            response += `<div style="background: linear-gradient(135deg, #d1fae5 0%, #bbf7d0 100%); padding: 16px; border-radius: 8px; color: #065f46; text-align: center; border: 1px solid #34d399;">
                <div style="font-size: 28px; font-weight: bold; margin-bottom: 4px;">${value}</div>
                <div style="font-size: 14px; font-weight: 500;">${key}</div>
            </div>`;
        } else {
            response += `<details style="background: #f7f7fc; padding: 12px; border-radius: 8px; cursor: pointer; border: 1px solid #ededf5;">
                <summary style="font-weight: 600; color: #065f46; user-select: none; outline: none; font-size: 13px;">
                    <span style="margin-right: 6px;">✅</span>${results.length} resultado(s) encontrado(s)
                    <span style="font-size: 12px; color: #6b7280; margin-left: 6px;">(clique para ver tabela)</span>
                </summary>
                <div style="overflow-x: auto; margin-top: 12px;">
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #ededf5;">
                        <thead><tr>`;
            
            Object.keys(results[0]).forEach(key => {
                response += `<th style="padding: 8px 12px; border-bottom: 1px solid #ededf5; background: #f7f7fc; font-weight: 600; text-align: left; color: #1a1a2e;">${key}</th>`;
            });
            
            response += `</tr></thead><tbody>`;
            
            results.slice(0, 20).forEach((row, idx) => {
                const bgColor = idx % 2 === 0 ? 'white' : '#f7f7fc';
                response += `<tr style="background: ${bgColor};">`;
                Object.values(row).forEach(value => {
                    const displayValue = value !== null && value !== undefined ? value : '-';
                    response += `<td style="padding: 8px 12px; border-bottom: 1px solid #ededf5;">${displayValue}</td>`;
                });
                response += '</tr>';
            });
            
            response += `</tbody></table>`;
            
            if (results.length > 20) {
                response += `<div style="margin-top: 8px; font-size: 12px; color: #6b7280; text-align: center; font-style: italic; padding: 6px; background: #ededf5; border-radius: 6px;">
                    Mostrando 20 de ${results.length} resultados
                </div>`;
            }
            
            response += `</div></details>`;
        }
        
        if (results && results.length > 0) {
            const chartId = `chart-${Date.now()}`;
            
            if (!window.chartDataStore) {
                window.chartDataStore = {};
            }
            window.chartDataStore[chartId] = {
                question: question,
                sqlQuery: sqlQuery,
                results: results.slice(0, 50)
            };
            
            response += `<div style="margin-top: 12px; text-align: center;">
                <button 
                    id="${chartId}" 
                    style="background: linear-gradient(135deg, #6B73FF 0%, #000DFF 100%); 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 9999px; 
                        cursor: pointer; 
                        font-size: 13px; 
                        font-weight: 500;
                        box-shadow: 0 1px 3px rgba(107, 115, 255, 0.3);
                        transition: all 0.2s;"
                    onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 2px 4px rgba(107, 115, 255, 0.4)'"
                    onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 1px 3px rgba(107, 115, 255, 0.3)'"
                    onclick="window.generateChartVisualization('${chartId}')">
                    📊 Gerar Visualização Gráfica
                </button>
                <div id="${chartId}-container" style="margin-top: 12px;"></div>
            </div>`;
        }
        
        return response;
    }
    
    function addMessage(type, content) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        avatar.textContent = type === 'user' ? '👤' : '🤖';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'ai-message-content';
        
        if (type === 'bot' && content.includes('<')) {
            contentDiv.innerHTML = content;
        } else {
            contentDiv.textContent = content;
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    function showTypingIndicator() {
        const messagesContainer = document.getElementById('ai-chat-messages');
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-message bot';
        typingDiv.id = 'ai-typing-indicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        avatar.textContent = '🤖';
        
        const dots = document.createElement('div');
        dots.className = 'ai-typing-indicator';
        dots.innerHTML = `
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
        `;
        
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(dots);
        messagesContainer.appendChild(typingDiv);
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    function removeTypingIndicator() {
        const indicator = document.getElementById('ai-typing-indicator');
        if (indicator) indicator.remove();
    }

    // ============================================
    // NOVA IMPLEMENTAÇÃO: GRÁFICOS VIA COPILOT
    // ============================================
    
    window.generateChartVisualization = async function(chartId) {
        console.log('[COPILOT-CHART] Iniciando geração de gráfico:', chartId);
        
        const button = document.getElementById(chartId);
        const container = document.getElementById(`${chartId}-container`);
        
        if (!button || !container) {
            console.error('[COPILOT-CHART] Elementos não encontrados');
            return;
        }
        
        const payload = window.chartDataStore?.[chartId];
        if (!payload) {
            console.error('[COPILOT-CHART] Dados não encontrados no store');
            container.innerHTML = `<div style="background: #fff5f5; padding: 12px; border-radius: 8px; color: #c53030; border: 1px solid #fed7d7; margin-top: 8px;">
                <strong>❌ Erro</strong><br>
                <span style="font-size: 13px;">Dados não encontrados. Tente novamente.</span>
            </div>`;
            return;
        }
        
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '🤖 Consultando Copilot...';
        
        try {
            console.log('[COPILOT-CHART] Enviando para Copilot:', {
                query: payload.question,
                sqlLength: payload.sqlQuery.length,
                resultsCount: payload.results.length
            });
            
            const response = await fetch('/api/chat/copilot-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: payload.question,
                    sqlQuery: payload.sqlQuery,
                    results: payload.results
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[COPILOT-CHART] Resposta do Copilot:', data);
            
            if (!data.chartCode) {
                throw new Error('Código do gráfico não retornado');
            }
            
            const canvasId = `canvas-${chartId}`;
            container.innerHTML = `
                <div style="background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-top: 8px;">
                    <canvas id="${canvasId}" style="max-height: 400px;"></canvas>
                </div>`;
            
            if (typeof Chart === 'undefined') {
                console.log('[COPILOT-CHART] Carregando Chart.js...');
                await loadChartJS();
            }
            
            console.log('[COPILOT-CHART] Executando código do gráfico...');
            executeChartCode(canvasId, data.chartCode);
            
            button.style.display = 'none';
            delete window.chartDataStore[chartId];
            
            console.log('[COPILOT-CHART] Gráfico renderizado com sucesso');
            
        } catch (error) {
            console.error('[COPILOT-CHART] Erro:', error);
            container.innerHTML = `<div style="background: #fff5f5; padding: 12px; border-radius: 8px; color: #c53030; border: 1px solid #fed7d7; margin-top: 8px;">
                <strong>❌ Erro ao gerar visualização</strong><br>
                <span style="font-size: 13px;">${error.message}</span>
            </div>`;
            button.disabled = false;
            button.innerHTML = originalText;
        }
    };
    
    function loadChartJS() {
        return new Promise((resolve, reject) => {
            if (typeof Chart !== 'undefined') {
                resolve();
                return;
            }
            
            console.log('[COPILOT-CHART] Carregando Chart.js...');
            
            // 1. Carregar Chart.js
            const chartScript = document.createElement('script');
            chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            
            chartScript.onload = () => {
                console.log('[COPILOT-CHART] ✅ Chart.js carregado');
                
                // 2. Carregar date-fns (necessário para o adaptador)
                const dateFnsScript = document.createElement('script');
                dateFnsScript.src = 'https://cdn.jsdelivr.net/npm/date-fns@3.0.0/index.min.js';
                
                dateFnsScript.onload = () => {
                    console.log('[COPILOT-CHART] ✅ date-fns carregado');
                    
                    // 3. Carregar adaptador de datas para Chart.js
                    const adapterScript = document.createElement('script');
                    adapterScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js';
                    
                    adapterScript.onload = () => {
                        console.log('[COPILOT-CHART] ✅ Adaptador de datas carregado');
                        
                        // 4. Carregar plugin datalabels (opcional)
                        const pluginScript = document.createElement('script');
                        pluginScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js';
                        
                        pluginScript.onload = () => {
                            console.log('[COPILOT-CHART] ✅ Plugin datalabels carregado');
                            resolve();
                        };
                        
                        pluginScript.onerror = () => {
                            console.warn('[COPILOT-CHART] ⚠️ Falha ao carregar plugin, continuando sem ele');
                            resolve(); // Continua mesmo sem o plugin
                        };
                        
                        document.head.appendChild(pluginScript);
                    };
                    
                    adapterScript.onerror = () => {
                        console.error('[COPILOT-CHART] ❌ Falha ao carregar adaptador de datas');
                        reject(new Error('Falha ao carregar adaptador de datas'));
                    };
                    
                    document.head.appendChild(adapterScript);
                };
                
                dateFnsScript.onerror = () => {
                    console.error('[COPILOT-CHART] ❌ Falha ao carregar date-fns');
                    reject(new Error('Falha ao carregar date-fns'));
                };
                
                document.head.appendChild(dateFnsScript);
            };
            
            chartScript.onerror = () => {
                console.error('[COPILOT-CHART] ❌ Falha ao carregar Chart.js');
                reject(new Error('Falha ao carregar Chart.js'));
            };
            
            document.head.appendChild(chartScript);
        });
    }
    
    function executeChartCode(canvasId, chartCode) {
        console.log('[COPILOT-CHART] Código recebido:', chartCode.substring(0, 200) + '...');
        
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            throw new Error('Canvas não encontrado');
        }
        
        // ADICIONAR BOTÃO DE EXPANSÃO
        const container = canvas.closest('div[style*="background: white"]');
        if (container && !container.querySelector('.chart-expand-btn')) {
            const expandBtn = document.createElement('button');
            expandBtn.className = 'chart-expand-btn';
            expandBtn.innerHTML = '⛶';
            expandBtn.title = 'Expandir gráfico';
            expandBtn.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                background: linear-gradient(135deg, #6B73FF 0%, #000DFF 100%);
                color: white;
                border: none;
                width: 32px;
                height: 32px;
                border-radius: 9999px;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                transition: all 0.2s;
            `;
            
            expandBtn.onmouseover = () => {
                expandBtn.style.transform = 'scale(1.05)';
                expandBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            };
            
            expandBtn.onmouseout = () => {
                expandBtn.style.transform = 'scale(1)';
                expandBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            };
            
            expandBtn.onclick = () => {
                const modal = document.createElement('div');
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.8);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 32px;
                    animation: fadeIn 0.3s;
                `;
                
                const modalContent = document.createElement('div');
                modalContent.style.cssText = `
                    background: white;
                    border-radius: 12px;
                    width: 90vw;
                    height: 85vh;
                    max-width: 1200px;
                    position: relative;
                    padding: 24px;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                `;
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '×';
                closeBtn.title = 'Fechar';
                closeBtn.style.cssText = `
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: #ef4444;
                    color: white;
                    border: none;
                    width: 36px;
                    height: 36px;
                    border-radius: 9999px;
                    cursor: pointer;
                    font-size: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10;
                    transition: all 0.2s;
                    line-height: 1;
                `;
                
                closeBtn.onmouseover = () => {
                    closeBtn.style.transform = 'scale(1.05)';
                    closeBtn.style.background = '#dc2626';
                };
                
                closeBtn.onmouseout = () => {
                    closeBtn.style.transform = 'scale(1)';
                    closeBtn.style.background = '#ef4444';
                };
                
                closeBtn.onclick = () => modal.remove();
                
                const expandedCanvas = document.createElement('canvas');
                expandedCanvas.id = `expanded-${canvasId}`;
                expandedCanvas.style.cssText = `
                    max-width: 100%;
                    max-height: calc(85vh - 64px);
                `;
                
                modalContent.appendChild(closeBtn);
                modalContent.appendChild(expandedCanvas);
                modal.appendChild(modalContent);
                document.body.appendChild(modal);
                
                // Recriar gráfico no canvas expandido
                const expandedCtx = expandedCanvas.getContext('2d');
                const sandbox = {
                    Chart: window.Chart,
                    ctx: expandedCtx,
                    canvas: expandedCanvas,
                    console: {
                        log: (...args) => console.log('[CHART-EXPANDED]', ...args),
                        error: (...args) => console.error('[CHART-EXPANDED]', ...args),
                        warn: (...args) => console.warn('[CHART-EXPANDED]', ...args)
                    }
                };
                
                try {
                    const executor = new Function(
                        'Chart', 'ctx', 'canvas', 'console',
                        `"use strict"; Chart.register(ChartDataLabels); Chart.defaults.plugins.datalabels.display = true; Chart.defaults.plugins.datalabels.color = '#555'; Chart.defaults.plugins.datalabels.font = { weight: 'bold' }; Chart.defaults.plugins.datalabels.align = 'end'; ${chartCode}`
                    );
                    executor(sandbox.Chart, sandbox.ctx, sandbox.canvas, sandbox.console);
                } catch (error) {
                    console.error('[CHART-EXPANDED] Erro ao renderizar:', error);
                    modal.remove();
                }
                
                // Fechar com ESC
                const escHandler = (e) => {
                    if (e.key === 'Escape') {
                        modal.remove();
                        document.removeEventListener('keydown', escHandler);
                    }
                };
                document.addEventListener('keydown', escHandler);
                
                // Fechar clicando fora
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.remove();
                    }
                };
            };
            
            container.style.position = 'relative';
            container.insertBefore(expandBtn, container.firstChild);
        }
        
        const ctx = canvas.getContext('2d');
        
        const sandbox = {
            Chart: window.Chart,
            ctx: ctx,
            canvas: canvas,
            console: {
                log: (...args) => console.log('[CHART-SANDBOX]', ...args),
                error: (...args) => console.error('[CHART-SANDBOX]', ...args),
                warn: (...args) => console.warn('[CHART-SANDBOX]', ...args)
            }
        };
        
        try {
            const executor = new Function(
                'Chart', 'ctx', 'canvas', 'console',
                `"use strict"; Chart.register(ChartDataLabels); Chart.defaults.plugins.datalabels.display = true; Chart.defaults.plugins.datalabels.color = '#555'; Chart.defaults.plugins.datalabels.font = { weight: 'bold' }; Chart.defaults.plugins.datalabels.align = 'end'; ${chartCode}`
            );
            
            const timeout = setTimeout(() => {
                throw new Error('Timeout: código levou mais de 5s');
            }, 5000);
            
            executor(sandbox.Chart, sandbox.ctx, sandbox.canvas, sandbox.console);
            
            clearTimeout(timeout);
            console.log('[COPILOT-CHART] Código executado com sucesso');
            
        } catch (error) {
            console.error('[COPILOT-CHART] Erro na execução:', error);
            throw new Error(`Erro ao renderizar: ${error.message}`);
        }
    }
    
    // ============================================
    // FIM DA IMPLEMENTAÇÃO DE GRÁFICOS VIA COPILOT
    // ============================================
    
    function initChatbot() {
        try {
            forcedMode = isForcedMode();

            if (!isChatbotAllowed()) {
                // Se já existe, remove
                const existing = document.getElementById('ai-chatbot-container');
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                return; // Não inicializa quando desabilitado
            }

            if (!document.getElementById('ai-chatbot-container')) {
                createChatbotHTML();
            }
            initializeEvents();
            
            setTimeout(() => {
                toggleChatbotVisibility();
                if (forcedMode) {
                    // Abrir automaticamente a janela do chat na URL dedicada
                    const chatWindow = document.getElementById('ai-chat-window');
                    if (chatWindow) chatWindow.classList.add('show');
                }
            }, 1000);
            
        } catch (e) {
            console.error('[CHATBOT] Erro ao inicializar:', e);
        }
    }
    
    window.toggleChatbotVisibility = toggleChatbotVisibility;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatbot);
    } else {
        initChatbot();
    }
    
    window.addEventListener('load', () => {
        if (!document.getElementById('ai-chat-button')) {
            try { initChatbot(); } catch (e) {}
        }
    });

    // Reagir a atualizações de configuração vindas do painel admin
    window.addEventListener('portalConfigUpdated', () => {
        try {
            forcedMode = isForcedMode();
            const allowed = isChatbotAllowed();
            const existing = document.getElementById('ai-chatbot-container');
            if (allowed && !existing) {
                createChatbotHTML();
                initializeEvents();
                toggleChatbotVisibility();
            } else if (!allowed && existing) {
                existing.remove();
            } else if (allowed && existing) {
                toggleChatbotVisibility();
            }
        } catch (e) {
            console.warn('[CHATBOT] Falha ao aplicar config:', e);
        }
    });

})();