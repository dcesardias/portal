// Estado da aplicação
let currentTable = null;
let selectedFile = null;
let tabelas = {};

// Tabela especial: Orçamento Fluxo de Caixa Ajustado
const ORCAMENTO_FLUXO_CAIXA_TABLE = 'VW_ORCAMENTO_FLUXO_CAIXA_AJUSTADO';

// Elementos DOM
const tablesList = document.getElementById('tablesList');
const uploadArea = document.getElementById('uploadArea');

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', async () => {
    loadTables();
    setupSearch();
    setupJobsGlobalUI();
    if (window.jobsManager) {
        await window.jobsManager.init();
        // Sincroniza badges com jobs ativos depois que a lista carregar
        // (loadTables e' assincrono, entao usamos um pequeno delay seguro
        // via observador do tablesList em vez de race com loadTables).
    }
});

// Listener global de jobs: atualiza badges na sidebar, dispara toasts no
// termino e re-renderiza a barra de progresso se a tabela do job estiver
// selecionada. Tudo em um lugar so.
function setupJobsGlobalUI() {
    if (!window.jobsManager) return;

    window.jobsManager.on('*', (state) => {
        // 1) Badge na sidebar
        updateSidebarBadge(state.tableName, !window.jobsManager.TERMINAL.has(state.status));

        // 2) Atualiza barra se a tabela do job esta atualmente aberta
        if (currentTable && state.tableName === currentTable) {
            renderJobProgress(state);
        }

        // 3) Toast quando termina (success ou error) e o usuario esta em
        // outra tabela ou nem ve a tela do upload.
        if (window.jobsManager.TERMINAL.has(state.status)) {
            const onSameTable = currentTable === state.tableName;
            if (state.status === 'success') {
                if (!onSameTable) {
                    showGlobalToast(`Carga concluída: ${state.tableName} (${state.insertedRows ?? '?'} registros)`, 'success');
                }
                // Refresca contador/lastLoad da tabela na sidebar
                updateTableCount(state.tableName);
            } else if (state.status === 'error') {
                showGlobalToast(`Falha na carga de ${state.tableName}: ${state.errorMessage || state.message || 'erro desconhecido'}`, 'error');
            }
        }
    });
}

// Toast flutuante (canto superior direito) para notificar termino de jobs
// quando o usuario esta em outra tela.
function showGlobalToast(message, type) {
    let stack = document.getElementById('jobsToastStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'jobsToastStack';
        stack.style.cssText = 'position:fixed;top:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:10000;max-width:360px;';
        document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'linear-gradient(135deg,#28a745,#20c997)' : 'linear-gradient(135deg,#dc3545,#c82333)';
    toast.style.cssText = `background:${bg};color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:14px;font-weight:600;animation:adminFadeIn .3s ease-out;cursor:pointer;`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}" style="margin-right:8px;"></i>${escapeHtml(message)}`;
    toast.addEventListener('click', () => toast.remove());
    stack.appendChild(toast);
    setTimeout(() => { try { toast.remove(); } catch (_) {} }, 8000);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Atualiza badge na sidebar para tabelas com job ativo.
function updateSidebarBadge(tableName, isActive) {
    if (!tableName) return;
    const item = document.querySelector(`[data-table="${tableName}"]`);
    if (!item) return;
    let badge = item.querySelector('.table-job-badge');
    if (isActive) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'table-job-badge';
            badge.title = 'Carga em andamento';
            badge.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            item.appendChild(badge);
        }
    } else if (badge) {
        badge.remove();
    }
}

// Configurar pesquisa
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterTables(searchTerm);
    });
    
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        filterTables('');
        searchInput.focus();
    });
}

