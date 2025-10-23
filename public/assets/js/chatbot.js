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
        
        const shouldShow = isOnHomeScreen();
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
                #ai-chatbot-container {
                    position: fixed;
                    bottom: ${CHATBOT_CONFIG.position.bottom}px;
                    right: ${CHATBOT_CONFIG.position.right}px;
                    z-index: 9999;
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                    display: none;
                }
                
                #ai-chat-button {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 32px;
                    transition: all 0.3s ease;
                    position: relative;
                }
                
                #ai-chat-button::after {
                    content: '';
                    position: absolute;
                    inset: -4px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    z-index: -1;
                    animation: pulse 2s ease-in-out infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 0.5; }
                    50% { transform: scale(1.1); opacity: 0; }
                }
                
                #ai-chat-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5);
                }
                
                #ai-chat-window {
                    position: absolute;
                    bottom: 84px;
                    right: 0;
                    width: ${currentWidth}px;
                    height: ${currentHeight}px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                    min-width: ${CHATBOT_CONFIG.width.min}px;
                    max-width: ${CHATBOT_CONFIG.width.max}px;
                    min-height: ${CHATBOT_CONFIG.height.min}px;
                    max-height: ${CHATBOT_CONFIG.height.max}px;
                    border: 2px solid rgba(102, 126, 234, 0.2);
                    resize: none;
                }
                
                #ai-chat-window.show {
                    display: flex;
                    animation: slideUp 0.3s ease-out;
                }
                
                #ai-chat-window.fullscreen {
                    position: fixed !important;
                    top: 20px !important;
                    left: 20px !important;
                    right: 20px !important;
                    bottom: 20px !important;
                    width: auto !important;
                    height: auto !important;
                    max-width: none !important;
                    max-height: none !important;
                    border-radius: 12px;
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .chat-resize-handle {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 24px;
                    height: 24px;
                    cursor: nw-resize;
                    background: linear-gradient(45deg, transparent 30%, #999 30%, #999 40%, transparent 40%, transparent 60%, #999 60%, #999 70%, transparent 70%);
                    border-bottom-left-radius: 12px;
                    opacity: 0.3;
                    transition: opacity 0.2s;
                }
                
                #ai-chat-window.fullscreen .chat-resize-handle {
                    display: none;
                }
                
                .chat-resize-handle:hover {
                    opacity: 0.6;
                }
                
                #ai-chat-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    flex-shrink: 0;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                #ai-chat-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .chat-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .chat-control-btn {
                    background: rgba(255,255,255,0.15);
                    border: none;
                    color: white;
                    cursor: pointer;
                    padding: 8px;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.2s;
                    font-size: 16px;
                    backdrop-filter: blur(10px);
                }
                
                .chat-control-btn:hover {
                    background: rgba(255,255,255,0.25);
                    transform: translateY(-1px);
                }
                
                .chat-control-btn:active {
                    transform: translateY(0);
                }
                
                #ai-chat-close {
                    font-size: 22px;
                }
                
                #ai-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                    background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                
                #ai-chat-messages::-webkit-scrollbar {
                    width: 8px;
                }
                
                #ai-chat-messages::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                
                #ai-chat-messages::-webkit-scrollbar-thumb {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 10px;
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
                        transform: translateY(10px);
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
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    flex-shrink: 0;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                
                .ai-message.user .ai-message-avatar {
                    background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
                }
                
                .ai-message.bot .ai-message-avatar {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                
                .ai-message-content {
                    max-width: 75%;
                    padding: 16px 20px;
                    border-radius: 16px;
                    word-wrap: break-word;
                    line-height: 1.6;
                    font-size: 15px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                }
                
                .ai-message.user .ai-message-content {
                    background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
                    color: white;
                    border-bottom-right-radius: 6px;
                }
                
                .ai-message.bot .ai-message-content {
                    background: white;
                    color: #333;
                    border-bottom-left-radius: 6px;
                    border: 1px solid #e0e0e0;
                }
                
                details {
                    margin: 12px 0;
                    border-radius: 8px;
                    overflow: hidden;
                    transition: background-color 0.2s;
                }

                details:hover {
                    background: #f0f0f0 !important;
                }

                details[open] {
                    background: #f0f0f0 !important;
                }

                details[open] summary {
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #dee2e6;
                }

                summary {
                    padding: 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    user-select: none;
                    font-weight: 500;
                }

                summary:hover {
                    background: rgba(0, 0, 0, 0.03);
                }
                
                .ai-message-content pre {
                    background: #f5f5f5;
                    padding: 12px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 12px 0;
                    font-size: 13px;
                    font-family: 'Courier New', monospace;
                    border: 1px solid #e0e0e0;
                }
                
                .ai-message.bot .ai-message-content pre {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                }
                
                .ai-message-content table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 12px 0;
                    font-size: 13px;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                }
                
                .ai-message-content th,
                .ai-message-content td {
                    padding: 10px 12px;
                    border: 1px solid #dee2e6;
                    text-align: left;
                }
                
                .ai-message-content th {
                    background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%);
                    font-weight: 600;
                    color: #495057;
                }
                
                .ai-message-content tr:hover {
                    background: #f8f9fa;
                }
                
                #ai-chat-input-container {
                    padding: 20px 24px;
                    background: white;
                    border-top: 1px solid #e0e0e0;
                    flex-shrink: 0;
                }
                
                #ai-chat-input-wrapper {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }
                
                #ai-chat-input {
                    flex: 1;
                    padding: 14px 18px;
                    border: 2px solid #e0e0e0;
                    border-radius: 28px;
                    outline: none;
                    font-size: 15px;
                    transition: all 0.2s;
                    background: #f8f9fa;
                }
                
                #ai-chat-input:focus {
                    border-color: #667eea;
                    background: white;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                }
                
                #ai-chat-send {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    font-size: 20px;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }
                
                #ai-chat-send:hover:not(:disabled) {
                    transform: scale(1.05);
                    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
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
                    gap: 6px;
                    padding: 14px;
                }
                
                .ai-typing-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    animation: typing 1.4s infinite;
                }
                
                .ai-typing-dot:nth-child(2) {
                    animation-delay: 0.2s;
                }
                
                .ai-typing-dot:nth-child(3) {
                    animation-delay: 0.4s;
                }
                
                @keyframes typing {
                    0%, 60%, 100% {
                        opacity: 0.3;
                        transform: translateY(0);
                    }
                    30% {
                        opacity: 1;
                        transform: translateY(-12px);
                    }
                }
                
                .size-indicator {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.85);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s;
                    z-index: 10;
                    backdrop-filter: blur(10px);
                }
                
                .size-indicator.show {
                    opacity: 1;
                }
                
                @media (max-width: 768px) {
                    #ai-chat-window {
                        width: calc(100vw - 40px) !important;
                        height: calc(100vh - 120px) !important;
                        right: 20px !important;
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
                        max-width: 85%;
                        font-size: 14px;
                    }
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
                            <div style="margin-top: 12px; padding: 12px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); border-radius: 8px; font-size: 13px;">
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
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
                <div style="font-size: 17px; font-weight: 600; margin-bottom: 10px;">
                    ${selectedResponse}
                </div>
            </div>
            
            <div style="background: #e3f2fd; padding: 16px; border-radius: 12px; color: #1565c0;">
                <strong style="font-size: 15px;">💡 Exemplos de perguntas que posso responder:</strong>
                <ul style="margin: 12px 0; padding-left: 24px; line-height: 2;">
                    <li>Quantos atendimentos foram realizados hoje?</li>
                    <li>Liste os pacientes cadastrados em janeiro</li>
                    <li>Qual o total de consultas por médico este mês?</li>
                    <li>Mostre os atendimentos de urgência da última semana</li>
                    <li>Há crescimento no número de consultas este ano?</li>
                </ul>
            </div>
            
            <div style="background: #f0f8ff; padding: 12px; border-radius: 12px; margin-top: 16px; font-size: 13px; color: #0066cc;">
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
                    <div style="background:#fff8e1; padding:16px; border-radius:8px; color:#5d4037;">
                        Não consegui compreender seu pedido.
                        <div style="margin-top:12px; font-size:13px; color:#1565c0; background:#e3f2fd; padding:12px; border-radius:8px;">
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
            
            let formattedError = `<div style="color: #d32f2f; padding: 16px; background: #ffebee; border-radius: 8px; margin: 8px 0;">
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
        const authToken = localStorage.getItem('authToken');
        
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
            response += `<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <span style="font-size: 28px;">🔍</span>
                    <strong style="font-size: 18px;">Análise dos Dados</strong>
                </div>
                <div style="font-size: 15px; line-height: 1.8; white-space: pre-wrap;">${analysis}</div>
            </div>`;
        }
        
        response += `<div style="background: #f0f8ff; padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #0066cc;">
            <strong style="font-size: 14px;">📝 Sua pergunta:</strong> <span style="font-size: 14px;">${question}</span>
        </div>`;
        
        response += `<details style="background: #f8f9fa; padding: 14px; border-radius: 8px; margin-bottom: 16px; cursor: pointer; border: 1px solid #e0e0e0;">
            <summary style="font-weight: 600; color: #495057; user-select: none; outline: none; font-size: 14px;">
                <span style="margin-right: 8px;">🔍</span>Consulta SQL gerada
                <span style="font-size: 12px; color: #6c757d; margin-left: 8px;">(clique para expandir)</span>
            </summary>
            <pre style="background: #ffffff; padding: 12px; border-radius: 8px; margin-top: 12px; font-size: 13px; border: 1px solid #dee2e6; overflow-x: auto;">${sqlQuery}</pre>
        </details>`;
        
        if (!results || results.length === 0) {
            response += `<div style="background: #fff3cd; padding: 16px; border-radius: 8px; color: #856404; border: 1px solid #ffeaa7;">
                <strong>⚠️ Nenhum resultado encontrado</strong><br>
                <span style="font-size: 14px;">A consulta foi executada mas não retornou dados.</span>
            </div>`;
        } else if (results.length === 1 && Object.keys(results[0]).length === 1) {
            const value = Object.values(results[0])[0];
            const key = Object.keys(results[0])[0];
            response += `<div style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); padding: 20px; border-radius: 12px; color: #155724; text-align: center; border: 2px solid #28a745;">
                <div style="font-size: 36px; font-weight: bold; margin-bottom: 8px;">${value}</div>
                <div style="font-size: 16px; font-weight: 500;">${key}</div>
            </div>`;
        } else {
            response += `<details style="background: #f8f9fa; padding: 14px; border-radius: 8px; cursor: pointer; border: 1px solid #e0e0e0;">
                <summary style="font-weight: 600; color: #155724; user-select: none; outline: none; font-size: 14px;">
                    <span style="margin-right: 8px;">✅</span>${results.length} resultado(s) encontrado(s)
                    <span style="font-size: 12px; color: #6c757d; margin-left: 8px;">(clique para ver tabela)</span>
                </summary>
                <div style="overflow-x: auto; margin-top: 16px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: white; border-radius: 8px; overflow: hidden;">
                        <thead><tr>`;
            
            Object.keys(results[0]).forEach(key => {
                response += `<th style="padding: 12px; border: 1px solid #dee2e6; background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 100%); font-weight: 600; text-align: left; color: #495057;">${key}</th>`;
            });
            
            response += `</tr></thead><tbody>`;
            
            results.slice(0, 20).forEach((row, idx) => {
                const bgColor = idx % 2 === 0 ? 'white' : '#f8f9fa';
                response += `<tr style="background: ${bgColor};">`;
                Object.values(row).forEach(value => {
                    const displayValue = value !== null && value !== undefined ? value : '-';
                    response += `<td style="padding: 10px; border: 1px solid #dee2e6;">${displayValue}</td>`;
                });
                response += '</tr>';
            });
            
            response += `</tbody></table>`;
            
            if (results.length > 20) {
                response += `<div style="margin-top: 12px; font-size: 13px; color: #666; text-align: center; font-style: italic; padding: 8px; background: #f0f0f0; border-radius: 6px;">
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
            
            response += `<div style="margin-top: 16px; text-align: center;">
                <button 
                    id="${chartId}" 
                    style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        border: none; 
                        padding: 12px 24px; 
                        border-radius: 8px; 
                        cursor: pointer; 
                        font-size: 14px; 
                        font-weight: 600;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                        transition: all 0.2s;"
                    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.4)'"
                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)'"
                    onclick="window.generateChartVisualization('${chartId}')">
                    📊 Gerar Visualização Gráfica
                </button>
                <div id="${chartId}-container" style="margin-top: 16px;"></div>
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
            container.innerHTML = `<div style="background: #ffebee; padding: 16px; border-radius: 8px; color: #c62828; border: 1px solid #ef5350; margin-top: 12px;">
                <strong>❌ Erro</strong><br>
                <span style="font-size: 14px;">Dados não encontrados. Tente novamente.</span>
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
                <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 12px;">
                    <canvas id="${canvasId}" style="max-height: 500px;"></canvas>
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
            container.innerHTML = `<div style="background: #ffebee; padding: 16px; border-radius: 8px; color: #c62828; border: 1px solid #ef5350; margin-top: 12px;">
                <strong>❌ Erro ao gerar visualização</strong><br>
                <span style="font-size: 14px;">${error.message}</span>
            </div>`;
            button.disabled = false;
            button.innerHTML = originalText;
        }
    };
    
    // Substitua a função loadChartJS() (linha ~1493) por esta versão:

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
                top: 10px;
                right: 10px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                width: 36px;
                height: 36px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transition: all 0.2s;
            `;
            
            expandBtn.onmouseover = () => {
                expandBtn.style.transform = 'scale(1.1)';
                expandBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            };
            
            expandBtn.onmouseout = () => {
                expandBtn.style.transform = 'scale(1)';
                expandBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            };
            
            expandBtn.onclick = () => {
                const modal = document.createElement('div');
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.9);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    animation: fadeIn 0.3s;
                `;
                
                const modalContent = document.createElement('div');
                modalContent.style.cssText = `
                    background: white;
                    border-radius: 16px;
                    width: 90vw;
                    height: 85vh;
                    max-width: 1400px;
                    position: relative;
                    padding: 30px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                `;
                
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '×';
                closeBtn.title = 'Fechar';
                closeBtn.style.cssText = `
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    background: #e74c3c;
                    color: white;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10;
                    transition: all 0.2s;
                    line-height: 1;
                `;
                
                closeBtn.onmouseover = () => {
                    closeBtn.style.transform = 'scale(1.1)';
                    closeBtn.style.background = '#c0392b';
                };
                
                closeBtn.onmouseout = () => {
                    closeBtn.style.transform = 'scale(1)';
                    closeBtn.style.background = '#e74c3c';
                };
                
                closeBtn.onclick = () => modal.remove();
                
                const expandedCanvas = document.createElement('canvas');
                expandedCanvas.id = `expanded-${canvasId}`;
                expandedCanvas.style.cssText = `
                    flex: 1;
                    max-height: calc(85vh - 80px);
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
                        `"use strict"; ${chartCode}`
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
                `"use strict"; ${chartCode}`
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
            if (!document.getElementById('ai-chatbot-container')) {
                createChatbotHTML();
            }
            initializeEvents();
            
            setTimeout(() => {
                toggleChatbotVisibility();
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

})();