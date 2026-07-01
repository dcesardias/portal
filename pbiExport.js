// pbiExport.js
//
// Export server-side de reports embedados (PDF/PPTX/PNG) via Power BI REST
// API. Fluxo assincrono — frontend inicia, faz polling, depois baixa o file.
//
// Endpoints (todos exigem X-MS-Id-Token MSAL):
//   POST /api/embed/export             -> { pageId, format } => { exportId }
//   GET  /api/embed/export/status      -> ?pageId&exportId   => { status, percentComplete }
//   GET  /api/embed/export/file        -> ?pageId&exportId   => stream do arquivo
//
// Auth/allowlist: mesma logica de pbiEmbed (MSAL + email na allowlist do
// workspace/report alvo, com suporte a redirect condicional).
//
// Requer Premium/Fabric capacity (ExportTo nao funciona em PPU). AACD esta
// em F8 — OK.

'use strict';

const sql = require('mssql');
const { getAadToken, loadPage, isGuid } = require('./pbiEmbed');
const { getEffectiveAllowlist, isAllowed } = require('./pbiPermissions');
const msalVerify = require('./msalVerify');

const PBI_BASE = 'https://api.powerbi.com/v1.0/myorg';

const FORMAT_EXT = {
    PDF: 'pdf',
    PPTX: 'pptx',
    PNG: 'png',
};
const FORMAT_MIME = {
    PDF: 'application/pdf',
    PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    PNG: 'image/png',
};

function normalizeFormat(raw) {
    const f = String(raw || '').toUpperCase().trim();
    if (FORMAT_EXT[f]) return f;
    return null;
}

// Resolve a page e os IDs efetivos (redirect) + valida que o user tem acesso.
// Devolve { page, effectiveWorkspaceId, effectiveReportId, userEmail } ou
// envia uma resposta de erro (e retorna null).
async function resolvePageContext({ req, res, getPool }) {
    const idToken = req.headers['x-ms-id-token'];
    let userEmail = null;
    if (idToken) {
        try {
            const payload = await msalVerify.verify(idToken);
            userEmail = msalVerify.extractEmail(payload);
        } catch (e) {
            res.status(401).json({ error: 'invalid_msal_token', message: e.message });
            return null;
        }
    }

    const pageId = Number(req.body?.pageId || req.query?.pageId);
    if (!Number.isInteger(pageId) || pageId <= 0) {
        res.status(400).json({ error: 'invalid_input', message: 'pageId obrigatorio.' });
        return null;
    }

    const page = await loadPage(getPool, pageId, null, null);
    if (!page) {
        res.status(404).json({ error: 'page_not_found' });
        return null;
    }
    if (!page.UseEmbed) {
        res.status(400).json({ error: 'page_not_embed', message: 'Page nao esta em modo embed.' });
        return null;
    }
    const primaryWs = page.EmbedWorkspaceId;
    const primaryRid = page.EmbedReportId;
    if (!isGuid(primaryWs) || !isGuid(primaryRid)) {
        res.status(400).json({ error: 'invalid_embed_ids' });
        return null;
    }

    // Redirect condicional (mesma logica de pbiEmbed)
    let effectiveWs = primaryWs, effectiveRid = primaryRid;
    const redirectWs = page.RedirectEmbedWorkspaceId;
    const redirectRid = page.RedirectEmbedReportId;
    const redirectEmailsRaw = page.RedirectEmails || '';
    if (redirectWs && redirectRid && redirectEmailsRaw && userEmail) {
        const redirectEmails = String(redirectEmailsRaw)
            .split(/[;,\n\r]+/)
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
        if (redirectEmails.includes(String(userEmail).toLowerCase())) {
            effectiveWs = redirectWs;
            effectiveRid = redirectRid;
        }
    }

    const effectivePage = Object.assign({}, page, {
        embedWorkspaceId: effectiveWs,
        EmbedWorkspaceId: effectiveWs,
        embedReportId: effectiveRid,
        EmbedReportId: effectiveRid,
    });

    // Allowlist
    let allowlist = { emails: new Set(), groupIds: [], source: null };
    try {
        allowlist = await getEffectiveAllowlist(effectivePage, getAadToken);
    } catch (e) {
        console.warn('[PBI EXPORT] allowlist falhou:', e.message);
    }
    if (allowlist.emails.size > 0 || allowlist.groupIds.length > 0) {
        if (!userEmail) {
            res.status(401).json({ error: 'msal_required' });
            return null;
        }
        if (!isAllowed(userEmail, allowlist)) {
            res.status(403).json({ error: 'forbidden', message: `Usuario ${userEmail} sem permissao.` });
            return null;
        }
    }

    return {
        page,
        effectiveWorkspaceId: effectiveWs,
        effectiveReportId: effectiveRid,
        userEmail,
    };
}

function buildIdentities(page, userEmail, datasetId) {
    const rawRoles = page.EmbedRoles || '';
    if (!rawRoles || !userEmail || !datasetId) return null;
    const roles = String(rawRoles).split(/[;,\n\r]+/).map(s => s.trim()).filter(Boolean);
    if (roles.length === 0) return null;
    return [{ username: userEmail, roles, datasets: [datasetId] }];
}