// Filtrar tabelas
function filterTables(searchTerm) {
    const tableItems = document.querySelectorAll('.table-item');
    const tableGroups = document.querySelectorAll('.table-group');
    
    tableItems.forEach(item => {
        const tableName = item.querySelector('.table-name')?.textContent.toLowerCase() || '';
        const tableDesc = item.querySelector('.table-desc')?.textContent.toLowerCase() || '';
        const matches = tableName.includes(searchTerm) || tableDesc.includes(searchTerm);
        
        item.style.display = matches ? 'flex' : 'none';
    });
    
    // Expandir grupos automaticamente se houver busca
    tableGroups.forEach(group => {
        if (searchTerm) {
            const groupContent = group.querySelector('.table-group-content');
            const visibleItems = Array.from(groupContent.querySelectorAll('.table-item'))
                .filter(item => item.style.display !== 'none');
            
            if (visibleItems.length > 0) {
                group.style.display = 'block';
                if (!group.classList.contains('expanded')) {
                    group.classList.add('expanded');
                    requestAnimationFrame(() => {
                        groupContent.style.maxHeight = (groupContent.scrollHeight + 20) + 'px';
                    });
                }
            } else {
                group.style.display = 'none';
            }
        } else {
            group.style.display = 'block';
        }
    });
}

// Carregar lista de tabelas disponíveis
async function loadTables() {
    try {
        const response = await fetch('/api/excel/tabelas');
        const data = await response.json();
        
        // Novo formato: { groups: {...}, tables: {...} }
        if (data.groups) {
            // Processar grupos e suas tabelas
            window.groups = data.groups;
            window.tables = data.tables || {};
            
            // Criar lista flat de tabelas para compatibilidade
            tabelas = {};
            Object.keys(data.groups).forEach(groupKey => {
                const group = data.groups[groupKey];
                if (group.tabelas) {
                    Object.keys(group.tabelas).forEach(tableKey => {
                        tabelas[tableKey] = group.tabelas[tableKey];
                    });
                }
            });
            
            // Adicionar tabelas sem grupo
            Object.keys(data.tables).forEach(tableKey => {
                tabelas[tableKey] = data.tables[tableKey];
            });
        } else {
            // Formato antigo (fallback)
            tabelas = data.tabelas || {};
        }
        
        renderTablesList();
        
        // Carregar contagem de registros para cada tabela
        for (const key of Object.keys(tabelas)) {
            loadTableCount(key);
        }
    } catch (error) {
        console.error('Erro ao carregar tabelas:', error);
        showAlert('Erro ao carregar lista de tabelas', 'error');
    }
}

// Carregar contagem de registros + ultima carga de uma tabela
async function loadTableCount(tableKey) {
    try {
        const response = await fetch(`/api/excel/tabelas/${tableKey}/info`);
        if (response.ok) {
            const data = await response.json();
            const item = document.querySelector(`[data-table="${tableKey}"]`);
            if (!item) return;
            const countElement = item.querySelector('.table-count');
            if (countElement && data.total_registros !== undefined) {
                countElement.textContent = formatNumber(data.total_registros) + ' registros';
                countElement.style.opacity = '1';
            }
            const lastLoadElement = item.querySelector('.table-last-load');
            if (lastLoadElement) {
                if (data.last_load_at) {
                    lastLoadElement.textContent = 'Última carga: ' + formatRelativeDate(data.last_load_at);
                    lastLoadElement.title = new Date(data.last_load_at).toLocaleString('pt-BR');
                    lastLoadElement.style.opacity = '1';
                } else {
                    lastLoadElement.textContent = 'Sem cargas anteriores';
                    lastLoadElement.style.opacity = '0.5';
                }
            }
        }
    } catch (error) {
        console.error(`Erro ao carregar info da tabela ${tableKey}:`, error);
    }
}

