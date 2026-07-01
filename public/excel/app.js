// Estado da aplicação
let currentTable = null;
let selectedFile = null;
let tabelas = {};

const ORCAMENTO_FLUXO_CAIXA_TABLE = 'VW_ORCAMENTO_FLUXO_CAIXA_AJUSTADO';

const tablesList = document.getElementById('tablesList');
const uploadArea = document.getElementById('uploadArea');

document.addEventListener('DOMContentLoaded', async () => {
    loadTables();
    setupSearch();
    setupJobsGlobalUI();
    if (window.jobsManager) {
        await window.jobsManager.init();
    }
});

// Listener global: atualiza badge na sidebar, progresso e toasts
function setupJobsGlobalUI() {
    if (!window.jobsManager) return;

    window.jobsManager.on('*', (state) => {
        updateSidebarBadge(state.tableName, !window.jobsManager.TERMINAL.has(state.status));

        if (currentTable && state.tableName === currentTable) {
            renderJobProgress(state);
        }

        if (window.jobsManager.TERMINAL.has(state.status)) {
            const onSameTable = currentTable === state.tableName;
            if (state.status === 'success') {
                if (!onSameTable) {
                    showGlobalToast(`Carga concluída: ${state.tableName} (${state.insertedRows ?? '?'} registros)`, 'success');
                }
                updateTableCount(state.tableName);
            } else if (state.status === 'error') {
                showGlobalToast(`Falha na carga de ${state.tableName}: ${state.errorMessage || state.message || 'erro desconhecido'}`, 'error');
            }
        }
    });
}

