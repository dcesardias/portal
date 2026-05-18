// jobsManager.js
// Estado global de jobs de upload em execucao.
// Mantem um Map de jobs ativos, conecta SSE para cada um, persiste em
// localStorage para sobreviver a refresh, e expoe pub/sub para a UI
// re-renderizar barras de progresso ao trocar de tabela.
(function () {
    const LS_KEY = 'excelJobs:active';
    const TERMINAL = new Set(['success', 'error', 'cancelled']);

    const jobs = new Map();        // jobId -> state
    const jobByTable = new Map();  // tableName -> jobId
    const sources = new Map();     // jobId -> EventSource
    const listeners = new Map();   // jobId|'*' -> Set<fn>

    function persist() {
        try {
            const minimal = Array.from(jobs.values())
                .filter(j => !TERMINAL.has(j.status))
                .map(j => ({ jobId: j.jobId, tableName: j.tableName }));
            localStorage.setItem(LS_KEY, JSON.stringify(minimal));
        } catch (_) {}
    }

    function hydrate() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }

    function getListeners(jobId) {
        if (!listeners.has(jobId)) listeners.set(jobId, new Set());
        return listeners.get(jobId);
    }

    function emit(jobId, state) {
        getListeners(jobId).forEach(fn => { try { fn(state); } catch (_) {} });
        getListeners('*').forEach(fn => { try { fn(state); } catch (_) {} });
    }

    function applyState(jobId, partial) {
        const prev = jobs.get(jobId) || { jobId };
        const next = Object.assign({}, prev, partial);

        // Calcula throughput (linhas/seg) e ETA quando da pra
        if (typeof next.insertedRows === 'number' && next.insertedRows > 0 && prev.insertedRows !== undefined) {
            const now = Date.now();
            const lastTs = prev._tpTs || prev._startTs || now;
            const lastIns = prev._tpIns ?? 0;
            const dt = (now - lastTs) / 1000;
            const di = next.insertedRows - lastIns;
            if (dt >= 0.5 && di > 0) {
                next.throughput = di / dt;
                next._tpTs = now;
                next._tpIns = next.insertedRows;
            } else {
                next.throughput = prev.throughput;
                next._tpTs = prev._tpTs;
                next._tpIns = prev._tpIns;
            }
            if (next.throughput > 0 && typeof next.totalRows === 'number' && next.totalRows > next.insertedRows) {
                next.etaSeconds = Math.ceil((next.totalRows - next.insertedRows) / next.throughput);
            }
        }
        if (!prev._startTs) next._startTs = next._startTs || Date.now();

        jobs.set(jobId, next);
        if (next.tableName) jobByTable.set(next.tableName, jobId);

        if (TERMINAL.has(next.status)) {
            // limpa lookup por tabela (mas mantem o jobs.get para a UI ler estado final)
            if (next.tableName && jobByTable.get(next.tableName) === jobId) {
                jobByTable.delete(next.tableName);
            }
            // fecha SSE
            const es = sources.get(jobId);
            if (es) { try { es.close(); } catch (_) {} sources.delete(jobId); }
        }

        persist();
        emit(jobId, next);
        return next;
    }

    function attach(jobId, tableName) {
        if (!jobId) return;
        if (sources.has(jobId)) return; // ja conectado

        // Se nao temos estado ainda, registra placeholder
        if (!jobs.has(jobId)) {
            jobs.set(jobId, { jobId, tableName: tableName || null, status: 'queued', progress: 0, _startTs: Date.now() });
            if (tableName) jobByTable.set(tableName, jobId);
        }

        const es = new EventSource(`/api/excel/upload/progress/${jobId}`);
        sources.set(jobId, es);

        es.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch (_) { return; }

            // O servidor envia stage='connected' como primeiro frame; ignora
            if (data.stage === 'connected') return;

            const partial = {
                jobId,
                tableName: data.tableName || jobs.get(jobId)?.tableName || tableName || null,
                stage: data.stage,
                status: data.status || (data.stage === 'completed' ? 'success' : data.stage === 'error' ? 'error' : 'running'),
                message: data.message,
                progress: typeof data.progress === 'number' ? data.progress : jobs.get(jobId)?.progress,
                totalRows: typeof data.total === 'number' ? data.total : (typeof data.total_inserido === 'number' ? jobs.get(jobId)?.totalRows : jobs.get(jobId)?.totalRows),
                insertedRows: typeof data.current === 'number' ? data.current : (typeof data.total_inserido === 'number' ? data.total_inserido : jobs.get(jobId)?.insertedRows),
                errorMessage: data.error || (data.stage === 'error' ? data.message : undefined)
            };
            applyState(jobId, partial);
        };

        es.onerror = () => {
            // Browser tenta reconectar automaticamente. Se o job terminou,
            // o servidor fecha a conexao e o EventSource fica em CLOSED;
            // nesse caso, faz polling final ao job para sincronizar estado.
            if (es.readyState === EventSource.CLOSED) {
                sources.delete(jobId);
                fetch(`/api/excel/jobs/${jobId}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(j => {
                        if (!j) return;
                        applyState(jobId, {
                            jobId,
                            tableName: j.tableName,
                            status: j.status,
                            stage: j.stage,
                            message: j.message,
                            progress: j.progress,
                            totalRows: j.totalRows,
                            insertedRows: j.insertedRows,
                            errorMessage: j.errorMessage
                        });
                    })
                    .catch(() => {});
            }
        };
    }

    async function init() {
        // 1) Pega lista de jobs ativos do servidor (fonte de verdade)
        let serverJobs = [];
        try {
            const r = await fetch('/api/excel/jobs?status=running,queued');
            if (r.ok) serverJobs = await r.json();
        } catch (_) {}

        // 2) Junta com o que estava no localStorage (caso o cliente tenha
        // anotado um jobId que ainda nao apareceu no servidor — race rara)
        const persisted = hydrate();
        const known = new Map();
        serverJobs.forEach(j => known.set(j.jobId, { jobId: j.jobId, tableName: j.tableName }));
        persisted.forEach(p => { if (!known.has(p.jobId)) known.set(p.jobId, p); });

        // 3) Re-hidrata estado e abre SSE
        serverJobs.forEach(j => {
            applyState(j.jobId, {
                jobId: j.jobId,
                tableName: j.tableName,
                status: j.status,
                stage: j.stage,
                message: j.message,
                progress: j.progress,
                totalRows: j.totalRows,
                insertedRows: j.insertedRows,
                errorMessage: j.errorMessage
            });
        });
        known.forEach(({ jobId, tableName }) => attach(jobId, tableName));
    }

    function start({ jobId, tableName, fileName }) {
        if (!jobId) return;
        applyState(jobId, {
            jobId,
            tableName,
            fileName: fileName || null,
            status: 'queued',
            stage: 'queued',
            progress: 0,
            message: 'Enviado para processamento...'
        });
        attach(jobId, tableName);
    }

    function on(jobId, fn) {
        if (typeof fn !== 'function') return () => {};
        getListeners(jobId).add(fn);
        return () => getListeners(jobId).delete(fn);
    }

    function getJob(jobId) { return jobs.get(jobId) || null; }
    function getJobByTable(tableName) {
        const id = jobByTable.get(tableName);
        return id ? jobs.get(id) : null;
    }
    function hasActiveForTable(tableName) {
        const j = getJobByTable(tableName);
        return !!(j && !TERMINAL.has(j.status));
    }
    function listActive() {
        return Array.from(jobs.values()).filter(j => !TERMINAL.has(j.status));
    }

    window.jobsManager = { init, start, attach, on, getJob, getJobByTable, hasActiveForTable, listActive, TERMINAL };
})();