// Formatar número com separador de milhares
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Formata data relativa: "ha 3 min", "ha 2h", "ontem", senao dd/MM/yyyy HH:mm
function formatRelativeDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)   return 'agora mesmo';
    if (diffMin < 60)  return `há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'ontem';
    if (diffD < 7)   return `há ${diffD} dias`;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

// Renderizar lista de tabelas
function renderTablesList() {
    tablesList.innerHTML = '';
    
    // Limpar pesquisa ao renderizar
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Adicionar opção de tabela temporária primeiro
    const tempItem = createTableItem('TABELA_TEMPORARIA', {
        nome: 'Tabela Temporária',
        descricao: 'Criar nova tabela temporária',
        icone: '🆕'
    });
    tablesList.appendChild(tempItem);
    
    // Renderizar grupos do banco de dados
    if (window.groups) {
        Object.keys(window.groups).forEach(groupKey => {
            const group = window.groups[groupKey];
            if (group.tabelas && Object.keys(group.tabelas).length > 0) {
                const groupElement = createTableGroup(groupKey, {
                    nome: group.nome,
                    descricao: group.descricao,
                    icone: group.icone
                }, group.tabelas);
                tablesList.appendChild(groupElement);
            }
        });
    }
    
    // Renderizar tabelas sem grupo
    if (window.tables && Object.keys(window.tables).length > 0) {
        Object.keys(window.tables).forEach(tableKey => {
            const tableInfo = window.tables[tableKey];
            const item = createTableItem(tableKey, tableInfo);
            tablesList.appendChild(item);
        });
    }

    // Sincroniza badges com jobs ativos (caso re-hidratacao tenha terminado antes do render)
    if (window.jobsManager) {
        window.jobsManager.listActive().forEach(j => updateSidebarBadge(j.tableName, true));
    }
}

// Criar grupo de tabelas
function createTableGroup(groupKey, groupInfo, groupTables) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'table-group';
    groupDiv.dataset.group = groupKey;
    
    // Cabeçalho do grupo
    const groupHeader = document.createElement('div');
    groupHeader.className = 'table-group-header';
    groupHeader.innerHTML = `
        <span class="table-icon">${groupInfo.icone}</span>
        <div class="table-info">
            <div class="table-name">${groupInfo.nome}</div>
            <div class="table-desc">${groupInfo.descricao}</div>
        </div>
        <i class="fas fa-chevron-down group-arrow"></i>
    `;
    
    // Container das tabelas do grupo
    const groupContent = document.createElement('div');
    groupContent.className = 'table-group-content';
    
    // Adicionar tabelas ao grupo
    for (const [key, info] of Object.entries(groupTables)) {
        const item = createTableItem(key, info);
        item.classList.add('group-item');
        groupContent.appendChild(item);
    }
    
    // Toggle do grupo
    groupHeader.addEventListener('click', (e) => {
        // Se clicou em uma tabela dentro do grupo, não fazer toggle
        if (e.target.closest('.table-item')) return;
        
        const isExpanded = groupDiv.classList.contains('expanded');
        
        if (isExpanded) {
            groupContent.style.maxHeight = '0px';
            groupDiv.classList.remove('expanded');
        } else {
            groupDiv.classList.add('expanded');
            // Aguardar um frame para calcular a altura correta
            requestAnimationFrame(() => {
                // Adicionar margem extra para padding
                groupContent.style.maxHeight = (groupContent.scrollHeight + 20) + 'px';
            });
        }
    });
    
    groupDiv.appendChild(groupHeader);
    groupDiv.appendChild(groupContent);
    
    return groupDiv;
}

// Criar elemento de tabela
function createTableItem(key, info) {
    const div = document.createElement('div');
    div.className = 'table-item';
    div.dataset.table = key;
    
    const showCount = key !== 'TABELA_TEMPORARIA';
    
    div.innerHTML = `
        <span class="table-icon">${info.icone}</span>
        <div class="table-info">
            <div class="table-name">${info.nome}</div>
            <div class="table-desc">${info.descricao}</div>
            ${showCount ? '<div class="table-count" style="opacity: 0.5;">Carregando...</div>' : ''}
            ${showCount ? '<div class="table-last-load" style="opacity: 0.5;">&nbsp;</div>' : ''}
        </div>
    `;
    
    div.addEventListener('click', () => selectTable(key, info));
    
    return div;
}

// Selecionar tabela
function selectTable(key, info) {
    currentTable = key;
    selectedFile = null;
    
    // Atualizar visual da lista
    document.querySelectorAll('.table-item').forEach(item => {
        item.classList.remove('active');
    });
    const selectedItem = document.querySelector(`[data-table="${key}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
        
        // Expandir grupo se a tabela estiver dentro de um
        const parentGroup = selectedItem.closest('.table-group');
        if (parentGroup && !parentGroup.classList.contains('expanded')) {
            parentGroup.classList.add('expanded');
            const groupContent = parentGroup.querySelector('.table-group-content');
            if (groupContent) {
                requestAnimationFrame(() => {
                    groupContent.style.maxHeight = (groupContent.scrollHeight + 20) + 'px';
                });
            }
        }
    }
    
    // Renderizar área de upload
    if (key === 'TABELA_TEMPORARIA') {
        renderTempTableUpload(info);
    } else {
        renderStandardUpload(key, info);
    }

    // Se ja existe um job ativo para essa tabela, re-injeta a UI de progresso
    if (window.jobsManager) {
        const job = window.jobsManager.getJobByTable(key);
        if (job && !window.jobsManager.TERMINAL.has(job.status)) {
            renderJobProgress(job);
        }
    }
}

