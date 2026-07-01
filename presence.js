// presence.js
//
// Rastreamento de usuarios online via heartbeat HTTP, com suporte a multiplos
// dispositivos por email (util para usuarios genericos compartilhados).
//
// Por que nao SSE: iisnode bufferiza/reusa named pipes entre requests, e
// EventSource entra em loop de reconnect que nao da pra evitar do lado do
// servidor. Polling padrao funciona 100% confiavel em iisnode.
//
// Fluxo:
//   - Usuario final: POST /api/presence/heartbeat a cada ~30s com headers
//     X-MS-Id-Token (id_token MSAL) e X-Device-Id (UUID gerado e persistido
//     em localStorage do browser).
//   - Admin (count):  GET /api/admin/online-count   (distinct emails)
//   - Admin (lista):  GET /api/admin/online-users   (com devices[] por user)
//
// Janela: 90s (~3 heartbeats). Tolera 2 heartbeats perdidos por device antes
// de considera-lo offline. firstSeen reinicia quando o device sai e volta
// (intervalo > 90s).

'use strict';

const dns = require('dns').promises;
const msalVerify = require('./msalVerify');

// email lowercase -> Map<deviceId, { name, firstSeen, lastSeen, userAgent, ip, hostname }>
const presence = new Map();

// Cache de reverse DNS por IP. Hit TTL: 10min (hostnames mudam pouco em rede
// corporativa). Miss TTL: 1min (se nao tinha PTR ainda, da chance de tentar
// de novo sem martelar o DNS toda hora).
const dnsCache = new Map(); // ip -> { hostname (or null), cachedAt }
const DNS_HIT_TTL_MS = 10 * 60 * 1000;
const DNS_MISS_TTL_MS = 60 * 1000;

const ONLINE_WINDOW_MS = 90 * 1000;

function gc() {
    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    for (const [email, devices] of presence) {
        for (const [deviceId, info] of devices) {
            if (info.lastSeen < cutoff) {
                devices.delete(deviceId);
            } else if (info.tabViews) {
                // Limpa abas inativas dentro de devices ainda vivos.
                for (const [tabId, tab] of info.tabViews) {
                    if (tab.lastSeen < cutoff) info.tabViews.delete(tabId);
                }
            }
        }
        if (devices.size === 0) presence.delete(email);
    }
    // Limpa cache de DNS antigo pra nao crescer indefinidamente.
    const dnsCutoff = Date.now() - DNS_HIT_TTL_MS;
    for (const [ip, info] of dnsCache) {
        if (info.cachedAt < dnsCutoff) dnsCache.delete(ip);
    }
}

// Extrai o IP do cliente. Em iisnode atras do IIS, req.ip pode vir como
// '::ffff:10.x.x.x' (IPv4 mapeado em IPv6); normalizamos pra IPv4 puro.
// X-Forwarded-For tem prioridade pra cobrir cenarios de proxy interno.
function extractClientIp(req) {
    const xff = req.headers && req.headers['x-forwarded-for'];
    let ip = '';
    if (xff) {
        ip = String(xff).split(',')[0].trim();
    } else if (req.ip) {
        ip = String(req.ip);
    } else if (req.socket && req.socket.remoteAddress) {
        ip = String(req.socket.remoteAddress);
    }
    return ip.replace(/^::ffff:/, '');
}

// Reverse DNS com cache. Retorna hostname string ou null. Nunca lanca.
// Resolve em background (caller nao espera) — atualiza a entrada de presence
// quando o resultado chega.
async function resolveHostname(ip) {
    if (!ip) return null;
    // Ignora loopback e IPs ja' obviamente sem PTR util.
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('169.254.')) return null;

    const cached = dnsCache.get(ip);
    if (cached) {
        const age = Date.now() - cached.cachedAt;
        const ttl = cached.hostname ? DNS_HIT_TTL_MS : DNS_MISS_TTL_MS;
        if (age < ttl) return cached.hostname;
    }

    try {
        const hostnames = await dns.reverse(ip);
        const hostname = (Array.isArray(hostnames) && hostnames.length > 0) ? hostnames[0] : null;
        dnsCache.set(ip, { hostname, cachedAt: Date.now() });
        return hostname;
    } catch (_) {
        // ENOTFOUND, ENODATA, timeout — sem PTR.
        dnsCache.set(ip, { hostname: null, cachedAt: Date.now() });
        return null;
    }
}

// Dispara resolucao em background e atualiza todos os devices com esse IP
// quando o hostname chegar. Nao bloqueia a resposta do heartbeat.
function backfillHostname(ip) {
    if (!ip) return;
    resolveHostname(ip).then(hostname => {
        if (!hostname) return;
        for (const [, devices] of presence) {
            for (const [, info] of devices) {
                if (info.ip === ip && !info.hostname) info.hostname = hostname;
            }
        }
    }).catch(() => {});
}

function uniqueOnlineCount() {
    gc();
    return presence.size;
}

