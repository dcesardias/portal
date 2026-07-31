// /fatura — frontend standalone para upload de fatura em PDF e extracao via IA.
// Reaproveita /api/login do portal (mesma tabela Users); o backend exige
// IsAdmin OU UserAppPermissions(userId, 'fatura').
(function () {
    'use strict';

    const API = '/api';
    const TOKEN_KEY = 'authToken';
    const USER_KEY = 'currentUser';
    const NOVOS_KEY = 'fatura_novos_v1'; // sessionStorage: lembra novos da ultima fatura processada

    const $ = (id) => document.getElementById(id);

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function setSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
    }
    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }
    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); }
        catch (_) { return {}; }
    }

    // Persistencia leve dos "novos" da ultima fatura processada (sobrevive
    // refresh leve mas nao precisa durar dias). Apaga se > 24h.
    function getNovosState() {
        try {
            const raw = sessionStorage.getItem(NOVOS_KEY);
            if (!raw) return { fornecedoresIds: [], categoriasIds: [], faturaId: null, ts: 0 };
            const s = JSON.parse(raw);
            if (!s || (Date.now() - (s.ts || 0)) > 24 * 3600 * 1000) {
                sessionStorage.removeItem(NOVOS_KEY);
                return { fornecedoresIds: [], categoriasIds: [], faturaId: null, ts: 0 };
            }
            return s;
        } catch (_) {
            return { fornecedoresIds: [], categoriasIds: [], faturaId: null, ts: 0 };
        }
    }
    function setNovosState(s) {
        sessionStorage.setItem(NOVOS_KEY, JSON.stringify({ ...s, ts: Date.now() }));
    }

    function showAlert(el, type, msg) {
        if (!el) return;
        el.className = `alert alert-${type} show`;
        el.textContent = msg;
    }
    function hideAlert(el) {
        if (!el) return;
        el.className = 'alert';
        el.textContent = '';
    }

    let toastTimer = null;
    function toast(msg, kind) {
        const t = $('toast');
        t.textContent = msg;
        t.className = 'toast show ' + (kind || '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
    }

    function fmtBRL(value) {
        if (value === null || value === undefined || value === '') return '—';
        const n = typeof value === 'number' ? value : parseFloat(value);
        if (!isFinite(n)) return '—';
        return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    function fmtNum(value) {
        if (value === null || value === undefined || value === '') return '—';
        const n = typeof value === 'number' ? value : parseFloat(value);
        if (!isFinite(n)) return '—';
        return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
    }
    function fmtPercent(value) {
        if (value === null || value === undefined || value === '') return '—';
        const n = typeof value === 'number' ? value : parseFloat(value);
        if (!isFinite(n)) return '—';
        return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + ' %';
    }
    function fmtDate(value) {
        if (!value) return '—';
        const s = String(value).slice(0, 10);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (!m) return s;
        return `${m[3]}/${m[2]}/${m[1]}`;
    }
    function fmtDateTime(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (isNaN(d)) return String(value);
        return d.toLocaleString('pt-BR');
    }
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function api(method, path, body, opts) {
        const headers = { 'Authorization': `Bearer ${getToken()}` };
        if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
        const r = await fetch(`${API}${path}`, {
            method,
            headers,
            body: body
                ? (body instanceof FormData ? body : JSON.stringify(body))
                : undefined
        });
        if (r.status === 401 || r.status === 403) {
            if (opts && opts.silentAuthFail) throw Object.assign(new Error('auth'), { status: r.status });
            clearSession();
            showLogin();
            const msg = r.status === 403
                ? 'Sua conta não tem permissão para a aplicação Fatura.'
                : 'Sessão expirada. Faça login novamente.';
            showAlert($('loginAlert'), 'error', msg);
            throw new Error(msg);
        }
        const ct = r.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await r.json().catch(() => ({})) : await r.text();
        if (!r.ok) {
            const msg = (data && data.error) || `HTTP ${r.status}`;
            throw new Error(msg);
        }
        return data;
    }

    // --- LOGIN ---
    async function tryLogin(username, password) {
        const r = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.error || `Falha no login (HTTP ${r.status})`);
        }
        return r.json();
    }

    function showLogin() {
        $('loginScreen').classList.remove('hidden');
        $('appScreen').classList.add('hidden');
        setTimeout(() => $('loginUsername')?.focus(), 30);
    }
    function showApp() {
        $('loginScreen').classList.add('hidden');
        $('appScreen').classList.remove('hidden');
        const u = getUser();
        $('userLabel').textContent = u.fullName || u.username || '';
    }

    function handleLoginSubmit(e) {
        e.preventDefault();
        hideAlert($('loginAlert'));
        const btn = $('loginButton');
        const username = $('loginUsername').value.trim();
        const password = $('loginPassword').value;
        if (!username || !password) {
            showAlert($('loginAlert'), 'error', 'Informe usuário e senha.');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Entrando…';
        tryLogin(username, password)
            .then(({ token, user }) => {
                setSession(token, user);
                bootstrap();
            })
            .catch(err => {
                showAlert($('loginAlert'), 'error', err.message || 'Erro no login');
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Entrar';
            });
    }

    // --- UPLOAD ---
    let selectedFile = null;

    function setSelectedFile(file) {
        selectedFile = file || null;
        $('filenameLabel').textContent = file ? file.name : '';
        $('uploadBtn').disabled = !file;
        hideAlert($('uploadAlert'));
    }

    function bindDropZone() {
        const dz = $('dropZone');
        const input = $('fileInput');
        // O <label class="drop-zone"> ja dispara click no <input type="file">
        // nativamente. NAO adicionar listener manual aqui — duplicaria o
        // file picker e a primeira selecao seria descartada.
        input.addEventListener('change', () => setSelectedFile(input.files && input.files[0]));
        ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
            e.preventDefault(); dz.classList.add('dragover');
        }));
        ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
            e.preventDefault(); dz.classList.remove('dragover');
        }));
        dz.addEventListener('drop', (e) => {
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) setSelectedFile(f);
        });
        $('clearBtn').addEventListener('click', () => {
            input.value = '';
            setSelectedFile(null);
        });
        $('uploadBtn').addEventListener('click', uploadFatura);
    }

    async function uploadFatura() {
        if (!selectedFile) return;
        const btn = $('uploadBtn');
        const progress = $('uploadProgress');
        hideAlert($('uploadAlert'));
        btn.disabled = true;
        progress.classList.add('show');
        $('progressLabel').textContent = 'Enviando PDF para a IA…';

        const fd = new FormData();
        fd.append('file', selectedFile);

        try {
            const data = await api('POST', '/fatura/upload', fd);

            // Salva os "novos" (id) para destacar nas tabelas de fornecedores/categorias
            const novosFornecedoresIds = (data.novos_fornecedores || []).map(x => x.id);
            const novasCategoriasIds   = (data.novas_categorias   || []).map(x => x.id);
            setNovosState({
                fornecedoresIds: novosFornecedoresIds,
                categoriasIds:   novasCategoriasIds,
                faturaId:        data.id
            });

            const r = data.resumo || {};
            const novosLabel = [];
            if (data.novos_fornecedores && data.novos_fornecedores.length) {
                novosLabel.push(`${data.novos_fornecedores.length} fornecedor(es) novo(s)`);
            }
            if (data.novas_categorias && data.novas_categorias.length) {
                novosLabel.push(`${data.novas_categorias.length} categoria(s) nova(s)`);
            }
            const sufixo = novosLabel.length ? ` — ${novosLabel.join(', ')}` : '';
            const msg = `Fatura #${data.id} processada (${r.qtd_itens || 0} lançamentos, ${fmtBRL(r.total)})${sufixo}.`;
            showAlert($('uploadAlert'), 'success', msg);
            toast(msg, 'success');

            $('fileInput').value = '';
            setSelectedFile(null);

            await Promise.all([loadStats(), loadHistory(), loadFornecedores(), loadCategorias()]);
            // Se houver novos, abre a aba de fornecedores pra revisao
            if (novosLabel.length) {
                activateTab('fornecedores');
                $('fornecedoresTable').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            if (err.message !== 'auth') {
                showAlert($('uploadAlert'), 'error', err.message || 'Erro ao processar fatura');
                toast(err.message || 'Erro ao processar fatura', 'error');
            }
        } finally {
            btn.disabled = !selectedFile;
            progress.classList.remove('show');
        }
    }

    // --- HISTORICO ---
    async function loadHistory() {
        const tbody = $('historyTable').querySelector('tbody');
        try {
            const data = await api('GET', '/fatura/list?limit=50');
            const pill = $('tabCountHistorico');
            if (pill) pill.textContent = Array.isArray(data) ? data.length : 0;
            if (!Array.isArray(data) || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Nenhuma fatura processada ainda.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.map(f => `
                <tr>
                    <td>#${f.Id}</td>
                    <td>${escapeHtml(fmtDateTime(f.uploaded_at))}</td>
                    <td>${escapeHtml(f.empresa || f.pagador_nome || '—')}</td>
                    <td>${escapeHtml(f.fornecedor_nome || '—')}</td>
                    <td>${escapeHtml(f.numero_fatura || '—')}</td>
                    <td>${escapeHtml(fmtDate(f.data_vencimento))}</td>
                    <td class="num">${fmtBRL(f.valor_total)}</td>
                    <td class="num">${f.repasse_iof_brl != null ? fmtBRL(f.repasse_iof_brl) : '—'}</td>
                    <td class="num">${f.qtd_itens != null ? f.qtd_itens : '—'}</td>
                    <td class="row-action"><button class="btn" data-detalhes-id="${f.Id}">Detalhes</button></td>
                </tr>
            `).join('');
            tbody.querySelectorAll('button[data-detalhes-id]').forEach(btn => {
                btn.addEventListener('click', () => openDetalhesModal(btn.dataset.detalhesId));
            });
        } catch (err) {
            if (err.message !== 'auth') {
                tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Erro ao carregar histórico: ${escapeHtml(err.message || '')}</td></tr>`;
            }
        }
    }

    // --- FORNECEDORES / CATEGORIAS (master tables) ---
    function nameCell(row, novosKey) {
        return `<td>
            <span class="drill-name">
                <span class="name-text">${escapeHtml(row.nome)}</span>${badgeNovo(row, novosKey)}${row.despesa_ti ? '<span class="badge-ti">TI</span>' : ''}
                <span class="chev" aria-hidden="true">›</span>
            </span>
        </td>`;
    }
    async function loadFornecedores() {
        await loadMasterTable({
            kind: 'fornecedor',
            endpoint: '/fatura/fornecedores',
            tableId: 'fornecedoresTable',
            countPillId: 'tabCountFornecedores',
            patchPath: id => `/fatura/fornecedores/${id}`,
            novosKey: 'fornecedoresIds',
            colsBefore: (row) => nameCell(row, 'fornecedoresIds')
        });
    }
    async function loadCategorias() {
        await loadMasterTable({
            kind: 'categoria',
            endpoint: '/fatura/categorias',
            tableId: 'categoriasTable',
            countPillId: 'tabCountCategorias',
            patchPath: id => `/fatura/categorias/${id}`,
            novosKey: 'categoriasIds',
            colsBefore: (row) => nameCell(row, 'categoriasIds')
        });
    }

    function badgeNovo(row, novosKey) {
        const novos = getNovosState()[novosKey] || [];
        return novos.includes(row.Id) ? '<span class="badge-novo">Novo</span>' : '';
    }

    async function loadMasterTable({ kind, endpoint, tableId, countPillId, patchPath, novosKey, colsBefore }) {
        const tbody = $(tableId).querySelector('tbody');
        try {
            const data = await api('GET', endpoint);
            const pill = countPillId && $(countPillId);
            if (pill) pill.textContent = Array.isArray(data) ? data.length : 0;
            if (!Array.isArray(data) || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhum item ainda. Suba uma fatura para começar.</td></tr>`;
                return;
            }
            const novosIds = getNovosState()[novosKey] || [];
            // Linhas novas vão pro topo, depois alfabético por nome
            const sorted = data.slice().sort((a, b) => {
                const aNew = novosIds.includes(a.Id) ? 0 : 1;
                const bNew = novosIds.includes(b.Id) ? 0 : 1;
                if (aNew !== bNew) return aNew - bNew;
                return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
            });

            tbody.innerHTML = sorted.map(row => `
                <tr class="clickable ${novosIds.includes(row.Id) ? 'row-novo' : ''}"
                    data-row-id="${row.Id}"
                    data-kind="${kind}"
                    data-nome="${escapeHtml(row.nome)}"
                    data-count="${row.occurrences != null ? row.occurrences : 0}"
                    data-total="${row.total_brl != null ? row.total_brl : ''}"
                    data-ti="${row.despesa_ti ? '1' : '0'}">
                    ${colsBefore(row)}
                    <td class="num">${row.occurrences != null ? row.occurrences : 0}</td>
                    <td class="num">${row.total_brl != null ? fmtBRL(row.total_brl) : '—'}</td>
                    <td class="no-drill">
                        <label class="switch">
                            <input type="checkbox" data-field="despesa_ti" ${row.despesa_ti ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td class="no-drill">
                        <input type="text" data-field="observacao" value="${escapeHtml(row.observacao || '')}" placeholder="(opcional)">
                    </td>
                </tr>
            `).join('');

            // Wire-up dos PATCH on-change
            tbody.querySelectorAll('tr[data-row-id]').forEach(tr => {
                const id = tr.dataset.rowId;

                // Clique na linha (fora dos controles) abre o detalhamento
                tr.addEventListener('click', (e) => {
                    if (e.target.closest('.no-drill')) return;
                    openDrillModal(tr.dataset.kind, {
                        id: id,
                        nome: tr.dataset.nome,
                        count: parseInt(tr.dataset.count, 10) || 0,
                        total: tr.dataset.total === '' ? null : parseFloat(tr.dataset.total),
                        ti: tr.dataset.ti === '1'
                    });
                });
                const tiInput = tr.querySelector('input[data-field="despesa_ti"]');
                const obsInput = tr.querySelector('input[data-field="observacao"]');
                tiInput.addEventListener('change', async () => {
                    try {
                        const updated = await api('PATCH', patchPath(id), { despesa_ti: tiInput.checked });
                        toast(`${updated.nome}: ${updated.despesa_ti ? 'marcado' : 'desmarcado'} como Despesa de TI`, 'success');
                        // Atualiza badge "TI" sem reload completo
                        const cell = tr.querySelector('td:first-child');
                        cell.querySelectorAll('.badge-ti').forEach(b => b.remove());
                        if (updated.despesa_ti) {
                            cell.insertAdjacentHTML('beforeend', '<span class="badge-ti">TI</span>');
                        }
                    } catch (e) {
                        if (e.message !== 'auth') {
                            tiInput.checked = !tiInput.checked; // revert
                            toast(`Falha: ${e.message}`, 'error');
                        }
                    }
                });
                let obsTimer = null;
                obsInput.addEventListener('input', () => {
                    clearTimeout(obsTimer);
                    obsTimer = setTimeout(async () => {
                        try {
                            await api('PATCH', patchPath(id), { observacao: obsInput.value });
                        } catch (e) {
                            if (e.message !== 'auth') toast(`Falha ao salvar observação: ${e.message}`, 'error');
                        }
                    }, 700);
                });
            });
        } catch (err) {
            if (err.message !== 'auth') {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro: ${escapeHtml(err.message || '')}</td></tr>`;
            }
        }
    }

    // --- KPIs ---
    async function loadStats() {
        try {
            const s = await api('GET', '/fatura/stats', null, { silentAuthFail: true });
            $('kpiGasto').textContent   = fmtBRL(s.total_gasto_brl);
            $('kpiTi').textContent      = fmtBRL(s.total_ti_brl);
            $('kpiFaturas').textContent = s.total_faturas != null ? s.total_faturas.toLocaleString('pt-BR') : '0';
            $('kpiItens').textContent   = s.total_itens != null ? s.total_itens.toLocaleString('pt-BR') : '0';
            const gasto = parseFloat(s.total_gasto_brl) || 0;
            const ti = parseFloat(s.total_ti_brl) || 0;
            const pct = gasto > 0 ? Math.round((ti / gasto) * 100) : 0;
            $('kpiTiHint').textContent = gasto > 0 ? `${pct}% do total processado` : 'classificado como TI';
        } catch (_) {
            // KPIs sao best-effort; nao bloqueiam a tela
            ['kpiGasto','kpiTi','kpiFaturas','kpiItens'].forEach(id => { if ($(id).textContent === '—') $(id).textContent = '—'; });
        }
    }

    // --- TABS ---
    function activateTab(name) {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    }
    function bindTabs() {
        document.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => activateTab(t.dataset.tab));
        });
    }

    // --- MODAL DRILL-DOWN (lançamentos por fornecedor / categoria) ---
    async function openDrillModal(kind, meta) {
        const overlay = $('drillModal');
        const isFornecedor = kind === 'fornecedor';
        const label = isFornecedor ? 'Fornecedor' : 'Categoria';
        overlay.classList.remove('hidden');

        $('drillTitle').textContent = meta.nome || label;
        $('drillSub').innerHTML = `${label}${meta.ti ? ' <span class="badge-ti">Despesa de TI</span>' : ''}`;
        // A 4ª coluna mostra a "outra" dimensão: numa lista de fornecedor exibimos a categoria, e vice-versa.
        $('drillCol6').textContent = isFornecedor ? 'Categoria' : 'Fornecedor';

        $('drillSummary').innerHTML = `
            <div class="stat"><div class="l">Total</div><div class="v">${meta.total != null ? fmtBRL(meta.total) : '—'}</div></div>
            <div class="stat"><div class="l">Lançamentos</div><div class="v">${meta.count != null ? meta.count : 0}</div></div>
        `;
        const tbody = $('drillItens').querySelector('tbody');
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Carregando…</td></tr>`;

        try {
            const path = isFornecedor
                ? `/fatura/fornecedores/${meta.id}/itens`
                : `/fatura/categorias/${meta.id}/itens`;
            const itens = await api('GET', path);
            if (!Array.isArray(itens) || itens.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum lançamento encontrado.</td></tr>`;
                return;
            }
            tbody.innerHTML = itens.map(it => {
                const outra = isFornecedor ? it.categoria_normalizada : it.fornecedor_normalizado;
                const neg = (parseFloat(it.valor_brl) || 0) < 0;
                return `
                    <tr>
                        <td>${escapeHtml(fmtDate(it.data))}</td>
                        <td>${tipoPill(it.tipo)}</td>
                        <td>${escapeHtml(it.estabelecimento || it.descricao || '—')}${it.produto_servico ? `<span class="fornecedor-prod" style="display:block">${escapeHtml(it.produto_servico)}</span>` : ''}</td>
                        <td>${escapeHtml(outra || '—')}</td>
                        <td>${escapeHtml(it.portador_nome || '—')}${it.portador_cartao_final ? ` ••${escapeHtml(it.portador_cartao_final)}` : ''}</td>
                        <td>${escapeHtml(it.cidade || '—')}</td>
                        <td><button class="btn btn-sm" data-fatura-id="${it.fatura_id}">#${it.fatura_id}</button></td>
                        <td class="num ${neg ? 'val-neg' : ''}">${fmtBRL(it.valor_brl)}</td>
                    </tr>
                `;
            }).join('');
            // "#fatura" abre o detalhamento completo da fatura de origem
            tbody.querySelectorAll('button[data-fatura-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    closeDrillModal();
                    openDetalhesModal(btn.dataset.faturaId);
                });
            });
        } catch (err) {
            if (err.message !== 'auth') {
                tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro: ${escapeHtml(err.message || '')}</td></tr>`;
            }
        }
    }
    function closeDrillModal() {
        $('drillModal').classList.add('hidden');
    }

    // --- MODAL DETALHES ---
    function renderField(label, value, formatter) {
        const isEmpty = value === null || value === undefined || value === '';
        const v = isEmpty ? null : (formatter ? formatter(value) : value);
        return `
            <div class="field">
                <label>${escapeHtml(label)}</label>
                <div class="value ${isEmpty ? 'empty' : ''}">${isEmpty ? '— não identificado —' : escapeHtml(v)}</div>
            </div>
        `;
    }

    function tipoPill(tipo) {
        if (!tipo) return '—';
        const safe = String(tipo).toLowerCase();
        const cls = safe.includes('internacional') ? 'tipo-internacional'
                  : safe === 'pagamento' ? 'tipo-pagamento'
                  : safe === 'saque' ? 'tipo-saque'
                  : safe === 'encargo' ? 'tipo-encargo'
                  : '';
        return `<span class="tipo-pill ${cls}">${escapeHtml(tipo)}</span>`;
    }

    function renderFornecedorCell(it) {
        const f = it.fornecedor_normalizado;
        const c = it.categoria_normalizada;
        const p = it.produto_servico;
        const ti = it.fornecedor_despesa_ti || it.categoria_despesa_ti;
        if (!f && !c && !p) {
            return `<span class="fornecedor-cell empty">— não classificado —</span>`;
        }
        return `
            <div class="fornecedor-cell">
                ${f ? `<span class="fornecedor-nome">${escapeHtml(f)}${ti ? '<span class="badge-ti">TI</span>' : ''}</span>` : ''}
                ${c ? `<span class="fornecedor-cat">${escapeHtml(c)}</span>` : ''}
                ${p ? `<span class="fornecedor-prod">${escapeHtml(p)}</span>` : ''}
            </div>
        `;
    }

    async function openDetalhesModal(faturaId) {
        const overlay = $('detalhesModal');
        overlay.classList.remove('hidden');
        $('detalhesModel').textContent = 'carregando…';
        // Limpa conteudo
        ['detIdent','detResumo','detLimites','detEncargos','detProximo','detTotais'].forEach(id => $(id).innerHTML = '');
        $('detItens').querySelector('tbody').innerHTML = `<tr><td colspan="12" class="empty-state">Carregando…</td></tr>`;

        try {
            const f = await api('GET', `/fatura/${faturaId}`);
            $('detalhesModel').textContent = f.model_used || '';

            $('detIdent').innerHTML = [
                renderField('Empresa', f.empresa),
                renderField('Nº conta / cartão', f.numero_conta),
                renderField('Nº fatura', f.numero_fatura),
                renderField('Tipo', f.tipo_documento),
                renderField('Emissão', f.data_emissao, fmtDate),
                renderField('Postagem', f.data_postagem, fmtDate),
                renderField('Vencimento', f.data_vencimento, fmtDate),
                renderField('Próximo fechamento', f.data_proximo_fechamento, fmtDate),
                renderField('Emissor', f.fornecedor_nome),
                renderField('CNPJ emissor', f.fornecedor_cnpj),
                renderField('Pagador', f.pagador_nome),
                renderField('CNPJ pagador', f.pagador_cnpj)
            ].join('');

            $('detResumo').innerHTML = [
                renderField('Fatura anterior', f.total_fatura_anterior, fmtBRL),
                renderField('Pagamentos efetuados', f.pagamentos_efetuados, fmtBRL),
                renderField('Saldo em atraso', f.saldo_atraso, fmtBRL),
                renderField('Lançamentos atuais', f.lancamentos_atuais, fmtBRL),
                renderField('Total desta fatura', f.valor_total, fmtBRL)
            ].join('');

            $('detLimites').innerHTML = [
                renderField('Limite total', f.limite_total_credito, fmtBRL),
                renderField('Limite disponível', f.limite_disponivel, fmtBRL),
                renderField('Limite utilizado', f.limite_total_utilizado, fmtBRL)
            ].join('');

            $('detEncargos').innerHTML = [
                renderField('Juros de atraso (%)', f.juros_atraso_percent, fmtPercent),
                renderField('Juros de atraso (R$)', f.juros_atraso_valor, fmtBRL),
                renderField('Juros de mora (% a.m.)', f.juros_mora_percent_mensal, fmtPercent),
                renderField('Juros de mora (R$)', f.juros_mora_valor, fmtBRL),
                renderField('Multa por atraso (%)', f.multa_atraso_percent, fmtPercent),
                renderField('Multa por atraso (R$)', f.multa_atraso_valor, fmtBRL),
                renderField('IOF financiamento (taxa)', f.iof_financiamento_descricao),
                renderField('IOF financiamento (R$)', f.iof_financiamento_valor, fmtBRL)
            ].join('');

            $('detProximo').innerHTML = [
                renderField('Juros máx. (% a.m.)', f.juros_max_proximo_mensal_percent, fmtPercent),
                renderField('Juros máx. (% a.a.)', f.juros_max_proximo_anual_percent, fmtPercent),
                renderField('Pgto. de contas (% a.m.)', f.juros_pgto_contas_mensal_percent, fmtPercent)
            ].join('');

            $('detTotais').innerHTML = [
                renderField('Total pagamentos', f.total_pagamentos, fmtBRL),
                renderField('Total lanç. atuais', f.total_lancamentos_atuais, fmtBRL),
                renderField('Total internacional (R$)', f.total_transacoes_internacionais_brl, fmtBRL),
                renderField('Repasse de IOF (R$)', f.repasse_iof_brl, fmtBRL),
                renderField('Total internacional + IOF', f.total_lancamentos_internacionais_brl, fmtBRL)
            ].join('');

            const itens = Array.isArray(f.itens) ? f.itens : [];
            const tbody = $('detItens').querySelector('tbody');
            tbody.innerHTML = itens.length === 0
                ? `<tr><td colspan="12" class="empty-state">Nenhum lançamento discriminado.</td></tr>`
                : itens.map(it => `
                    <tr>
                        <td>${escapeHtml(fmtDate(it.data))}</td>
                        <td>${tipoPill(it.tipo)}</td>
                        <td>${escapeHtml(it.portador_nome || '—')}</td>
                        <td>${escapeHtml(it.portador_cartao_final ? `••${it.portador_cartao_final}` : '—')}</td>
                        <td>${escapeHtml(it.estabelecimento || it.descricao || '—')}</td>
                        <td>${renderFornecedorCell(it)}</td>
                        <td>${escapeHtml(it.cidade || '—')}</td>
                        <td>${escapeHtml(it.centro_custo || '—')}</td>
                        <td>${escapeHtml(it.moeda_original || '—')}</td>
                        <td class="num">${it.valor_original != null ? fmtNum(it.valor_original) : '—'}</td>
                        <td class="num">${it.taxa_cambio != null ? fmtNum(it.taxa_cambio) : '—'}</td>
                        <td class="num">${fmtBRL(it.valor_brl)}</td>
                    </tr>
                `).join('');
        } catch (err) {
            if (err.message !== 'auth') {
                $('detalhesModel').textContent = '';
                $('detItens').querySelector('tbody').innerHTML =
                    `<tr><td colspan="12" class="empty-state">Erro: ${escapeHtml(err.message || '')}</td></tr>`;
            }
        }
    }

    function closeDetalhesModal() {
        $('detalhesModal').classList.add('hidden');
    }

    // --- BOOTSTRAP ---
    async function bootstrap() {
        const token = getToken();
        if (!token) { showLogin(); return; }
        try {
            await api('GET', '/fatura/list?limit=1', null, { silentAuthFail: true });
        } catch (err) {
            clearSession();
            showLogin();
            if (err.status === 403) showAlert($('loginAlert'), 'error', 'Sua conta não tem permissão para a aplicação Fatura.');
            else if (err.status === 401) showAlert($('loginAlert'), 'error', 'Sessão expirada. Faça login novamente.');
            else showAlert($('loginAlert'), 'error', 'Não foi possível validar a sessão.');
            return;
        }
        showApp();
        await Promise.all([loadStats(), loadHistory(), loadFornecedores(), loadCategorias()]);
    }

    function init() {
        $('loginForm').addEventListener('submit', handleLoginSubmit);
        $('logoutBtn').addEventListener('click', () => { clearSession(); location.reload(); });
        bindDropZone();
        bindTabs();
        $('detalhesClose').addEventListener('click', closeDetalhesModal);
        $('detalhesModal').addEventListener('click', (e) => {
            if (e.target.id === 'detalhesModal') closeDetalhesModal();
        });
        $('drillClose').addEventListener('click', closeDrillModal);
        $('drillModal').addEventListener('click', (e) => {
            if (e.target.id === 'drillModal') closeDrillModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!$('drillModal').classList.contains('hidden')) closeDrillModal();
            else if (!$('detalhesModal').classList.contains('hidden')) closeDetalhesModal();
        });
        bootstrap();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