// Renderiza estado do job na barra de progresso da tela atual.
// Usa os elementos #progressBar / #progressFill / #progressText que ja
// existem nos templates renderizados por renderStandardUpload e
// renderTempTableUpload.
function renderJobProgress(state) {
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadBtn = document.getElementById('uploadBtn');
    if (!progressBar || !progressFill || !progressText) return;

    const isTerminal = window.jobsManager && window.jobsManager.TERMINAL.has(state.status);
    if (!isTerminal) {
        progressBar.classList.add('active');
        progressText.style.display = 'block';
        if (uploadBtn) uploadBtn.disabled = true;
    }

    const pct = typeof state.progress === 'number' ? state.progress : 0;
    progressFill.style.width = `${pct}%`;

    // Mensagem com fase + ETA + throughput quando aplicavel
    const stageLabel = labelStage(state.stage || state.status);
    const baseMsg = state.message || stageLabel || '';
    const parts = [];
    if (stageLabel) parts.push(stageLabel);
    if (typeof state.insertedRows === 'number' && typeof state.totalRows === 'number') {
        parts.push(`${formatNumber(state.insertedRows)}/${formatNumber(state.totalRows)} linhas`);
    }
    if (typeof state.throughput === 'number' && state.throughput > 0 && !isTerminal) {
        parts.push(`${Math.round(state.throughput)} linhas/s`);
    }
    if (typeof state.etaSeconds === 'number' && state.etaSeconds > 0 && !isTerminal) {
        parts.push(`ETA ${formatDuration(state.etaSeconds)}`);
    }
    progressText.textContent = parts.length > 1 ? `${parts.join(' • ')} (${pct}%)` : `${baseMsg} (${pct}%)`;
    progressText.style.color = state.status === 'error' ? '#dc3545' : (state.status === 'success' ? '#28a745' : '#0066cc');

    if (state.status === 'success') {
        // Reset suave 3s depois
        setTimeout(() => {
            if (currentTable !== state.tableName) return;
            selectedFile = null;
            const fileInfoEl = document.getElementById('fileInfo');
            if (fileInfoEl) fileInfoEl.innerHTML = '';
            progressBar.classList.remove('active');
            progressFill.style.width = '0%';
            if (progressText) progressText.style.display = 'none';
            if (uploadBtn) uploadBtn.disabled = false;
            const tn = document.getElementById('tableName');
            if (tn) tn.value = '';
        }, 3000);
    } else if (state.status === 'error') {
        if (uploadBtn) uploadBtn.disabled = false;
        showAlert('Erro no upload: ' + (state.errorMessage || state.message || 'erro desconhecido'), 'error');
    }
}

function labelStage(stage) {
    if (!stage) return '';
    switch (stage) {
        case 'queued':     return 'Na fila';
        case 'reading':    return 'Lendo arquivo';
        case 'read':       return 'Arquivo lido';
        case 'cleaning':   return 'Limpando tabela';
        case 'cleaned':    return 'Tabela limpa';
        case 'altering':   return 'Ajustando schema';
        case 'creating':   return 'Criando tabela';
        case 'inserting':  return 'Inserindo dados';
        case 'completed':
        case 'success':    return 'Concluído';
        case 'error':      return 'Erro';
        case 'running':    return 'Processando';
        default:           return stage;
    }
}

function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return s ? `${m}m${s}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h${mm}m` : `${h}h`;
}