function showGlobalToast(message, type) {
    let stack = document.getElementById('jobsToastStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'jobsToastStack';
        stack.style.cssText = 'position:fixed;top:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:10000;max-width:360px;';
        document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    const bg = type === 'success' ? '#166534' : '#991b1b';
    toast.style.cssText = `background:${bg};color:#fff;padding:11px 14px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.22);font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:inherit;`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i><span>${escapeHtml(message)}</span>`;
    toast.addEventListener('click', () => toast.remove());
    stack.appendChild(toast);
    setTimeout(() => { try { toast.remove(); } catch (_) {} }, 8000);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateSidebarBadge(tableName, isActive) {
    if (!tableName) return;
    const item = document.querySelector(`[data-table="${tableName}"]`);
    if (!item) return;
    let badge = item.querySelector('.sc-item-dot');
    if (isActive) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'sc-item-dot';
            badge.title = 'Carga em andamento';
            item.appendChild(badge);
        }
    } else if (badge) {
        badge.remove();
    }
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    searchInput.addEventListener('input', e => filterTables(e.target.value.toLowerCase()));
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        filterTables('');
        searchInput.focus();
    });
}

function filterTables(term) {
    document.querySelectorAll('.sc-item').forEach(item => {
        const nm   = item.querySelector('.sc-item-nm')?.textContent.toLowerCase() || '';
        const desc = (item.dataset.desc || '').toLowerCase();
        item.style.display = (!term || nm.includes(term) || desc.includes(term)) ? 'flex' : 'none';
    });

    document.querySelectorAll('.sc-group').forEach(group => {
        if (term) {
            const items = group.querySelector('.sc-group-items');
            const vis = items
                ? Array.from(items.querySelectorAll('.sc-item')).filter(i => i.style.display !== 'none')
                : [];
            if (vis.length > 0) {
                group.style.display = 'block';
                if (!group.classList.contains('open')) {
                    group.classList.add('open');
                    requestAnimationFrame(() => {
                        if (items) items.style.maxHeight = (items.scrollHeight + 20) + 'px';
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

async function loadTables() {
    try {
        const response = await fetch('/api/excel/tabelas');
        const data = await response.json();

        if (data.groups) {
            window.groups = data.groups;
            window.tables = data.tables || {};
            tabelas = {};
            Object.keys(data.groups).forEach(gk => {
                const g = data.groups[gk];
                if (g.tabelas) Object.keys(g.tabelas).forEach(tk => { tabelas[tk] = g.tabelas[tk]; });
            });
            Object.keys(data.tables).forEach(tk => { tabelas[tk] = data.tables[tk]; });
        } else {
            tabelas = data.tabelas || {};
        }

        renderTablesList();
        for (const key of Object.keys(tabelas)) loadTableCount(key);
    } catch (error) {
        console.error('Erro ao carregar tabelas:', error);
    }
}

async function loadTableCount(tableKey) {
    const item = document.querySelector(`[data-table="${tableKey}"]`);
    const meta = item?.querySelector('.sc-item-meta');
    const fallback = item?.dataset.desc || '';

    try {
        const r = await fetch(`/api/excel/tabelas/${tableKey}/info`);
        if (!r.ok) {
            // Banco fonte indisponível (503) ou tabela não encontrada (404)
            if (meta) meta.textContent = fallback;
            return;
        }
        const data = await r.json();
        if (!meta) return;
        if (data.total_registros != null) {
            const count = formatNumber(data.total_registros);
            const last  = data.last_load_at ? formatRelativeDate(data.last_load_at) : null;
            meta.textContent = last ? `${count} registros · ${last}` : `${count} registros`;
            if (data.last_load_at) meta.title = new Date(data.last_load_at).toLocaleString('pt-BR');
        } else {
            meta.textContent = fallback;
        }
    } catch (err) {
        console.error(`loadTableCount(${tableKey}):`, err);
        if (meta) meta.textContent = fallback;
    }
}

function formatNumber(num) {
    if (num == null) return '0';
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatRelativeDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1)   return 'agora mesmo';
    if (diffMin < 60)  return `há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'ontem';
    if (diffD < 7)   return `há ${diffD} dias`;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

function renderTablesList() {
    tablesList.innerHTML = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    // Tabela temporária sempre no topo
    tablesList.appendChild(createTableItem('TABELA_TEMPORARIA', {
        nome: 'Tabela Temporária',
        descricao: 'Criar nova tabela temporária',
        icone: '🆕'
    }));

    if (window.groups) {
        Object.keys(window.groups).forEach(gk => {
            const g = window.groups[gk];
            if (g.tabelas && Object.keys(g.tabelas).length > 0) {
                tablesList.appendChild(createTableGroup(gk, {
                    nome: g.nome,
                    descricao: g.descricao,
                    icone: g.icone
                }, g.tabelas));
            }
        });
    }

    if (window.tables) {
        Object.keys(window.tables).forEach(tk => {
            tablesList.appendChild(createTableItem(tk, window.tables[tk]));
        });
    }

    if (window.jobsManager) {
        window.jobsManager.listActive().forEach(j => updateSidebarBadge(j.tableName, true));
    }
}

function createTableGroup(groupKey, groupInfo, groupTables) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'sc-group';
    groupDiv.dataset.group = groupKey;

    const hdr = document.createElement('div');
    hdr.className = 'sc-group-hdr';
    hdr.innerHTML = `
        <span class="sc-group-glyph">${groupInfo.icone || '📁'}</span>
        <div class="sc-group-txt">
            <div class="sc-group-nm">${groupInfo.nome}</div>
            <div class="sc-group-dsc">${groupInfo.descricao || ''}</div>
        </div>
        <i class="fas fa-chevron-right sc-group-chv"></i>
    `;

    const items = document.createElement('div');
    items.className = 'sc-group-items';

    for (const [key, info] of Object.entries(groupTables)) {
        items.appendChild(createTableItem(key, info));
    }

    hdr.addEventListener('click', e => {
        if (e.target.closest('.sc-item')) return;
        const isOpen = groupDiv.classList.contains('open');
        if (isOpen) {
            items.style.maxHeight = '0px';
            groupDiv.classList.remove('open');
        } else {
            groupDiv.classList.add('open');
            requestAnimationFrame(() => {
                items.style.maxHeight = (items.scrollHeight + 20) + 'px';
            });
        }
    });

    groupDiv.appendChild(hdr);
    groupDiv.appendChild(items);
    return groupDiv;
}

function createTableItem(key, info) {
    const div = document.createElement('div');
    div.className = 'sc-item';
    div.dataset.table = key;
    div.dataset.desc = info.descricao || '';

    const isTempKey = (key === 'TABELA_TEMPORARIA');
    div.innerHTML = `
        <span class="sc-item-glyph">${info.icone || '📋'}</span>
        <div class="sc-item-info">
            <div class="sc-item-nm">${info.nome}</div>
            <div class="sc-item-meta">${isTempKey ? (info.descricao || '') : 'Carregando...'}</div>
        </div>
    `;
    div.addEventListener('click', () => selectTable(key, info));
    return div;
}

function selectTable(key, info) {
    currentTable = key;
    selectedFile = null;

    document.querySelectorAll('.sc-item').forEach(i => i.classList.remove('active'));
    const selected = document.querySelector(`[data-table="${key}"]`);
    if (selected) {
        selected.classList.add('active');
        const parentGroup = selected.closest('.sc-group');
        if (parentGroup && !parentGroup.classList.contains('open')) {
            parentGroup.classList.add('open');
            const items = parentGroup.querySelector('.sc-group-items');
            if (items) requestAnimationFrame(() => { items.style.maxHeight = (items.scrollHeight + 20) + 'px'; });
        }
    }

    if (key === 'TABELA_TEMPORARIA') {
        renderTempTableUpload(info);
    } else {
        renderStandardUpload(key, info);
    }

    if (window.jobsManager) {
        const job = window.jobsManager.getJobByTable(key);
        if (job && !window.jobsManager.TERMINAL.has(job.status)) {
            renderJobProgress(job);
        }
    }
}

function renderStandardUpload(key, info) {
    const allowFullLoad = info && info.allowFullLoad !== undefined ? !!info.allowFullLoad : true;

    uploadArea.innerHTML = `
        <div class="sc-panel">
            <div id="alertBox" class="sc-alert"></div>

            <div class="sc-panel-hdr">
                <div class="sc-panel-glyph">${info.icone}</div>
                <div class="sc-panel-text">
                    <div class="sc-panel-title">${info.nome}</div>
                    <div class="sc-panel-desc">${info.descricao}</div>
                </div>
                <div class="sc-panel-stats">
                    <div class="sc-stat-val" id="statCount">—</div>
                    <div class="sc-stat-lbl">Registros</div>
                </div>
            </div>

            <div class="sc-section">
                <div class="sc-section-hd">
                    <span class="sc-lbl">Tipo de carga</span>
                    <button class="sc-btn-ghost" onclick="downloadModel('${key}')">
                        <i class="fas fa-download"></i> Baixar modelo
                    </button>
                </div>
                <div class="sc-load-grid">
                    <div class="sc-load-opt ${allowFullLoad ? 'sc-sel' : 'sc-load-disabled'}" data-value="completa" id="btnCompleta">
                        <div class="sc-load-row">
                            <div class="sc-radio"><div class="sc-radio-dot"></div></div>
                            <span class="sc-load-nm">Carga Completa</span>
                        </div>
                        <div class="sc-load-desc">Apaga todos os dados existentes e insere os novos</div>
                        <div class="sc-warn-chip"><i class="fas fa-exclamation-triangle"></i> Destrói dados atuais</div>
                    </div>
                    <div class="sc-load-opt ${!allowFullLoad ? 'sc-sel' : ''}" data-value="incremental" id="btnIncremental">
                        <div class="sc-load-row">
                            <div class="sc-radio"><div class="sc-radio-dot"></div></div>
                            <span class="sc-load-nm">Incremental</span>
                        </div>
                        <div class="sc-load-desc">Adiciona os novos registros sem apagar os existentes</div>
                    </div>
                </div>
            </div>

            ${key === ORCAMENTO_FLUXO_CAIXA_TABLE ? `
            <div class="sc-section">
                <div class="sc-section-hd"><span class="sc-lbl">Ano base do orçamento</span></div>
                <input type="number" id="anoBase" class="sc-input" placeholder="Ex: 2025" min="2000" max="2100" style="max-width:180px">
                <div class="sc-input-hint">Obrigatório para carga de orçamento/fluxo de caixa</div>
            </div>
            ` : ''}

            <div class="sc-section">
                <div class="sc-section-hd"><span class="sc-lbl">Arquivo Excel</span></div>
                <div class="sc-dz" id="dropzone">
                    <div id="dz-idle">
                        <div class="sc-dz-idle-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                        <div class="sc-dz-idle-title">Clique ou arraste o arquivo aqui</div>
                        <div class="sc-dz-idle-hint">.xlsx ou .xls · máx. 50 MB</div>
                    </div>
                    <div id="dz-file" class="sc-dz-file-row" style="display:none">
                        <i class="fas fa-file-excel sc-dz-file-ico"></i>
                        <div class="sc-dz-file-info">
                            <div class="sc-dz-file-nm" id="dzFileName">—</div>
                            <div class="sc-dz-file-sz" id="dzFileSize">—</div>
                        </div>
                        <button class="sc-dz-remove" onclick="event.stopPropagation(); removeFile()">
                            <i class="fas fa-times"></i> Remover
                        </button>
                    </div>
                </div>
            </div>

            <div class="sc-prog" id="progressBar">
                <div class="sc-prog-hd">
                    <div class="sc-prog-stage" id="progStage">
                        <div class="sc-prog-spin"></div>
                        <span id="progStageText">Processando...</span>
                    </div>
                    <div class="sc-prog-pct" id="progressText">0%</div>
                </div>
                <div class="sc-prog-bar">
                    <div class="sc-prog-fill" id="progressFill"></div>
                </div>
                <div class="sc-prog-meta" id="progMeta"></div>
            </div>

            <div class="sc-actions">
                <button class="sc-btn-up" id="uploadBtn" disabled>
                    <i class="fas fa-upload"></i> Fazer Upload
                </button>
            </div>
        </div>
    `;

    setupDropzone();
    setupUploadButton();
    setupTipoCargaButtons();
    loadPanelStats(key);

    if (key === ORCAMENTO_FLUXO_CAIXA_TABLE) {
        const anoBaseInput = document.getElementById('anoBase');
        if (anoBaseInput) anoBaseInput.addEventListener('input', updateUploadButtonState);
    }
}

function renderTempTableUpload(info) {
    uploadArea.innerHTML = `
        <div class="sc-panel">
            <div id="alertBox" class="sc-alert"></div>

            <div class="sc-panel-hdr">
                <div class="sc-panel-glyph">${info.icone}</div>
                <div class="sc-panel-text">
                    <div class="sc-panel-title">${info.nome}</div>
                    <div class="sc-panel-desc">Crie uma tabela temporária no banco a partir de qualquer planilha. O prefixo <strong>TEMP_</strong> é adicionado automaticamente.</div>
                </div>
            </div>

            <div class="sc-section">
                <div class="sc-section-hd"><span class="sc-lbl">Nome da tabela</span></div>
                <div class="sc-prefix-row">
                    <span class="sc-prefix-tag">TEMP_</span>
                    <input type="text" id="tableName" class="sc-input" placeholder="NOME_DA_TABELA"
                           pattern="[A-Za-z0-9_]+" maxlength="50">
                </div>
                <div class="sc-input-hint">Apenas letras, números e underscore (_)</div>
            </div>

            <div class="sc-section">
                <div class="sc-section-hd"><span class="sc-lbl">Arquivo Excel</span></div>
                <div class="sc-dz" id="dropzone">
                    <div id="dz-idle">
                        <div class="sc-dz-idle-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                        <div class="sc-dz-idle-title">Clique ou arraste o arquivo aqui</div>
                        <div class="sc-dz-idle-hint">.xlsx ou .xls · máx. 50 MB</div>
                    </div>
                    <div id="dz-file" class="sc-dz-file-row" style="display:none">
                        <i class="fas fa-file-excel sc-dz-file-ico"></i>
                        <div class="sc-dz-file-info">
                            <div class="sc-dz-file-nm" id="dzFileName">—</div>
                            <div class="sc-dz-file-sz" id="dzFileSize">—</div>
                        </div>
                        <button class="sc-dz-remove" onclick="event.stopPropagation(); removeFile()">
                            <i class="fas fa-times"></i> Remover
                        </button>
                    </div>
                </div>
            </div>

            <div class="sc-prog" id="progressBar">
                <div class="sc-prog-hd">
                    <div class="sc-prog-stage" id="progStage">
                        <div class="sc-prog-spin"></div>
                        <span id="progStageText">Processando...</span>
                    </div>
                    <div class="sc-prog-pct" id="progressText">0%</div>
                </div>
                <div class="sc-prog-bar">
                    <div class="sc-prog-fill" id="progressFill"></div>
                </div>
                <div class="sc-prog-meta" id="progMeta"></div>
            </div>

            <div class="sc-actions">
                <button class="sc-btn-up" id="uploadBtn" disabled>
                    <i class="fas fa-plus-circle"></i> Criar Tabela
                </button>
            </div>
        </div>
    `;

    setupDropzone();
    setupUploadButton();

    const tableNameInput = document.getElementById('tableName');
    if (tableNameInput) tableNameInput.addEventListener('input', updateUploadButtonState);
}

async function loadPanelStats(tableKey) {
    if (!tableKey || tableKey === 'TABELA_TEMPORARIA') return;
    try {
        const r = await fetch(`/api/excel/tabelas/${tableKey}/info`);
        if (!r.ok) return;
        const data = await r.json();
        const statCount = document.getElementById('statCount');
        if (statCount && data.total_registros !== undefined) {
            statCount.textContent = formatNumber(data.total_registros);
        }
    } catch (_) {}
}

// Renderiza estado do job na área de progresso.
// Chamado tanto pelo listener global quanto ao re-abrir uma tabela
// com job em andamento.
function renderJobProgress(state) {
    const progressBar   = document.getElementById('progressBar');
    const progressFill  = document.getElementById('progressFill');
    const progressText  = document.getElementById('progressText');
    const progStageText = document.getElementById('progStageText');
    const progStage     = document.getElementById('progStage');
    const progMeta      = document.getElementById('progMeta');
    const uploadBtn     = document.getElementById('uploadBtn');
    if (!progressBar || !progressFill || !progressText) return;

    const isTerminal = window.jobsManager && window.jobsManager.TERMINAL.has(state.status);

    if (!isTerminal) {
        progressBar.classList.add('active');
        if (uploadBtn) uploadBtn.disabled = true;
    }

    const pct = typeof state.progress === 'number' ? state.progress : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;

    const stageLabel = labelStage(state.stage || state.status);
    if (progStageText) progStageText.textContent = stageLabel || 'Processando...';

    if (state.status === 'success') {
        progressFill.classList.add('done');
        progressFill.classList.remove('err');
        if (progStage) { progStage.className = 'sc-prog-stage done'; progStageText.textContent = 'Concluído'; }
    } else if (state.status === 'error') {
        progressFill.classList.add('err');
        progressFill.classList.remove('done');
        if (progStage) { progStage.className = 'sc-prog-stage err'; progStageText.textContent = 'Erro'; }
    }

    if (progMeta) {
        const parts = [];
        if (typeof state.insertedRows === 'number' && typeof state.totalRows === 'number') {
            parts.push(`${formatNumber(state.insertedRows)} / ${formatNumber(state.totalRows)} linhas`);
        }
        if (typeof state.throughput === 'number' && state.throughput > 0 && !isTerminal) {
            parts.push(`${Math.round(state.throughput)} lin/s`);
        }
        if (typeof state.etaSeconds === 'number' && state.etaSeconds > 0 && !isTerminal) {
            parts.push(`ETA ${formatDuration(state.etaSeconds)}`);
        }
        progMeta.textContent = parts.join(' · ');
    }

    if (state.status === 'success') {
        setTimeout(() => {
            if (currentTable !== state.tableName) return;
            removeFile();
            progressBar.classList.remove('active');
            progressFill.style.width = '0%';
            progressFill.classList.remove('done');
            if (progStage) progStage.className = 'sc-prog-stage';
            if (progStageText) progStageText.textContent = 'Processando...';
            if (progMeta) progMeta.textContent = '';
            if (progressText) progressText.textContent = '0%';
            if (uploadBtn) { uploadBtn.disabled = false; syncUploadBtnLabel(); }
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
    const map = {
        queued:    'Na fila',
        reading:   'Lendo arquivo',
        read:      'Arquivo lido',
        cleaning:  'Limpando tabela',
        cleaned:   'Tabela limpa',
        altering:  'Ajustando schema',
        creating:  'Criando tabela',
        inserting: 'Inserindo dados',
        completed: 'Concluído',
        success:   'Concluído',
        error:     'Erro',
        running:   'Processando',
    };
    return map[stage] || stage;
}

function formatDuration(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return s ? `${m}m${s}s` : `${m}m`;
    const h = Math.floor(m / 60), mm = m % 60;
    return mm ? `${h}h${mm}m` : `${h}h`;
}

function setupDropzone() {
    const dropzone = document.getElementById('dropzone');
    if (!dropzone) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls';

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('over');
        if (e.dataTransfer.files.length > 0) {
            const f = e.dataTransfer.files[0];
            if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
                handleFileSelect(f);
            } else {
                showAlert('Selecione um arquivo Excel (.xlsx ou .xls)', 'error');
            }
        }
    });
}

function handleFileSelect(file) {
    selectedFile = file;
    const dropzone   = document.getElementById('dropzone');
    const dzIdle     = document.getElementById('dz-idle');
    const dzFile     = document.getElementById('dz-file');
    const dzFileName = document.getElementById('dzFileName');
    const dzFileSize = document.getElementById('dzFileSize');
    if (dropzone)   dropzone.classList.add('has-file');
    if (dzIdle)     dzIdle.style.display = 'none';
    if (dzFile)     dzFile.style.display = 'flex';
    if (dzFileName) dzFileName.textContent = file.name;
    if (dzFileSize) dzFileSize.textContent = formatFileSize(file.size);
    updateUploadButtonState();
}

function removeFile() {
    selectedFile = null;
    const dropzone = document.getElementById('dropzone');
    const dzIdle   = document.getElementById('dz-idle');
    const dzFile   = document.getElementById('dz-file');
    if (dropzone) dropzone.classList.remove('has-file');
    if (dzIdle)   dzIdle.style.display = '';
    if (dzFile)   dzFile.style.display = 'none';
    updateUploadButtonState();
}

function updateUploadButtonState() {
    const uploadBtn = document.getElementById('uploadBtn');
    if (!uploadBtn) return;
    let enabled = false;
    if (currentTable === 'TABELA_TEMPORARIA') {
        const tn = document.getElementById('tableName')?.value.trim();
        enabled = !!(selectedFile && tn && /^[A-Za-z0-9_]+$/.test(tn));
    } else if (currentTable === ORCAMENTO_FLUXO_CAIXA_TABLE) {
        const ano = document.getElementById('anoBase')?.value.trim();
        enabled = !!(selectedFile && /^[0-9]{4}$/.test(ano));
    } else {
        enabled = !!selectedFile;
    }
    uploadBtn.disabled = !enabled;
    if (enabled) syncUploadBtnLabel();
}

// Sincroniza label/cor do botão de upload com o tipo de carga selecionado.
// Quando Carga Completa está ativa, o botão fica vermelho escuro (danger)
// com texto "Substituir Dados" para sinalizar ação destrutiva.
function syncUploadBtnLabel() {
    const uploadBtn = document.getElementById('uploadBtn');
    if (!uploadBtn || uploadBtn.disabled) return;
    if (currentTable === 'TABELA_TEMPORARIA') return;
    if (getTipoCargaSelecionado() === 'completa') {
        uploadBtn.className = 'sc-btn-up danger';
        uploadBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Substituir Dados';
    } else {
        uploadBtn.className = 'sc-btn-up';
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Fazer Upload';
    }
}

function setupUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', handleUpload);
}

