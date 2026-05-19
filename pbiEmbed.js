// pbiEmbed.js
//
// Modulo aditivo — gera Embed Token para reports do Power BI usando
// Service Principal (App Owns Data). NAO toca em nenhuma tabela do banco.
// NAO modifica nenhuma rota existente. Pode ser removido em segundos.
//
// Endpoints expostos:
//   GET  /api/embed/status        -> diagnostico (sem secret)
//   POST /api/embed/token         -> { workspaceId, reportId } => { embedUrl, accessToken, expiration }
//
// Variaveis de ambiente esperadas:
//   PBI_TENANT_ID, PBI_CLIENT_ID, PBI_CLIENT_SECRET
//
// Auth do endpoint /api/embed/token (decisao 2026-05-18):
//   - id_token MSAL via header X-MS-Id-Token (validado contra JWKs do tenant,
//     aud = client_id do portal, iss = tenant correto) — prova quem e o usuario.
//   - Allowlist via REST do Power BI Service (Manage access do workspace/report)
//     — controla quais emails podem gerar embed token para a page.
//   - NAO exige JWT do portal: usuario final do portal acessa via MSAL apenas;
//     JWT eh do fluxo admin (username/password) e nao se aplica aqui.
//   - Roadmap: migrar para access_token MSAL contra scope proprio (api://.../
//     access_as_user) — padrao oficial do Entra para proteger Web APIs.

'use strict';

const sql = require('mssql');
const { getEffectiveAllowlist, isAllowed, normalizeEmail } = require('./pbiPermissions');
const msalVerify = require('./msalVerify');

const AAD_TOKEN_URL = (tenantId) =>
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
const PBI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const PBI_BASE = 'https://api.powerbi.com/v1.0/myorg';

// Cache de AAD token em memoria (process-wide). Renova com folga de 5 min.
let aadTokenCache = { value: null, expiresAt: 0 };

function nowMs() { return Date.now(); }

function envOk() {
    return Boolean(
        process.env.PBI_TENANT_ID &&
        process.env.PBI_CLIENT_ID &&
        process.env.PBI_CLIENT_SECRET
    );
}

async function getAadToken() {
    if (aadTokenCache.value && nowMs() < aadTokenCache.expiresAt - 5 * 60 * 1000) {
        return aadTokenCache.value;
    }
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.PBI_CLIENT_ID,
        client_secret: process.env.PBI_CLIENT_SECRET,
        scope: PBI_SCOPE,
    });
    const res = await fetch(AAD_TOKEN_URL(process.env.PBI_TENANT_ID), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (!res.ok || !json?.access_token) {
        const code = json?.error || 'unknown';
        const msg = json?.error_description || text;
        const err = new Error(`AAD token nao obtido (${code}): ${msg}`);
        err.status = 502;
        err.stage = 'aad';
        throw err;
    }
    aadTokenCache = {
        value: json.access_token,
        expiresAt: nowMs() + (json.expires_in || 3600) * 1000,
    };
    return aadTokenCache.value;
}