// Renderizar upload para tabela padrão
function renderStandardUpload(key, info) {
    uploadArea.className = 'upload-area';
    const allowFullLoad = info && info.allowFullLoad !== undefined ? !!info.allowFullLoad : true;
    uploadArea.innerHTML = `
        <div class="upload-content">
            <h2><span class="icon-emoji">${info.icone}</span> <span class="title-text">${info.nome}</span></h2>
            
            <div id="alertBox"></div>
            
            <div class="info-card">
                <h3>Sobre esta tabela</h3>
                <p>${info.descricao}</p>
            </div>
            
            <div class="download-model-section">
                <button class="btn btn-download" onclick="downloadModel('${key}')">
                    <i class="fas fa-download"></i> Baixar Modelo
                </button>
            </div>
            
            <div class="form-group">
                <label><i class="fas fa-cog"></i> Tipo de Carga</label>
                <div class="btn-group-toggle">
                    <button class="btn-toggle ${allowFullLoad ? 'active' : ''}" data-value="completa" id="btnCompleta" ${allowFullLoad ? '' : 'disabled'}>
                        <i class="fas fa-sync-alt"></i> Carga Completa
                    </button>
                    <button class="btn-toggle ${allowFullLoad ? '' : 'active'}" data-value="incremental" id="btnIncremental">
                        <i class="fas fa-plus-circle"></i> Carga Incremental
                    </button>
                </div>
                <small class="hint-text" id="tipoCargaHint">${allowFullLoad ? 'Substitui todos os dados da tabela' : 'Carga completa desabilitada para esta tabela'}</small>
            </div>

            ${key === ORCAMENTO_FLUXO_CAIXA_TABLE ? `
            <div class="form-group">
                <label for="anoBase"><i class="fas fa-calendar-alt"></i> Ano base do orçamento</label>
                <input type="number" id="anoBase" placeholder="Ex: 2025" min="2000" max="2100">
                <small class="hint-text">Obrigatório para a carga de orçamento</small>
            </div>
            ` : ''}
            
            <div class="dropzone" id="dropzone">
                <div class="upload-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="upload-text">Clique para selecionar ou arraste o arquivo Excel</div>
                <div class="upload-hint">Formatos aceitos: .xlsx, .xls (Máximo: 50MB)</div>
            </div>
            
            <div id="fileInfo"></div>
            
            <div class="progress-bar" id="progressBar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="progress-text" id="progressText" style="display:none;">Processando...</div>
            
            <div class="btn-group">
                <button class="btn btn-primary" id="uploadBtn" disabled>
                    <i class="fas fa-upload"></i> Fazer Upload
                </button>
            </div>
        </div>
    `;
    
    setupDropzone();
    setupUploadButton();
    setupTipoCargaButtons();

    if (key === ORCAMENTO_FLUXO_CAIXA_TABLE) {
        const anoBaseInput = document.getElementById('anoBase');
        if (anoBaseInput) {
            anoBaseInput.addEventListener('input', updateUploadButtonState);
        }
    }
}

// Renderizar upload para tabela temporária
function renderTempTableUpload(info) {
    uploadArea.className = 'upload-area';
    uploadArea.innerHTML = `
        <div class="upload-content">
            <h2><span class="icon-emoji">${info.icone}</span> <span class="title-text">${info.nome}</span></h2>
            
            <div id="alertBox"></div>
            
            <div class="info-card">
                <h3><i class="fas fa-info-circle"></i> Sobre Tabelas Temporárias</h3>
                <p>Crie uma nova tabela no banco de dados a partir de qualquer arquivo Excel. 
                O nome será prefixado com "TEMP_" automaticamente. Ideal para testes e análises temporárias.</p>
            </div>
            
            <div class="form-group">
                <label for="tableName"><i class="fas fa-table"></i> Nome da Tabela</label>
                <input type="text" id="tableName" placeholder="Ex: DADOS_TESTE" 
                       pattern="[A-Za-z0-9_]+" maxlength="50">
            </div>
            
            <div class="dropzone" id="dropzone">
                <div class="upload-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="upload-text">Clique para selecionar ou arraste o arquivo Excel</div>
                <div class="upload-hint">Formatos aceitos: .xlsx, .xls (Máximo: 50MB)</div>
            </div>
            
            <div id="fileInfo"></div>
            
            <div class="progress-bar" id="progressBar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="progress-text" id="progressText" style="display:none;">Criando tabela e carregando dados...</div>
            
            <div class="btn-group">
                <button class="btn btn-primary" id="uploadBtn" disabled>
                    <i class="fas fa-plus-circle"></i> Criar Tabela e Carregar Dados
                </button>
            </div>
        </div>
    `;
    
    setupDropzone();
    setupUploadButton();
    
    // Validar nome da tabela
    const tableNameInput = document.getElementById('tableName');
    tableNameInput.addEventListener('input', () => {
        updateUploadButtonState();
    });
}