// Upload async: backend responde 202+jobId; o jobsManager abre o SSE
// e atualiza a UI via listener global. Permite trocar de tabela durante upload.
async function handleUpload() {
    if (!selectedFile) return;

    const uploadBtn     = document.getElementById('uploadBtn');
    const progressBar   = document.getElementById('progressBar');
    const progressText  = document.getElementById('progressText');
    const progStageText = document.getElementById('progStageText');

    const tableAtStart = currentTable;
    const isTempTable  = (tableAtStart === 'TABELA_TEMPORARIA');

    uploadBtn.disabled = true;
    progressBar.classList.add('active');
    if (progressText)  progressText.textContent  = '0%';
    if (progStageText) progStageText.textContent = 'Enviando arquivo...';

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
                const anoBase = document.getElementById('anoBase')?.value.trim();
                if (!/^[0-9]{4}$/.test(anoBase)) {
                    showAlert('Informe o ano base do orçamento (4 dígitos)', 'error');
                    progressBar.classList.remove('active');
                    uploadBtn.disabled = false;
                    return;
                }
                formData.append('ano_base', anoBase);
            }

            url = `/api/excel/upload/${tableAtStart}`;
            effectiveTableName = tableAtStart;
        }

        const response = await fetch(url, { method: 'POST', body: formData });
        const result   = await response.json().catch(() => ({}));

        if (response.status === 409) throw new Error(result.error || 'Já existe uma carga em andamento para esta tabela.');
        if (!response.ok)            throw new Error(result.error || 'Falha ao iniciar upload');

        const jobId = result.jobId || result.sessionId;
        if (!jobId) throw new Error('Servidor não retornou jobId');

        if (window.jobsManager) {
            window.jobsManager.start({ jobId, tableName: effectiveTableName, fileName: selectedFile.name });
        }

        // Limpa seleção de arquivo (progresso continua via jobsManager)
        selectedFile = null;
        const dzIdle = document.getElementById('dz-idle');
        const dzFile = document.getElementById('dz-file');
        const dz     = document.getElementById('dropzone');
        if (dz)     dz.classList.remove('has-file');
        if (dzIdle) dzIdle.style.display = '';
        if (dzFile) dzFile.style.display = 'none';

    } catch (error) {
        console.error('Erro no upload:', error);
        showAlert('Erro no upload: ' + error.message, 'error');
        if (currentTable === tableAtStart) {
            progressBar.classList.remove('active');
            uploadBtn.disabled = false;
        }
    }
}

