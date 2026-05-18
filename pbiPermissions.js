// pbiPermissions.js
//
// Resolve a allowlist efetiva de uma pagina (workspace + report) lendo
// permissoes diretamente do Power BI Service. Usuario logado via MSAL no
// portal precisa ter UPN/email batendo com algum entry da lista pra liberar
// o embed token.
//
// Logica:
//   - Se page.AllowedAADGroups (override) tem entries: usa eles.
//   - Senao: chama PBI REST `GET /groups/{wsId}/users` + `GET /groups/{wsId}/reports/{rid}/users`,
//     pega principalType=User, devolve emails.
//   - Entries do tipo Group (security group AAD) sao IGNORADOS por enquanto
//     (precisariam expansao via Graph com admin consent — fica pra fase 2).
//
// Cache: 5 min por chave (workspace + report).

'use strict';

const PBI_BASE = 'https://api.powerbi.com/v1.0/myorg';
const TTL_MS = 5 * 60 * 1000;

const cache = new Map(); // key -> { expiresAt, emails }

function normalizeEmail(s) {
    return (s || '').toLowerCase().trim();
}

function parseOverride(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // tenta JSON array; senao quebra por virgula/quebra-linha/;
    try {
        const j = JSON.parse(trimmed);
        if (Array.isArray(j)) return j;
    } catch (_) {}
    return trimmed.split(/[;,\n\r]+/).map(s => s.trim()).filter(Boolean);
}

async function pbiGet(path, aadToken) {
    const res = await fetch(`${PBI_BASE}${path}`, {
        headers: { Authorization: `Bearer ${aadToken}` },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (!res.ok) {
        const err = new Error(`PBI GET ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.status = res.status;
        err.body = json || text;
        throw err;
    }
    return json;
}

/**
 * Devolve { emails: Set<string>, groupIds: string[], source: 'override'|'pbi' }
 * emails = UPNs/emails normalizados (lowercase) com permissao
 * groupIds = AAD security group ids encontrados (informativo; nao expandidos)
 */
async function getEffectiveAllowlist(page, getAadToken) {
    const overrideRaw = page.allowedAADGroups || page.AllowedAADGroups;
    const override = parseOverride(overrideRaw);
    if (override && override.length > 0) {
        const emails = new Set();
        const groupIds = [];
        for (const entry of override) {
            const s = String(entry).trim();
            // GUID puro -> assume group id
            if (/^[0-9a-fA-F-]{36}$/.test(s)) groupIds.push(s);
            else if (s.includes('@')) emails.add(normalizeEmail(s));
        }
        return { emails, groupIds, source: 'override' };
    }

    // Sem override: ler do PBI
    const wsId = page.embedWorkspaceId || page.EmbedWorkspaceId;
    const rId = page.embedReportId || page.EmbedReportId;
    if (!wsId || !rId) return { emails: new Set(), groupIds: [], source: 'pbi' };

    const cacheKey = `${wsId}|${rId}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const aadToken = await getAadToken();
    const emails = new Set();
    const groupIds = [];

    // 1) Workspace users
    try {
        const wsUsers = await pbiGet(`/groups/${wsId}/users`, aadToken);
        for (const u of (wsUsers?.value || [])) {
            if (u.principalType === 'User' && u.emailAddress) {
                emails.add(normalizeEmail(u.emailAddress));
            } else if (u.principalType === 'Group' && u.identifier) {
                groupIds.push(u.identifier);
            }
        }
    } catch (e) {
        console.warn('[PBI PERM] workspace users falhou:', e.message);
    }

    // 2) Report-level users (sharing direto no report)
    try {
        const rUsers = await pbiGet(`/groups/${wsId}/reports/${rId}/users`, aadToken);
        for (const u of (rUsers?.value || [])) {
            if (u.principalType === 'User' && u.emailAddress) {
                emails.add(normalizeEmail(u.emailAddress));
            } else if (u.principalType === 'Group' && u.identifier) {
                groupIds.push(u.identifier);
            }
        }
    } catch (e) {
        // Pode dar 404 se nao houver sharing direto — silencioso
        if (e.status !== 404) console.warn('[PBI PERM] report users falhou:', e.message);
    }

    const value = { emails, groupIds, source: 'pbi' };
    cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value });
    return value;
}

function isAllowed(userEmail, allowlist) {
    if (!userEmail) return false;
    return allowlist.emails.has(normalizeEmail(userEmail));
}

function invalidateCache(workspaceId, reportId) {
    if (workspaceId && reportId) cache.delete(`${workspaceId}|${reportId}`);
    else cache.clear();
}

module.exports = { getEffectiveAllowlist, isAllowed, invalidateCache, normalizeEmail };