// Configurar dropzone
function setupDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls';
    
    dropzone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                handleFileSelect(file);
            } else {
                showAlert('Por favor, selecione um arquivo Excel (.xlsx ou .xls)', 'error');
            }
        }
    });
}

// Manipular seleção de arquivo
function handleFileSelect(file) {
    selectedFile = file;
    
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.innerHTML = `
        <div class="file-info">
            <div class="file-details">
                <div class="file-name"><i class="fas fa-file-excel"></i> ${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="remove-btn" onclick="removeFile()"><i class="fas fa-times"></i> Remover</button>
        </div>
    `;
    
    updateUploadButtonState();
}

// Remover arquivo selecionado
function removeFile() {
    selectedFile = null;
    document.getElementById('fileInfo').innerHTML = '';
    updateUploadButtonState();
}

// Atualizar estado do botão de upload
function updateUploadButtonState() {
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (currentTable === 'TABELA_TEMPORARIA') {
        const tableName = document.getElementById('tableName').value.trim();
        uploadBtn.disabled = !selectedFile || !tableName || !/^[A-Za-z0-9_]+$/.test(tableName);
    } else if (currentTable === ORCAMENTO_FLUXO_CAIXA_TABLE) {
        const anoBaseInput = document.getElementById('anoBase');
        const anoBase = anoBaseInput ? anoBaseInput.value.trim() : '';
        uploadBtn.disabled = !selectedFile || !/^[0-9]{4}$/.test(anoBase);
    } else {
        uploadBtn.disabled = !selectedFile;
    }
}

// Configurar botão de upload
function setupUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.addEventListener('click', handleUpload);
}

// Realizar upload (fluxo async com jobsManager).
// O backend responde 202+jobId; quem cuida do progresso/SSE/UI e' o
// jobsManager via listener global. Isso permite o usuario trocar de
// tabela enquanto o upload roda e voltar para ver progresso.
async function handleUpload() {
    if (!selectedFile) return;

    const uploadBtn = document.getElementById('uploadBtn');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const tableAtStart = currentTable;
    const isTempTable = (tableAtStart === 'TABELA_TEMPORARIA');

    uploadBtn.disabled = true;
    progressBar.classList.add('active');
    if (progressText) {
        progressText.style.display = 'block';
        progressText.style.color = '#0066cc';
        progressText.textContent = 'Enviando arquivo...';
    }

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        let url, effectiveTableName;
        if (isTempTable) {
            const tableName = document.getElementById('tableName').value.trim();
            formData.append('table_name', tableName);
            url = '/api/excel/upload-temp';
            effectiveTableName = tableName.startsWith('TEMP_') ? tableName : `TEMP_${tableName}`;
        } else {
            const tipoCarga = getTipoCargaSelecionado();
            formData.append('tipo_carga', tipoCarga);

            if (tableAtStart === ORCAMENTO_FLUXO_CAIXA_TABLE) {
                const anoBaseInput = document.getElementById('anoBase');
                const anoBase = anoBaseInput ? anoBaseInput.value.trim() : '';
                if (!/^[0-9]{4}$/.test(anoBase)) {
                    showAlert('Informe o ano base do orçamento (4 dígitos)', 'error');
                    progressBar.classList.remove('active');
                    if (progressText) progressText.style.display = 'none';
                    uploadBtn.disabled = false;
                    return;
                }
                formData.append('ano_base', anoBase);
            }

            url = `/api/excel/upload/${tableAtStart}`;
            effectiveTableName = tableAtStart;
        }

        const response = await fetch(url, { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({}));

        if (response.status === 409) {
            throw new Error(result.error || 'Já existe uma carga em andamento para esta tabela.');
        }
        if (!response.ok) {
            throw new Error(result.error || 'Falha ao iniciar upload');
        }

        const jobId = result.jobId || result.sessionId;
        if (!jobId) {
            throw new Error('Servidor não retornou jobId');
        }

        // Registra no jobsManager — ele abre SSE e atualiza UI via listener global
        if (window.jobsManager) {
            window.jobsManager.start({
                jobId,
                tableName: effectiveTableName,
                fileName: selectedFile.name
            });
        }

        // Limpa selecao do arquivo na tela atual (a barra continua sendo
        // controlada pelo listener global enquanto o usuario estiver na
        // mesma tabela)
        selectedFile = null;
        const fileInfoEl = document.getElementById('fileInfo');
        if (fileInfoEl) fileInfoEl.innerHTML = '';

    } catch (error) {
        console.error('Erro no upload:', error);
        showAlert('Erro no upload: ' + error.message, 'error');
        if (currentTable === tableAtStart) {
            progressBar.classList.remove('active');
            if (progressText) progressText.style.display = 'none';
            uploadBtn.disabled = false;
        }
    }
}

