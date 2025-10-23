'use strict';

// Patch savePage: avoid misleading error if only the reload fails
(function() {
    function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
    function isChecked(id) { const el = document.getElementById(id); return el ? !!el.checked : false; }
    function prep(val, max) {
        try { return (window.prepareStringForDb ? window.prepareStringForDb(val, max).value : (val || '')); }
        catch(_) { return val || ''; }
    }
    async function reloadSafely() {
        try { if (typeof window.loadDataFromAPI === 'function') await window.loadDataFromAPI(); }
        catch (e) { console.warn('[savePage] reload warning:', e); }
        try {
            if (window.selectedPageId === null && typeof window.loadQuickAccessCards === 'function') {
                window.loadQuickAccessCards();
            }
        } catch (_) {}
    }

    // Override global savePage to improve UX/errors after save
    window.savePage = async function() {
        const title = getVal('pageNameInput').trim();
        if (!title) { alert('Por favor, preencha o título da página'); return; }

        const token = localStorage.getItem('authToken');
        if (!token) { alert('Faça login como administrador para salvar páginas'); return; }

        const MAX = (window.MAX_LENGTHS || {});
        const payload = {
            title:       prep(title,                           MAX.pageTitle     || 200),
            subtitle:    prep(getVal('pageSubtitleInput'),     MAX.pageSubtitle  || 500),
            description: prep(getVal('pageDescInput'),         MAX.pageDescription || 4000),
            powerBIUrl:  prep(getVal('powerbiUrlInput'),       MAX.powerBIUrl    || 2000),
            showInHome:  isChecked('showInHomeCheckbox'),
            icon:        prep(getVal('pageIconInput'),         MAX.pageIcon      || 500) || null
        };

        const editingId = (typeof window.editingPageId !== 'undefined' && window.editingPageId) ? window.editingPageId : null;
        const url = editingId ? `${location.origin}/api/pages/${editingId}` : `${location.origin}/api/pages`;
        const method = editingId ? 'PUT' : 'POST';

        try {
            const resp = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const body = await resp.text().catch(() => resp.statusText);
                alert(`Erro ao salvar página: ${body || resp.statusText} (status ${resp.status})`);
                return;
            }

            // Sucesso: limpar formulário e estado de edição
            try { if (typeof window.clearPageForm === 'function') window.clearPageForm(); } catch (_) {}
            window.editingPageId = null;
            const btn = document.getElementById('savePageBtn'); if (btn) btn.textContent = 'Salvar Página';
            const cancel = document.getElementById('cancelPageEditBtn'); if (cancel) cancel.style.display = 'none';

            // Recarregar dados sem falhar a operação de salvar
            await reloadSafely();
            alert(editingId ? 'Página atualizada com sucesso!' : 'Página salva com sucesso!');
        } catch (err) {
            console.error('[savePage] erro:', err);
            // Evitar mensagem enganosa: o erro pode ser apenas ao recarregar a UI
            alert(`Não foi possível atualizar a interface após salvar. Detalhes: ${err.message || err}`);
        }
    };
})();
