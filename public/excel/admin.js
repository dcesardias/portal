// Estado da aplicação
let groups = [];
let tables = [];
let currentEditingGroup = null;
let currentEditingTable = null;

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    setupForms();
    await loadGroups();
    await loadTables();
    await loadGroupsDropdown(); // Carregar grupos no dropdown inicialmente
});

// Configurar navegação
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            
            // Atualizar links ativos
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Mostrar seção
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`${section}-section`).classList.add('active');
        });
    });
}

// Configurar formulários
function setupForms() {
    // Form de grupo
    document.getElementById('groupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveGroup();
    });
    
    // Form de tabela
    document.getElementById('tableForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTable();
    });
    
    // Upload de arquivo
    document.getElementById('tableModelFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileInfo').classList.add('show');
        }
    });
}

// Carregar grupos
async function loadGroups() {
    try {
        const response = await fetch('/api/excel/groups');
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Erro ao carregar grupos');
        }
        
        groups = await response.json();
        console.log('Grupos carregados:', groups);
        renderGroups();
    } catch (err) {
        console.error('Erro ao carregar grupos:', err);
        showAlert('Erro ao carregar grupos: ' + err.message, 'error');
    }
}

// Renderizar grupos
function renderGroups() {
    const tbody = document.getElementById('groupsTableBody');
    
    if (groups.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>Nenhum grupo cadastrado</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = groups.map(group => `
        <tr>
            <td><code>${group.Code}</code></td>
            <td>${group.Name}</td>
            <td>${group.Description || '-'}</td>
            <td style="font-size: 20px;">${group.Icon || '📁'}</td>
            <td><span class="badge badge-primary">${group.TotalTables || 0}</span></td>
            <td>
                <button class="btn btn-primary" onclick="editGroup(${group.Id})">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-danger" onclick="deleteGroup(${group.Id}, '${group.Name}')">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </td>
        </tr>
    `).join('');
}

// Carregar tabelas
async function loadTables() {
    try {
        const response = await fetch('/api/excel/table-definitions');
        if (!response.ok) throw new Error('Erro ao carregar tabelas');
        
        tables = await response.json();
        renderTables();
    } catch (err) {
        console.error('Erro ao carregar tabelas:', err);
        showAlert('Erro ao carregar tabelas', 'error');
    }
}

// Renderizar tabelas
function renderTables() {
    const tbody = document.getElementById('tablesTableBody');
    
    if (tables.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fas fa-table"></i>
                    <p>Nenhuma tabela cadastrada</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = tables.map(table => `
        <tr>
            <td><code>${table.TableName}</code></td>
            <td>${table.DisplayName}</td>
            <td>${table.Description || '-'}</td>
            <td>${table.GroupName || '-'}</td>
            <td>
                ${table.ModelFilePath 
                    ? '<i class="fas fa-check-circle" style="color: #28a745;"></i> Sim' 
                    : '<i class="fas fa-times-circle" style="color: #dc3545;"></i> Não'}
            </td>
            <td>
                <button class="btn btn-primary" onclick="editTable(${table.Id})">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-danger" onclick="deleteTable(${table.Id}, '${table.DisplayName}')">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </td>
        </tr>
    `).join('');
}

// Mostrar modal de grupo
function showGroupModal(groupId = null) {
    currentEditingGroup = groupId;
    
    if (groupId) {
        const group = groups.find(g => g.Id === groupId);
        if (!group) return;
        
        document.getElementById('groupModalTitle').textContent = 'Editar Grupo';
        document.getElementById('groupId').value = group.Id;
        document.getElementById('groupCode').value = group.Code;
        document.getElementById('groupCode').disabled = true; // Não permitir editar código
        document.getElementById('groupName').value = group.Name;
        document.getElementById('groupDescription').value = group.Description || '';
        document.getElementById('groupIcon').value = group.Icon || '';
    } else {
        document.getElementById('groupModalTitle').textContent = 'Novo Grupo';
        document.getElementById('groupForm').reset();
        document.getElementById('groupCode').disabled = false;
    }
    
    document.getElementById('groupModal').classList.add('show');
}

// Fechar modal de grupo
function closeGroupModal() {
    document.getElementById('groupModal').classList.remove('show');
    document.getElementById('groupForm').reset();
    currentEditingGroup = null;
}

// Salvar grupo
async function saveGroup() {
    try {
        const token = sessionStorage.getItem('authToken');
        if (!token) {
            alert('Você precisa estar logado como administrador para criar/editar grupos.');
            return;
        }
        
        const formData = {
            code: document.getElementById('groupCode').value.toUpperCase(),
            name: document.getElementById('groupName').value,
            description: document.getElementById('groupDescription').value,
            icon: document.getElementById('groupIcon').value
        };
        
        const isEdit = currentEditingGroup !== null;
        const url = isEdit 
            ? `/api/excel/groups/${currentEditingGroup}` 
            : '/api/excel/groups';
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            let errorMessage = 'Erro ao salvar grupo';
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (e) {
                // Se não conseguir parsear JSON, usar texto
                const text = await response.text();
                errorMessage = text || `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        showAlert(`Grupo ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        closeGroupModal();
        await loadGroups();
        
        // Recarregar dropdown de grupos no form de tabela
        await loadGroupsDropdown();
    } catch (err) {
        console.error('Erro ao salvar grupo:', err);
        showAlert(err.message, 'error');
    }
}

// Editar grupo
function editGroup(groupId) {
    showGroupModal(groupId);
}

// Excluir grupo
async function deleteGroup(groupId, groupName) {
    if (!confirm(`Tem certeza que deseja excluir o grupo "${groupName}"?`)) {
        return;
    }
    
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Você precisa estar logado como administrador para excluir grupos.');
        return;
    }
    
    try {
        const response = await fetch(`/api/excel/groups/${groupId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Erro ao excluir grupo');
        
        showAlert('Grupo excluído com sucesso!', 'success');
        await loadGroups();
        await loadGroupsDropdown();
    } catch (err) {
        console.error('Erro ao excluir grupo:', err);
        showAlert('Erro ao excluir grupo', 'error');
    }
}

// Mostrar modal de tabela
async function showTableModal(tableId = null) {
    currentEditingTable = tableId;
    
    // Carregar grupos no dropdown
    await loadGroupsDropdown();
    
    const fileUploadSection = document.querySelector('.form-group:has(#tableModelFile)');
    
    if (tableId) {
        const table = tables.find(t => t.Id === tableId);
        if (!table) return;
        
        document.getElementById('tableModalTitle').textContent = 'Editar Tabela';
        document.getElementById('tableId').value = table.Id;
        document.getElementById('tableName').value = table.TableName;
        document.getElementById('tableName').disabled = true; // Não permitir editar nome
        document.getElementById('tableDisplayName').value = table.DisplayName;
        document.getElementById('tableDescription').value = table.Description || '';
        document.getElementById('tableIcon').value = table.Icon || '';
        document.getElementById('tableGroup').value = table.GroupId || '';
        const allowFullLoadCheckbox = document.getElementById('allowFullLoad');
        if (allowFullLoadCheckbox) {
            allowFullLoadCheckbox.checked = table.AllowFullLoad !== undefined ? !!table.AllowFullLoad : true;
        }
        
        // Ocultar seção de upload de arquivo na edição
        if (fileUploadSection) {
            fileUploadSection.style.display = 'none';
        }
    } else {
        document.getElementById('tableModalTitle').textContent = 'Nova Tabela';
        document.getElementById('tableForm').reset();
        document.getElementById('tableName').disabled = false;
        document.getElementById('fileInfo').classList.remove('show');
        const allowFullLoadCheckbox = document.getElementById('allowFullLoad');
        if (allowFullLoadCheckbox) {
            allowFullLoadCheckbox.checked = true;
        }
        
        // Mostrar seção de upload na criação
        if (fileUploadSection) {
            fileUploadSection.style.display = 'block';
        }
    }
    
    document.getElementById('tableModal').classList.add('show');
}

// Fechar modal de tabela
function closeTableModal() {
    document.getElementById('tableModal').classList.remove('show');
    
    const tableForm = document.getElementById('tableForm');
    if (tableForm) {
        tableForm.reset();
    }
    
    const fileInfo = document.getElementById('fileInfo');
    if (fileInfo) {
        fileInfo.classList.remove('show');
    }
    
    currentEditingTable = null;
}

// Carregar grupos no dropdown
async function loadGroupsDropdown() {
    const select = document.getElementById('tableGroup');
    
    if (!select) {
        console.error('Select tableGroup não encontrado');
        return;
    }
    
    console.log('Carregando grupos no dropdown. Total de grupos:', groups.length);
    
    // Manter opção "Sem grupo"
    select.innerHTML = '<option value="">Sem grupo</option>';
    
    groups.forEach(group => {
        console.log('Adicionando grupo ao dropdown:', group.Name, 'ID:', group.Id);
        const option = document.createElement('option');
        option.value = group.Id;
        option.textContent = group.Name;
        select.appendChild(option);
    });
    
    console.log('Dropdown atualizado. Total de opções:', select.options.length);
}

// Salvar tabela
async function saveTable() {
    const modalContent = document.querySelector('#tableModal .modal-content');
    const originalContent = modalContent.innerHTML;
    let eventSource = null;
    
    try {
        const token = sessionStorage.getItem('authToken');
        if (!token) {
            alert('Você precisa estar logado como administrador para criar/editar tabelas.');
            return;
        }
        
        const formData = new FormData();
        
        const isEdit = currentEditingTable !== null;
        
        if (!isEdit) {
            formData.append('tableName', document.getElementById('tableName').value.toUpperCase());
        }
        
        formData.append('displayName', document.getElementById('tableDisplayName').value);
        formData.append('description', document.getElementById('tableDescription').value);
        formData.append('icon', document.getElementById('tableIcon').value);

        const allowFullLoadCheckbox = document.getElementById('allowFullLoad');
        formData.append('allow_full_load', allowFullLoadCheckbox && allowFullLoadCheckbox.checked ? '1' : '0');
        
        const groupId = document.getElementById('tableGroup').value;
        if (groupId) {
            formData.append('groupId', groupId);
        }
        
        const fileInput = document.getElementById('tableModelFile');
        if (fileInput.files.length > 0) {
            formData.append('modelFile', fileInput.files[0]);
        }
        
        // Mostrar barra de progresso
        if (!isEdit) {
            const sessionId = Date.now().toString();
            formData.append('sessionId', sessionId);
            
            modalContent.innerHTML = `
                <div style="text-align: center; padding: 40px 30px;">
                    <i class="fas fa-database" style="font-size: 42px; color: #0066cc; margin-bottom: 20px;"></i>
                    <h3 style="color: #0066cc; margin-bottom: 15px;">Criando Tabela</h3>
                    <p id="progressMessage" style="color: #666; font-size: 14px; margin-bottom: 20px;">Iniciando...</p>
                    
                    <div style="width: 100%; background: #e0e0e0; border-radius: 10px; height: 24px; overflow: hidden; margin-bottom: 10px;">
                        <div id="progressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0066cc 0%, #0052a3 100%); transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 12px;"></div>
                    </div>
                    
                    <p id="progressDetails" style="color: #999; font-size: 12px;">0%</p>
                </div>
            `;
            
            // Conectar ao SSE para receber progresso
            console.log('[SSE] Conectando ao servidor com sessionId:', sessionId);
            eventSource = new EventSource(`/api/excel/table-definitions/progress/${sessionId}`);
            
            eventSource.onopen = () => {
                console.log('[SSE] Conexão estabelecida');
            };
            
            eventSource.onmessage = (event) => {
                console.log('[SSE] Mensagem recebida:', event.data);
                const data = JSON.parse(event.data);
                const progressBar = document.getElementById('progressBar');
                const progressMessage = document.getElementById('progressMessage');
                const progressDetails = document.getElementById('progressDetails');
                
                if (progressBar && progressMessage && progressDetails) {
                    progressBar.style.width = `${data.progress}%`;
                    progressBar.textContent = `${data.progress}%`;
                    progressMessage.textContent = data.message;
                    
                    if (data.current && data.total) {
                        progressDetails.textContent = `${data.current.toLocaleString()} / ${data.total.toLocaleString()} linhas (${data.progress}%)`;
                    } else {
                        progressDetails.textContent = `${data.progress}%`;
                    }
                }
            };
            
            eventSource.onerror = (error) => {
                console.error('[SSE] Erro na conexão:', error);
            };
        }
        
        const url = isEdit 
            ? `/api/excel/table-definitions/${currentEditingTable}` 
            : '/api/excel/table-definitions';
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            let errorMessage = 'Erro ao salvar tabela';
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (e) {
                const text = await response.text();
                errorMessage = text || `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        
        // Fechar EventSource se existir
        if (eventSource) {
            eventSource.close();
        }
        
        showAlert(result.message || `Tabela ${isEdit ? 'atualizada' : 'criada'} com sucesso!`, 'success');
        closeTableModal();
        await loadTables();
    } catch (err) {
        console.error('Erro ao salvar tabela:', err);
        
        // Fechar EventSource se existir
        if (eventSource) {
            eventSource.close();
        }
        
        // Restaurar conteúdo original em caso de erro
        setTimeout(() => {
            modalContent.innerHTML = originalContent;
            showAlert(err.message, 'error');
        }, 300);
    }
}

// Editar tabela
function editTable(tableId) {
    showTableModal(tableId);
}

// Excluir tabela
async function deleteTable(tableId, tableName) {
    if (!confirm(`Tem certeza que deseja excluir a tabela "${tableName}"?`)) {
        return;
    }
    
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Você precisa estar logado como administrador para excluir tabelas.');
        return;
    }
    
    try {
        const response = await fetch(`/api/excel/table-definitions/${tableId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Erro ao excluir tabela');
        
        showAlert('Tabela excluída com sucesso!', 'success');
        await loadTables();
    } catch (err) {
        console.error('Erro ao excluir tabela:', err);
        showAlert('Erro ao excluir tabela', 'error');
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

// Fechar modais ao clicar fora
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});