// Atualizar contagem + data da ultima carga de uma tabela na sidebar
async function updateTableCount(tableName) {
    try {
        const response = await fetch(`/api/excel/tabelas/${tableName}/info`);
        if (!response.ok) return;

        const data = await response.json();
        const item = document.querySelector(`[data-table="${tableName}"]`);
        if (!item) return;

        const countElement = item.querySelector('.table-count');
        if (countElement && data.total_registros !== undefined) {
            countElement.textContent = formatNumber(data.total_registros) + ' registros';
            countElement.style.opacity = '1';
            countElement.style.transition = 'all 0.3s';
            countElement.style.color = '#28a745';
            countElement.style.fontWeight = '700';
            setTimeout(() => {
                countElement.style.color = '';
                countElement.style.fontWeight = '';
            }, 2000);
        }

        const lastLoadElement = item.querySelector('.table-last-load');
        if (lastLoadElement) {
            if (data.last_load_at) {
                lastLoadElement.textContent = 'Última carga: ' + formatRelativeDate(data.last_load_at);
                lastLoadElement.title = new Date(data.last_load_at).toLocaleString('pt-BR');
                lastLoadElement.style.opacity = '1';
            } else {
                lastLoadElement.textContent = 'Sem cargas anteriores';
                lastLoadElement.style.opacity = '0.5';
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar info:', error);
    }
}

// Mostrar alerta
function showAlert(message, type) {
    const alertBox = document.getElementById('alertBox');
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    
    setTimeout(() => {
        alertBox.classList.remove('show');
    }, 5000);
}

// Formatar tamanho do arquivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Configurar botões de tipo de carga
function setupTipoCargaButtons() {
    const btnCompleta = document.getElementById('btnCompleta');
    const btnIncremental = document.getElementById('btnIncremental');
    const hintText = document.getElementById('tipoCargaHint');
    
    if (!btnCompleta || !btnIncremental) return;
    
    btnCompleta.addEventListener('click', () => {
        if (btnCompleta.disabled) return;
        btnCompleta.classList.add('active');
        btnIncremental.classList.remove('active');
        if (hintText) hintText.textContent = 'Substitui todos os dados da tabela';
    });
    
    btnIncremental.addEventListener('click', () => {
        btnIncremental.classList.add('active');
        btnCompleta.classList.remove('active');
        if (hintText) hintText.textContent = 'Adiciona aos dados existentes na tabela';
    });
}

// Obter tipo de carga selecionado
function getTipoCargaSelecionado() {
    const btnCompleta = document.getElementById('btnCompleta');
    return btnCompleta && btnCompleta.classList.contains('active') ? 'completa' : 'incremental';
}

// Download de modelo
function downloadModel(tableName) {
    showAlert('Gerando modelo...', 'info');
    
    fetch(`/api/excel/modelo/${tableName}`)
        .then(response => {
            if (!response.ok) throw new Error('Erro ao baixar modelo');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Modelo_${tableName}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showAlert('Modelo baixado com sucesso!', 'success');
        })
        .catch(error => {
            console.error('Erro ao baixar modelo:', error);
            showAlert('Erro ao baixar modelo: ' + error.message, 'error');
        });
}
