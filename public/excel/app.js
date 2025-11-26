// Estado da aplicação
let currentTable = null;
let selectedFile = null;
let tabelas = {};

// Elementos DOM
const tablesList = document.getElementById('tablesList');
const uploadArea = document.getElementById('uploadArea');

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', () => {
    loadTables();
    setupSearch();
});

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

// Carregar contagem de registros de uma tabela
async function loadTableCount(tableKey) {
    try {
        const response = await fetch(`/api/excel/tabelas/${tableKey}/info`);
        if (response.ok) {
            const data = await response.json();
            const countElement = document.querySelector(`[data-table="${tableKey}"] .table-count`);
            if (countElement && data.total_registros !== undefined) {
                countElement.textContent = formatNumber(data.total_registros) + ' registros';
                countElement.style.opacity = '1';
            }
        }
    } catch (error) {
        console.error(`Erro ao carregar contagem da tabela ${tableKey}:`, error);
    }
}

// Formatar número com separador de milhares
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
}

// Renderizar upload para tabela padrão
function renderStandardUpload(key, info) {
    uploadArea.className = 'upload-area';
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
                    <button class="btn-toggle active" data-value="completa" id="btnCompleta">
                        <i class="fas fa-sync-alt"></i> Carga Completa
                    </button>
                    <button class="btn-toggle" data-value="incremental" id="btnIncremental">
                        <i class="fas fa-plus-circle"></i> Carga Incremental
                    </button>
                </div>
                <small class="hint-text" id="tipoCargaHint">Substitui todos os dados da tabela</small>
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
    } else {
        uploadBtn.disabled = !selectedFile;
    }
}

// Configurar botão de upload
function setupUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.addEventListener('click', handleUpload);
}

// Realizar upload
async function handleUpload() {
    if (!selectedFile) return;
    
    const uploadBtn = document.getElementById('uploadBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    
    uploadBtn.disabled = true;
    progressBar.classList.add('active');
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        let url, successMessage;
        
        if (currentTable === 'TABELA_TEMPORARIA') {
            const tableName = document.getElementById('tableName').value.trim();
            formData.append('table_name', tableName);
            url = '/api/excel/upload-temp';
            successMessage = `Tabela TEMP_${tableName} criada com sucesso!`;
        } else {
            const tipoCarga = getTipoCargaSelecionado();
            formData.append('tipo_carga', tipoCarga);
            url = `/api/excel/upload/${currentTable}`;
            successMessage = `Upload concluído com sucesso!`;
        }
        
        // Mostrar progresso
        const progressText = document.getElementById('progressText');
        if (progressText) progressText.style.display = 'block';
        
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90) {
                progressFill.style.width = progress + '%';
            }
        }, 200);
        
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        
        const result = await response.json();
        
        if (response.ok) {
            const progressText = document.getElementById('progressText');
            if (progressText) {
                progressText.textContent = 'Concluído!';
                progressText.style.color = '#28a745';
            }
            
            showAlert(successMessage + ` (${result.total_inserido || result.rows_inserted} registros)`, 'success');
            
            // Reset
            setTimeout(() => {
                selectedFile = null;
                document.getElementById('fileInfo').innerHTML = '';
                progressBar.classList.remove('active');
                progressFill.style.width = '0%';
                uploadBtn.disabled = false;
                if (progressText) progressText.style.display = 'none';
                
                if (currentTable === 'TABELA_TEMPORARIA') {
                    document.getElementById('tableName').value = '';
                }
            }, 3000);
        } else {
            throw new Error(result.error || 'Erro desconhecido');
        }
        
    } catch (error) {
        console.error('Erro no upload:', error);
        showAlert('Erro no upload: ' + error.message, 'error');
        progressBar.classList.remove('active');
        const progressText = document.getElementById('progressText');
        if (progressText) progressText.style.display = 'none';
        uploadBtn.disabled = false;
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
