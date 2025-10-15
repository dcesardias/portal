// chatbot.js - DESIGN MELHORADO COM JANELA MAIOR

(function() {
    'use strict';
    
    // Configurações do chatbot - TAMANHOS AUMENTADOS
    const CHATBOT_CONFIG = {
        width: {
            default: 720,  // Aumentado de 480
            min: 480,      // Aumentado de 320
            max: 1200      // Aumentado de 800
        },
        height: {
            default: 700,  // Aumentado de 600
            min: 500,      // Aumentado de 400
            max: 900       // Aumentado de 800
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
        
        // Botão fullscreen
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
        
        // Redimensionamento
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
        
        // Observer para mudança de telas
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

    // [RESTO DO CÓDIGO PERMANECE IGUAL - funções isGreeting, getGreetingResponse, sendMessage, etc.]
    
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
            console.error('Erro no chatbot:', error);
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
            console.error('[Chatbot] Erro ao carregar dicionário:', error);
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
            
            // Aceitar SELECT ou CTEs (WITH)
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
        
        // CORREÇÃO: Armazenar dados em estrutura global ao invés de no HTML
        if (results && results.length > 0) {
            const chartId = `chart-${Date.now()}`;
            
            // Armazenar dados globalmente
            if (!window.chartDataStore) {
                window.chartDataStore = {};
            }
            window.chartDataStore[chartId] = {
                question: question,
                sqlQuery: sqlQuery,
                results: results,
                analysis: analysis
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

    window.generateChartVisualization = async function(chartId) {
        const button = document.getElementById(chartId);
        const container = document.getElementById(`${chartId}-container`);
        
        if (!button || !container) return;
        
        // Recuperar dados da estrutura global
        const payload = window.chartDataStore?.[chartId];
        if (!payload) {
            container.innerHTML = `<div style="background: #ffebee; padding: 16px; border-radius: 8px; color: #c62828; border: 1px solid #ef5350; margin-top: 12px;">
                <strong>❌ Erro</strong><br>
                <span style="font-size: 14px;">Dados não encontrados. Por favor, tente novamente.</span>
            </div>`;
            return;
        }
        
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '⏳ Analisando dados...';
        
        try {
            const response = await fetch('/api/chat/generate-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: payload.question,
                    sqlQuery: payload.sqlQuery,
                    results: payload.results,
                    analysis: payload.analysis
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.suitable) {
                container.innerHTML = `<div style="background: #fff3cd; padding: 16px; border-radius: 8px; color: #856404; border: 1px solid #ffeaa7; margin-top: 12px;">
                    <strong>📊 Visualização não recomendada</strong><br>
                    <span style="font-size: 14px;">${data.reasoning}</span>
                </div>`;
                button.style.display = 'none';
                return;
            }
            
            const canvasId = `canvas-${chartId}`;
            container.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 12px;">
                    <h4 style="margin: 0 0 16px 0; color: #333; font-size: 16px;">${data.title}</h4>
                    <canvas id="${canvasId}" style="max-height: 400px;"></canvas>
                    <div style="margin-top: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 13px; color: #666; font-style: italic; border-left: 3px solid #667eea;">
                        <strong>💡 Interpretação:</strong> ${data.reasoning}
                    </div>
                </div>`;
            
            if (typeof Chart === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
                script.onload = () => renderChart(canvasId, data);
                document.head.appendChild(script);
            } else {
                renderChart(canvasId, data);
            }
            
            button.style.display = 'none';
            
            // Limpar dados após uso
            delete window.chartDataStore[chartId];
            
        } catch (error) {
            console.error('[CHART] Erro:', error);
            container.innerHTML = `<div style="background: #ffebee; padding: 16px; border-radius: 8px; color: #c62828; border: 1px solid #ef5350; margin-top: 12px;">
                <strong>❌ Erro ao gerar visualização</strong><br>
                <span style="font-size: 14px;">${error.message}</span>
            </div>`;
            button.disabled = false;
            button.innerHTML = originalText;
        }
    };

    function renderChart(canvasId, chartData) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        console.log('[CHART] ========== INÍCIO RENDERIZAÇÃO ==========');
        console.log('[CHART] chartData completo:', chartData);
        console.log('[CHART] xColumn:', chartData.xColumn);
        console.log('[CHART] yColumn:', chartData.yColumn);
        console.log('[CHART] Primeiros 3 registros de data:', chartData.data.slice(0, 3));
        
        const useHorizontalBar = chartData.type === 'bar' && chartData.data.length > 8;
        const actualChartType = useHorizontalBar ? 'bar' : chartData.type;
        
        console.log('[CHART] Renderizando gráfico:', {
            type: actualChartType,
            horizontal: useHorizontalBar,
            xColumn: chartData.xColumn,
            yColumn: chartData.yColumn,
            dataCount: chartData.data.length,
            showVariation: chartData.showVariation
        });
        
        function formatIfDate(value) {
            if (!value) return 'N/A';
            
            const str = String(value).trim();
            
            if (/^\d{4}-\d{2}$/.test(str)) {
                const [year, month] = str.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                return date.toLocaleDateString('pt-BR', { 
                    month: 'short', 
                    year: '2-digit' 
                }).replace('.', '');
            }
            
            if (/^\d{6}$/.test(str)) {
                const year = str.substring(0, 4);
                const month = str.substring(4, 6);
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                return date.toLocaleDateString('pt-BR', { 
                    month: 'short', 
                    year: '2-digit' 
                }).replace('.', '');
            }
            
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
                try {
                    const date = new Date(str);
                    if (!isNaN(date.getTime())) {
                        if (date.getDate() === 1) {
                            return date.toLocaleDateString('pt-BR', { 
                                month: 'short', 
                                year: '2-digit' 
                            }).replace('.', '');
                        }
                        return date.toLocaleDateString('pt-BR', { 
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                        }).replace(/\./g, '');
                    }
                } catch (e) {}
            }
            
            return str;
        }
        
        const rawLabels = chartData.data.map(row => {
            const value = row[chartData.xColumn];
            console.log('[CHART] Processando label:', { xColumn: chartData.xColumn, value: value, row: row });
            return value;
        });
        
        console.log('[CHART] ===== RAW LABELS =====');
        console.log('[CHART] Total de labels:', rawLabels.length);
        console.log('[CHART] Labels brutos completos:', rawLabels);
        console.log('[CHART] Tipos dos labels:', rawLabels.map(l => typeof l));
        
        const allAreDates = rawLabels.every(val => {
            const str = String(val);
            return /^\d{4}-\d{2}(-\d{2})?$/.test(str) || /^\d{6}$/.test(str);
        });
        
        console.log('[CHART] Todos são datas?', allAreDates);
        
        const labels = rawLabels.map(value => {
            if (allAreDates) {
                return formatIfDate(value);
            }
            
            const str = value !== null && value !== undefined ? String(value) : 'N/A';
            
            if (useHorizontalBar) {
                return str.length > 50 ? str.substring(0, 47) + '...' : str;
            } else {
                return str.length > 30 ? str.substring(0, 27) + '...' : str;
            }
        });
        
        console.log('[CHART] ===== LABELS FINAIS =====');
        console.log('[CHART] Labels formatados completos:', labels);
        
        const isPieType = ['pie', 'doughnut'].includes(chartData.type);
        const isLineChart = chartData.type === 'line';
        const isBarChart = chartData.type === 'bar';
        
        const isMultiSeries = chartData.isMultiSeries && Array.isArray(chartData.yColumn);
        let datasets = [];
        
        if (isMultiSeries) {
            console.log('[CHART] Criando múltiplos datasets para:', chartData.yColumn);
            
            const seriesColors = [
                { bg: 'rgba(102, 126, 234, 0.2)', border: 'rgba(102, 126, 234, 1)' },
                { bg: 'rgba(244, 67, 54, 0.2)', border: 'rgba(244, 67, 54, 1)' },
                { bg: 'rgba(76, 175, 80, 0.2)', border: 'rgba(76, 175, 80, 1)' },
                { bg: 'rgba(255, 152, 0, 0.2)', border: 'rgba(255, 152, 0, 1)' }
            ];
            
            chartData.yColumn.forEach((col, idx) => {
                const values = chartData.data.map(row => formatChartValue(row[col]));
                const color = seriesColors[idx % seriesColors.length];
                
                datasets.push({
                    label: col,
                    data: values,
                    backgroundColor: color.bg,
                    borderColor: color.border,
                    borderWidth: 3,
                    tension: isLineChart ? 0.4 : 0,
                    fill: isLineChart,
                    pointBackgroundColor: color.border,
                    pointBorderColor: '#fff',
                    pointHoverRadius: 6,
                    pointRadius: 4
                });
            });
        } else {
            const values = chartData.data.map(row => formatChartValue(row[chartData.yColumn]));
            
            const gradientColors = {
                bar: (ctx) => {
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.9)');
                    gradient.addColorStop(1, 'rgba(118, 75, 162, 0.7)');
                    return gradient;
                },
                line: 'rgba(118, 75, 162, 0.2)'
            };
            
            datasets = [{
                label: chartData.yColumn,
                data: values,
                backgroundColor: isPieType 
                    ? generateColorArray(values.length)
                    : (isBarChart ? gradientColors.bar(ctx.getContext('2d')) : gradientColors.line),
                borderColor: isLineChart 
                    ? 'rgba(118, 75, 162, 1)' 
                    : (isPieType ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.8)'),
                borderWidth: isLineChart ? 3 : 2,
                tension: isLineChart ? 0.4 : 0,
                fill: isLineChart,
                pointBackgroundColor: isLineChart ? 'rgba(118, 75, 162, 1)' : undefined,
                pointBorderColor: isLineChart ? '#fff' : undefined,
                pointHoverRadius: isLineChart ? 6 : undefined,
                pointRadius: isLineChart ? 4 : undefined
            }];
        }
        
        console.log('[CHART] ===== DATASETS =====');
        console.log('[CHART] Número de séries:', datasets.length);
        datasets.forEach((ds, i) => console.log(`[CHART] Série ${i}: ${ds.label}, ${ds.data.length} pontos`));
        
        const values = datasets[0].data;
        
        let variations = [];
        if (isBarChart && chartData.showVariation && values.length >= 2 && !isMultiSeries) {
            for (let i = 1; i < values.length; i++) {
                const diff = values[i] - values[i-1];
                const percent = values[i-1] !== 0 ? ((diff / values[i-1]) * 100) : 0;
                variations.push({ diff, percent });
            }
        }
        
        let minIndex = -1, maxIndex = -1, minValue = Infinity, maxValue = -Infinity;
        if (isLineChart && values.length > 0 && !isMultiSeries) {
            values.forEach((val, idx) => {
                if (val < minValue) { minValue = val; minIndex = idx; }
                if (val > maxValue) { maxValue = val; maxIndex = idx; }
            });
        }
        
        const minMaxPlugin = {
            id: 'minMaxIndicator',
            afterDatasetsDraw: (chart) => {
                if (!isLineChart || minIndex === -1 || maxIndex === -1) return;
                
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                
                const drawIndicator = (index, value, label, color) => {
                    const point = meta.data[index];
                    if (!point) return;
                    
                    const x = point.x;
                    const y = point.y;
                    
                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(x, y, 8, 0, 2 * Math.PI);
                    ctx.stroke();
                    
                    const labelY = label === 'MIN' ? y + 25 : y - 25;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, labelY);
                    ctx.stroke();
                    
                    const text = `${label}: ${value.toLocaleString('pt-BR')}`;
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = color;
                    
                    const textWidth = ctx.measureText(text).width;
                    const padding = 6;
                    const boxY = label === 'MIN' ? labelY : labelY - 16;
                    
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.fillRect(x - textWidth/2 - padding, boxY, textWidth + padding*2, 18);
                    
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x - textWidth/2 - padding, boxY, textWidth + padding*2, 18);
                    
                    ctx.fillStyle = color;
                    ctx.fillText(text, x, boxY + 13);
                    ctx.restore();
                };
                
                drawIndicator(minIndex, minValue, 'MIN', '#e74c3c');
                drawIndicator(maxIndex, maxValue, 'MAX', '#27ae60');
            }
        };
        
        const variationPlugin = {
            id: 'variationIndicator',
            afterDatasetsDraw: (chart) => {
                if (!isBarChart || !chartData.showVariation || variations.length === 0) return;
                
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                
                variations.forEach((variation, idx) => {
                    const bar1 = meta.data[idx];
                    const bar2 = meta.data[idx + 1];
                    
                    if (!bar1 || !bar2) return;
                    
                    const x1 = bar1.x;
                    const y1 = bar1.y;
                    const x2 = bar2.x;
                    const y2 = bar2.y;
                    
                    const midX = (x1 + x2) / 2;
                    const topY = Math.min(y1, y2) - 30;
                    
                    const isPositive = variation.diff > 0;
                    const color = isPositive ? '#27ae60' : '#e74c3c';
                    const arrow = isPositive ? '▲' : '▼';
                    
                    ctx.save();
                    
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 3]);
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(midX, topY + 10);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    const diffText = `${arrow} ${Math.abs(variation.diff).toLocaleString('pt-BR')}`;
                    const percentText = `(${variation.percent >= 0 ? '+' : ''}${variation.percent.toFixed(1)}%)`;
                    
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    
                    const diffWidth = ctx.measureText(diffText).width;
                    const percentWidth = ctx.measureText(percentText).width;
                    const maxWidth = Math.max(diffWidth, percentWidth);
                    const padding = 8;
                    
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.fillRect(midX - maxWidth/2 - padding, topY - 10, maxWidth + padding*2, 30);
                    
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(midX - maxWidth/2 - padding, topY - 10, maxWidth + padding*2, 30);
                    
                    ctx.fillStyle = color;
                    ctx.fillText(diffText, midX, topY + 3);
                    ctx.font = '10px Arial';
                    ctx.fillText(percentText, midX, topY + 15);
                    
                    ctx.restore();
                });
            }
        };
        
        const total = isPieType ? values.reduce((a, b) => a + b, 0) : 0;
        
        const config = {
            type: actualChartType,
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                indexAxis: useHorizontalBar ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: true,
                layout: {
                    padding: {
                        top: (isLineChart || (isBarChart && chartData.showVariation)) ? 50 : 10,
                        bottom: isLineChart ? 40 : 10,
                        left: 10,
                        right: 10
                    }
                },
                plugins: {
                    legend: {
                        display: isPieType || isMultiSeries,
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 12 },
                            usePointStyle: true,
                            generateLabels: isPieType ? (chart) => {
                                const data = chart.data;
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const percent = ((value / total) * 100).toFixed(1);
                                    return {
                                        text: `${label}: ${value.toLocaleString('pt-BR')} (${percent}%)`,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    };
                                });
                            } : undefined
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                                
                                if (isPieType) {
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${label}: ${value.toLocaleString('pt-BR')} (${percentage}%)`;
                                }
                                
                                return `${label}: ${value.toLocaleString('pt-BR')}`;
                            }
                        }
                    },
                    datalabels: isPieType ? {
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            size: 14
                        },
                        formatter: (value, context) => {
                            const percent = ((value / total) * 100).toFixed(1);
                            return percent > 5 ? `${percent}%` : '';
                        }
                    } : undefined
                },
                scales: !isPieType ? (useHorizontalBar ? {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            font: { size: 11 },
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                                return Number.isInteger(value) ? value : value.toFixed(1);
                            }
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 10 },
                            autoSkip: false
                        }
                    }
                } : {
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 10 },
                            autoSkip: true,
                            maxTicksLimit: 30
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            font: { size: 11 },
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                                return Number.isInteger(value) ? value : value.toFixed(1);
                            }
                        }
                    }
                }) : {}
            },
            plugins: [
                ...(isLineChart && !isMultiSeries ? [minMaxPlugin] : []),
                ...(isBarChart && chartData.showVariation ? [variationPlugin] : [])
            ]
        };
        
        new Chart(ctx, config);
    }

    function generateColorArray(count) {
        const baseColors = [
            'rgba(102, 126, 234, 0.8)',
            'rgba(118, 75, 162, 0.8)',
            'rgba(76, 175, 80, 0.8)',
            'rgba(255, 152, 0, 0.8)',
            'rgba(244, 67, 54, 0.8)',
            'rgba(33, 150, 243, 0.8)',
            'rgba(156, 39, 176, 0.8)',
            'rgba(0, 188, 212, 0.8)',
            'rgba(255, 235, 59, 0.8)',
            'rgba(121, 85, 72, 0.8)'
        ];
        
        const colors = [];
        for (let i = 0; i < count; i++) {
            colors.push(baseColors[i % baseColors.length]);
        }
        return colors;
    }
    
    // Carregar Chart.js com plugin de labels
    function preloadChartJS() {
        if (typeof Chart === 'undefined') {
            // Chart.js principal
            const chartScript = document.createElement('script');
            chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            chartScript.async = true;
            
            // Plugin de datalabels para pizza/rosca
            chartScript.onload = () => {
                const pluginScript = document.createElement('script');
                pluginScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js';
                pluginScript.async = true;
                document.head.appendChild(pluginScript);
            };
            
            document.head.appendChild(chartScript);
        }
    }

    // Formatar valores para exibição no gráfico
    function formatChartValue(value) {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    // Formatar labels para melhor legibilidade
    
    // Melhorar função renderChart com formatação
        
    function initChatbot() {
        try {
            if (!document.getElementById('ai-chatbot-container')) {
                createChatbotHTML();
            }
            initializeEvents();
            preloadChartJS();
            
            setTimeout(() => {
                toggleChatbotVisibility();
            }, 1000);
            
        } catch (e) {
            console.error('Erro ao inicializar chatbot:', e);
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