async function pbiCall(method, path, aadToken, body) {
    const headers = { Authorization: `Bearer ${aadToken}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${PBI_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, text, json };
}

function mountPbiExport({ app, getPool }) {
    // ---------- 1) Inicia export ----------
    app.post('/api/embed/export', async (req, res) => {
        try {
            const ctx = await resolvePageContext({ req, res, getPool });
            if (!ctx) return;

            const format = normalizeFormat(req.body?.format);
            if (!format) {
                return res.status(400).json({ error: 'invalid_format', message: 'format deve ser PDF, PPTX ou PNG.' });
            }

            const aadToken = await getAadToken();

            // Precisamos do datasetId pra montar identities (RLS).
            let datasetId = null;
            if (ctx.page.EmbedRoles) {
                const r = await pbiCall('GET', `/groups/${ctx.effectiveWorkspaceId}/reports/${ctx.effectiveReportId}`, aadToken);
                if (r.ok && r.json?.datasetId) datasetId = r.json.datasetId;
            }
            const identities = buildIdentities(ctx.page, ctx.userEmail, datasetId);

            const payload = { format };
            if (identities) {
                payload.powerBIReportConfiguration = { identities };
            }

            const exp = await pbiCall(
                'POST',
                `/groups/${ctx.effectiveWorkspaceId}/reports/${ctx.effectiveReportId}/ExportTo`,
                aadToken,
                payload,
            );
            if (!exp.ok || !exp.json?.id) {
                console.error('[PBI EXPORT] ExportTo falhou:', {
                    status: exp.status,
                    ws: ctx.effectiveWorkspaceId,
                    report: ctx.effectiveReportId,
                    body: exp.json || exp.text,
                });
                return res.status(exp.status || 502).json({
                    error: 'export_start_failed',
                    message: (exp.json && (exp.json.error?.message || exp.json.error?.code || exp.json.message)) || 'Falha ao iniciar export.',
                    body: exp.json || exp.text,
                });
            }
            res.json({
                exportId: exp.json.id,
                status: exp.json.status,
                percentComplete: exp.json.percentComplete || 0,
                format,
            });
        } catch (e) {
            console.error('[PBI EXPORT] start error:', e);
            res.status(500).json({ error: 'export_error', message: e.message });
        }
    });

    // ---------- 2) Status do export ----------
    app.get('/api/embed/export/status', async (req, res) => {
        try {
            const ctx = await resolvePageContext({ req, res, getPool });
            if (!ctx) return;
            const exportId = String(req.query?.exportId || '');
            if (!exportId) return res.status(400).json({ error: 'invalid_input', message: 'exportId obrigatorio.' });

            const aadToken = await getAadToken();
            const r = await pbiCall(
                'GET',
                `/groups/${ctx.effectiveWorkspaceId}/reports/${ctx.effectiveReportId}/exports/${exportId}`,
                aadToken,
            );
            if (!r.ok) {
                return res.status(r.status || 502).json({ error: 'status_failed', body: r.json || r.text });
            }
            res.json({
                status: r.json?.status,
                percentComplete: r.json?.percentComplete || 0,
                resourceFileExtension: r.json?.resourceFileExtension,
                expirationTime: r.json?.expirationTime,
            });
        } catch (e) {
            console.error('[PBI EXPORT] status error:', e);
            res.status(500).json({ error: 'export_error', message: e.message });
        }
    });

    // ---------- 3) Download do arquivo ----------
    app.get('/api/embed/export/file', async (req, res) => {
        try {
            const ctx = await resolvePageContext({ req, res, getPool });
            if (!ctx) return;
            const exportId = String(req.query?.exportId || '');
            const format = normalizeFormat(req.query?.format) || 'PDF';
            if (!exportId) return res.status(400).json({ error: 'invalid_input', message: 'exportId obrigatorio.' });

            const aadToken = await getAadToken();
            const upstream = await fetch(
                `${PBI_BASE}/groups/${ctx.effectiveWorkspaceId}/reports/${ctx.effectiveReportId}/exports/${exportId}/file`,
                { headers: { Authorization: `Bearer ${aadToken}` } },
            );
            if (!upstream.ok) {
                const text = await upstream.text();
                return res.status(upstream.status).json({ error: 'file_failed', body: text.slice(0, 500) });
            }

            const filename = `${(ctx.page.Title || 'painel').replace(/[^\w.-]+/g, '_')}.${FORMAT_EXT[format] || 'bin'}`;
            res.setHeader('Content-Type', FORMAT_MIME[format] || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            const contentLength = upstream.headers.get('content-length');
            if (contentLength) res.setHeader('Content-Length', contentLength);

            // Stream o body upstream -> response.
            const reader = upstream.body.getReader();
            const pump = async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(Buffer.from(value));
                }
                res.end();
            };
            await pump();
        } catch (e) {
            console.error('[PBI EXPORT] file error:', e);
            try { res.status(500).json({ error: 'export_error', message: e.message }); } catch (_) {}
        }
    });

    console.log('[PBI EXPORT] Endpoints montados: POST /api/embed/export, GET /api/embed/export/status, GET /api/embed/export/file');
}

module.exports = { mountPbiExport };
