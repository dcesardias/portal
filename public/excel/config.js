// Configuração de URLs para integração no portal
window.EXCEL_API_URL = window.location.origin + '/api/excel';
// CORRIGIDO: WebSocket URL sem /ws no final (o código React já adiciona /ws/upload)
window.EXCEL_WS_URL = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host;

console.log('[EXCEL CONFIG] API URL:', window.EXCEL_API_URL);
console.log('[EXCEL CONFIG] WebSocket URL:', window.EXCEL_WS_URL);