function listOnlineUsers() {
    gc();
    const result = [];
    for (const [email, devices] of presence) {
        if (devices.size === 0) continue;
        const deviceList = [];
        let earliestFirstSeen = Infinity;
        let latestLastSeen = 0;
        let nameOfLatest = '';
        let latestTs = 0;
        for (const [deviceId, info] of devices) {
            // Coleta views de todas as abas ativas (Map<tabId,{view,...}>),
            // deduplicando por codigo de view. Preserva ordem de abertura.
            // Fallback para campo legado `view` se tabViews nao existe.
            const views = [];
            if (info.tabViews && info.tabViews.size > 0) {
                const seen = new Set();
                for (const tab of info.tabViews.values()) {
                    if (tab.view && !seen.has(tab.view)) {
                        seen.add(tab.view);
                        views.push(tab.view);
                    }
                }
            } else if (info.view) {
                views.push(info.view);
            }

            deviceList.push({
                deviceId,
                firstSeen: info.firstSeen,
                lastSeen: info.lastSeen,
                userAgent: info.userAgent || '',
                ip: info.ip || '',
                hostname: info.hostname || '',
                winUser: info.winUser || '',
                views,
            });
            if (info.firstSeen < earliestFirstSeen) earliestFirstSeen = info.firstSeen;
            if (info.lastSeen > latestLastSeen) latestLastSeen = info.lastSeen;
            // Pega o nome do device com lastSeen mais recente — mais provavel
            // de estar com claim atualizada.
            if (info.lastSeen > latestTs && info.name) {
                latestTs = info.lastSeen;
                nameOfLatest = info.name;
            }
        }
        deviceList.sort((a, b) => a.firstSeen - b.firstSeen);
        result.push({
            email,
            name: nameOfLatest || email,
            deviceCount: deviceList.length,
            earliestFirstSeen,
            latestLastSeen,
            devices: deviceList,
        });
    }
    result.sort((a, b) => a.earliestFirstSeen - b.earliestFirstSeen);
    return result;
}

function mountPresence({ app, authenticateToken }) {
    // ---------- Heartbeat do usuario final ----------
    app.post('/api/presence/heartbeat', async (req, res) => {
        const idToken = req.headers['x-ms-id-token'];
        if (!idToken) return res.status(401).json({ error: 'msal_required' });

        // X-Device-Id e' um UUID gerado/persistido no localStorage do browser.
        // Limita 64 chars pra evitar abuso. Sem deviceId tratamos como uma
        // pseudo-sessao por IP+UA (ver fallback abaixo) — mas em geral o
        // frontend sempre envia.
        const rawDeviceId = (req.headers['x-device-id'] || '').toString().trim().slice(0, 64);
        const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 256);
        const clientIp = extractClientIp(req);
        const deviceId = rawDeviceId || ('fallback:' + (clientIp || 'unknown') + ':' + userAgent.slice(0, 32));
        // Usuario Windows (DOMAIN\username) capturado pelo cliente via
        // /api/whoami-windows (NTLM/Kerberos). Vazio se nao for maquina
        // joined no dominio ou se IIS Windows Auth nao tiver sido habilitado.
        const winUser = (req.headers['x-win-user'] || '').toString().trim().slice(0, 128);
        // View atual no portal: codigo curto tipo "portal:page:42" ou
        // "admin:presenca". O front do admin resolve pra titulo amigavel.
        const view = (req.headers['x-portal-view'] || '').toString().trim().slice(0, 64);
        // tabId: UUID por aba (sessionStorage). Diferente do deviceId que e'
        // por browser (localStorage). Permite rastrear view de cada aba
        // separadamente quando o usuario tem multiplas abas abertas.
        const tabId = (req.headers['x-tab-id'] || '').toString().trim().slice(0, 64);

        try {
            const payload = await msalVerify.verify(idToken);
            const email = (msalVerify.extractEmail(payload) || '').toLowerCase().trim();
            if (!email) return res.status(401).json({ error: 'email_not_found' });
            const name = ((payload && payload.name) || '').toString().trim();
            const now = Date.now();

            let devices = presence.get(email);
            if (!devices) {
                devices = new Map();
                presence.set(email, devices);
            }

            const existing = devices.get(deviceId);
            if (existing && (now - existing.lastSeen) <= ONLINE_WINDOW_MS) {
                existing.lastSeen = now;
                if (name) existing.name = name;
                if (userAgent) existing.userAgent = userAgent;
                if (winUser) existing.winUser = winUser;
                if (clientIp && existing.ip !== clientIp) {
                    existing.ip = clientIp;
                    existing.hostname = '';
                }
                // Atualiza a view da aba especifica que enviou este heartbeat.
                if (tabId) {
                    if (!existing.tabViews) existing.tabViews = new Map();
                    existing.tabViews.set(tabId, { view: view || '', lastSeen: now });
                } else {
                    // Fallback sem tabId (cliente antigo sem a feature).
                    existing.view = view;
                }
            } else {
                const tabViews = new Map();
                if (tabId) tabViews.set(tabId, { view: view || '', lastSeen: now });
                devices.set(deviceId, {
                    name: name || email,
                    firstSeen: now,
                    lastSeen: now,
                    userAgent,
                    ip: clientIp,
                    hostname: '',
                    winUser: winUser || '',
                    view: tabId ? '' : (view || ''), // legado sem tabId
                    tabViews,
                });
            }

            // Reverse DNS em background — nao bloqueia a resposta. Se ja' temos
            // hostname no cache, o backfill aplica imediatamente.
            backfillHostname(clientIp);

            return res.json({ ok: true });
        } catch (e) {
            return res.status(401).json({ error: 'invalid_msal_token', message: e.message });
        }
    });

    // ---------- Contador (admin) ----------
    app.get('/api/admin/online-count', authenticateToken, (req, res) => {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ error: 'forbidden' });
        }
        res.json({
            count: uniqueOnlineCount(),
            windowSeconds: ONLINE_WINDOW_MS / 1000,
            timestamp: Date.now(),
        });
    });

    // ---------- Lista detalhada (admin) ----------
    app.get('/api/admin/online-users', authenticateToken, (req, res) => {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ error: 'forbidden' });
        }
        res.json({
            users: listOnlineUsers(),
            windowSeconds: ONLINE_WINDOW_MS / 1000,
            timestamp: Date.now(),
        });
    });

    console.log('[PRESENCE] Endpoints montados: POST /api/presence/heartbeat, GET /api/admin/online-count, GET /api/admin/online-users');
}

module.exports = { mountPresence };