async function pbiGet(path, aadToken) {
    const res = await fetch(`${PBI_BASE}${path}`, {
        headers: { Authorization: `Bearer ${aadToken}` },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (!res.ok) {
        const err = new Error(`Power BI GET ${path} falhou: HTTP ${res.status} ${text}`);
        err.status = res.status;
        err.stage = 'pbi-get';
        err.body = json || text;
        throw err;
    }
    return json;
}

async function generateEmbedToken(aadToken, workspaceId, reportId, datasetId, identities) {
    const payload = {
        datasets: [{ id: datasetId }],
        reports: [{ id: reportId }],
        targetWorkspaces: [{ id: workspaceId }],
    };
    if (Array.isArray(identities) && identities.length > 0) {
        payload.identities = identities;
    }
    const res = await fetch(`${PBI_BASE}/GenerateToken`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${aadToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (!res.ok || !json?.token) {
        const err = new Error(`GenerateToken falhou: HTTP ${res.status} ${text}`);
        err.status = res.status;
        err.stage = 'generate-token';
        err.body = json || text;
        throw err;
    }
    return json; // { token, tokenId, expiration }
}

function isGuid(s) {
    return typeof s === 'string' && /^[0-9a-fA-F-]{36}$/.test(s);
}

async function loadPage(getPool, pageId, workspaceId, reportId) {
    if (typeof getPool !== 'function') return null;
    const pool = getPool();
    if (!pool || !pool.connected) return null;
    const req = pool.request();
    let query;
    if (Number.isInteger(pageId) && pageId > 0) {
        req.input('id', sql.Int, pageId);
        query = 'SELECT TOP 1 * FROM Pages WHERE Id = @id AND IsActive = 1';
    } else if (workspaceId && reportId) {
        req.input('wsId', sql.UniqueIdentifier, workspaceId);
        req.input('rId', sql.UniqueIdentifier, reportId);
        query = 'SELECT TOP 1 * FROM Pages WHERE EmbedWorkspaceId = @wsId AND EmbedReportId = @rId AND IsActive = 1';
    } else {
        return null;
    }
    const result = await req.query(query);
    return result.recordset[0] || null;
}

function mountPbiEmbed({ app, getPool }) {
    // Diagnostico — confirma se as env vars estao setadas (sem expor secret)
    app.get('/api/embed/status', (req, res) => {
        res.json({
            configured: envOk(),
            tenantId: process.env.PBI_TENANT_ID || null,
            clientId: process.env.PBI_CLIENT_ID || null,
            secretPresent: Boolean(process.env.PBI_CLIENT_SECRET),
            aadTokenCached: Boolean(aadTokenCache.value),
            aadTokenExpiresAt: aadTokenCache.expiresAt
                ? new Date(aadTokenCache.expiresAt).toISOString()
                : null,
        });
    });

    app.post('/api/embed/token', async (req, res) => {
        try {
            if (!envOk()) {
                return res.status(503).json({
                    error: 'embed_not_configured',
                    message: 'Variaveis PBI_TENANT_ID / PBI_CLIENT_ID / PBI_CLIENT_SECRET nao definidas no servidor.',
                });
            }
            const { workspaceId, reportId, pageId } = req.body || {};
            if (!isGuid(workspaceId) || !isGuid(reportId)) {
                return res.status(400).json({
                    error: 'invalid_input',
                    message: 'workspaceId e reportId precisam ser GUIDs.',
                });
            }

            // --- Checagem de permissao ---
            // 1) Verifica id_token MSAL do usuario (header X-MS-Id-Token)
            const idToken = req.headers['x-ms-id-token'];
            let userEmail = null;
            if (idToken) {
                try {
                    const payload = await msalVerify.verify(idToken);
                    userEmail = msalVerify.extractEmail(payload);
                } catch (e) {
                    return res.status(401).json({
                        error: 'invalid_msal_token',
                        message: `id_token MSAL invalido: ${e.message}`,
                    });
                }
            }

            // 2) Carrega a page (pra ter AllowedAADGroups + confirmar IDs)
            const page = await loadPage(getPool, pageId, workspaceId, reportId);
            if (!page) {
                return res.status(404).json({
                    error: 'page_not_found',
                    message: 'Pagina nao encontrada ou IDs nao batem com nenhuma page cadastrada.',
                });
            }

            // 2.5) Redirect condicional: se a page tem RedirectEmbed* + emails
            //      configurados E o usuario logado bate com a lista, troca os
            //      IDs efetivos. A allowlist e a chamada GenerateToken passam a
            //      usar o workspace/report de redirect — incluindo a verificacao
            //      de quem pode acessar (Manage access do workspace alvo).
            const redirectWs = page.RedirectEmbedWorkspaceId || page.redirectEmbedWorkspaceId;
            const redirectRid = page.RedirectEmbedReportId || page.redirectEmbedReportId;
            const redirectEmailsRaw = page.RedirectEmails || page.redirectEmails || '';
            let effectiveWorkspaceId = workspaceId;
            let effectiveReportId = reportId;
            if (redirectWs && redirectRid && redirectEmailsRaw && userEmail) {
                const redirectEmails = String(redirectEmailsRaw)
                    .split(/[;,\n\r]+/)
                    .map(s => s.trim().toLowerCase())
                    .filter(Boolean);
                if (redirectEmails.includes(String(userEmail).toLowerCase())) {
                    effectiveWorkspaceId = redirectWs;
                    effectiveReportId = redirectRid;
                    console.log(`[PBI EMBED] redirect aplicado pro user ${userEmail} -> ws=${redirectWs} r=${redirectRid}`);
                }
            }
            const effectivePage = Object.assign({}, page, {
                embedWorkspaceId: effectiveWorkspaceId,
                EmbedWorkspaceId: effectiveWorkspaceId,
                embedReportId: effectiveReportId,
                EmbedReportId: effectiveReportId,
            });

            // 3) Resolve allowlist efetiva (override ou PBI service) — usa os
            //    IDs efetivos pra que a verificacao bata com o workspace alvo.
            let allowlist = { emails: new Set(), groupIds: [], source: null };
            try {
                allowlist = await getEffectiveAllowlist(effectivePage, getAadToken);
            } catch (e) {
                console.warn('[PBI EMBED] falha ao resolver allowlist:', e.message);
            }

            // 4) Se ha allowlist nao-vazia, exige login MSAL + email permitido
            if (allowlist.emails.size > 0 || allowlist.groupIds.length > 0) {
                if (!userEmail) {
                    return res.status(401).json({
                        error: 'msal_required',
                        message: 'Este painel exige login Microsoft. Faca sign-in e tente novamente.',
                    });
                }
                if (!isAllowed(userEmail, allowlist)) {
                    return res.status(403).json({
                        error: 'forbidden',
                        message: `Usuario ${userEmail} nao tem permissao para visualizar este painel.`,
                        hint: allowlist.source === 'pbi'
                            ? 'Permissao gerenciada via Power BI Service (workspace/report users).'
                            : 'Permissao gerenciada via allowlist do portal.',
                    });
                }
            }
            // (Se allowlist vazia: pagina livre — preserva comportamento atual.
            //  Logamos pra observabilidade.)
            if (allowlist.emails.size === 0 && allowlist.groupIds.length === 0) {
                console.log(`[PBI EMBED] page ${page.Id} sem allowlist — acesso livre`);
            }

            const aadToken = await getAadToken();
            const report = await pbiGet(
                `/groups/${effectiveWorkspaceId}/reports/${effectiveReportId}`,
                aadToken,
            );
            if (!report?.datasetId || !report?.embedUrl) {
                return res.status(502).json({
                    error: 'report_metadata_incomplete',
                    message: 'Resposta do Power BI nao trouxe datasetId/embedUrl.',
                    report,
                });
            }
            // RLS: se a Page tem EmbedRoles preenchido, monta identities com
            // o email do usuario MSAL como username + roles configurados +
            // datasetId. Sem MSAL e RLS exigido pelo dataset, PBI rejeita.
            let identities = null;
            const rawRoles = page.EmbedRoles || page.embedRoles || '';
            if (rawRoles) {
                const roles = String(rawRoles)
                    .split(/[;,\n\r]+/)
                    .map(s => s.trim())
                    .filter(Boolean);
                if (roles.length > 0) {
                    if (!userEmail) {
                        return res.status(401).json({
                            error: 'msal_required',
                            message: 'Este painel usa Row-Level Security e exige login Microsoft para identificar o usuario.',
                        });
                    }
                    identities = [{
                        username: userEmail,
                        roles,
                        datasets: [report.datasetId],
                    }];
                }
            }

            const embed = await generateEmbedToken(
                aadToken,
                effectiveWorkspaceId,
                effectiveReportId,
                report.datasetId,
                identities,
            );
            return res.json({
                embedUrl: report.embedUrl,
                reportId: effectiveReportId,
                workspaceId: effectiveWorkspaceId,
                datasetId: report.datasetId,
                reportName: report.name,
                accessToken: embed.token,
                tokenId: embed.tokenId,
                expiration: embed.expiration,
            });
        } catch (e) {
            console.error('[PBI EMBED]', e.stage || 'unknown', e.message);
            const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
            return res.status(status).json({
                error: e.stage || 'embed_error',
                message: e.message,
                body: e.body,
            });
        }
    });

    console.log('[PBI EMBED] Endpoints montados: GET /api/embed/status, POST /api/embed/token');
}

module.exports = { mountPbiEmbed };
