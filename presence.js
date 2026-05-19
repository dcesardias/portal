// presence.js
//
// Rastreamento de usuarios online via heartbeat HTTP (POST + polling do admin).
//
// Por que nao SSE: iisnode bufferiza/reusa named pipes entre requests, e
// EventSource entra em loop de reconnect que nao da pra evitar do lado do
// servidor. Polling padrao funciona 100% confiavel em iisnode.
//
// Fluxo:
//   - Usuario final: POST /api/presence/heartbeat a cada ~30s com header
//     X-MS-Id-Token (id_token MSAL). Backend extrai email e atualiza
//     lastSeen[email] = now.
//   - Admin: GET /api/admin/online-count a cada ~5s. Backend conta emails
//     com lastSeen dentro da janela (ONLINE_WINDOW_MS).
//
// Janela: 90s (~3 heartbeats). Tolera 2 heartbeats perdidos por usuario antes
// de considera-lo offline.

'use strict';

const msalVerify = require('./msalVerify');

// email lowercase -> timestamp do ultimo heartbeat (ms)
const lastSeen = new Map();

const ONLINE_WINDOW_MS = 90 * 1000;

function gc() {
    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    for (const [email, ts] of lastSeen) {
        if (ts < cutoff) lastSeen.delete(email);
    }
}

function uniqueOnlineCount() {
    gc();
    return lastSeen.size;
}

function mountPresence({ app, authenticateToken }) {
    // ---------- Heartbeat do usuario final ----------
    app.post('/api/presence/heartbeat', async (req, res) => {
        const idToken = req.headers['x-ms-id-token'];
        if (!idToken) return res.status(401).json({ error: 'msal_required' });
        try {
            const payload = await msalVerify.verify(idToken);
            const email = (msalVerify.extractEmail(payload) || '').toLowerCase().trim();
            if (!email) return res.status(401).json({ error: 'email_not_found' });
            lastSeen.set(email, Date.now());
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

    console.log('[PRESENCE] Endpoints montados: POST /api/presence/heartbeat, GET /api/admin/online-count');
}

module.exports = { mountPresence };
