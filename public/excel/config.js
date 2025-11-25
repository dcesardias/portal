// Configuração de URLs para integração no portal
window.EXCEL_API_URL = window.location.origin + '/api/excel';
window.EXCEL_WS_URL = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/ws';

console.log('[EXCEL CONFIG] API URL:', window.EXCEL_API_URL);
console.log('[EXCEL CONFIG] WebSocket URL:', window.EXCEL_WS_URL);