async function updateTableCount(tableName) {
    try {
        const r = await fetch(`/api/excel/tabelas/${tableName}/info`);
        if (!r.ok) return;
        const data = await r.json();

        const item = document.querySelector(`[data-table="${tableName}"]`);
        if (item && data.total_registros !== undefined) {
            const meta = item.querySelector('.sc-item-meta');
            if (meta) {
                const count = formatNumber(data.total_registros);
                const last  = data.last_load_at ? formatRelativeDate(data.last_load_at) : null;
                meta.textContent = last ? `${count} registros · ${last}` : `${count} registros`;
                if (data.last_load_at) meta.title = new Date(data.last_load_at).toLocaleString('pt-BR');
                meta.style.color      = '#166534';
                meta.style.fontWeight = '600';
                setTimeout(() => { meta.style.color = ''; meta.style.fontWeight = ''; }, 2500);
            }
        }

        // Atualiza stat do painel se a tabela estiver aberta
        if (currentTable === tableName) {
            const statCount = document.getElementById('statCount');
            if (statCount && data.total_registros !== undefined) {
                statCount.textContent = formatNumber(data.total_registros);
            }
        }
    } catch (_) {}
}

function showAlert(message, type) {
    const alertBox = document.getElementById('alertBox');
    if (!alertBox) return;
    const iconMap  = { error: 'fa-exclamation-circle', success: 'fa-check-circle', info: 'fa-info-circle' };
    const classMap = { error: 'sc-alert-err', success: 'sc-alert-ok', info: 'sc-alert-info' };
    alertBox.className = `sc-alert ${classMap[type] || 'sc-alert-info'} show`;
    alertBox.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i>${escapeHtml(message)}`;
    setTimeout(() => alertBox.classList.remove('show'), 5000);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function setupTipoCargaButtons() {
    const btnCompleta    = document.getElementById('btnCompleta');
    const btnIncremental = document.getElementById('btnIncremental');
    if (!btnCompleta || !btnIncremental) return;

    btnCompleta.addEventListener('click', () => {
        if (btnCompleta.classList.contains('sc-load-disabled')) return;
        btnCompleta.classList.add('sc-sel');
        btnIncremental.classList.remove('sc-sel');
        syncUploadBtnLabel();
    });

    btnIncremental.addEventListener('click', () => {
        if (btnIncremental.classList.contains('sc-load-disabled')) return;
        btnIncremental.classList.add('sc-sel');
        btnCompleta.classList.remove('sc-sel');
        syncUploadBtnLabel();
    });
}

function getTipoCargaSelecionado() {
    const btnCompleta = document.getElementById('btnCompleta');
    return btnCompleta && btnCompleta.classList.contains('sc-sel') ? 'completa' : 'incremental';
}

function downloadModel(tableName) {
    showAlert('Gerando modelo...', 'info');
    fetch(`/api/excel/modelo/${tableName}`)
        .then(r => { if (!r.ok) throw new Error('Erro ao baixar modelo'); return r.blob(); })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `Modelo_${tableName}.xlsx`;
            document.body.appendChild(a); a.click();
            URL.revokeObjectURL(url); a.remove();
            showAlert('Modelo baixado com sucesso!', 'success');
        })
        .catch(err => showAlert('Erro ao baixar modelo: ' + err.message, 'error'));
}
