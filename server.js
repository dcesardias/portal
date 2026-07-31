// server.js
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ensureMapDbTables, mountMapDb } = require('./mapdbIntegration');
const { createUserManagementRouter, loadAppsByUserId } = require('./userManagement');
const { mountPbiEmbed } = require('./pbiEmbed');
const { mountPbiExport } = require('./pbiExport');
const { mountPresence } = require('./presence');
const msalVerify = require('./msalVerify');

try { require('dotenv').config(); } catch (e) { console.warn('dotenv não encontrado (opcional)'); }

const app = express();
// No IIS/iisnode, PORT é um named pipe (string), não um número
const PORT = process.env.PORT || process.env.IISNODE_VERSION ? process.env.PORT : 3000;
const HOST = process.env.IISNODE_VERSION ? undefined : (process.env.HOST || '0.0.0.0');

const DIRECT_LINE_SECRET = process.env.DIRECT_LINE_SECRET;
const DIRECT_LINE_ENDPOINT = process.env.DIRECT_LINE_ENDPOINT || 'https://directline.botframework.com/v3/directline';
const MICROSOFT_AUTH_CLIENT_ID = process.env.MICROSOFT_AUTH_CLIENT_ID || 'b97df545-f361-4a9b-913f-f6a4b957486c';
const MICROSOFT_AUTH_TENANT_ID = process.env.MICROSOFT_AUTH_TENANT_ID || '1ebad822-ee55-4814-9f70-6defb1fb0694';
const MICROSOFT_AUTH_ENABLED = String(process.env.MICROSOFT_AUTH_ENABLED || 'true').toLowerCase() !== 'false';
const MICROSOFT_AUTH_FORCE_SELECT = String(process.env.MICROSOFT_AUTH_FORCE_SELECT || 'false').toLowerCase() === 'true';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fetchFn = (typeof fetch !== 'undefined')
    ? fetch
    : (...args) => import('node-fetch').then(({ default: f }) => f(...args));

app.use(cors());
// CORRIGIDO: Aumentar limite para aceitar imagens grandes em base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/vendor/msal-browser', express.static(path.join(__dirname, 'node_modules', '@azure', 'msal-browser', 'lib')));
app.use('/vendor/powerbi-client', express.static(path.join(__dirname, 'node_modules', 'powerbi-client', 'dist')));

// ==================== Kanban de Chamados — proxy com autenticação ====================
const { createProxyMiddleware } = require('http-proxy-middleware');
const KANBAN_URL = process.env.KANBAN_API_URL || 'http://localhost:8000';
const KANBAN_COOKIE = 'kanban_sess';

// Lê um cookie específico do header sem depender de cookie-parser
function getKanbanCookie(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        if (part.slice(0, eq).trim() === KANBAN_COOKIE)
            return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return null;
}

// Exige cookie de sessão kanban_sess (emitido por POST /api/kanban/session)
function requireKanbanAccess(req, res, next) {
    const token = getKanbanCookie(req);
    const isApi = req.originalUrl.startsWith('/api/');
    if (!token) {
        return isApi
            ? res.status(401).json({ error: 'Não autenticado. Acesse via portal.' })
            : res.redirect('/chamados/login');
    }
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    jwt.verify(token, secret, (err, user) => {
        if (err) {
            res.setHeader('Set-Cookie', `${KANBAN_COOKIE}=; Max-Age=0; Path=/; HttpOnly`);
            return isApi
                ? res.status(401).json({ error: 'Sessão expirada. Acesse via portal.' })
                : res.redirect('/chamados/login');
        }
        req.kanbanUsername = user.username; // propagado como X-Kanban-User ao FastAPI
        next();
    });
}

// Restaura o path completo após o Express strip o prefixo de montagem
function kanbanPathRewrite(mountPath) {
    return (path) => {
        const qi = path.indexOf('?');
        const pn = qi >= 0 ? path.slice(0, qi) : path;
        const qs = qi >= 0 ? path.slice(qi) : '';
        return mountPath + (pn === '/' ? '' : pn) + qs;
    };
}

// Emite cookie kanban_sess. Aceita JWT do portal (Authorization header)
// OU id_token MSAL (body.idToken) — cobre todos os cenários de login do portal.
app.post('/api/kanban/session', async (req, res) => {
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';

    async function issueKanbanCookie(userId, username, isAdmin) {
        const sessionToken = jwt.sign({ id: userId, username, isAdmin }, secret, { expiresIn: '8h' });
        const secure = !!process.env.IISNODE_VERSION;
        res.setHeader('Set-Cookie',
            `${KANBAN_COOKIE}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${8 * 3600}${secure ? '; Secure' : ''}`
        );
        return res.json({ ok: true });
    }

    // Caminho 1: JWT do portal via Authorization: Bearer
    const authHeader = req.headers['authorization'];
    const portalToken = authHeader && authHeader.split(' ')[1];
    if (portalToken) {
        jwt.verify(portalToken, secret, async (err, user) => {
            if (err) return res.status(401).json({ error: 'Token expirado ou inválido.' });
            const allowed = await userHasAppPermission(user.id, 'chamados');
            if (!allowed) return res.status(403).json({ error: 'Você não tem permissão para acessar o Kanban de Chamados.' });
            return issueKanbanCookie(user.id, user.username, user.isAdmin);
        });
        return;
    }

    // Caminho 2: MSAL id_token via body (usuários que autenticam com Microsoft)
    const idToken = req.body && req.body.idToken;
    if (idToken) {
        try {
            const payload = await msalVerify.verify(idToken);
            const email = (msalVerify.extractEmail(payload) || '').toLowerCase().trim();
            if (!email) return res.status(401).json({ error: 'E-mail não encontrado no token Microsoft.' });
            if (!pool || !pool.connected) return res.status(503).json({ error: 'Banco de dados indisponível.' });

            const result = await pool.request()
                .input('email', sql.NVarChar, email)
                .query('SELECT TOP 1 Id, Username, IsAdmin FROM dbo.Users WHERE LOWER(Email) = @email AND IsActive = 1');

            if (result.recordset.length === 0) {
                return res.status(403).json({ error: 'Sua conta Microsoft não está cadastrada no portal. Contate o administrador.' });
            }

            const user = result.recordset[0];
            const allowed = await userHasAppPermission(user.Id, 'chamados');
            if (!allowed) return res.status(403).json({ error: 'Você não tem permissão para acessar o Kanban de Chamados.' });

            return issueKanbanCookie(user.Id, user.Username, !!user.IsAdmin);
        } catch (e) {
            return res.status(401).json({ error: 'Token Microsoft inválido ou expirado.' });
        }
    }

    return res.status(401).json({ error: 'Credenciais não fornecidas.' });
});

// Página ponte: tenta JWT do portal (usuários locais) e cai pro MSAL (usuários Microsoft)
// Retorna dados do usuário logado a partir do kanban_sess cookie
app.get('/api/kanban/me', async (req, res) => {
    const token = getKanbanCookie(req);
    if (!token) return res.status(401).json({ error: 'Não autenticado.' });
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    let user;
    try { user = jwt.verify(token, secret); } catch (e) { return res.status(401).json({ error: 'Sessão expirada.' }); }
    let fullName = user.username;
    try {
        if (pool && pool.connected) {
            const r = await pool.request()
                .input('id', sql.Int, user.id)
                .query('SELECT TOP 1 FullName FROM dbo.Users WHERE Id = @id');
            if (r.recordset.length > 0 && r.recordset[0].FullName) fullName = r.recordset[0].FullName;
        }
    } catch {}
    return res.json({ username: user.username, fullName, isAdmin: !!user.isAdmin });
});

app.get('/chamados/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanban de Chamados</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1117;color:#9ca3af}
    .card{text-align:center;padding:2.5rem;max-width:380px}
    .logo{font-size:2.8rem;margin-bottom:1.2rem;display:block}
    h2{color:#f3f4f6;font-size:1.2rem;margin-bottom:.35rem}
    .sub{font-size:.85rem;margin-bottom:1.5rem}
    #msg{font-size:.85rem;min-height:1.4em;line-height:1.6}
    .spinner{display:inline-block;width:16px;height:16px;border:2px solid #374151;border-top-color:#6366f1;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:5px}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="card">
    <span class="logo">⛬</span>
    <h2>Kanban de Chamados</h2>
    <p class="sub">Portal de Dados · TI</p>
    <p id="msg"><span class="spinner"></span>Verificando acesso…</p>
  </div>
  <script>
  (function () {
    var msgEl = document.getElementById('msg');

    function showErr(text) {
      msgEl.innerHTML = text;
      setTimeout(function () { window.location.href = '/'; }, 4000);
    }

    // Tenta com JWT do portal (usuários com login local)
    function tryPortalJWT(token) {
      fetch('/api/kanban/session', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function (r) {
        var status = r.status;
        return r.json().then(function (d) { return { status: status, d: d }; });
      }).then(function (res) {
        if (res.d && res.d.ok) {
          sessionStorage.setItem('kanban_tab_auth', '1');
          window.location.href = '/chamados/?_kauth=1';
        } else if (res.status === 401) {
          // Token expirado/inválido — tenta autenticação Microsoft
          tryMSAL();
        } else {
          showErr((res.d && res.d.error) || 'Sem permissão de acesso.');
        }
      }).catch(function () { tryMSAL(); });
    }

    // Cria sessão kanban a partir de um idToken MSAL e redireciona para o SPA
    function doKanbanSession(idToken) {
      return fetch('/api/kanban/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken })
      }).then(function (r) {
        var status = r.status;
        return r.json().then(function (d) { return { status: status, d: d }; });
      }).then(function (res) {
        if (res.d && res.d.ok) {
          sessionStorage.setItem('kanban_tab_auth', '1');
          window.location.href = '/chamados/?_kauth=1';
        } else {
          showErr((res.d && res.d.error) || 'Sem permissão de acesso.');
        }
      });
    }

    // Tenta com conta Microsoft (fluxo principal do portal)
    function tryMSAL() {
      msgEl.innerHTML = '<span class="spinner"></span>Verificando conta Microsoft…';
      var script = document.createElement('script');
      script.src = '/vendor/msal-browser/msal-browser.min.js';
      script.onerror = function () {
        showErr('Biblioteca MSAL não carregada. Acesse o portal e tente novamente.');
      };
      script.onload = function () {
        fetch('/api/microsoft-auth/config?cb=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (cfg) {
            if (!cfg.enabled) {
              showErr('Autenticação Microsoft não habilitada. Faça login com usuário/senha no portal.');
              return;
            }
            var instance = new window.msal.PublicClientApplication({
              auth: {
                clientId: cfg.clientId,
                authority: cfg.authority,
                redirectUri: window.location.origin + '/',
                navigateToLoginRequestUrl: false
              },
              cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
            });
            var initP = typeof instance.initialize === 'function'
              ? instance.initialize() : Promise.resolve();
            initP
              .then(function () { return instance.handleRedirectPromise(); })
              .then(function () {
                var accounts = instance.getAllAccounts();
                if (!accounts || accounts.length === 0) {
                  // Sem conta na aba atual: exibe botão de login Microsoft (igual ao portal de dados)
                  msgEl.innerHTML =
                    '<button id="btn-ms" style="background:#0f6cbd;color:#fff;border:none;border-radius:4px;' +
                    'padding:.6rem 1.2rem;font-size:.9rem;cursor:pointer;font-family:inherit">' +
                    'Entrar com conta Microsoft</button>';
                  document.getElementById('btn-ms').onclick = function () {
                    msgEl.innerHTML = '<span class="spinner"></span>Autenticando com Microsoft…';
                    instance.loginPopup({ scopes: ['openid', 'profile', 'email'] })
                      .then(function (tokenResp) { return doKanbanSession(tokenResp.idToken); })
                      .catch(function (e) {
                        console.warn('[kanban-login] popup:', e && e.message);
                        showErr('Login cancelado ou não foi possível autenticar.');
                      });
                  };
                  return;
                }
                // Já tem conta na aba: acquireTokenSilent
                return instance.acquireTokenSilent({
                  scopes: ['openid', 'profile', 'email'],
                  account: accounts[0]
                }).then(function (tokenResp) {
                  return doKanbanSession(tokenResp.idToken);
                });
              })
              .catch(function (e) {
                console.warn('[kanban-login] MSAL:', e && e.message);
                showErr('Não foi possível autenticar. Tente novamente.');
              });
          })
          .catch(function () { showErr('Erro ao carregar configuração de autenticação.'); });
      };
      document.head.appendChild(script);
    }

    // Início: JWT do portal primeiro, MSAL como fallback
    var portalToken = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    if (portalToken) {
      tryPortalJWT(portalToken);
    } else {
      tryMSAL();
    }
  }());
  </script>
</body>
</html>`);
});

// Proxy frontend: /chamados/* → FastAPI /
// Checkpoint por aba: a raiz (/chamados ou /chamados/) só carrega o SPA se:
//   a) _kauth=1 estiver na URL (bridge de login acabou de autenticar) → proxy direto
//   b) sessionStorage.kanban_tab_auth estiver marcado              → proxy via cookie
//   c) nenhum dos dois                                             → checkpoint HTML
// Sub-rotas e assets sempre passam por requireKanbanAccess (cookie).
const _kanbanProxy = createProxyMiddleware({
    target: KANBAN_URL,
    changeOrigin: true,
    on: {
        error: (err, req, res) => {
            console.error('[kanban-proxy]', err.code, err.message);
            if (!res.headersSent) res.status(502).send('Kanban de Chamados indisponível.');
        }
    }
});
app.use('/chamados',
    async (req, res, next) => {
        if (req.path !== '/' && req.path !== '') return next(); // sub-rotas → requireKanbanAccess

        const _clearAndLogin = () => {
            res.setHeader('Set-Cookie', `${KANBAN_COOKIE}=; Max-Age=0; Path=/; HttpOnly`);
            res.setHeader('Cache-Control', 'no-store');
            return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><script>
sessionStorage.removeItem('kanban_tab_auth');
window.location.replace('/chamados/login');
</script></body></html>`);
        };

        if (req.query._kauth === '1') {
            // Verifica cookie + permissão atual no banco (re-checa cadastro a cada abertura de aba)
            const tok = getKanbanCookie(req);
            if (!tok) return _clearAndLogin();
            const sec = process.env.JWT_SECRET || 'seu_secret_key_aqui';
            let user;
            try { user = jwt.verify(tok, sec); } catch (e) { return _clearAndLogin(); }
            const allowed = await userHasAppPermission(user.id, 'chamados');
            if (!allowed) return _clearAndLogin();
            return _kanbanProxy(req, res, next);
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.send(`<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"><title>Kanban de Chamados</title></head>
<body>
<script>
if (sessionStorage.getItem('kanban_tab_auth')) {
  window.location.replace('/chamados/?_kauth=1');
} else {
  window.location.replace('/chamados/login');
}
</script>
</body>
</html>`);
    },
    requireKanbanAccess,
    _kanbanProxy
);

// Proxy APIs do Kanban: pathRewrite restaura o prefixo que o Express stripa
// X-Kanban-User injeta o login do usuário logado para o FastAPI gravar em nm_usuario
const KANBAN_API_PATHS = ['/api/chamados', '/api/usuarios', '/api/grupos', '/api/estagios', '/api/meta', '/api/meus-grupos'];
for (const mountPath of KANBAN_API_PATHS) {
    app.use(mountPath, requireKanbanAccess, createProxyMiddleware({
        target: KANBAN_URL,
        changeOrigin: true,
        pathRewrite: kanbanPathRewrite(mountPath),
        on: {
            proxyReq: (proxyReq, req) => {
                if (req.kanbanUsername) proxyReq.setHeader('X-Kanban-User', req.kanbanUsername);
                // express.json() consome o stream do body antes do proxy — re-envia manualmente
                if (req.body && Object.keys(req.body).length > 0) {
                    const raw = JSON.stringify(req.body);
                    proxyReq.setHeader('Content-Type', 'application/json');
                    proxyReq.setHeader('Content-Length', Buffer.byteLength(raw));
                    proxyReq.write(raw);
                }
            },
            error: (err, req, res) => {
                console.error('[kanban-api-proxy]', err.code, err.message);
                if (!res.headersSent) res.status(502).json({ error: 'Kanban de Chamados indisponível.' });
            }
        }
    }));
}
// ======================================================================================

// ==================== AACD Investe (Solicitação de Investimentos) — SSO + proxy ==========
// App full-stack: API NestJS (:3000) + SPA React, servido sob /investfacil.
// Autenticação por bridge de SSO: o Portal autentica o usuário e afirma a identidade
// (por e-mail) ao endpoint /api/v1/auth/sso do NestJS usando um segredo compartilhado.
// Só o Portal (server-side) chama o /auth/sso; o browser nunca vê o segredo.
const INVEST_URL = process.env.INVEST_API_URL || 'http://localhost:3000';
const INVEST_SSO_SECRET = process.env.INVEST_SSO_SECRET || '';
const INVEST_DIST = path.join(__dirname, 'Investimentos', 'apps', 'web', 'dist');

// Restaura o prefixo /api após o Express strip do mount /investfacil/api.
// (Express entrega req.url como /v1/... → NestJS espera /api/v1/...)
function investPathRewrite(reqPath) {
    const qi = reqPath.indexOf('?');
    const pn = qi >= 0 ? reqPath.slice(0, qi) : reqPath;
    const qs = qi >= 0 ? reqPath.slice(qi) : '';
    return '/api' + (pn === '/' ? '' : pn) + qs;
}

// Resolve o e-mail do usuário autenticado no Portal (JWT local OU id_token MSAL).
async function resolveInvestEmail(req) {
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    // Caminho 1: JWT do portal (Authorization: Bearer)
    const authHeader = req.headers['authorization'];
    const portalToken = authHeader && authHeader.split(' ')[1];
    if (portalToken) {
        const user = jwt.verify(portalToken, secret); // lança se inválido/expirado
        let email = (user.email || '').toLowerCase().trim();
        if (!email && pool && pool.connected && user.id) {
            const r = await pool.request()
                .input('id', sql.Int, user.id)
                .query('SELECT TOP 1 Email FROM dbo.Users WHERE Id = @id AND IsActive = 1');
            if (r.recordset.length) email = (r.recordset[0].Email || '').toLowerCase().trim();
        }
        if (!email) { const e = new Error('email_not_found'); e.status = 401; throw e; }
        return email;
    }
    // Caminho 2: id_token MSAL (usuários Microsoft).
    // A autoridade de acesso é o investimentos.User (o /auth/sso valida por email
    // e retorna 401 se não existir/estiver inativo). NÃO exigimos cadastro em
    // dbo.Users do portal — usuários do app podem não ser usuários do portal.
    const idToken = req.body && req.body.idToken;
    if (idToken) {
        const payload = await msalVerify.verify(idToken);
        const email = (msalVerify.extractEmail(payload) || '').toLowerCase().trim();
        if (!email) { const e = new Error('email_not_found'); e.status = 401; throw e; }
        return email;
    }
    const e = new Error('no_credentials'); e.status = 401; throw e;
}

// POST /api/aacdinveste/session — troca a identidade do Portal por tokens do Investimentos.
// Chama o /auth/sso do NestJS (server-side, com o segredo) e relaia o cookie de refresh
// reescrevendo o Path para o prefixo /aacdinveste. (Alias legado: /api/investfacil/session.)
const investSessionHandler = async (req, res) => {
    if (!INVEST_SSO_SECRET) {
        return res.status(503).json({ error: 'SSO do AACD Investe não configurado no Portal.' });
    }
    let email;
    try {
        email = await resolveInvestEmail(req);
    } catch (e) {
        return res.status(e.status || 401).json({ error: 'Não autenticado no Portal.' });
    }
    try {
        const r = await fetchFn(`${INVEST_URL}/api/v1/auth/sso`, {
            method: 'POST',
            headers: { 'x-sso-secret': INVEST_SSO_SECRET, 'x-portal-email': email },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            return res.status(r.status).json({
                error: data.message || 'Seu usuário não está habilitado no AACD Investe.',
            });
        }
        const cookies = (typeof r.headers.getSetCookie === 'function')
            ? r.headers.getSetCookie()
            : [r.headers.get('set-cookie')].filter(Boolean);
        if (cookies.length) {
            res.setHeader('Set-Cookie', cookies.map((c) =>
                c.replace('Path=/api/v1/auth', 'Path=/aacdinveste/api/v1/auth')));
        }
        return res.json({ accessToken: data.accessToken });
    } catch (e) {
        console.error('[aacdinveste-sso]', e.message || e);
        return res.status(502).json({ error: 'AACD Investe indisponível.' });
    }
};
app.post('/api/aacdinveste/session', investSessionHandler);
app.post('/api/investfacil/session', investSessionHandler); // alias legado (compat.)

// Proxy da API do Investimentos: /investfacil/api/* → NestJS :3000/api/*.
// Bloqueia /auth/sso vindo do browser (só o Portal server-side pode chamá-lo).
const _investApiProxy = createProxyMiddleware({
    target: INVEST_URL,
    changeOrigin: true,
    pathRewrite: (p) => investPathRewrite(p),
    cookiePathRewrite: { '/api/v1/auth': '/aacdinveste/api/v1/auth' },
    on: {
        proxyReq: (proxyReq, req) => {
            // express.json() (global) já consumiu o stream do body — sem isto,
            // POST/PUT com corpo travam esperando um body que nunca chega.
            if (req.body && Object.keys(req.body).length > 0) {
                const raw = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Content-Length', Buffer.byteLength(raw));
                proxyReq.write(raw);
            }
        },
        error: (err, req, res) => {
            console.error('[investfacil-proxy]', err.code, err.message);
            if (res && !res.headersSent && res.status) {
                res.status(502).json({ error: 'AACD Investe indisponível.' });
            }
        },
    },
});
// Guard de /auth/sso (browser não pode chamar) + proxy. Montado no prefixo novo
// (/aacdinveste/api) e no legado (/investfacil/api) — o pathRewrite ignora o
// prefixo, então o mesmo proxy serve os dois.
const investApiGuard = (req, res, next) => {
    if (/^\/v1\/auth\/sso\b/.test(req.url)) {
        return res.status(404).json({ error: 'Not found' });
    }
    return _investApiProxy(req, res, next);
};
app.use('/aacdinveste/api', investApiGuard);
app.use('/investfacil/api', investApiGuard); // alias legado (compat.)

// (A tela de login agora é a própria SPA em /aacdinveste/login — servida pelo fallback abaixo.)

// SPA estática do AACD Investe + fallback de rotas client-side (React Router).
app.use('/aacdinveste', express.static(INVEST_DIST));
app.get(/^\/aacdinveste(?:\/.*)?$/, (req, res) => {
    res.sendFile(path.join(INVEST_DIST, 'index.html'));
});

// Redirect legado: qualquer /investfacil (app) → /aacdinveste, preservando o resto
// do caminho e a query. A API legada (/investfacil/api) já foi tratada acima.
app.get(/^\/investfacil(?:\/.*)?$/, (req, res) => {
    res.redirect(302, req.originalUrl.replace(/^\/investfacil/, '/aacdinveste'));
});
// ======================================================================================

// Versão da aplicação — usada para cache-busting de assets estáticos.
// Combina pkg.version com o mtime mais recente de QUALQUER asset do front
// (varredura recursiva de public/assets, public/excel e dos HTMLs servidos
// pelo Node). Assim qualquer edit em CSS/JS/HTML invalida o cache de todos
// os assets, sem precisar bumpar pkg.version nem manter uma allowlist.
//
// Calculo lazy com TTL: recalcula no maximo 1x a cada APP_VERSION_TTL_MS.
// Sem isso, o valor era congelado no startup e qualquer deploy exigia
// reciclar o iisnode (touch web.config / iisreset) para invalidar cache.
const APP_VERSION_TTL_MS = 15000;
const TRACKED_EXT = new Set(['.js', '.css', '.html', '.htm', '.mjs']);
const WATCHED_ROOTS = [
    path.join(__dirname, 'public', 'assets'),
    path.join(__dirname, 'public', 'excel'),
];
const WATCHED_FILES = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'public', 'admin.html'),
    path.join(__dirname, 'public', 'fatura.html'),
];

let cachedAppVersion = null;
let cachedAppVersionAt = 0;

function computeAppVersion() {
    try {
        const pkg = require('./package.json');
        const baseVersion = String(pkg.version || '0.0.0');

        let mtimeMs = 0;
        const visit = (p) => {
            let stat;
            try { stat = fs.statSync(p); } catch (e) { return; }
            if (stat.isDirectory()) {
                let entries;
                try { entries = fs.readdirSync(p); } catch (e) { return; }
                for (const name of entries) {
                    if (name === 'node_modules' || name.startsWith('.')) continue;
                    visit(path.join(p, name));
                }
            } else if (stat.isFile()) {
                const ext = path.extname(p).toLowerCase();
                if (!TRACKED_EXT.has(ext)) return;
                if (stat.mtimeMs > mtimeMs) mtimeMs = stat.mtimeMs;
            }
        };
        for (const root of WATCHED_ROOTS) visit(root);
        for (const file of WATCHED_FILES) visit(file);

        if (mtimeMs > 0) {
            return `${baseVersion}-${Math.floor(mtimeMs)}`;
        }
        return baseVersion;
    } catch (e) {
        return '0.0.0';
    }
}

function getAppVersion() {
    const now = Date.now();
    if (cachedAppVersion && (now - cachedAppVersionAt) < APP_VERSION_TTL_MS) {
        return cachedAppVersion;
    }
    cachedAppVersion = computeAppVersion();
    cachedAppVersionAt = now;
    return cachedAppVersion;
}

app.get('/api/version', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: getAppVersion() });
});

// Serve o index.html sempre fresh, injetando a versão para cache-busting dos assets.
const indexHtmlPath = path.join(__dirname, 'public', 'index.html');
app.get(['/', '/index.html'], (req, res) => {
    fs.readFile(indexHtmlPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Erro ao ler index.html:', err);
            return res.status(500).send('Erro ao carregar a página');
        }
        const out = html.split('__APP_VERSION__').join(getAppVersion());
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(out);
    });
});

// Evita cache do Tutorial Builder (iframe costuma cachear agressivamente)
// Mantém a URL e comportamento; apenas força o browser a buscar a versão atual.
app.get(['/tutorial-builder.html', '/tutorial-builder'], (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        const filePath = path.join(__dirname, 'public', 'tutorial-builder.html');
        const html = fs.readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html.split('__APP_VERSION__').join(getAppVersion()));
    } catch (e) {
        console.error('Erro ao servir tutorial-builder.html:', e);
        res.status(404).send('Tutorial Builder não encontrado');
    }
});

app.get('/tutorial', (req, res) => {
    res.sendFile(path.join(__dirname, 'Tutorial Portal AACD.html'));
});

app.get('/tutorial', (req, res) => {
    res.sendFile(path.join(__dirname, 'Tutorial Portal AACD.html'));
});

// Página administrativa dedicada — substitui o drawer lateral.
// Autenticação é validada client-side via /api/verify-token; o HTML em si
// é público (qualquer um pode baixar), mas só renderiza conteúdo se o token
// retornar isAdmin: true. Mesmo padrão usado em /excel/admin.html.
app.get(['/admin', '/admin.html'], (req, res) => {
    const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
    fs.readFile(adminHtmlPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Erro ao ler admin.html:', err);
            return res.status(500).send('Erro ao carregar a página admin');
        }
        const out = html.split('__APP_VERSION__').join(getAppVersion());
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(out);
    });
});

// Home alternativa para paineis em homologacao. Mesma stack do index.html
// (modulos JS/CSS), apenas oculta sidebar e filtra cards por IsHomologation=1.
// Login opcional (mesma regra de /), o filtro acontece no client.
const homologaHtmlPath = path.join(__dirname, 'public', 'homologa.html');
app.get(['/homologa', '/homologa.html'], (req, res) => {
    fs.readFile(homologaHtmlPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Erro ao ler homologa.html:', err);
            return res.status(500).send('Erro ao carregar a página de homologação');
        }
        const out = html.split('__APP_VERSION__').join(getAppVersion());
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(out);
    });
});

// Tela /excel (admin Sistema de Carga) e' baixa frequencia e evolui muito,
// entao desativa cache do browser para evitar que ajustes em app.js /
// jobsManager.js / index.html fiquem presos no cache local. Aplica antes do
// static handler para que os headers vigorem mesmo no asset servido pelo
// proprio express.static.
app.use((req, res, next) => {
    if (req.path && req.path.startsWith('/excel/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// HTMLs do Sistema de Carga: servidos pelo Node injetando __APP_VERSION__,
// para que <link>/<script> com ?v=__APP_VERSION__ sejam invalidados sempre
// que qualquer asset do front for alterado.
const serveHtmlWithVersion = (relPath) => (req, res) => {
    const filePath = path.join(__dirname, 'public', relPath);
    fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
            console.error(`Erro ao ler ${relPath}:`, err);
            return res.status(500).send('Erro ao carregar a página');
        }
        const out = html.split('__APP_VERSION__').join(getAppVersion());
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(out);
    });
};
app.get(['/excel', '/excel/', '/excel/index.html'], serveHtmlWithVersion(path.join('excel', 'index.html')));
app.get(['/excel/admin', '/excel/admin.html'], serveHtmlWithVersion(path.join('excel', 'admin.html')));
// /fatura — pagina standalone com login + upload de PDF + historico.
// Nao adicionamos /fatura.html aqui porque o IIS rewrite (regra StaticContent)
// servir-lo-ia direto sem passar pelo Node, e __APP_VERSION__ nao seria
// substituido. Acessar via /fatura.
app.get(['/fatura', '/fatura/'], serveHtmlWithVersion('fatura.html'));

app.use(express.static('public'));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static('uploads'));

// Rota direta para o Chatbot (URL dedicada)
app.get(['/chatbot', '/chatbot/'], (req, res) => {
    try {
        const filePath = path.join(__dirname, 'public', 'chatbot.html');
        const html = fs.readFileSync(filePath, 'utf8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html.split('__APP_VERSION__').join(getAppVersion()));
    } catch (e) {
        res.status(404).send('Chatbot não encontrado');
    }
});

app.get('/api/microsoft-auth/config', (req, res) => {
    res.json({
        enabled: MICROSOFT_AUTH_ENABLED && !!MICROSOFT_AUTH_CLIENT_ID && !!MICROSOFT_AUTH_TENANT_ID,
        clientId: MICROSOFT_AUTH_CLIENT_ID,
        tenantId: MICROSOFT_AUTH_TENANT_ID,
        authority: `https://login.microsoftonline.com/${MICROSOFT_AUTH_TENANT_ID}`,
        loginScopes: ['openid', 'profile', 'offline_access', 'User.Read'],
        forceAccountSelection: MICROSOFT_AUTH_FORCE_SELECT
    });
});

// ========================================
// ROTAS PARA APLICAÇÃO DE CARGA EXCEL
// ========================================

const XLSX = require('xlsx');

// Tabela especial: Orçamento Fluxo de Caixa Ajustado
const ORCAMENTO_FLUXO_CAIXA_TABLE = 'VW_ORCAMENTO_FLUXO_CAIXA_AJUSTADO';

// Garantir coluna AllowFullLoad em TableDefinitions
async function ensureAllowFullLoadColumn() {
    const check = await pool.request().query(`
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'TableDefinitions' AND COLUMN_NAME = 'AllowFullLoad'
    `);
    if (check.recordset.length === 0) {
        console.log('[DB] Adicionando coluna AllowFullLoad em TableDefinitions');
        await pool.request().query(`
            ALTER TABLE [dbo].[TableDefinitions]
            ADD [AllowFullLoad] BIT NOT NULL CONSTRAINT DF_TableDefinitions_AllowFullLoad DEFAULT 1
        `);
    }
}

async function tableDefinitionsHasAllowFullLoad() {
    const check = await pool.request().query(`
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'TableDefinitions' AND COLUMN_NAME = 'AllowFullLoad'
    `);
    return check.recordset.length > 0;
}

async function ensureUploadJobsTable() {
    if (!pool || !pool.connected) return;
    try {
        const check = await pool.request().query(`
            SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UploadJobs]') AND type = 'U'
        `);
        if (check.recordset.length === 0) {
            console.log('[DB] Criando tabela UploadJobs');
            await pool.request().batch(`
                CREATE TABLE [dbo].[UploadJobs] (
                    [JobId]         VARCHAR(64)   NOT NULL PRIMARY KEY,
                    [TableName]     VARCHAR(200)  NOT NULL,
                    [JobType]       VARCHAR(20)   NOT NULL,
                    [LoadType]      VARCHAR(20)   NULL,
                    [Status]        VARCHAR(20)   NOT NULL,
                    [Stage]         VARCHAR(40)   NULL,
                    [Message]       NVARCHAR(500) NULL,
                    [Progress]      INT           NOT NULL DEFAULT 0,
                    [TotalRows]     INT           NULL,
                    [InsertedRows]  INT           NULL,
                    [FileName]      NVARCHAR(255) NULL,
                    [FileSize]      BIGINT        NULL,
                    [UserId]        INT           NULL,
                    [UserName]      NVARCHAR(200) NULL,
                    [ErrorMessage] NVARCHAR(MAX) NULL,
                    [StartedAt]     DATETIME      NOT NULL DEFAULT GETDATE(),
                    [FinishedAt]    DATETIME      NULL,
                    [UpdatedAt]     DATETIME      NOT NULL DEFAULT GETDATE()
                );
            `);
            await pool.request().batch(`
                CREATE INDEX IX_UploadJobs_TableName_Status ON [dbo].[UploadJobs]([TableName], [Status]);
                CREATE INDEX IX_UploadJobs_Status_StartedAt ON [dbo].[UploadJobs]([Status], [StartedAt] DESC);
                CREATE INDEX IX_UploadJobs_TableName_FinishedAt ON [dbo].[UploadJobs]([TableName], [FinishedAt] DESC) WHERE [Status] = 'success';
            `);
            console.log('[DB] Tabela UploadJobs criada');
        }

        // Em caso de restart do iisnode: jobs que ficaram 'running' nao sao mais retomaveis
        await pool.request().query(`
            UPDATE [dbo].[UploadJobs]
               SET Status = 'error',
                   ErrorMessage = ISNULL(ErrorMessage, N'Servidor reiniciou durante a execucao'),
                   FinishedAt = GETDATE(),
                   UpdatedAt = GETDATE()
             WHERE Status IN ('queued', 'running')
        `);
    } catch (e) {
        console.warn('[DB] Falha ao garantir UploadJobs:', e.message || e);
    }
}

// Mapeamento de tabelas disponíveis para carga
const TABELAS_DISPONIVEIS = {
    'AFASTAMENTO': { nome: 'Afastamentos', descricao: 'Dados de afastamentos de funcionários', icone: '🏥' },
    'FERIAS': { nome: 'Férias', descricao: 'Registros de férias', icone: '🏖️' },
    'MATRICULA': { nome: 'Matrículas', descricao: 'Dados de matrículas de funcionários', icone: '👤' },
    'MOVIMENTO_PESSOAL': { nome: 'Movimento Pessoal', descricao: 'Movimentações de pessoal', icone: '📋' },
    'MOVIMENTO_PESSOAL_CC': { nome: 'Movimento Pessoal CC', descricao: 'Movimentações de pessoal - Centro de Custo', icone: '💼' },
    'ADP_BENEFICIOS': { nome: 'ADP Benefícios', descricao: 'Dados de benefícios ADP', icone: '🎁' },
    'ADP_MOTIVO_RESCISAO': { nome: 'ADP Motivo Rescisão', descricao: 'Motivos de rescisão ADP', icone: '📄' },
    [ORCAMENTO_FLUXO_CAIXA_TABLE]: { nome: 'Orçamento Fluxo de Caixa', descricao: 'Carga de orçamento com transformação de meses em linhas', icone: '📈' }
};

// ROTAS REMOVIDAS - Acesso apenas via painel admin
// As páginas /excel e /excel/admin agora são acessadas apenas pelo painel administrativo
// usando window.open() com URLs diretas para os arquivos HTML

// Listar tabelas disponíveis (busca do banco de dados)
app.get('/api/excel/tabelas', async (req, res) => {
    try {
        // Buscar grupos e tabelas do banco
        const groupsResult = await pool.request().query(`
            SELECT * FROM TableGroups WHERE IsActive = 1 ORDER BY Name
        `);
        
        const tablesResult = await pool.request().query(`
            SELECT * FROM TableDefinitions WHERE IsActive = 1 ORDER BY DisplayName
        `);
        
        // Organizar por grupos
        const groups = {};
        const tables = {};
        
        groupsResult.recordset.forEach(group => {
            groups[group.Code] = {
                id: group.Id,
                nome: group.Name,
                descricao: group.Description,
                icone: group.Icon,
                tabelas: {}
            };
        });
        
        tablesResult.recordset.forEach(table => {
            const tableInfo = {
                id: table.Id,
                nome: table.DisplayName,
                descricao: table.Description,
                icone: table.Icon,
                modelFilePath: table.ModelFilePath,
                allowFullLoad: table.AllowFullLoad !== undefined ? !!table.AllowFullLoad : true
            };
            
            if (table.GroupId) {
                // Encontrar código do grupo
                const group = groupsResult.recordset.find(g => g.Id === table.GroupId);
                if (group && groups[group.Code]) {
                    groups[group.Code].tabelas[table.TableName] = tableInfo;
                }
            } else {
                // Tabela sem grupo
                tables[table.TableName] = tableInfo;
            }
        });
        
        res.json({ groups, tables });
    } catch (err) {
        console.error('Erro ao buscar tabelas:', err);
        // Fallback para tabelas hardcoded
        res.json({ 
            groups: {
                ADP: {
                    nome: 'ADP',
                    descricao: 'Tabelas do sistema ADP',
                    icone: '📊',
                    tabelas: TABELAS_DISPONIVEIS
                }
            },
            tables: {}
        });
    }
});

// Obter informações de uma tabela específica
app.get('/api/excel/tabelas/:tabela/info', async (req, res) => {
    const { tabela } = req.params;
    
    try {
        // Buscar definição da tabela no banco PowerBIPortal
        const tableDefResult = await pool.request()
            .input('tableName', sql.VarChar(100), tabela)
            .query('SELECT * FROM TableDefinitions WHERE TableName = @tableName AND IsActive = 1');
        
        if (tableDefResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Tabela não encontrada' });
        }
        
        const tableDef = tableDefResult.recordset[0];
        
        let pf;
        try {
            pf = await ensurePoolFonte();
        } catch (connErr) {
            console.error('[tabela/info] Falha ao conectar ao banco Fonte:', connErr.message);
            return res.status(503).json({ error: 'Banco Fonte não conectado' });
        }

        // Contar registros na tabela
        const countResult = await pf.request()
            .query(`SELECT COUNT(*) as total FROM dbo.[${tabela}]`);

        // Data da ultima carga bem-sucedida (vinda de UploadJobs)
        let lastLoad = null;
        try {
            lastLoad = await jobStore.lastSuccessByTable(tabela);
        } catch (_) {}

        res.json({
            tabela: tabela,
            info: {
                nome: tableDef.DisplayName,
                descricao: tableDef.Description,
                icon: tableDef.Icon
            },
            total_registros: countResult.recordset[0].total,
            last_load_at: lastLoad ? lastLoad.FinishedAt : null,
            last_load_rows: lastLoad ? lastLoad.InsertedRows : null,
            last_load_type: lastLoad ? lastLoad.LoadType : null
        });
    } catch (err) {
        console.error('Erro ao obter info da tabela:', err);
        res.status(500).json({ error: err.message });
    }
});

// Baixar modelo Excel de uma tabela
app.get('/api/excel/modelo/:tabela', async (req, res) => {
    const { tabela } = req.params;
    
    try {
        // Buscar definição da tabela no banco PowerBIPortal
        const tableDefResult = await pool.request()
            .input('tableName', sql.VarChar(100), tabela)
            .query('SELECT * FROM TableDefinitions WHERE TableName = @tableName AND IsActive = 1');
        
        if (tableDefResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Tabela não encontrada' });
        }
        
        const tableDef = tableDefResult.recordset[0];
        
        // Se existe arquivo modelo salvo, retornar ele
        if (tableDef.ModelFilePath && fs.existsSync(path.join(__dirname, 'public', tableDef.ModelFilePath))) {
            return res.download(path.join(__dirname, 'public', tableDef.ModelFilePath), `${tabela}_modelo.xlsx`);
        }
        
        // Caso contrário, gerar modelo dinamicamente
        let pfModelo;
        try {
            pfModelo = await ensurePoolFonte();
        } catch (connErr) {
            console.error('[modelo] Falha ao conectar ao banco Fonte:', connErr.message);
            return res.status(503).json({ error: 'Banco Fonte não conectado' });
        }

        // Obter estrutura da tabela
        const schemaResult = await pfModelo.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${tabela}'
            ORDER BY ORDINAL_POSITION
        `);
        
        const columns = schemaResult.recordset.filter(col => col.COLUMN_NAME !== 'Id');
        
        // Criar workbook com XLSX
        const workbook = XLSX.utils.book_new();
        
        // Criar dados de exemplo (header + 1 linha de exemplo)
        const headers = columns.map(c => c.COLUMN_NAME);
        const exampleRow = columns.map(c => {
            switch (c.DATA_TYPE.toLowerCase()) {
                case 'int':
                case 'bigint':
                    return 123;
                case 'decimal':
                case 'float':
                case 'money':
                    return 123.45;
                case 'datetime':
                case 'datetime2':
                case 'date':
                    return '2025-01-01';
                case 'bit':
                    return 1;
                default:
                    return 'Exemplo';
            }
        });
        
        const worksheetData = [headers, exampleRow];
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Ajustar largura das colunas
        worksheet['!cols'] = headers.map(() => ({ wch: 15 }));
        
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
        
        // Gerar buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        // Enviar arquivo
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Modelo_${tabela}.xlsx"`);
        res.send(buffer);
        
    } catch (err) {
        console.error('Erro ao gerar modelo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Configuração do multer para upload de arquivos Excel
const excelStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const excelUploads = path.join(__dirname, 'uploads', 'excel');
        if (!fs.existsSync(excelUploads)) {
            fs.mkdirSync(excelUploads, { recursive: true });
        }
        cb(null, excelUploads);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `upload-${Date.now()}${ext}`);
    }
});

const uploadExcel = multer({
    storage: excelStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos Excel (.xlsx ou .xls) são permitidos'));
        }
    }
});

// ===============================
// Normalização de números (pt-BR / en-US)
// ===============================

// Ex.: "1.234,56" -> "1234.56" | "1,234.56" -> "1234.56" | "123,45" -> "123.45" | "220,00" -> "220.00"
function normalizeLocaleNumberString(input) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') return String(input);
    if (typeof input !== 'string') return null;

    let s = input.trim();
    if (s === '') return null;

    // Remove espaços (inclui NBSP usado às vezes como separador de milhar)
    s = s.replace(/[\s\u00A0]/g, '');

    const hasDot = s.includes('.');
    const hasComma = s.includes(',');

    if (hasDot && hasComma) {
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        if (lastComma > lastDot) {
            // pt-BR: '.' milhar, ',' decimal
            s = s.replace(/\./g, '').replace(/,/g, '.');
        } else {
            // en-US: ',' milhar, '.' decimal
            s = s.replace(/,/g, '');
        }
    } else if (hasComma && !hasDot) {
        // pt-BR: ',' decimal
        s = s.replace(/,/g, '.');
    }

    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    return s;
}

function getLocaleNumberInfo(input) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') {
        if (!Number.isFinite(input)) return null;
        const s = String(input);
        const scale = s.includes('.') ? s.split('.')[1].length : 0;
        return { normalized: s, number: input, scale };
    }
    const normalized = normalizeLocaleNumberString(input);
    if (!normalized) return null;
    const number = parseFloat(normalized);
    if (!Number.isFinite(number)) return null;
    const scale = normalized.includes('.') ? normalized.split('.')[1].length : 0;
    return { normalized, number, scale };
}

// Função para detectar tipo de dados baseado em amostra de valores
function detectColumnType(values) {
    // Filtra valores válidos (não nulos)
    const validValues = values.filter(v => v !== null && v !== undefined && v !== '');
    
    if (validValues.length === 0) {
        return 'NVARCHAR(MAX)';
    }
    
    let allIntegers = true;
    let allDecimals = true;
    let allDates = true;
    let hasDateStrings = false;
    let hasDateNumbers = false;

    let maxScale = 0;
    
    for (const val of validValues) {
        const type = typeof val;
        
        // Se é número
        if (type === 'number') {
            // Verifica se pode ser data serial do Excel (entre 25000 e 50000 = 1968-2036)
            if (val > 25000 && val < 50000) {
                hasDateNumbers = true;
                // Não marca como não-inteiro ainda, pode ser data
            } else {
                // É um número normal
                allDates = false;
                if (!Number.isInteger(val)) {
                    allIntegers = false;
                    // Para números JS, tenta inferir scale pela string
                    const info = getLocaleNumberInfo(val);
                    if (info && info.scale > maxScale) maxScale = info.scale;
                } else if (val > 2147483647 || val < -2147483648) {
                    // Número muito grande para INT, precisa ser BIGINT
                    allIntegers = false;
                    allDecimals = false;
                    // Marca que precisa de BIGINT (será tratado como NVARCHAR para segurança)
                }
            }
        } else if (type === 'string') {
            const trimmed = val.trim();

            // Se parece número (inclui 1.234,56 / 123,45 / 220,00), trata como número.
            const info = getLocaleNumberInfo(trimmed);
            if (info !== null) {
                allDates = false;

                // IMPORTANTÍSSIMO: se o texto traz separador decimal (mesmo ",00"), é decimal.
                // Isso evita colunas como "Nro de Horas" serem inferidas como INT.
                if (info.scale > 0) {
                    allIntegers = false;
                    if (info.scale > maxScale) maxScale = info.scale;
                } else if (!Number.isInteger(info.number)) {
                    allIntegers = false;
                } else if (info.number > 2147483647 || info.number < -2147483648) {
                    allIntegers = false;
                    allDecimals = false;
                }
                continue;
            }
            
            // Verifica se é uma string de data (formato brasileiro DD/MM/YYYY ou DD/MM/YY)
            const datePatterns = [
                /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,  // DD/MM/YYYY ou DD/MM/YY
                /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
                /^\d{1,2}-\d{1,2}-\d{2,4}$/      // DD-MM-YYYY ou DD-MM-YY
            ];
            
            const isDateString = datePatterns.some(pattern => pattern.test(trimmed));
            if (isDateString) {
                hasDateStrings = true;
                allIntegers = false;
                allDecimals = false;
            } else {
                // Não é data, então definitivamente não é coluna de data
                allDates = false;
                allIntegers = false;
                allDecimals = false;
            }
        } else {
            allIntegers = false;
            allDecimals = false;
            allDates = false;
        }
    }
    
    // Decide o tipo baseado na análise
    // Se tem strings de data OU números seriais de data, é DATETIME
    if (hasDateStrings || (hasDateNumbers && allDates)) {
        return 'DATETIME';
    } else if (allIntegers) {
        // Verifica se todos os inteiros estão no range do INT32
        const hasLargeInts = validValues.some(val => {
            const num = typeof val === 'number' ? val : (getLocaleNumberInfo(val)?.number ?? NaN);
            return !isNaN(num) && Number.isInteger(num) && (num > 2147483647 || num < -2147483648);
        });
        return hasLargeInts ? 'BIGINT' : 'INT';
    } else if (allDecimals) {
        // Preferir DECIMAL para preservar escala (evita flutuação e mantém ",00")
        const scale = Math.max(1, Math.min(maxScale || 2, 10));
        return `DECIMAL(18,${scale})`;
    } else {
        return 'NVARCHAR(MAX)';
    }
}

// Função auxiliar para mapear tipo SQL
function getSqlDataType(sqlType) {
    if (!sqlType) return sql.NVarChar;

    const raw = String(sqlType).trim().toLowerCase();
    const match = raw.match(/^([a-z0-9_]+)\(([^)]+)\)$/);
    const baseType = match ? match[1] : raw;
    const args = match ? match[2].split(',').map(s => s.trim()) : null;

    switch (baseType) {
        case 'int':
            return sql.Int;
        case 'smallint':
            return sql.SmallInt;
        case 'tinyint':
            return sql.TinyInt;
        case 'bigint':
            return sql.BigInt;
        case 'float':
            return sql.Float;
        case 'real':
            return sql.Real;
        case 'money':
            return sql.Money;
        case 'smallmoney':
            return sql.SmallMoney ? sql.SmallMoney : sql.Money;
        case 'bit':
            return sql.Bit;
        case 'datetime':
            return sql.DateTime;
        case 'datetime2':
            return sql.DateTime2;
        case 'date':
            return sql.Date;
        case 'text':
            return sql.Text;
        case 'ntext':
            return sql.NText;
        case 'char':
            if (args && args[0] && args[0] !== 'max') {
                const len = parseInt(args[0], 10);
                return Number.isFinite(len) ? sql.Char(len) : sql.Char;
            }
            return sql.Char;
        case 'nchar':
            if (args && args[0] && args[0] !== 'max') {
                const len = parseInt(args[0], 10);
                return Number.isFinite(len) ? sql.NChar(len) : sql.NChar;
            }
            return sql.NChar;
        case 'varchar':
            if (args && args[0]) {
                if (args[0] === 'max') return sql.VarChar(sql.MAX);
                const len = parseInt(args[0], 10);
                return Number.isFinite(len) ? sql.VarChar(len) : sql.VarChar;
            }
            return sql.VarChar;
        case 'nvarchar':
            if (args && args[0]) {
                if (args[0] === 'max') return sql.NVarChar(sql.MAX);
                const len = parseInt(args[0], 10);
                return Number.isFinite(len) ? sql.NVarChar(len) : sql.NVarChar;
            }
            return sql.NVarChar;
        case 'decimal': {
            if (args && args[0]) {
                const precision = parseInt(args[0], 10);
                const scale = parseInt(args[1] ?? '0', 10);
                if (Number.isFinite(precision) && Number.isFinite(scale)) return sql.Decimal(precision, scale);
                if (Number.isFinite(precision)) return sql.Decimal(precision, 0);
            }
            return sql.Decimal;
        }
        case 'numeric': {
            if (args && args[0]) {
                const precision = parseInt(args[0], 10);
                const scale = parseInt(args[1] ?? '0', 10);
                if (Number.isFinite(precision) && Number.isFinite(scale)) return sql.Numeric(precision, scale);
                if (Number.isFinite(precision)) return sql.Numeric(precision, 0);
            }
            return sql.Numeric;
        }
        default:
            return sql.NVarChar;
    }
}

// Tipo SQL com base no schema do INFORMATION_SCHEMA (inclui precisão/scale/tamanho)
function getSqlDataTypeFromColumn(col) {
    if (!col || !col.DATA_TYPE) return sql.NVarChar;
    const baseType = String(col.DATA_TYPE).trim().toLowerCase();

    if (baseType === 'decimal') {
        const precision = col.NUMERIC_PRECISION != null ? parseInt(col.NUMERIC_PRECISION, 10) : 18;
        const scale = col.NUMERIC_SCALE != null ? parseInt(col.NUMERIC_SCALE, 10) : 0;
        if (Number.isFinite(precision) && Number.isFinite(scale)) return sql.Decimal(precision, scale);
        return sql.Decimal;
    }
    if (baseType === 'numeric') {
        const precision = col.NUMERIC_PRECISION != null ? parseInt(col.NUMERIC_PRECISION, 10) : 18;
        const scale = col.NUMERIC_SCALE != null ? parseInt(col.NUMERIC_SCALE, 10) : 0;
        if (Number.isFinite(precision) && Number.isFinite(scale)) return sql.Numeric(precision, scale);
        return sql.Numeric;
    }

    if (baseType === 'money') {
        return sql.Money;
    }
    if (baseType === 'smallmoney') {
        return sql.SmallMoney ? sql.SmallMoney : sql.Money;
    }
    if (baseType === 'real') {
        return sql.Real;
    }
    if (baseType === 'smallint') {
        return sql.SmallInt;
    }
    if (baseType === 'tinyint') {
        return sql.TinyInt;
    }

    if (baseType === 'varchar') {
        const len = col.CHARACTER_MAXIMUM_LENGTH;
        if (len === -1) return sql.VarChar(sql.MAX);
        if (len != null) {
            const n = parseInt(len, 10);
            if (Number.isFinite(n) && n > 0) return sql.VarChar(n);
        }
        return sql.VarChar;
    }

    if (baseType === 'nvarchar') {
        const len = col.CHARACTER_MAXIMUM_LENGTH;
        if (len === -1) return sql.NVarChar(sql.MAX);
        if (len != null) {
            const n = parseInt(len, 10);
            if (Number.isFinite(n) && n > 0) return sql.NVarChar(n);
        }
        return sql.NVarChar;
    }

    return getSqlDataType(baseType);
}

// Função auxiliar para converter número serial do Excel para data
function excelSerialToDate(serial) {
    // Excel serial date: número de dias desde 30/12/1899 (serial 0)
    // Excel tem bug onde considera 1900 ano bissexto (não era), mas isso já está embutido no serial
    const days = Math.floor(serial);
    
    // Data base: 30/12/1899 às 00:00:00 UTC
    const baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0));
    
    // Adicionar os dias
    const resultDate = new Date(baseDate.getTime() + days * 86400000);
    
    // Criar objeto Date local sem timezone usando os componentes UTC
    const date = new Date(
        resultDate.getUTCFullYear(),
        resultDate.getUTCMonth(),
        resultDate.getUTCDate(),
        0, 0, 0, 0
    );
    
    console.log(`[DATA EXCEL SERIAL] ${serial} -> ${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} 00:00:00`);
    
    return date;
}

// Função auxiliar para converter tipos de dados
function convertToSqlType(value, sqlType) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    function parseLocaleNumber(input) {
        const info = getLocaleNumberInfo(input);
        return info ? info.number : NaN;
    }

    // Suporta tipos parametrizados como DECIMAL(18,2), NVARCHAR(MAX), etc.
    function getBaseSqlType(typeName) {
        if (!typeName) return '';
        const raw = String(typeName).trim().toLowerCase();
        const m = raw.match(/^([a-z0-9_]+)\s*(\(.*\))?$/);
        return m ? m[1] : raw;
    }

    function getTypeArgs(typeName) {
        if (!typeName) return null;
        const raw = String(typeName).trim().toLowerCase();
        const m = raw.match(/^[a-z0-9_]+\(([^)]+)\)$/);
        if (!m) return null;
        return m[1].split(',').map(s => s.trim());
    }

    // Formata número como string invariante com escala fixa, sem depender de locale.
    // Ex.: normalized="133.3", scale=2 -> "133.30"
    function formatNormalizedDecimal(normalized, scale) {
        if (normalized == null) return null;
        const s = String(normalized);
        const sign = s.startsWith('-') ? '-' : '';
        const unsigned = sign ? s.slice(1) : s;
        const parts = unsigned.split('.');
        const intPart = parts[0] === '' ? '0' : parts[0];
        const fracPart = parts[1] || '';
        const targetScale = Math.max(0, scale);

        if (targetScale === 0) {
            return sign + intPart;
        }

        const fracPadded = (fracPart + '0'.repeat(targetScale)).slice(0, targetScale);
        return sign + intPart + '.' + fracPadded;
    }
    
    try {
        const type = getBaseSqlType(sqlType);
        switch (type) {
            case 'int':
            case 'bigint':
                // INT/BIGINT não guarda casas. Se vier com casas != 0, recusar para evitar perda silenciosa.
                if (typeof value === 'string') {
                    const info = getLocaleNumberInfo(value);
                    if (info && info.scale > 0) {
                        const frac = info.normalized.split('.')[1] || '';
                        if (/[1-9]/.test(frac)) {
                            throw new Error(`Valor decimal "${value}" não cabe em coluna ${sqlType}. Altere a coluna para DECIMAL/NUMERIC.`);
                        }
                    }
                }
                const intVal = typeof value === 'number'
                    ? Math.trunc(value)
                    : parseInt((normalizeLocaleNumberString(value) ?? String(value)).split('.')[0], 10);
                return isNaN(intVal) ? null : intVal;
            case 'smallint':
            case 'tinyint': {
                if (typeof value === 'string') {
                    const info = getLocaleNumberInfo(value);
                    if (info && info.scale > 0) {
                        const frac = info.normalized.split('.')[1] || '';
                        if (/[1-9]/.test(frac)) {
                            throw new Error(`Valor decimal "${value}" não cabe em coluna ${sqlType}. Altere a coluna para DECIMAL/NUMERIC.`);
                        }
                    }
                }
                const smallVal = typeof value === 'number'
                    ? Math.trunc(value)
                    : parseInt((normalizeLocaleNumberString(value) ?? String(value)).split('.')[0], 10);
                return isNaN(smallVal) ? null : smallVal;
            }
            case 'float':
            case 'decimal':
            case 'numeric':
            case 'real':
            case 'money':
            case 'smallmoney': {
                const info = getLocaleNumberInfo(value);
                if (!info) return null;

                // Determina scale preferencial:
                // - DECIMAL/NUMERIC: usa o scale do tipo (ex.: decimal(18,2))
                // - MONEY: scale=4
                let scale = 0;
                if (type === 'money' || type === 'smallmoney') {
                    scale = 4;
                } else {
                    const args = getTypeArgs(sqlType);
                    if (args && args.length >= 2) {
                        const s = parseInt(args[1], 10);
                        if (Number.isFinite(s) && s >= 0) scale = s;
                    }
                }

                // Se a coluna tem scale 0 mas o dado tem parte fracionária != 0, falhar (evita 133,30 virar 133,00)
                if (scale === 0 && info.scale > 0) {
                    const frac = info.normalized.split('.')[1] || '';
                    if (/[1-9]/.test(frac)) {
                        throw new Error(`Valor decimal "${value}" não cabe em ${sqlType}. Ajuste a coluna para ter casas decimais (scale > 0).`);
                    }
                }

                // GARANTIA: enviar string numérica com ponto e escala fixa para o driver.
                // Isso evita qualquer interpretação de "," como milhar e evita perda de casas.
                const formatted = formatNormalizedDecimal(info.normalized, scale);
                const num = parseFloat(formatted);
                return Number.isFinite(num) ? formatted : null;
            }
            case 'bit':
                return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
            case 'datetime':
            case 'datetime2':
            case 'date':
                // Se já é uma data, retorna
                if (value instanceof Date) return value;
                
                // Se é um número (serial do Excel)
                if (typeof value === 'number') {
                    // Verifica se está no range válido de datas seriais do Excel
                    if (value > 0 && value < 2958466) { // 31/12/9999 no formato serial
                        return excelSerialToDate(value);
                    }
                    return null;
                }
                
                // Se é string, tenta converter
                if (typeof value === 'string') {
                    // Remove espaços extras
                    value = value.trim();
                    
                    // Se está vazio, retorna null
                    if (value === '') return null;
                    
                    console.log(`[convertToSqlType DATE] Tentando converter string: "${value}"`);
                    
                    // PRIMEIRO: Tenta formato brasileiro DD/MM/YYYY ou DD/MM/YY
                    const brDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
                    if (brDateMatch) {
                        const [, day, month, year] = brDateMatch;
                        const dayNum = parseInt(day);
                        const monthNum = parseInt(month);
                        let yearNum = parseInt(year);
                        
                        // Se o ano tem 2 dígitos, converter para 4 dígitos
                        if (yearNum < 100) {
                            // Anos 00-49 = 2000-2049, anos 50-99 = 1950-1999
                            yearNum = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
                        }
                        
                        // Validar se os valores são válidos
                        if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
                            // Validar se a data existe (ex: 31/02 seria inválido)
                            const testDate = new Date(yearNum, monthNum - 1, dayNum);
                            if (testDate.getFullYear() === yearNum && 
                                testDate.getMonth() === monthNum - 1 && 
                                testDate.getDate() === dayNum) {
                                
                                // Criar Date com meia-noite (00:00) para gravar data sem hora
                                const date = new Date(yearNum, monthNum - 1, dayNum, 0, 0, 0, 0);
                                
                                const sqlDateString = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                                console.log(`[DATA BR] "${value}" -> ${sqlDateString} 00:00:00`);
                                
                                return date;
                            } else {
                                console.log(`[DATA BR] Data inválida após validação: ${yearNum}-${monthNum}-${dayNum}`);
                            }
                        } else {
                            console.log(`[DATA BR] Valores fora do range: day=${dayNum}, month=${monthNum}, year=${yearNum}`);
                        }
                    }
                    
                    // SEGUNDO: Tenta formato ISO YYYY-MM-DD (criação manual para evitar parse nativo)
                    const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    if (isoDateMatch) {
                        const [, y, m, d] = isoDateMatch;
                        const yearNum = parseInt(y, 10);
                        const monthNum = parseInt(m, 10);
                        const dayNum = parseInt(d, 10);

                        if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
                            const testDate = new Date(yearNum, monthNum - 1, dayNum);
                            if (
                                testDate.getFullYear() === yearNum &&
                                testDate.getMonth() === monthNum - 1 &&
                                testDate.getDate() === dayNum
                            ) {
                                return new Date(yearNum, monthNum - 1, dayNum, 0, 0, 0, 0);
                            }
                        }
                    }
                    
                    // QUARTO: Tenta formato ISO com hora: YYYY-MM-DD HH:mm:ss(.SSS)
                    const isoDateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
                    if (isoDateTimeMatch) {
                        const [, year, month, day, hh, mm, ss, ms] = isoDateTimeMatch;
                        const yearNum = parseInt(year, 10);
                        const monthNum = parseInt(month, 10);
                        const dayNum = parseInt(day, 10);
                        const hourNum = parseInt(hh || '0', 10);
                        const minNum = parseInt(mm || '0', 10);
                        const secNum = parseInt(ss || '0', 10);
                        const msNum = parseInt(ms || '0', 10);

                        const testDate = new Date(yearNum, monthNum - 1, dayNum, hourNum, minNum, secNum, msNum);
                        if (!isNaN(testDate.getTime())) {
                            return testDate;
                        }
                    }

                    // TERCEIRO: Tenta formato DD-MM-YYYY ou DD-MM-YY
                    const brDateMatch2 = value.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
                    if (brDateMatch2) {
                        const [, day, month, year] = brDateMatch2;
                        const dayNum = parseInt(day);
                        const monthNum = parseInt(month);
                        let yearNum = parseInt(year);
                        
                        // Se o ano tem 2 dígitos, converter para 4 dígitos
                        if (yearNum < 100) {
                            yearNum = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
                        }
                        
                        // Validar e criar data com meia-noite
                        const testDate = new Date(yearNum, monthNum - 1, dayNum);
                        if (!isNaN(testDate.getTime())) {
                            const date = new Date(yearNum, monthNum - 1, dayNum, 0, 0, 0, 0);
                            const sqlDateString = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                            console.log(`[DATA BR-DASH] "${value}" -> ${sqlDateString} 00:00:00`);
                            
                            return date;
                        }
                    }
                    
                    console.log(`[convertToSqlType DATE] Nenhum formato de data reconhecido para: "${value}"`);
                }
                
                return null;
            default:
                return String(value);
        }
    } catch (e) {
        console.error(`[convertToSqlType] Erro ao converter valor "${value}" para tipo ${sqlType}:`, e);
        return null;
    }
}

// ===============================
// Helpers específicos para carga de Orçamento Fluxo de Caixa
// ===============================
function simplifyHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeHeader(value) {
    return simplifyHeader(value).replace(/[^a-z0-9]/g, '');
}

function getMonthInfoFromHeader(header) {
    const simplified = simplifyHeader(header);

    // Casos simples numéricos (ex.: "1", "01", "m1", "m01", "mes1", "mes01")
    const simpleNumMatch = simplified.match(/^(?:m|mes)?0?([1-9]|1[0-2])$/i);
    if (simpleNumMatch) {
        return { monthNum: parseInt(simpleNumMatch[1], 10), source: header };
    }

    const monthRegex = /(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co|ço)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)/i;
    const monthMatch = simplified.match(monthRegex);
    if (monthMatch) {
        const key = normalizeHeader(monthMatch[1]);
        const map = {
            jan: 1,
            janeiro: 1,
            fev: 2,
            fevereiro: 2,
            mar: 3,
            marco: 3,
            abr: 4,
            abril: 4,
            mai: 5,
            maio: 5,
            jun: 6,
            junho: 6,
            jul: 7,
            julho: 7,
            ago: 8,
            agosto: 8,
            set: 9,
            setembro: 9,
            out: 10,
            outubro: 10,
            nov: 11,
            novembro: 11,
            dez: 12,
            dezembro: 12
        };
        const monthNum = map[key];
        if (monthNum) return { monthNum, source: header };
    }

    const mesNumeroMatch = simplified.match(/\bmes\D*0?([1-9]|1[0-2])\b/);
    if (mesNumeroMatch) {
        return { monthNum: parseInt(mesNumeroMatch[1], 10), source: header };
    }

    // Detecção genérica: mês como número dentro do header (ex.: "2025-02", "M-03")
    const genericNumMatch = simplified.match(/(?:^|[^0-9])0?([1-9]|1[0-2])(?:[^0-9]|$)/);
    if (genericNumMatch) {
        return { monthNum: parseInt(genericNumMatch[1], 10), source: header };
    }

    return null;
}

function pickCellValueForColumn(row, excelHeader, col) {
    if (!excelHeader) return null;
    const cell = row ? row[excelHeader] : null;
    if (!cell) return null;

    if (col && col.DATA_TYPE && col.DATA_TYPE.toLowerCase().includes('date')) {
        const textVal = cell.text && typeof cell.text === 'string' ? cell.text.trim() : '';
        if (textVal && textVal.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
            return textVal;
        }
        if (cell.raw !== null && cell.raw !== undefined && typeof cell.raw === 'number') {
            return cell.raw;
        }
        if (textVal !== '') return textVal;
        return cell.raw;
    }

    if (cell.raw !== undefined && cell.raw !== null) return cell.raw;
    if (cell.text !== undefined && cell.text !== null) return cell.text;
    return null;
}

function formatSqlDateTime(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 00:00:00.000`;
}

function buildHeaderMap(excelHeaders, ignoredHeaders = new Set()) {
    const map = new Map();
    excelHeaders.forEach((header) => {
        if (!header || ignoredHeaders.has(header)) return;
        const normalized = normalizeHeader(header);
        if (!map.has(normalized)) map.set(normalized, header);
    });
    return map;
}

function tokenizeHeader(value) {
    const simplified = simplifyHeader(value);
    const tokens = simplified.split(/[^a-z0-9]+/).filter(Boolean);
    const stopwords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'para', 'por', 'com']);
    return tokens.filter(t => t.length > 1 && !stopwords.has(t));
}

function jaccardSimilarity(a, b) {
    if (!a.length || !b.length) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

function findBestExcelHeaderForTarget(target, excelHeaders, normalizedHeaderMap) {
    const normalizedTarget = normalizeHeader(target);
    if (normalizedHeaderMap.has(normalizedTarget)) return normalizedHeaderMap.get(normalizedTarget);

    const targetTokens = tokenizeHeader(target);
    let bestHeader = null;
    let bestScore = 0;

    for (const header of excelHeaders) {
        const headerTokens = tokenizeHeader(header);
        const score = jaccardSimilarity(targetTokens, headerTokens);
        if (score > bestScore) {
            bestScore = score;
            bestHeader = header;
        }
    }

    return bestScore >= 0.25 ? bestHeader : null;
}

function preferDsOverCdHeader(targetCol, header, excelHeaders) {
    if (!header) return header;
    if (targetCol !== 'Conta Contábil' && targetCol !== 'Centro Custo') return header;

    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader.startsWith('cd')) return header;

    const candidates = excelHeaders.filter(h => normalizeHeader(h).startsWith('ds'));
    if (candidates.length === 0) return header;

    let bestCandidate = null;
    let bestScore = 0;
    const targetTokens = tokenizeHeader(targetCol);
    for (const candidate of candidates) {
        const score = jaccardSimilarity(targetTokens, tokenizeHeader(candidate));
        if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    }

    return bestCandidate || header;
}

function isMovimentoHeader(header) {
    const norm = normalizeHeader(header);
    return norm.includes('movimento');
}

function isTransacaoFinanceiraHeader(header) {
    const norm = normalizeHeader(header);
    return norm.includes('transacao') || norm.includes('financeir');
}

function enforceMovimentoMapping(excelHeaders, excelColumnByTarget) {
    if (!excelHeaders || excelHeaders.length === 0) return;

    const movimentoHeaders = excelHeaders.filter(h => isMovimentoHeader(h));
    if (movimentoHeaders.length === 0) return;

    const currentMovimento = excelColumnByTarget.get('Movimento');
    if (!currentMovimento || !isMovimentoHeader(currentMovimento)) {
        excelColumnByTarget.set('Movimento', movimentoHeaders[0]);
    }

    const currentTransacao = excelColumnByTarget.get('TRANSACAO_FINANCEIRA');
    if (currentTransacao && isMovimentoHeader(currentTransacao) && !isTransacaoFinanceiraHeader(currentTransacao)) {
        excelColumnByTarget.set('TRANSACAO_FINANCEIRA', null);
    }
}

async function getAiColumnMapping(excelHeaders, targetColumns, contextName) {
    if (!DIRECT_LINE_SECRET) {
        console.warn('[AI-MAP] Direct Line não configurado; pulando mapeamento por IA.');
        return null;
    }

    const rules = `INSTRUÇÃO ABSOLUTA: Responda APENAS com um JSON válido.

Você é um assistente especializado em mapear colunas de planilhas para colunas de banco.

TABELA/CONTEXTO: ${contextName}

COLUNAS DO EXCEL (origem):
${JSON.stringify(excelHeaders, null, 2)}

COLUNAS DO BANCO (destino):
${JSON.stringify(targetColumns, null, 2)}

REGRAS OBRIGATÓRIAS:
1. Retorne um JSON no formato {"COLUNA_DESTINO": "COLUNA_EXCEL" | null}
2. Use EXATAMENTE os nomes das colunas do banco (destino) como chaves.
3. O valor deve ser EXATAMENTE um dos nomes do Excel (origem) ou null.
4. Se não houver correspondência clara, use null.
5. Não invente colunas.
6. Não inclua explicações nem texto adicional.
7. Priorize semântica (ex.: Movimento deve mapear para coluna que contém "movimento").
8. Se houver coluna com prefixo DS_ e outra CD_ para o mesmo conceito, prefira DS_.
9. NÃO use colunas de meses para mapear campos de dimensão.

Responda APENAS com o JSON.`;

    try {
        console.log('[AI-MAP] Iniciando conversa com Direct Line...');
        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        if (!convResp.ok) {
            const errorText = await convResp.text().catch(() => 'Erro desconhecido');
            console.error(`[AI-MAP] Falha ao iniciar conversa: ${convResp.status} - ${errorText}`);
            return null;
        }
        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: rules };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activity)
        });
        if (!postResp.ok) {
            const errorText = await postResp.text().catch(() => 'Erro desconhecido');
            console.error(`[AI-MAP] Falha ao enviar mensagem: ${postResp.status} - ${errorText}`);
            return null;
        }

        let watermark;
        let replyText = '';
        for (let i = 0; i < 25; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            if (!actResp.ok) {
                const errorText = await actResp.text().catch(() => 'Erro desconhecido');
                console.error(`[AI-MAP] Falha ao obter resposta: ${actResp.status} - ${errorText}`);
                return null;
            }
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => a.type === 'message' && a.from && a.from.id && a.from.id !== 'user');
            const last = activities.length ? activities[activities.length - 1] : null;
            if (last && last.text) {
                replyText = last.text;
                break;
            }
            await sleep(800);
        }

        if (!replyText) {
            console.warn('[AI-MAP] Timeout aguardando resposta');
            return null;
        }

        let jsonText = replyText.trim();
        const jsonBlockMatch = replyText.match(/```json\s*([\s\S]*?)\s*```/i);
        if (jsonBlockMatch) {
            jsonText = jsonBlockMatch[1];
        } else {
            jsonText = jsonText.replace(/```/g, '').trim();
        }

        const mapping = JSON.parse(jsonText);
        if (!mapping || typeof mapping !== 'object') return null;

        const allowedHeaders = new Set(excelHeaders);
        const cleaned = {};
        for (const target of targetColumns) {
            const value = mapping[target];
            if (value === null || value === undefined) {
                cleaned[target] = null;
            } else if (allowedHeaders.has(value)) {
                cleaned[target] = value;
            } else {
                cleaned[target] = null;
            }
        }

        return cleaned;
    } catch (err) {
        console.error('[AI-MAP] Erro ao mapear colunas:', err.message);
        return null;
    }
}

function findExcelHeaderForAliases(aliasList, normalizedHeaderMap) {
    for (const alias of aliasList) {
        if (normalizedHeaderMap.has(alias)) return normalizedHeaderMap.get(alias);
    }
    for (const alias of aliasList) {
        if (alias.length < 4) continue;
        for (const [norm, header] of normalizedHeaderMap.entries()) {
            if (norm.includes(alias)) return header;
        }
    }
    return null;
}

async function readExcelWithRawAndText(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const isTabDelimited = fileContent.includes('\t') && !fileContent.startsWith('PK');

    let dataText, dataRaw;

    if (isTabDelimited) {
        console.log('[UPLOAD ORCAMENTO] Arquivo detectado como TSV (tab-delimited), lendo como texto puro');
        let content = fileContent;
        if (content.includes('�')) {
            console.log('[UPLOAD ORCAMENTO] Detectado problema de encoding, relendo como Windows-1252');
            const iconv = require('iconv-lite');
            const buffer = fs.readFileSync(filePath);
            content = iconv.decode(buffer, 'windows-1252');
        }
        const lines = content.trim().split('\n');
        const headers = lines[0].split('\t').map(h => h.trim());
        const parsedData = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            const values = lines[i].split('\t');
            const row = {};
            headers.forEach((header, idx) => {
                const value = values[idx] ? values[idx].trim() : '';
                row[header] = value;
            });
            parsedData.push(row);
        }
        dataText = parsedData;
        dataRaw = parsedData;
    } else {
        const workbook = XLSX.readFile(filePath, { cellText: false, cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        dataText = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });
        dataRaw = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });
    }

    const data = dataRaw.map((row, idx) => {
        const cleanRow = {};
        const rawRow = row;
        const textRow = dataText[idx] || {};
        Object.keys(rawRow).forEach(key => {
            const cleanKey = key ? key.trim() : key;
            cleanRow[cleanKey] = {
                raw: rawRow[key],
                text: textRow[key] !== undefined ? (typeof textRow[key] === 'string' ? textRow[key].trim() : textRow[key]) : undefined
            };
        });
        return cleanRow;
    });

    const allExcelColumns = data.length > 0 ? Object.keys(data[0]) : [];
    const excelColumns = allExcelColumns.filter(col => col && col.trim() !== '' && !col.startsWith('__EMPTY'));

    return { data, allExcelColumns, excelColumns };
}

// Async-safe: nao usa res (jobStore + sendProgress comunicam o resultado).
// O parametro res e mantido na assinatura por compatibilidade mas e ignorado.
async function handleOrcamentoFluxoCaixaUpload(req, res, tabela, tipoCarga, sessionId) {
    const anoBaseRaw = req.body.ano_base;
    const anoBase = parseInt(anoBaseRaw, 10);
    if (!anoBaseRaw || !Number.isFinite(anoBase) || anoBase < 1900 || anoBase > 2100) {
        throw new Error('Ano base inválido. Informe um ano válido (ex.: 2025).');
    }

    if (!req.file) {
        throw new Error('Nenhum arquivo enviado');
    }

    if (!poolFonte || !poolFonte.connected) {
        throw new Error('Banco Fonte não conectado');
    }

    sendProgress(sessionId, { stage: 'reading', message: 'Lendo arquivo Excel...', progress: 5 });

    const { data, allExcelColumns, excelColumns } = await readExcelWithRawAndText(req.file.path);

    if (data.length === 0) {
        fs.unlinkSync(req.file.path);
        throw new Error('Arquivo Excel vazio');
    }

    sendProgress(sessionId, { stage: 'read', message: `${data.length} linhas encontradas`, progress: 10 });

    const monthColumns = [];
    const monthHeaders = new Set();
    excelColumns.forEach((header) => {
        const info = getMonthInfoFromHeader(header);
        if (info && !monthHeaders.has(header)) {
            monthColumns.push({ header, monthNum: info.monthNum });
            monthHeaders.add(header);
        }
    });

    const hasMonthColumns = monthColumns.length > 0;
    const normalizedHeaderMap = buildHeaderMap(excelColumns, monthHeaders);

    console.log('[UPLOAD ORCAMENTO] Todas as colunas do Excel:', allExcelColumns);
    console.log('[UPLOAD ORCAMENTO] Colunas válidas do Excel:', excelColumns);
    console.log('[UPLOAD ORCAMENTO] Colunas de meses detectadas:', monthColumns);
    console.log('[UPLOAD ORCAMENTO] Primeira linha do Excel (com raw/text):', JSON.stringify(data[0]));

    const schemaResult = await poolFonte.request().query(`
        SELECT
            c.name AS COLUMN_NAME,
            t.name AS DATA_TYPE,
            c.is_nullable AS IS_NULLABLE,
            c.max_length AS CHARACTER_MAXIMUM_LENGTH,
            c.precision AS NUMERIC_PRECISION,
            c.scale AS NUMERIC_SCALE,
            c.is_identity AS IS_IDENTITY
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.${tabela}')
        ORDER BY c.column_id
    `);

    const columns = schemaResult.recordset.filter(col => !col.IS_IDENTITY && col.COLUMN_NAME !== 'DataCarga');
    const columnNames = columns.map(c => c.COLUMN_NAME);

    console.log('[UPLOAD ORCAMENTO] Colunas da tabela (em ordem):', columnNames);

    const aliasMap = {
        'Origem': ['origem'],
        'Previsto x Realizado': ['previstoxrealizado', 'previstorealizado', 'previstoxreal', 'previsto_realizado'],
        'Dt Transação Contábil': ['dttransacaocontabil', 'datatransacaocontabil', 'dttransacao', 'datatransacao'],
        'NMês': ['nmes', 'mes', 'mesnumero', 'mesnum'],
        'Valor': ['valor', 'valorbase', 'valoror', 'valor_orcamento'],
        'CLASSIFICACAO': ['classificacao'],
        'GRUPO_CLASSIFICACAO': ['grupoclassificacao'],
        'Decendio': ['decendio', 'decendioo'],
        'TRANSACAO_FINANCEIRA': ['transacaofinanceira', 'transacao_financeira', 'transacaofin'],
        'ITEM_RELATORIO': ['itemrelatorio', 'itemrelatorioo'],
        'Conta Contábil': ['dscontacontabilcx', 'dscontacontabil', 'ds_conta_contabil', 'contacontabil', 'conta', 'contacontabilcx', 'cdcontacontabilcx'],
        'Beneficiario': ['beneficiario', 'beneficiarioo'],
        'Titulo': ['titulo'],
        'Centro Custo': ['dscentrocustocx', 'dscentrocusto', 'ds_centro_custo', 'centrocusto', 'centrodecusto', 'centrocustocx', 'cdcentrocustocx'],
        'Tipo_Titulo': ['tipotitulo'],
        'Ano Transação Contábil': ['anotransacaocontabil', 'anotransacao', 'ano'],
        'GRUPO': ['grupo'],
        'Desc Unidade Negócio': ['descunidadenegocio', 'descricaounidadenegocio', 'unidadenegocio', 'unidadedenegociocx'],
        'AREA': ['area'],
        'Grupo CRAT': ['grupocrat', 'grupocratcx'],
        'Linha CRAT': ['linhacrat', 'linhacratcx'],
        'DS_CAIXA': ['dscaixa', 'descacaixa', 'classificaixa', 'linhacaixa', 'classificacaixa'],
        'DS_ESTABELECIMENTO': ['dsestabelecimento', 'descestabelecimento', 'estabelecimento', 'estabelecimentocx'],
        'Movimento': ['movimento', 'movimentocx'],
        'Tipo Contábil': ['tipocontabil', 'tipocontabilcx'],
        'Impacto em Caixa': ['impactoemcaixa', 'impactacaixacx', 'impactocaixacx'],
        'Histórico Razão': ['historicorazao', 'historico', 'razao'],
        'Novo Mês': ['novomes', 'mesnovo', 'mes_novo'],
        'Desc Estabelecimento': ['descestabelecimento', 'estabelecimento'],
        'Valor Original': ['valororiginal', 'valor_origem'],
        'Valor Alterado': ['valoralterado', 'valorajustado'],
        'NR_SEQUENCIA': ['nrsequencia', 'sequencia', 'nrseqprojreccx', 'nrseqprojetoreccx'],
        'GER_Linha': ['gerlinha', 'linhager'],
        'GER_Grupo': ['gergrupo', 'grupoger'],
        'GER_Grupo_Contas': ['gergrupocontas', 'gergrupo_contas', 'contasger', 'grupocontascx']
    };

    const excelColumnByTarget = new Map();
    columnNames.forEach(targetCol => {
        const aliases = aliasMap[targetCol] || [normalizeHeader(targetCol)];
        let header = findExcelHeaderForAliases(aliases, normalizedHeaderMap);
        if (!header) {
            header = findBestExcelHeaderForTarget(targetCol, excelColumns.filter(h => !monthHeaders.has(h)), normalizedHeaderMap);
        }
        header = preferDsOverCdHeader(targetCol, header, excelColumns.filter(h => !monthHeaders.has(h)));
        if (header) excelColumnByTarget.set(targetCol, header);
    });

    // Mapeamento assistido por IA (se disponível)
    const excelHeadersForAi = excelColumns.filter(h => !monthHeaders.has(h));
    const aiMapping = await getAiColumnMapping(excelHeadersForAi, columnNames, 'VW_ORCAMENTO_FLUXO_CAIXA_AJUSTADO');
    if (aiMapping) {
        Object.entries(aiMapping).forEach(([targetCol, header]) => {
            if (header) {
                excelColumnByTarget.set(targetCol, header);
            } else if (!excelColumnByTarget.has(targetCol)) {
                excelColumnByTarget.set(targetCol, null);
            }
        });
    }

    enforceMovimentoMapping(excelHeadersForAi, excelColumnByTarget);

    console.log('[UPLOAD ORCAMENTO] Mapeamento de colunas detectado:', Object.fromEntries(excelColumnByTarget.entries()));

    if (tipoCarga === 'completa') {
        sendProgress(sessionId, { stage: 'cleaning', message: 'Limpando tabela...', progress: 15 });
        await poolFonte.request().query(`DELETE FROM dbo.[${tabela}]`);
        sendProgress(sessionId, { stage: 'cleaned', message: 'Tabela limpa', progress: 20 });
    }

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const rowsToInsert = [];
    if (hasMonthColumns) {
        data.forEach((row) => {
            monthColumns.forEach((monthCol) => {
                const cell = row[monthCol.header];
                const rawValue = cell ? (cell.raw !== undefined && cell.raw !== null ? cell.raw : cell.text) : null;
                if (rawValue === null || rawValue === undefined || rawValue === '') return;
                rowsToInsert.push({ row, monthNum: monthCol.monthNum, monthValue: rawValue });
            });
        });
    } else {
        data.forEach((row) => rowsToInsert.push({ row, monthNum: null, monthValue: null }));
    }

    const totalRows = rowsToInsert.length;
    sendProgress(sessionId, { stage: 'inserting', message: `Iniciando inserção de ${totalRows} linhas...`, progress: 25, total: totalRows });

    const batchSize = 1000;
    let totalInserted = 0;

    for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        const transaction = new sql.Transaction(poolFonte);
        await transaction.begin();

        try {
            for (const item of batch) {
                const request = new sql.Request(transaction);
                const params = [];

                columns.forEach((col, idx) => {
                    const paramName = `param${idx}`;
                    const colName = col.COLUMN_NAME;
                    let rawValue = null;

                    if (colName === 'Ano Transação Contábil') {
                        rawValue = anoBase;
                    } else if (colName === 'Dt Transação Contábil' && item.monthNum) {
                        const dateObj = new Date(anoBase, item.monthNum - 1, 1, 0, 0, 0, 0);
                        rawValue = formatSqlDateTime(dateObj);
                    } else if (colName === 'NMês' && item.monthNum) {
                        rawValue = item.monthNum;
                    } else if (colName === 'Novo Mês' && item.monthNum) {
                        rawValue = monthNames[item.monthNum - 1];
                    } else if (colName === 'Valor' && item.monthNum) {
                        rawValue = item.monthValue;
                    } else if (colName === 'Valor Original' && item.monthNum && !excelColumnByTarget.has(colName)) {
                        rawValue = item.monthValue;
                    } else if (colName === 'Valor Alterado' && item.monthNum && !excelColumnByTarget.has(colName)) {
                        rawValue = item.monthValue;
                    } else {
                        const excelHeader = excelColumnByTarget.get(colName);
                        rawValue = pickCellValueForColumn(item.row, excelHeader, col);
                    }

                    let conversionType = col.DATA_TYPE;
                    const baseType = String(col.DATA_TYPE || '').toLowerCase();
                    if (baseType === 'decimal' || baseType === 'numeric') {
                        const p = col.NUMERIC_PRECISION != null ? parseInt(col.NUMERIC_PRECISION, 10) : 18;
                        const s = col.NUMERIC_SCALE != null ? parseInt(col.NUMERIC_SCALE, 10) : 0;
                        conversionType = `${baseType}(${Number.isFinite(p) ? p : 18},${Number.isFinite(s) ? s : 0})`;
                    }

                    const value = convertToSqlType(rawValue, conversionType);
                    const sqlDataType = getSqlDataTypeFromColumn(col);

                    request.input(paramName, sqlDataType, value);
                    params.push(`@${paramName}`);
                });

                const insertQuery = `INSERT INTO dbo.[${tabela}] (${columnNames.map(c => `[${c}]`).join(',')}) VALUES (${params.join(',')})`;
                await request.query(insertQuery);
                totalInserted++;

                if (totalInserted % 100 === 0 || totalInserted === totalRows) {
                    const percentComplete = 25 + Math.floor((totalInserted / totalRows) * 70);
                    sendProgress(sessionId, {
                        stage: 'inserting',
                        message: `Inserindo dados: ${totalInserted}/${totalRows} linhas`,
                        progress: percentComplete,
                        current: totalInserted,
                        total: totalRows
                    });
                }
            }

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    sendProgress(sessionId, { stage: 'completed', message: 'Upload concluído com sucesso!', progress: 100, total_inserido: totalInserted });
    await jobStore.finish(sessionId, { insertedRows: totalInserted, totalRows: data.length, message: `${tipoCarga === 'completa' ? 'Carga completa' : 'Carga incremental'} concluída` });

    setTimeout(() => {
        const client = progressClients.get(sessionId);
        if (client) {
            client.end();
            progressClients.delete(sessionId);
        }
    }, 1000);
}

// Upload e processamento de arquivo Excel para tabela predefinida.
// Comportamento async: cria um job, responde 202+jobId imediatamente e roda
// o processamento em background. O cliente acompanha via SSE em
// /api/excel/upload/progress/:jobId. O sessionId no payload SSE = jobId.
app.post('/api/excel/upload/:tabela', uploadExcel.single('file'), optionalAuthenticate, async (req, res) => {
    const { tabela } = req.params;
    const tipoCarga = req.body.tipo_carga || 'completa';

    // Verificar se tabela existe no banco de dados
    let tableExists = false;
    try {
        const checkResult = await pool.request()
            .input('tableName', sql.VarChar(100), tabela)
            .query('SELECT 1 FROM TableDefinitions WHERE TableName = @tableName AND IsActive = 1');
        tableExists = checkResult.recordset.length > 0;
    } catch (err) {
        console.warn('Erro ao verificar tabela no banco:', err);
    }

    if (!tableExists && !TABELAS_DISPONIVEIS[tabela]) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Tabela não encontrada' });
    }

    // Respeitar configuração AllowFullLoad (se existir no banco)
    try {
        if (await tableDefinitionsHasAllowFullLoad()) {
            const allowResult = await pool.request()
                .input('tableName', sql.VarChar(100), tabela)
                .query('SELECT AllowFullLoad FROM TableDefinitions WHERE TableName = @tableName AND IsActive = 1');

            if (allowResult.recordset.length > 0) {
                const allowFullLoad = allowResult.recordset[0].AllowFullLoad;
                if (allowFullLoad === 0 && tipoCarga === 'completa') {
                    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                    return res.status(400).json({ error: 'Carga completa desabilitada para esta tabela. Utilize carga incremental.' });
                }
            }
        }
    } catch (err) {
        console.warn('Erro ao validar AllowFullLoad:', err.message);
    }

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    if (!poolFonte || !poolFonte.connected) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(503).json({ error: 'Banco Fonte não conectado' });
    }

    // Bloqueio: nao permite duas cargas simultaneas para a mesma tabela
    try {
        const running = await jobStore.hasRunningForTable(tabela);
        if (running) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(409).json({
                error: `Ja existe uma carga em andamento para a tabela ${tabela}. Aguarde concluir.`,
                runningJobId: running.JobId
            });
        }
    } catch (err) {
        console.warn('Falha ao verificar jobs em andamento:', err.message);
    }

    // Cria o job e responde imediatamente
    const userId = req.user && req.user.id ? req.user.id : null;
    const userName = req.user && req.user.username ? req.user.username : null;
    let jobId;
    try {
        jobId = await jobStore.create({
            tableName: tabela,
            jobType: 'standard',
            loadType: tipoCarga,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            userId,
            userName
        });
    } catch (err) {
        console.error('Erro ao criar job:', err);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Falha ao criar job de upload' });
    }

    res.status(202).json({
        success: true,
        jobId,
        sessionId: jobId,
        tabela,
        tipoCarga,
        message: 'Upload iniciado em background'
    });

    const filePath = req.file.path;
    const fileSnapshot = { path: req.file.path, originalname: req.file.originalname, size: req.file.size };
    const reqBodySnapshot = { ...req.body };

    // Carga especifica: Orcamento Fluxo de Caixa Ajustado
    if (tabela === ORCAMENTO_FLUXO_CAIXA_TABLE) {
        setImmediate(async () => {
            try {
                const fakeReq = { params: { tabela }, body: reqBodySnapshot, file: fileSnapshot };
                await handleOrcamentoFluxoCaixaUpload(fakeReq, null, tabela, tipoCarga, jobId);
            } catch (err) {
                console.error('Erro no upload orcamento (async):', err);
                await jobStore.fail(jobId, err.message);
                if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (_) {} }
            }
        });
        return;
    }

    setImmediate(() => runStandardUploadJob({ jobId, tabela, tipoCarga, file: fileSnapshot })
        .catch(async (err) => {
            console.error('Erro no upload (async):', err);
            await jobStore.fail(jobId, err.message);
            if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (_) {} }
        })
    );
});

// Funcao de processamento em background. Recebe o jobId; nao usa res.
// O conteudo abaixo era o corpo original do handler, agora com sessionId = jobId.
async function runStandardUploadJob({ jobId, tabela, tipoCarga, file }) {
    const sessionId = jobId;
    // Shim de req para reaproveitar o codigo original que usava req.file.path.
    const req = { file };
    try {
        sendProgress(sessionId, { stage: 'reading', message: 'Lendo arquivo Excel...', progress: 5 });
        
        // Detectar se o arquivo é TSV disfarçado de XLS
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        const isTabDelimited = fileContent.includes('\t') && !fileContent.startsWith('PK'); // TSV tem tabs, ZIP (xlsx) começa com PK
        
        let dataText, dataRaw;
        
        if (isTabDelimited) {
            console.log('[UPLOAD] Arquivo detectado como TSV (tab-delimited), lendo manualmente como texto puro');
            // Tentar detectar encoding correto (Windows-1252/Latin1 vs UTF-8)
            let content = fileContent;
            
            // Se tem caracteres inválidos UTF-8, tentar ler como Windows-1252
            if (content.includes('�')) {
                console.log('[UPLOAD] Detectado problema de encoding, relendo como Windows-1252');
                const iconv = require('iconv-lite');
                const buffer = fs.readFileSync(req.file.path);
                content = iconv.decode(buffer, 'windows-1252');
            }
            
            // Ler TSV manualmente como texto puro para evitar conversão automática de datas
            const lines = content.trim().split('\n');
            const headers = lines[0].split('\t').map(h => h.trim());
            
            const parsedData = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                const values = lines[i].split('\t');
                const row = {};
                headers.forEach((header, idx) => {
                    const value = values[idx] ? values[idx].trim() : '';
                    row[header] = value;
                });
                parsedData.push(row);
            }
            
            // Ambos text e raw são o mesmo (texto puro)
            dataText = parsedData;
            dataRaw = parsedData;
        } else {
            // Arquivo Excel verdadeiro
            const workbook = XLSX.readFile(req.file.path, { cellText: false, cellDates: false });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            dataText = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });
            dataRaw = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });
        }
        
        // Limpar espaços dos nomes das colunas, mantendo versões texto e bruta
        const data = dataRaw.map((row, idx) => {
            const cleanRow = {};
            const rawRow = row;
            const textRow = dataText[idx] || {};
            Object.keys(rawRow).forEach(key => {
                const cleanKey = key ? key.trim() : key;
                // Guardar tanto o bruto quanto o texto exibido
                cleanRow[cleanKey] = {
                    raw: rawRow[key],
                    text: textRow[key] !== undefined ? (typeof textRow[key] === 'string' ? textRow[key].trim() : textRow[key]) : undefined
                };
            });
            return cleanRow;
        });
        
        if (data.length === 0) {
            fs.unlinkSync(req.file.path);
            throw new Error('Arquivo Excel vazio');
        }

        sendProgress(sessionId, { stage: 'read', message: `${data.length} linhas encontradas`, progress: 10 });
        
        // Obter colunas do Excel na ordem em que aparecem, filtrando vazias
        const allExcelColumns = Object.keys(data[0]);
        const excelColumns = allExcelColumns.filter(col => {
            // Filtra colunas com nomes vazios, __EMPTY, ou que são só espaços
            return col && col.trim() !== '' && !col.startsWith('__EMPTY');
        });
        
        // Log dos dados lidos do Excel
        console.log('[UPLOAD] Todas as colunas do Excel:', allExcelColumns);
        console.log('[UPLOAD] Colunas válidas do Excel (em ordem):', excelColumns);
        console.log('[UPLOAD] Primeira linha do Excel (com raw/text):', JSON.stringify(data[0]));
        
        // Log detalhado dos tipos de cada valor na primeira linha
        console.log('[UPLOAD] Tipos de dados na primeira linha:');
        Object.keys(data[0]).forEach(col => {
            const val = data[0][col];
            const tipo = val && val.raw !== null && val.raw !== undefined ? typeof val.raw : typeof val;
            console.log(`  - ${col}: ${tipo} = ${val && val.raw !== undefined ? val.raw : val}`);
            if (val && val.text !== undefined) {
                console.log(`    (texto exibido: "${val.text}", tipo: ${typeof val.text})`);
            }
        });
        
        // Obter estrutura da tabela
        const schemaResult = await poolFonte.request().query(`
            SELECT
                c.name AS COLUMN_NAME,
                t.name AS DATA_TYPE,
                c.is_nullable AS IS_NULLABLE,
                c.max_length AS CHARACTER_MAXIMUM_LENGTH,
                c.precision AS NUMERIC_PRECISION,
                c.scale AS NUMERIC_SCALE,
                c.is_identity AS IS_IDENTITY
            FROM sys.columns c
            INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
            WHERE c.object_id = OBJECT_ID('dbo.${tabela}')
            ORDER BY c.column_id
        `);
        
        // Filtrar colunas automáticas (identity e DataCarga) - essas não vêm do Excel
        const columns = schemaResult.recordset.filter(col => 
            !col.IS_IDENTITY && col.COLUMN_NAME !== 'DataCarga'
        );
        const columnNames = columns.map(c => c.COLUMN_NAME);
        
        console.log('[UPLOAD] Colunas da tabela (em ordem):', columnNames);
        console.log('[UPLOAD] Estrutura das colunas:', columns.map(c => {
            const t = (c.DATA_TYPE || '').toLowerCase();
            if (t === 'decimal' || t === 'numeric') {
                return `${c.COLUMN_NAME} (${c.DATA_TYPE}(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE}))`;
            }
            if (t === 'varchar' || t === 'nvarchar') {
                const len = c.CHARACTER_MAXIMUM_LENGTH;
                const lenStr = (len === -1) ? 'MAX' : len;
                return `${c.COLUMN_NAME} (${c.DATA_TYPE}(${lenStr}))`;
            }
            return `${c.COLUMN_NAME} (${c.DATA_TYPE})`;
        }));
        
        // === MAPEAMENTO POR NOME + DETECCAO DE COLUNAS NOVAS ===
        // Casa cada header do Excel a uma coluna do banco por nome normalizado
        // (sem acentos / case-insensitive / ignora pontuacao). Headers que nao
        // batem com nenhuma coluna do banco viram candidatos a "coluna nova".
        // Para evitar tratar um Excel totalmente diferente como "schema novo",
        // exigimos que pelo menos 70% dos headers do Excel batam com a tabela
        // antes de adicionar colunas.
        const dbColByNormalized = new Map();
        columns.forEach(c => {
            const norm = normalizeHeader(c.COLUMN_NAME);
            if (norm && !dbColByNormalized.has(norm)) dbColByNormalized.set(norm, c.COLUMN_NAME);
        });
        const excelHeaderByColName = new Map(); // DB col name -> Excel header
        const matchedExcelHeaders = [];
        const unmatchedExcelHeaders = [];
        for (const header of excelColumns) {
            const norm = normalizeHeader(header);
            const dbColName = norm ? dbColByNormalized.get(norm) : null;
            if (dbColName && !excelHeaderByColName.has(dbColName)) {
                excelHeaderByColName.set(dbColName, header);
                matchedExcelHeaders.push(header);
            } else {
                unmatchedExcelHeaders.push(header);
            }
        }

        let newColumnsCreated = [];
        if (unmatchedExcelHeaders.length > 0) {
            const matchRatio = excelColumns.length > 0 ? matchedExcelHeaders.length / excelColumns.length : 0;
            const matchPct = Math.round(matchRatio * 100);

            if (tipoCarga !== 'completa') {
                fs.unlinkSync(req.file.path);
                throw new Error(`Colunas do Excel nao encontradas na tabela: ${unmatchedExcelHeaders.join(', ')}. Use carga completa para criar as colunas automaticamente.`);
            }

            if (matchRatio < 0.7) {
                fs.unlinkSync(req.file.path);
                throw new Error(`Arquivo Excel nao parece corresponder a tabela ${tabela}. Apenas ${matchedExcelHeaders.length} de ${excelColumns.length} colunas foram reconhecidas (${matchPct}%). Verifique se o arquivo selecionado e da tabela correta.`);
            }

            // Sanitiza nomes para SQL Server: alfanumerico + underscore, sem acentos,
            // nao comeca com digito, evita colidir com colunas ja existentes.
            const existingNamesLower = new Set(columns.map(c => c.COLUMN_NAME.toLowerCase()));
            existingNamesLower.add('id');
            existingNamesLower.add('datacarga');
            let fallbackCounter = 1;
            for (const header of unmatchedExcelHeaders) {
                let base = simplifyHeader(header).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                if (!base) base = `Coluna_${fallbackCounter++}`;
                if (/^[0-9]/.test(base)) base = `_${base}`;
                let candidate = base;
                let suffix = 2;
                while (existingNamesLower.has(candidate.toLowerCase())) {
                    candidate = `${base}_${suffix++}`;
                }
                existingNamesLower.add(candidate.toLowerCase());
                newColumnsCreated.push({ header, columnName: candidate });
            }

            sendProgress(sessionId, {
                stage: 'altering',
                message: `Adicionando ${newColumnsCreated.length} coluna(s) nova(s) a tabela ${tabela}: ${newColumnsCreated.map(d => d.columnName).join(', ')}`,
                progress: 12
            });
            console.log('[UPLOAD] Match ratio:', matchPct + '%', '- colunas novas a criar:', newColumnsCreated.map(d => `${d.header} -> ${d.columnName}`));
            for (const def of newColumnsCreated) {
                const alterSql = `ALTER TABLE dbo.[${tabela}] ADD [${def.columnName}] NVARCHAR(255) NULL`;
                console.log('[UPLOAD]', alterSql);
                await poolFonte.request().query(alterSql);
            }

            // Recarrega schema com as colunas novas e atualiza mapeamento
            const schemaReload = await poolFonte.request().query(`
                SELECT
                    c.name AS COLUMN_NAME,
                    t.name AS DATA_TYPE,
                    c.is_nullable AS IS_NULLABLE,
                    c.max_length AS CHARACTER_MAXIMUM_LENGTH,
                    c.precision AS NUMERIC_PRECISION,
                    c.scale AS NUMERIC_SCALE,
                    c.is_identity AS IS_IDENTITY
                FROM sys.columns c
                INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
                WHERE c.object_id = OBJECT_ID('dbo.${tabela}')
                ORDER BY c.column_id
            `);
            const refreshed = schemaReload.recordset.filter(col => !col.IS_IDENTITY && col.COLUMN_NAME !== 'DataCarga');
            columns.length = 0;
            refreshed.forEach(c => columns.push(c));
            columnNames.length = 0;
            columns.forEach(c => columnNames.push(c.COLUMN_NAME));
            for (const def of newColumnsCreated) {
                excelHeaderByColName.set(def.columnName, def.header);
            }
            console.log('[UPLOAD] Schema recarregado apos adicionar colunas novas. Total agora:', columnNames.length);
        }

        // Limpar tabela se for carga completa
        if (tipoCarga === 'completa') {
            sendProgress(sessionId, { stage: 'cleaning', message: 'Limpando tabela...', progress: 15 });
            await poolFonte.request().query(`DELETE FROM dbo.${tabela}`);
            sendProgress(sessionId, { stage: 'cleaned', message: 'Tabela limpa', progress: 20 });
        }

        // ===============================
        // Proteção sistêmica: se a coluna no banco é INT/BIGINT/SMALLINT/TINYINT,
        // mas os dados trazem casas decimais (ex.: "220,00", "133,30"),
        // a carga completa ajusta automaticamente a coluna para DECIMAL.
        // (Em carga incremental, falha com mensagem, pois é uma mudança de schema.)
        // ===============================
        {
            const integerTypes = new Set(['int', 'bigint', 'smallint', 'tinyint']);

            // Analisa amostra (até 500 linhas) para inferir escala necessária por coluna
            const sampleSize = Math.min(data.length, 500);
            const maxScaleByIndex = new Map();

            for (let r = 0; r < sampleSize; r++) {
                const row = data[r];
                for (let c = 0; c < columns.length; c++) {
                    const col = columns[c];
                    const colType = String(col.DATA_TYPE || '').toLowerCase();
                    if (!integerTypes.has(colType)) continue;
                    if (colType.includes('date')) continue;

                    const excelHeader = excelHeaderByColName.get(col.COLUMN_NAME);
                    if (!excelHeader) continue;
                    const cell = row[excelHeader];
                    const raw = cell ? cell.raw : null;
                    if (raw === null || raw === undefined || raw === '') continue;

                    const info = getLocaleNumberInfo(raw);
                    if (!info) continue;
                    if (info.scale <= 0) continue;

                    const prev = maxScaleByIndex.get(c) || 0;
                    if (info.scale > prev) maxScaleByIndex.set(c, info.scale);
                }
            }

            if (maxScaleByIndex.size > 0) {
                if (tipoCarga !== 'completa') {
                    const cols = Array.from(maxScaleByIndex.entries()).map(([idx, scale]) => `${columns[idx].COLUMN_NAME} (scale ${scale})`).join(', ');
                    throw new Error(`A carga contém valores decimais, mas a tabela possui colunas inteiras. Colunas: ${cols}. Use carga completa ou altere as colunas para DECIMAL/NUMERIC.`);
                }

                sendProgress(sessionId, { stage: 'altering', message: 'Ajustando tipos numéricos (INT -> DECIMAL) ...', progress: 22 });
                for (const [idx, scaleRaw] of maxScaleByIndex.entries()) {
                    const col = columns[idx];
                    const scale = Math.max(1, Math.min(scaleRaw, 10));
                    const nullable = String(col.IS_NULLABLE).toUpperCase() === 'YES' ? 'NULL' : 'NOT NULL';
                    const precision = String(col.DATA_TYPE || '').toLowerCase() === 'bigint' ? 38 : 18;
                    const alterSql = `ALTER TABLE dbo.[${tabela}] ALTER COLUMN [${col.COLUMN_NAME}] DECIMAL(${precision},${scale}) ${nullable}`;
                    console.log('[UPLOAD] Ajuste automático de tipo:', alterSql);
                    await poolFonte.request().query(alterSql);
                }

                // Recarregar schema para refletir os tipos ajustados
                const schemaReload = await poolFonte.request().query(`
                    SELECT
                        c.name AS COLUMN_NAME,
                        t.name AS DATA_TYPE,
                        c.is_nullable AS IS_NULLABLE,
                        c.max_length AS CHARACTER_MAXIMUM_LENGTH,
                        c.precision AS NUMERIC_PRECISION,
                        c.scale AS NUMERIC_SCALE,
                        c.is_identity AS IS_IDENTITY
                    FROM sys.columns c
                    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
                    WHERE c.object_id = OBJECT_ID('dbo.${tabela}')
                    ORDER BY c.column_id
                `);

                const refreshed = schemaReload.recordset.filter(col => !col.IS_IDENTITY && col.COLUMN_NAME !== 'DataCarga');
                // Mantém a ordem original das colunas filtradas
                columns.length = 0;
                refreshed.forEach(c => columns.push(c));

                // Atualiza arrays dependentes
                columnNames.length = 0;
                columns.forEach(c => columnNames.push(c.COLUMN_NAME));

                console.log('[UPLOAD] Schema recarregado após ajuste de tipos.');
            }
        }
        
        // Inserir dados em lotes
        const batchSize = 1000;
        let totalInserted = 0;
        
        sendProgress(sessionId, { stage: 'inserting', message: `Iniciando inserção de ${data.length} linhas...`, progress: 25, total: data.length });
        
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const transaction = new sql.Transaction(poolFonte);
            
            await transaction.begin();
            
            try {
                for (const row of batch) {
                    const request = new sql.Request(transaction);
                    const values = [];
                    const params = [];
                    
                    // Log da primeira linha do lote
                    if (totalInserted === 0) {
                        console.log('[UPLOAD] Processando primeira linha:', JSON.stringify(row));
                    }
                    
                    columns.forEach((col, idx) => {
                        const paramName = `param${idx}`;
                        // Pega o valor pelo NOME (via excelHeaderByColName); colunas sem
                        // header correspondente no Excel ficam como null.
                        const excelHeader = excelHeaderByColName.get(col.COLUMN_NAME);
                        const cell = excelHeader ? row[excelHeader] : null;
                        let rawValue = null;
                        // Para colunas de data
                        if (col.DATA_TYPE.toLowerCase().includes('date')) {
                            if (cell) {
                                const textVal = cell.text && typeof cell.text === 'string' ? cell.text.trim() : '';
                                
                                // Se o texto está em formato de data brasileiro (DD/MM/YYYY), usar o texto
                                if (textVal && textVal.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
                                    rawValue = textVal;
                                }
                                // Senão, se o raw é número (serial do Excel), usar o raw
                                else if (cell.raw !== null && cell.raw !== undefined && typeof cell.raw === 'number') {
                                    rawValue = cell.raw;
                                }
                                // Senão, se tem texto não vazio, usar o texto
                                else if (textVal !== '') {
                                    rawValue = textVal;
                                }
                                // Senão, usar o raw mesmo que não seja número
                                else {
                                    rawValue = cell.raw;
                                }
                            }
                        } else {
                            rawValue = cell ? cell.raw : null;
                        }
                        // Log detalhado ANTES da conversão para colunas de data
                        if (totalInserted === 0 && col.DATA_TYPE.toLowerCase().includes('date')) {
                            console.log(`[ANTES CONVERSÃO] Coluna ${col.COLUMN_NAME}: cell.raw=${cell.raw} (tipo: ${typeof cell.raw}), cell.text="${cell.text}" (tipo: ${typeof cell.text}), rawValue escolhido=${rawValue} (tipo: ${typeof rawValue})`);
                        }
                        
                        // Para DECIMAL/NUMERIC, incluir precisão/scale na conversão (garante preservação das casas)
                        let conversionType = col.DATA_TYPE;
                        const baseType = String(col.DATA_TYPE || '').toLowerCase();
                        if (baseType === 'decimal' || baseType === 'numeric') {
                            const p = col.NUMERIC_PRECISION != null ? parseInt(col.NUMERIC_PRECISION, 10) : 18;
                            const s = col.NUMERIC_SCALE != null ? parseInt(col.NUMERIC_SCALE, 10) : 0;
                            conversionType = `${baseType}(${Number.isFinite(p) ? p : 18},${Number.isFinite(s) ? s : 0})`;
                        }
                        const value = convertToSqlType(rawValue, conversionType);
                        const sqlDataType = getSqlDataTypeFromColumn(col);
                        
                        // Log detalhado da primeira linha E de todas as colunas de data
                        if (totalInserted === 0 || (col.DATA_TYPE.toLowerCase().includes('date') && totalInserted < 5)) {
                            console.log(`[UPLOAD] Linha ${totalInserted} - Coluna ${col.COLUMN_NAME} <- Excel "${excelHeader || '(sem header)'}": raw="${rawValue}" (tipo JS: ${typeof rawValue}) -> convertido="${value}" (tipo SQL: ${col.DATA_TYPE})`);
                        }
                        
                        request.input(paramName, sqlDataType, value);
                        params.push(`@${paramName}`);
                    });
                    
                    const insertQuery = `INSERT INTO dbo.${tabela} (${columnNames.map(c => `[${c}]`).join(',')}) VALUES (${params.join(',')})`;
                    
                    if (totalInserted === 0) {
                        console.log('[UPLOAD] Query de inserção:', insertQuery);
                    }
                    
                    await request.query(insertQuery);
                    totalInserted++;
                    
                    // Enviar progresso a cada 100 linhas
                    if (totalInserted % 100 === 0 || totalInserted === data.length) {
                        const percentComplete = 25 + Math.floor((totalInserted / data.length) * 70);
                        sendProgress(sessionId, {
                            stage: 'inserting',
                            message: `Inserindo dados: ${totalInserted}/${data.length} linhas`,
                            progress: percentComplete,
                            current: totalInserted,
                            total: data.length
                        });
                    }
                }
                
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        }
        
        // Remove arquivo temporário
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        const newColsSuffix = (newColumnsCreated && newColumnsCreated.length > 0)
            ? ` (${newColumnsCreated.length} coluna(s) nova(s) criada(s): ${newColumnsCreated.map(d => d.columnName).join(', ')})`
            : '';
        sendProgress(sessionId, { stage: 'completed', message: 'Upload concluído com sucesso!' + newColsSuffix, progress: 100, total_inserido: totalInserted });
        await jobStore.finish(sessionId, { insertedRows: totalInserted, totalRows: data.length, message: `${tipoCarga === 'completa' ? 'Carga completa' : 'Carga incremental'} concluída${newColsSuffix}` });

        // Fechar conexão SSE
        setTimeout(() => {
            const client = progressClients.get(sessionId);
            if (client) {
                client.end();
                progressClients.delete(sessionId);
            }
        }, 1000);
    } catch (err) {
        console.error('Erro no upload:', err);
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        sendProgress(sessionId, { stage: 'error', message: err.message || 'Erro durante a carga', progress: 0 });
        await jobStore.fail(sessionId, err.message);
        setTimeout(() => {
            const client = progressClients.get(sessionId);
            if (client) {
                client.end();
                progressClients.delete(sessionId);
            }
        }, 1000);
    }
}

// Upload para tabela temporária customizada (async + jobStore).
app.post('/api/excel/upload-temp', uploadExcel.single('file'), optionalAuthenticate, async (req, res) => {
    const tableName = req.body.table_name;

    if (!tableName || !/^[a-zA-Z0-9_]+$/.test(tableName)) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Nome de tabela inválido' });
    }

    const fullTableName = tableName.startsWith('TEMP_') ? tableName : `TEMP_${tableName}`;

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    if (!poolFonte || !poolFonte.connected) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(503).json({ error: 'Banco Fonte não conectado' });
    }

    // Bloqueio: nao permite duas cargas simultaneas para a mesma tabela TEMP
    try {
        const running = await jobStore.hasRunningForTable(fullTableName);
        if (running) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(409).json({
                error: `Ja existe uma carga em andamento para ${fullTableName}.`,
                runningJobId: running.JobId
            });
        }
    } catch (_) {}

    let jobId;
    try {
        jobId = await jobStore.create({
            tableName: fullTableName,
            jobType: 'temp',
            loadType: null,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            userId: req.user && req.user.id ? req.user.id : null,
            userName: req.user && req.user.username ? req.user.username : null
        });
    } catch (err) {
        console.error('Erro ao criar job:', err);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Falha ao criar job de upload' });
    }

    res.status(202).json({
        success: true,
        jobId,
        sessionId: jobId,
        table_name: fullTableName,
        message: 'Upload temporario iniciado em background'
    });

    const fileSnapshot = { path: req.file.path, originalname: req.file.originalname, size: req.file.size };
    setImmediate(() => runTempUploadJob({ jobId, fullTableName, file: fileSnapshot })
        .catch(async (err) => {
            console.error('Erro no upload-temp (async):', err);
            await jobStore.fail(jobId, err.message);
            if (fs.existsSync(fileSnapshot.path)) { try { fs.unlinkSync(fileSnapshot.path); } catch (_) {} }
        })
    );
});

async function runTempUploadJob({ jobId, fullTableName, file }) {
    const sessionId = jobId;
    const req = { file };
    try {
        sendProgress(sessionId, { stage: 'reading', message: 'Lendo arquivo Excel...', progress: 5 });

        // Detectar se o arquivo é TSV disfarçado de XLS
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        const isTabDelimited = fileContent.includes('\t') && !fileContent.startsWith('PK');
        
        let data;
        
        if (isTabDelimited) {
            console.log('[UPLOAD-TEMP] Arquivo detectado como TSV, lendo manualmente como texto puro');
            // Tentar detectar encoding correto
            let content = fileContent;
            
            if (content.includes('�')) {
                console.log('[UPLOAD-TEMP] Detectado problema de encoding, relendo como Windows-1252');
                const iconv = require('iconv-lite');
                const buffer = fs.readFileSync(req.file.path);
                content = iconv.decode(buffer, 'windows-1252');
            }
            
            // Ler TSV manualmente
            const lines = content.trim().split('\n');
            const headers = lines[0].split('\t').map(h => h.trim());
            
            const parsedData = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                const values = lines[i].split('\t');
                const row = {};
                headers.forEach((header, idx) => {
                    const value = values[idx] ? values[idx].trim() : '';
                    row[header] = value;
                });
                parsedData.push(row);
            }
            
            data = parsedData;
        } else {
            // Arquivo Excel verdadeiro
            const workbook = XLSX.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });
            
            // Limpar espaços dos nomes das colunas
            data = rawData.map(row => {
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim();
                    cleanRow[cleanKey] = row[key];
                });
                return cleanRow;
            });
        }
        
        if (data.length === 0) {
            fs.unlinkSync(req.file.path);
            throw new Error('Arquivo Excel vazio');
        }

        sendProgress(sessionId, { stage: 'read', message: `${data.length} linhas encontradas`, progress: 10 });

        // Analisar colunas do Excel
        const excelColumns = Object.keys(data[0]);

        sendProgress(sessionId, { stage: 'creating', message: 'Criando tabela...', progress: 15 });

        // Dropar tabela se existir
        await poolFonte.request().query(`
            IF OBJECT_ID('dbo.${fullTableName}', 'U') IS NOT NULL
                DROP TABLE dbo.${fullTableName}
        `);
        
        // Criar tabela
        const columnDefs = excelColumns.map(col => {
            const cleanName = col.replace(/[^a-zA-Z0-9_]/g, '_');
            return `[${cleanName}] NVARCHAR(MAX) NULL`;
        });
        
        await poolFonte.request().query(`
            CREATE TABLE dbo.${fullTableName} (
                Id INT IDENTITY(1,1) PRIMARY KEY,
                ${columnDefs.join(',\n')},
                DataCarga DATETIME DEFAULT GETDATE()
            )
        `);
        
        // Inserir dados
        let totalInserted = 0;
        sendProgress(sessionId, { stage: 'inserting', message: `Iniciando inserção de ${data.length} linhas...`, progress: 25, total: data.length });
        const transaction = new sql.Transaction(poolFonte);
        await transaction.begin();

        try {
            for (const row of data) {
                const request = new sql.Request(transaction);
                const params = [];
                const values = [];

                excelColumns.forEach((col, idx) => {
                    const cleanName = col.replace(/[^a-zA-Z0-9_]/g, '_');
                    const paramName = `param${idx}`;
                    request.input(paramName, row[col] !== null && row[col] !== undefined ? String(row[col]) : null);
                    params.push(`@${paramName}`);
                    values.push(cleanName);
                });

                const insertQuery = `INSERT INTO dbo.${fullTableName} (${values.map(v => `[${v}]`).join(',')}) VALUES (${params.join(',')})`;
                await request.query(insertQuery);
                totalInserted++;

                if (totalInserted % 100 === 0 || totalInserted === data.length) {
                    const pct = 25 + Math.floor((totalInserted / data.length) * 70);
                    sendProgress(sessionId, {
                        stage: 'inserting',
                        message: `Inserindo dados: ${totalInserted}/${data.length} linhas`,
                        progress: pct,
                        current: totalInserted,
                        total: data.length
                    });
                }
            }

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        sendProgress(sessionId, { stage: 'completed', message: `Tabela ${fullTableName} criada com sucesso!`, progress: 100, total_inserido: totalInserted });
        await jobStore.finish(sessionId, { insertedRows: totalInserted, totalRows: data.length, message: `Tabela ${fullTableName} criada com sucesso` });

        setTimeout(() => {
            const client = progressClients.get(sessionId);
            if (client) {
                client.end();
                progressClients.delete(sessionId);
            }
        }, 1000);
    } catch (err) {
        console.error('Erro no upload temp:', err);
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        sendProgress(sessionId, { stage: 'error', message: err.message || 'Erro durante a carga', progress: 0 });
        await jobStore.fail(sessionId, err.message);
        setTimeout(() => {
            const client = progressClients.get(sessionId);
            if (client) {
                client.end();
                progressClients.delete(sessionId);
            }
        }, 1000);
    }
}

// ========================================
// JOBS DE UPLOAD: estado e listagem
// ========================================

// Lista jobs de upload. Filtros opcionais: ?status=running,queued|success|error  ?tableName=X  ?limit=N
app.get('/api/excel/jobs', optionalAuthenticate, async (req, res) => {
    try {
        const status = req.query.status
            ? String(req.query.status).split(',').map(s => s.trim()).filter(Boolean)
            : null;
        const tableName = req.query.tableName ? String(req.query.tableName) : null;
        const limit = req.query.limit ? Math.min(parseInt(req.query.limit, 10) || 50, 200) : 50;

        const rows = await jobStore.list({ status, tableName, limit });
        res.json(rows.map(j => ({
            jobId: j.JobId,
            tableName: j.TableName,
            jobType: j.JobType,
            loadType: j.LoadType,
            status: j.Status,
            stage: j.Stage,
            message: j.Message,
            progress: j.Progress,
            totalRows: j.TotalRows,
            insertedRows: j.InsertedRows,
            fileName: j.FileName,
            fileSize: j.FileSize,
            userId: j.UserId,
            userName: j.UserName,
            errorMessage: j.ErrorMessage,
            startedAt: j.StartedAt,
            finishedAt: j.FinishedAt,
            updatedAt: j.UpdatedAt
        })));
    } catch (err) {
        console.error('[API] Erro ao listar jobs:', err);
        res.status(500).json({ error: err.message });
    }
});

// Estado atual de um job
app.get('/api/excel/jobs/:jobId', optionalAuthenticate, async (req, res) => {
    try {
        const j = await jobStore.get(req.params.jobId);
        if (!j) return res.status(404).json({ error: 'Job nao encontrado' });
        res.json({
            jobId: j.JobId,
            tableName: j.TableName,
            jobType: j.JobType,
            loadType: j.LoadType,
            status: j.Status,
            stage: j.Stage,
            message: j.Message,
            progress: j.Progress,
            totalRows: j.TotalRows,
            insertedRows: j.InsertedRows,
            fileName: j.FileName,
            fileSize: j.FileSize,
            userId: j.UserId,
            userName: j.UserName,
            errorMessage: j.ErrorMessage,
            startedAt: j.StartedAt,
            finishedAt: j.FinishedAt,
            updatedAt: j.UpdatedAt
        });
    } catch (err) {
        console.error('[API] Erro ao buscar job:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// FIM ROTAS APLICAÇÃO DE CARGA EXCEL
// ========================================

// ========================================
// ROTAS DE GERENCIAMENTO DE GRUPOS E TABELAS
// ========================================

// Listar todos os grupos
app.get('/api/excel/groups', async (req, res) => {
    console.log('[API] GET /api/excel/groups - Acesso público');
    try {
        const result = await pool.request().query(`
            SELECT g.*, COUNT(t.Id) as TotalTables
            FROM TableGroups g
            LEFT JOIN TableDefinitions t ON g.Id = t.GroupId AND t.IsActive = 1
            WHERE g.IsActive = 1
            GROUP BY g.Id, g.Code, g.Name, g.Description, g.Icon, g.IsActive, g.CreatedAt, g.UpdatedAt
            ORDER BY g.Name
        `);
        console.log('[API] Grupos encontrados:', result.recordset.length);
        console.log('[API] Grupos:', result.recordset.map(g => `${g.Code} - ${g.Name}`));
        res.json(result.recordset);
    } catch (err) {
        console.error('[API] Erro ao buscar grupos:', err);
        res.status(500).json({ error: err.message });
    }
});

// Criar novo grupo
app.post('/api/excel/groups', async (req, res) => {
    console.log('[API] POST /api/excel/groups - Acesso público');
    
    try {
        const { code, name, description, icon } = req.body;
        
        if (!code || !name) {
            return res.status(400).json({ error: 'Código e nome são obrigatórios' });
        }
        
        const result = await pool.request()
            .input('code', sql.VarChar(50), code)
            .input('name', sql.NVarChar(200), name)
            .input('description', sql.NVarChar(500), description || null)
            .input('icon', sql.NVarChar(50), icon || '📁')
            .query(`
                INSERT INTO TableGroups (Code, Name, Description, Icon)
                OUTPUT INSERTED.*
                VALUES (@code, @name, @description, @icon)
            `);
        
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Erro ao criar grupo:', err);
        if (err.number === 2627) { // Violação de chave única
            res.status(400).json({ error: 'Já existe um grupo com este código' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Atualizar grupo
app.put('/api/excel/groups/:id', async (req, res) => {
    console.log('[API] PUT /api/excel/groups/:id - Acesso público');
    
    try {
        const { name, description, icon } = req.body;
        
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar(200), name)
            .input('description', sql.NVarChar(500), description || null)
            .input('icon', sql.NVarChar(50), icon || null)
            .query(`
                UPDATE TableGroups
                SET Name = @name,
                    Description = @description,
                    Icon = @icon,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND IsActive = 1
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Grupo não encontrado' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Erro ao atualizar grupo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Excluir grupo (soft delete)
app.delete('/api/excel/groups/:id', async (req, res) => {
    console.log('[API] DELETE /api/excel/groups/:id - Acesso público');
    
    try {
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE TableGroups SET IsActive = 0 WHERE Id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir grupo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Listar todas as definições de tabelas
app.get('/api/excel/table-definitions', async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT t.*, g.Code as GroupCode, g.Name as GroupName
            FROM TableDefinitions t
            LEFT JOIN TableGroups g ON t.GroupId = g.Id
            WHERE t.IsActive = 1
            ORDER BY g.Name, t.DisplayName
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Erro ao buscar tabelas:', err);
        res.status(500).json({ error: err.message });
    }
});

// Armazenar clientes SSE para progresso
const progressClients = new Map();

// ========================================
// Job Store: persiste status/progresso de uploads em UploadJobs.
// Permite reconectar SSE com estado atual, listar jobs em andamento,
// bloquear cargas concorrentes na mesma tabela e exibir lastLoadAt.
// ========================================
const { randomUUID } = require('crypto');

const jobStore = {
    async create({ tableName, jobType, loadType, fileName, fileSize, userId, userName, totalRows = null }) {
        const jobId = randomUUID();
        await pool.request()
            .input('jobId', sql.VarChar(64), jobId)
            .input('tableName', sql.VarChar(200), tableName)
            .input('jobType', sql.VarChar(20), jobType)
            .input('loadType', sql.VarChar(20), loadType || null)
            .input('fileName', sql.NVarChar(255), fileName || null)
            .input('fileSize', sql.BigInt, fileSize || null)
            .input('userId', sql.Int, userId || null)
            .input('userName', sql.NVarChar(200), userName || null)
            .input('totalRows', sql.Int, totalRows)
            .query(`
                INSERT INTO UploadJobs (JobId, TableName, JobType, LoadType, Status, Stage, Message, Progress, TotalRows, FileName, FileSize, UserId, UserName)
                VALUES (@jobId, @tableName, @jobType, @loadType, 'queued', 'queued', N'Job criado', 0, @totalRows, @fileName, @fileSize, @userId, @userName)
            `);
        return jobId;
    },

    async update(jobId, fields) {
        if (!jobId) return;
        const sets = ['UpdatedAt = GETDATE()'];
        const req = pool.request().input('jobId', sql.VarChar(64), jobId);
        if (fields.status !== undefined)        { sets.push('Status = @status');               req.input('status', sql.VarChar(20), fields.status); }
        if (fields.stage !== undefined)         { sets.push('Stage = @stage');                 req.input('stage', sql.VarChar(40), fields.stage); }
        if (fields.message !== undefined)       { sets.push('Message = @message');             req.input('message', sql.NVarChar(500), fields.message); }
        if (fields.progress !== undefined)      { sets.push('Progress = @progress');           req.input('progress', sql.Int, fields.progress); }
        if (fields.totalRows !== undefined)     { sets.push('TotalRows = @totalRows');         req.input('totalRows', sql.Int, fields.totalRows); }
        if (fields.insertedRows !== undefined)  { sets.push('InsertedRows = @insertedRows');   req.input('insertedRows', sql.Int, fields.insertedRows); }
        if (fields.errorMessage !== undefined)  { sets.push('ErrorMessage = @errorMessage');   req.input('errorMessage', sql.NVarChar(sql.MAX), fields.errorMessage); }
        if (fields.finishedAt === true)         { sets.push('FinishedAt = GETDATE()'); }
        try {
            await req.query(`UPDATE UploadJobs SET ${sets.join(', ')} WHERE JobId = @jobId`);
        } catch (err) {
            console.warn('[jobStore.update] Falha ao atualizar job', jobId, err.message);
        }
    },

    async finish(jobId, { insertedRows, totalRows, message } = {}) {
        await this.update(jobId, {
            status: 'success',
            stage: 'completed',
            progress: 100,
            message: message || 'Upload concluído com sucesso!',
            insertedRows: insertedRows ?? null,
            totalRows: totalRows ?? null,
            finishedAt: true
        });
    },

    async fail(jobId, errorMessage) {
        await this.update(jobId, {
            status: 'error',
            stage: 'error',
            message: 'Erro durante a carga',
            errorMessage: String(errorMessage || 'Erro desconhecido').slice(0, 4000),
            finishedAt: true
        });
    },

    async get(jobId) {
        const r = await pool.request()
            .input('jobId', sql.VarChar(64), jobId)
            .query('SELECT * FROM UploadJobs WHERE JobId = @jobId');
        return r.recordset[0] || null;
    },

    async list({ status = null, tableName = null, userId = null, limit = 50 } = {}) {
        const req = pool.request();
        const where = [];
        if (status) {
            const list = Array.isArray(status) ? status : [status];
            where.push(`Status IN (${list.map((_, i) => `@status${i}`).join(',')})`);
            list.forEach((s, i) => req.input(`status${i}`, sql.VarChar(20), s));
        }
        if (tableName) { where.push('TableName = @tableName'); req.input('tableName', sql.VarChar(200), tableName); }
        if (userId)    { where.push('UserId = @userId'); req.input('userId', sql.Int, userId); }
        const sqlText = `
            SELECT TOP (${parseInt(limit, 10) || 50}) *
            FROM UploadJobs
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            ORDER BY StartedAt DESC
        `;
        const r = await req.query(sqlText);
        return r.recordset;
    },

    async hasRunningForTable(tableName) {
        const r = await pool.request()
            .input('tableName', sql.VarChar(200), tableName)
            .query(`SELECT TOP 1 JobId FROM UploadJobs WHERE TableName = @tableName AND Status IN ('queued','running')`);
        return r.recordset[0] || null;
    },

    async lastSuccessByTable(tableName) {
        const r = await pool.request()
            .input('tableName', sql.VarChar(200), tableName)
            .query(`
                SELECT TOP 1 FinishedAt, InsertedRows, LoadType
                  FROM UploadJobs
                 WHERE TableName = @tableName AND Status = 'success' AND FinishedAt IS NOT NULL
                 ORDER BY FinishedAt DESC
            `);
        return r.recordset[0] || null;
    }
};

// Rota SSE para progresso de upload
// O parametro sessionId e' o jobId (UUID) retornado por POST /upload.
// Ao reconectar, busca o estado atual do job em UploadJobs e reenvia,
// permitindo que o usuario saia da tela e volte sem perder progresso.
app.get('/api/excel/upload/progress/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    console.log(`[SSE UPLOAD] Cliente conectado com sessionId: ${sessionId}`);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(':' + ' '.repeat(2048) + '\n\n');
    res.flushHeaders();

    progressClients.set(sessionId, res);
    console.log(`[SSE UPLOAD] Total de clientes conectados: ${progressClients.size}`);

    res.write(`data: ${JSON.stringify({ stage: 'connected', message: 'Conectado ao servidor', progress: 0 })}\n\n`);

    // Reenvia o ultimo estado conhecido do job (caso o cliente esteja reconectando)
    try {
        const job = await jobStore.get(sessionId);
        if (job) {
            const snapshot = {
                stage: job.Stage || job.Status,
                status: job.Status,
                message: job.Message || '',
                progress: job.Progress || 0,
                total: job.TotalRows || undefined,
                total_inserido: job.InsertedRows || undefined,
                error: job.ErrorMessage || undefined,
                jobId: job.JobId
            };
            res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

            // Se o job ja terminou, fecha SSE em seguida
            if (job.Status === 'success' || job.Status === 'error' || job.Status === 'cancelled') {
                setTimeout(() => {
                    progressClients.delete(sessionId);
                    try { res.end(); } catch (_) {}
                }, 200);
            }
        }
    } catch (err) {
        console.warn('[SSE UPLOAD] Falha ao recuperar snapshot do job:', err.message);
    }

    req.on('close', () => {
        console.log(`[SSE UPLOAD] Cliente desconectado: ${sessionId}`);
        progressClients.delete(sessionId);
    });
});

// Rota SSE para progresso de criação de tabela
app.get('/api/excel/table-definitions/progress/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    console.log(`[SSE] Cliente conectado com sessionId: ${sessionId}`);
    
    // Headers necessários para SSE funcionar no IIS
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Desabilita buffering no nginx/proxy
    
    // Para IIS/iisnode: enviar espaços para forçar flush
    res.write(':' + ' '.repeat(2048) + '\n\n');
    res.flushHeaders();
    
    progressClients.set(sessionId, res);
    console.log(`[SSE] Total de clientes conectados: ${progressClients.size}`);
    
    // Enviar mensagem inicial
    res.write(`data: ${JSON.stringify({ stage: 'connected', message: 'Conectado ao servidor', progress: 0 })}\n\n`);
    
    req.on('close', () => {
        console.log(`[SSE] Cliente desconectado: ${sessionId}`);
        progressClients.delete(sessionId);
    });
});

// Funcao para enviar progresso.
// Alem de empurrar via SSE para o cliente conectado (se houver), persiste o
// estado em UploadJobs para que o cliente possa sair da tela e voltar.
// O parametro sessionId tambem e' o jobId. Aceita campos extras
// (current/total/total_inserido) e reflete em colunas do job.
function sendProgress(sessionId, data) {
    const client = progressClients.get(sessionId);
    if (client) {
        try {
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            console.error(`[SSE] Erro ao enviar:`, err.message);
        }
    }

    // Persistencia incremental no job store. Falha silenciosa para nao
    // afetar o fluxo de upload (o SSE ja foi feito).
    if (!sessionId || typeof sessionId !== 'string') return;
    const fields = {};
    if (data.stage !== undefined)    fields.stage = String(data.stage).slice(0, 40);
    if (data.message !== undefined)  fields.message = String(data.message).slice(0, 500);
    if (typeof data.progress === 'number') fields.progress = Math.max(0, Math.min(100, Math.round(data.progress)));
    if (typeof data.total === 'number')          fields.totalRows = data.total;
    if (typeof data.current === 'number')        fields.insertedRows = data.current;
    if (typeof data.total_inserido === 'number') fields.insertedRows = data.total_inserido;

    // Mapeia stage -> status quando aplicavel
    if (data.stage === 'completed') {
        fields.status = 'success';
        fields.finishedAt = true;
    } else if (data.stage === 'error') {
        fields.status = 'error';
        fields.finishedAt = true;
        if (data.message) fields.errorMessage = String(data.message).slice(0, 4000);
    } else if (Object.keys(fields).length > 0 && fields.status === undefined) {
        // Qualquer progresso intermediario marca como running
        fields.status = 'running';
    }

    if (Object.keys(fields).length > 0) {
        // Fire-and-forget para nao bloquear o loop de insert
        jobStore.update(sessionId, fields).catch(() => {});
    }
}

// Criar nova definição de tabela
app.post('/api/excel/table-definitions', uploadExcel.single('modelFile'), async (req, res) => {
    console.log('[API] POST /api/excel/table-definitions - Acesso público');
    const sessionId = req.body.sessionId || Date.now().toString();
    
    try {
        const { tableName, displayName, description, icon, groupId } = req.body;
        const allowFullLoad = String(req.body.allow_full_load ?? '1') === '1';

        await ensureAllowFullLoadColumn();
        const hasAllowFullLoad = await tableDefinitionsHasAllowFullLoad();
        
        if (!tableName || !displayName) {
            return res.status(400).json({ error: 'Nome da tabela e nome de exibição são obrigatórios' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo modelo Excel é obrigatório' });
        }
        
        let modelFileName = req.file.filename;
        let modelFilePath = `/uploads/excel/${req.file.filename}`;
        let columnDefinitions = null;
        
        // Ler estrutura do arquivo para extrair colunas.
        // Suporta: Excel real e TSV disfarçado de .xls (export ADP costuma vir assim).
        let data;
        {
            const buf = fs.readFileSync(req.file.path);
            const utf8 = buf.toString('utf8');
            const isTabDelimited = utf8.includes('\t') && !utf8.startsWith('PK');

            if (isTabDelimited) {
                console.log('[CRIAR TABELA] Arquivo detectado como TSV (tab-delimited), lendo como texto');
                let content = utf8;
                if (content.includes('�')) {
                    console.log('[CRIAR TABELA] Detectado problema de encoding, relendo como Windows-1252');
                    const iconv = require('iconv-lite');
                    content = iconv.decode(buf, 'windows-1252');
                }

                const lines = content.trim().split(/\r?\n/);
                const headersLine = lines[0] || '';
                const headers = headersLine.split('\t').map(h => h.trim());
                const rows = [];
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i] || lines[i].trim() === '') continue;
                    const vals = lines[i].split('\t').map(v => (v ?? '').trim());
                    rows.push(vals);
                }
                data = [headers, ...rows];
            } else {
                const workbook = XLSX.readFile(req.file.path, { cellText: false, cellDates: false });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                // raw:false preserva texto formatado (ex.: "220,00") -> inferência correta de DECIMAL
                data = XLSX.utils.sheet_to_json(worksheet, { defval: null, header: 1, raw: false });
            }
        }
        
        if (data.length === 0) {
            throw new Error('Arquivo Excel está vazio');
        }
        
        // Limpar headers: remover espaços em branco extras e filtrar null/undefined
        const headers = data[0]
            .filter(col => col !== null && col !== undefined && col !== '')
            .map(col => String(col).trim());
        
        if (headers.length === 0) {
            throw new Error('Nenhuma coluna válida encontrada no arquivo Excel');
        }
        
        // Detectar tipo de cada coluna baseado nos dados
        console.log('[CRIAR TABELA] Detectando tipos de colunas...');
        const columns = headers.map((col, idx) => {
            // Pega uma amostra dos valores desta coluna (primeiras 100 linhas)
            const sampleValues = data.slice(1, Math.min(101, data.length)).map(row => row[idx]);
            const detectedType = detectColumnType(sampleValues);
            
            console.log(`[CRIAR TABELA] Coluna "${col}": tipo detectado = ${detectedType}`);
            
            return {
                name: col,
                type: detectedType,
                nullable: true
            };
        });
        columnDefinitions = JSON.stringify(columns);
        
        // Verificar se tabela já existe no PowerBIPortal
        const existingTable = await pool.request()
            .input('tableName', sql.VarChar(100), tableName)
            .query('SELECT Id FROM TableDefinitions WHERE TableName = @tableName AND IsActive = 1');
        
        if (existingTable.recordset.length > 0) {
            sendProgress(sessionId, { stage: 'error', message: 'Tabela já existe', progress: 0 });
            return res.status(400).json({ error: 'Já existe uma tabela com este nome' });
        }
        
        // Verificar se tabela ou view já existe no banco Fonte
        const objectCheck = await poolFonte.request().query(`
            SELECT
                OBJECT_ID('dbo.${tableName}', 'U') AS TableId,
                OBJECT_ID('dbo.${tableName}', 'V') AS ViewId
        `);
        const objectRow = objectCheck.recordset[0] || {};
        const existsInFonte = !!objectRow.TableId || !!objectRow.ViewId;

        if (!existsInFonte) {
            // Criar a tabela no banco Fonte com tipos detectados
            const columnDefinitionsSQL = columns.map(col => `[${col.name}] ${col.type} NULL`).join(',\n                    ');
            
            const createTableSQL = `
                CREATE TABLE [dbo].[${tableName}] (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    ${columnDefinitionsSQL},
                    DataCarga DATETIME DEFAULT GETDATE()
                )
            `;
            
            console.log('[CRIAR TABELA] SQL:', createTableSQL);
            sendProgress(sessionId, { stage: 'creating', message: 'Criando estrutura da tabela...', progress: 0 });
            await poolFonte.request().query(createTableSQL);
            console.log(`[CRIAR TABELA] Tabela ${tableName} criada com sucesso no banco Fonte`);
            sendProgress(sessionId, { stage: 'created', message: 'Tabela criada com sucesso', progress: 5 });
        } else {
            console.log(`[CRIAR TABELA] Objeto ${tableName} já existe no banco Fonte. Pulando criação e inserção de dados do modelo.`);
            sendProgress(sessionId, { stage: 'created', message: 'Tabela/view já existe no banco Fonte', progress: 5 });
        }
        
        // Inserir dados do modelo na tabela (apenas se foi criada agora)
        if (!existsInFonte && data.length > 1) {
            const dataRows = data.slice(1).filter(row => row.some(cell => cell !== null && cell !== ''));
            
            if (dataRows.length > 0) {
                console.log(`[INSERIR DADOS] Inserindo ${dataRows.length} linhas na tabela ${tableName}`);
                sendProgress(sessionId, { stage: 'inserting', message: `Preparando inserção de ${dataRows.length} linhas...`, progress: 10, total: dataRows.length });
                
                // Inserir em lotes usando parametrização
                const batchSize = 100;
                
                for (let batchStart = 0; batchStart < dataRows.length; batchStart += batchSize) {
                    const batch = dataRows.slice(batchStart, batchStart + batchSize);
                    const transaction = new sql.Transaction(poolFonte);
                    
                    await transaction.begin();
                    
                    try {
                        for (let i = 0; i < batch.length; i++) {
                            const row = batch[i];
                            const request = new sql.Request(transaction);
                            
                            // Mapear valores das colunas e usar conversão de tipos apropriada
                            const originalHeaders = data[0];
                            const params = [];
                            
                            columns.forEach((col, colIdx) => {
                                const paramName = `param${colIdx}`;
                                const headerIndex = originalHeaders.findIndex(h => 
                                    h !== null && h !== undefined && String(h).trim() === col.name
                                );
                                
                                let rawValue = null;
                                if (headerIndex !== -1) {
                                    rawValue = row[headerIndex];
                                }
                                
                                // Log da primeira linha para debug
                                if (batchStart === 0 && i === 0) {
                                    console.log(`[DEBUG] Coluna "${col.name}" (tipo: ${col.type}): valor bruto = "${rawValue}" (tipo JS: ${typeof rawValue})`);
                                }
                                
                                // Converter valor para o tipo SQL correto
                                const convertedValue = convertToSqlType(rawValue, col.type);
                                const sqlDataType = getSqlDataType(col.type);
                                
                                if (batchStart === 0 && i === 0) {
                                    console.log(`[DEBUG] Coluna "${col.name}": valor convertido = "${convertedValue}" (tipo SQL: ${col.type})`);
                                }
                                
                                // Validação extra para INT: verificar range
                                if (col.type.toUpperCase() === 'INT' && convertedValue !== null) {
                                    if (convertedValue > 2147483647 || convertedValue < -2147483648) {
                                        throw new Error(`Valor ${convertedValue} na coluna "${col.name}" está fora do range INT32. Use BIGINT ou revise os dados.`);
                                    }
                                }
                                
                                request.input(paramName, sqlDataType, convertedValue);
                                params.push(`@${paramName}`);
                            });
                            
                            const insertSQL = `INSERT INTO [dbo].[${tableName}] (${columns.map(c => `[${c.name}]`).join(',')}) VALUES (${params.join(',')})`;
                            await request.query(insertSQL);
                        }
                        
                        await transaction.commit();
                        
                        // Enviar progresso
                        const totalInserted = batchStart + batch.length;
                        const percentComplete = 10 + Math.floor((totalInserted / dataRows.length) * 85);
                        sendProgress(sessionId, {
                            stage: 'inserting',
                            message: `Inserindo dados: ${totalInserted}/${dataRows.length} linhas`,
                            progress: percentComplete,
                            current: totalInserted,
                            total: dataRows.length
                        });
                        console.log(`[PROGRESSO] ${totalInserted}/${dataRows.length} linhas inseridas (${percentComplete}%)`);
                        
                    } catch (err) {
                        await transaction.rollback();
                        throw err;
                    }
                }
                
                console.log(`[INSERIR DADOS] ${dataRows.length} linhas inseridas com sucesso`);
            }
        }
        
        // Registrar definição no banco PowerBIPortal
        const insertRequest = pool.request()
            .input('tableName', sql.VarChar(100), tableName)
            .input('displayName', sql.NVarChar(200), displayName)
            .input('description', sql.NVarChar(500), description || null)
            .input('icon', sql.NVarChar(50), icon || '📊')
            .input('groupId', sql.Int, groupId || null)
            .input('modelFileName', sql.NVarChar(255), modelFileName)
            .input('modelFilePath', sql.NVarChar(500), modelFilePath)
            .input('columnDefinitions', sql.NVarChar(sql.MAX), columnDefinitions);

        let insertColumns = `TableName, DisplayName, Description, Icon, GroupId, ModelFileName, ModelFilePath, ColumnDefinitions`;
        let insertValues = `@tableName, @displayName, @description, @icon, @groupId, @modelFileName, @modelFilePath, @columnDefinitions`;

        if (hasAllowFullLoad) {
            insertRequest.input('allowFullLoad', sql.Bit, allowFullLoad ? 1 : 0);
            insertColumns += ', AllowFullLoad';
            insertValues += ', @allowFullLoad';
        }

        const result = await insertRequest.query(`
            INSERT INTO TableDefinitions 
                (${insertColumns})
            OUTPUT INSERTED.*
            VALUES 
                (${insertValues})
        `);
        
        sendProgress(sessionId, { stage: 'completed', message: 'Tabela criada e dados inseridos com sucesso!', progress: 100 });
        
        // Fechar conexão SSE
        setTimeout(() => {
            const client = progressClients.get(sessionId);
            if (client) {
                client.end();
                progressClients.delete(sessionId);
            }
        }, 1000);
        
        res.status(201).json({
            ...result.recordset[0],
            message: 'Tabela criada e dados do modelo inseridos com sucesso',
            sessionId
        });
    } catch (err) {
        console.error('[ERRO] Erro ao criar tabela:', err);
        
        // Limpar arquivo se houver erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        if (err.number === 2627) {
            res.status(400).json({ error: 'Já existe uma tabela com este nome' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Atualizar definição de tabela
app.put('/api/excel/table-definitions/:id', uploadExcel.single('modelFile'), async (req, res) => {
    console.log('[API] PUT /api/excel/table-definitions/:id - Acesso público');
    
    try {
        const { displayName, description, icon, groupId } = req.body;
        const allowFullLoad = String(req.body.allow_full_load ?? '1') === '1';

        await ensureAllowFullLoadColumn();
        const hasAllowFullLoad = await tableDefinitionsHasAllowFullLoad();
        
        let updateFields = {
            displayName: displayName,
            description: description || null,
            icon: icon || null,
            groupId: groupId || null
        };
        
        // Se houver novo arquivo modelo
        if (req.file) {
            updateFields.modelFileName = req.file.filename;
            updateFields.modelFilePath = `/uploads/excel/${req.file.filename}`;
            
            // Ler estrutura do arquivo (Excel real ou TSV disfarçado)
            try {
                let data;
                {
                    const buf = fs.readFileSync(req.file.path);
                    const utf8 = buf.toString('utf8');
                    const isTabDelimited = utf8.includes('\t') && !utf8.startsWith('PK');

                    if (isTabDelimited) {
                        console.log('[ATUALIZAR TABELA] Arquivo detectado como TSV (tab-delimited), lendo como texto');
                        let content = utf8;
                        if (content.includes('�')) {
                            console.log('[ATUALIZAR TABELA] Detectado problema de encoding, relendo como Windows-1252');
                            const iconv = require('iconv-lite');
                            content = iconv.decode(buf, 'windows-1252');
                        }

                        const lines = content.trim().split(/\r?\n/);
                        const headersLine = lines[0] || '';
                        const headers = headersLine.split('\t').map(h => h.trim());
                        const rows = [];
                        for (let i = 1; i < lines.length; i++) {
                            if (!lines[i] || lines[i].trim() === '') continue;
                            const vals = lines[i].split('\t').map(v => (v ?? '').trim());
                            rows.push(vals);
                        }
                        data = [headers, ...rows];
                    } else {
                        const workbook = XLSX.readFile(req.file.path, { cellText: false, cellDates: false });
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        data = XLSX.utils.sheet_to_json(worksheet, { defval: null, header: 1, raw: false });
                    }
                }
                
                if (data.length > 0) {
                    // Limpar headers: remover espaços em branco extras e filtrar null/undefined
                    const headers = data[0]
                        .filter(col => col !== null && col !== undefined && col !== '')
                        .map(col => String(col).trim());
                    
                    // Detectar tipo de cada coluna baseado nos dados
                    console.log('[ATUALIZAR TABELA] Detectando tipos de colunas...');
                    const columns = headers.map((col, idx) => {
                        // Pega uma amostra dos valores desta coluna (primeiras 100 linhas)
                        const sampleValues = data.slice(1, Math.min(101, data.length)).map(row => row[idx]);
                        const detectedType = detectColumnType(sampleValues);
                        
                        console.log(`[ATUALIZAR TABELA] Coluna "${col}": tipo detectado = ${detectedType}`);
                        
                        return {
                            name: col,
                            type: detectedType,
                            nullable: true
                        };
                    });
                    updateFields.columnDefinitions = JSON.stringify(columns);
                }
            } catch (excelErr) {
                console.error('Erro ao ler Excel:', excelErr);
            }
        }
        
        const request = pool.request()
            .input('id', sql.Int, req.params.id)
            .input('displayName', sql.NVarChar(200), updateFields.displayName)
            .input('description', sql.NVarChar(500), updateFields.description)
            .input('icon', sql.NVarChar(50), updateFields.icon)
            .input('groupId', sql.Int, updateFields.groupId);
        
        let query = `
            UPDATE TableDefinitions
            SET DisplayName = @displayName,
                Description = @description,
                Icon = @icon,
                GroupId = @groupId,
                UpdatedAt = GETDATE()`;

        if (hasAllowFullLoad) {
            request.input('allowFullLoad', sql.Bit, allowFullLoad ? 1 : 0);
            query += `,
                AllowFullLoad = @allowFullLoad`;
        }
        
        if (updateFields.modelFileName) {
            request
                .input('modelFileName', sql.NVarChar(255), updateFields.modelFileName)
                .input('modelFilePath', sql.NVarChar(500), updateFields.modelFilePath)
                .input('columnDefinitions', sql.NVarChar(sql.MAX), updateFields.columnDefinitions);
            
            query += `,
                ModelFileName = @modelFileName,
                ModelFilePath = @modelFilePath,
                ColumnDefinitions = @columnDefinitions`;
        }
        
        query += `
            OUTPUT INSERTED.*
            WHERE Id = @id AND IsActive = 1`;
        
        const result = await request.query(query);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Tabela não encontrada' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Erro ao atualizar tabela:', err);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: err.message });
    }
});

// Excluir definição de tabela (delete permanente + drop da tabela)
app.delete('/api/excel/table-definitions/:id', async (req, res) => {
    console.log('[API] DELETE /api/excel/table-definitions/:id - Acesso público');
    
    try {
        // Buscar informações da tabela antes de deletar
        const tableResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT TableName, ModelFilePath FROM TableDefinitions WHERE Id = @id');
        
        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Tabela não encontrada' });
        }
        
        const { TableName, ModelFilePath } = tableResult.recordset[0];
        
        // 1. Dropar tabela física no banco Fonte
        try {
            console.log(`[DELETE] Dropando tabela ${TableName} no banco Fonte`);
            await poolFonte.request().query(`DROP TABLE IF EXISTS [dbo].[${TableName}]`);
            console.log(`[DELETE] Tabela ${TableName} dropada com sucesso`);
        } catch (dropErr) {
            console.error(`[DELETE] Erro ao dropar tabela ${TableName}:`, dropErr.message);
            // Continua mesmo se falhar (tabela pode não existir)
        }
        
        // 2. Deletar arquivo modelo se existir
        if (ModelFilePath) {
            const filePath = path.join(__dirname, 'public', ModelFilePath);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[DELETE] Arquivo modelo deletado: ${ModelFilePath}`);
                } catch (fileErr) {
                    console.error(`[DELETE] Erro ao deletar arquivo:`, fileErr.message);
                }
            }
        }
        
        // 3. Deletar registro do PowerBIPortal
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM TableDefinitions WHERE Id = @id');
        
        console.log(`[DELETE] Definição da tabela ${TableName} deletada do PowerBIPortal`);
        
        res.json({ 
            success: true, 
            message: `Tabela ${TableName} excluída permanentemente` 
        });
    } catch (err) {
        console.error('[DELETE] Erro ao excluir tabela:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// FIM ROTAS DE GERENCIAMENTO
// ========================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `logo-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido. Use PNG, JPG, GIF ou SVG.'));
        }
    }
});

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    
    if (pool && pool.connected) return next();
    
    try {
        console.log('DB pool is null or disconnected — attempting to reconnect...');
        if (pool) {
            try {
                await pool.close();
            } catch (e) {
                console.warn('Error closing existing pool:', e);
            }
        }
        pool = await sql.connect(config);
        console.log('Reconnected to SQL Server');
        return next();
    } catch (err) {
        console.error('DB reconnection failed:', err.message || err);
        return res.status(503).json({ error: 'Serviço indisponível: banco de dados' });
    }
});

const config = {
    user: process.env.DB_USER || 'servicedw',
    password: process.env.DB_PASS || '@aacdservice',
    server: process.env.DB_SERVER || 'SERVER55',
    database: process.env.DB_NAME || 'PowerBIPortal',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 90000, // 90 segundos
        useUTC: false // Não converter datas para UTC
    }
};

// Configuração para o banco Fonte (sistema de carga Excel)
const configFonte = {
    user: process.env.DB_USER || 'servicedw',
    password: process.env.DB_PASS || '@aacdservice',
    server: process.env.DB_SERVER || 'SERVER55\\DW',
    database: 'Fonte',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 90000,
        useUTC: false // Não converter datas para UTC
    }
};

let pool;
let poolFonte;

// Garante que poolFonte esteja conectado, reconectando se necessário.
// Lança erro se não conseguir — o chamador deve tratar e retornar 503.
async function ensurePoolFonte() {
    if (poolFonte && poolFonte.connected) return poolFonte;
    if (poolFonte) {
        try { await poolFonte.close(); } catch (_) {}
        poolFonte = null;
    }
    poolFonte = await new sql.ConnectionPool(configFonte).connect();
    console.log('[poolFonte] Reconectado ao banco Fonte');
    return poolFonte;
}

// ==================== Atualização Data Warehouse (delete + recarga por período) ====================
// Mesma instância do banco Fonte (SERVER55\DW), banco DataWarehouse.
const configDW = {
    user: process.env.DB_USER || 'servicedw',
    password: process.env.DB_PASS || '@aacdservice',
    server: process.env.DB_SERVER || 'SERVER55\\DW',
    database: process.env.DB_DW_NAME || 'DataWarehouse',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 90000,
        useUTC: false
    }
};

let poolDW;

async function ensurePoolDW() {
    if (poolDW && poolDW.connected) return poolDW;
    if (poolDW) {
        try { await poolDW.close(); } catch (_) {}
        poolDW = null;
    }
    poolDW = await new sql.ConnectionPool(configDW).connect();
    console.log('[poolDW] Reconectado ao banco DataWarehouse');
    return poolDW;
}

// Tipos de atualização suportados: cada um mapeia para uma stored procedure existente
// (delete + insert por range de data) e para a view que passa a conter os dados novos.
const DW_UPDATE_TYPES = {
    custo_centro_custo: {
        label: 'Custo por Centro de Custo',
        proc: 'sp_AtualizarCustoCentroCusto',
        view: 'VW_TB_CUSTO_CENTRO_CUSTO',
        dateColumn: 'dt_mes_referencia'
    },
    custo_exames: {
        label: 'Custo de Exames',
        proc: 'sp_AtualizarCustoExames',
        view: 'VW_TB_CUSTO_EXAMES',
        dateColumn: 'dt_mes_referencia'
    }
};

// Mantém a data como string YYYY-MM-DD (não converte para Date object) para
// evitar deslocamento de fuso horário na conversão local/UTC feita pelo driver.
function parseDwDate(value) {
    if (!value || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    return value;
}

// Cache das colunas reais de cada view (usado para validar sortColumn e barrar injection,
// já que o nome da coluna não dá pra parametrizar num ORDER BY).
const dwViewColumnsCache = {};
async function getDwViewColumns(dw, viewName) {
    if (dwViewColumnsCache[viewName]) return dwViewColumnsCache[viewName];
    const result = await dw.request()
        .input('ViewName', sql.NVarChar(128), viewName)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @ViewName ORDER BY ORDINAL_POSITION`);
    const cols = result.recordset.map(r => r.COLUMN_NAME);
    dwViewColumnsCache[viewName] = cols;
    return cols;
}

app.post('/api/dw/atualizar/:tipo', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });

    const tipoInfo = DW_UPDATE_TYPES[req.params.tipo];
    if (!tipoInfo) return res.status(404).json({ error: 'Tipo de atualização desconhecido' });

    const dataInicial = parseDwDate(req.body.dataInicial);
    const dataFinal = parseDwDate(req.body.dataFinal);
    if (!dataInicial || !dataFinal) return res.status(400).json({ error: 'Informe dataInicial e dataFinal no formato YYYY-MM-DD' });
    if (dataInicial > dataFinal) return res.status(400).json({ error: 'dataInicial não pode ser maior que dataFinal' });

    try {
        const dw = await ensurePoolDW();
        await dw.request()
            .input('DataInicial', sql.Date, dataInicial)
            .input('DataFinal', sql.Date, dataFinal)
            .input('Usuario', sql.NVarChar(100), req.user.username)
            .execute(tipoInfo.proc);

        const countResult = await dw.request()
            .input('DataInicial', sql.Date, dataInicial)
            .input('DataFinal', sql.Date, dataFinal)
            .query(`SELECT COUNT(*) AS total FROM [${tipoInfo.view}] WHERE [${tipoInfo.dateColumn}] BETWEEN @DataInicial AND @DataFinal`);

        res.json({ success: true, totalRegistros: countResult.recordset[0].total });
    } catch (err) {
        console.error(`[DW] Erro ao executar ${tipoInfo.proc}:`, err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dw/atualizar/:tipo/preview', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });

    const tipoInfo = DW_UPDATE_TYPES[req.params.tipo];
    if (!tipoInfo) return res.status(404).json({ error: 'Tipo de atualização desconhecido' });

    // Range de datas é opcional aqui: sem ele, mostra a tabela inteira (paginada).
    const dataInicial = parseDwDate(req.query.dataInicial);
    const dataFinal = parseDwDate(req.query.dataFinal);
    if ((req.query.dataInicial || req.query.dataFinal) && (!dataInicial || !dataFinal)) {
        return res.status(400).json({ error: 'Informe dataInicial e dataFinal no formato YYYY-MM-DD' });
    }
    const hasRange = !!(dataInicial && dataFinal);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;

    try {
        const dw = await ensurePoolDW();

        // Nome de coluna não dá pra parametrizar em ORDER BY, então valida contra o schema real da view.
        const validColumns = await getDwViewColumns(dw, tipoInfo.view);
        let sortColumn = tipoInfo.dateColumn;
        if (req.query.sortColumn && validColumns.includes(req.query.sortColumn)) {
            sortColumn = req.query.sortColumn;
        }
        const sortDir = String(req.query.sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const request = dw.request()
            .input('Offset', sql.Int, offset)
            .input('PageSize', sql.Int, pageSize);
        let whereClause = '';
        if (hasRange) {
            request.input('DataInicial', sql.Date, dataInicial).input('DataFinal', sql.Date, dataFinal);
            whereClause = `WHERE t.[${tipoInfo.dateColumn}] BETWEEN @DataInicial AND @DataFinal`;
        }

        const result = await request.query(`
            SELECT COUNT(*) OVER() AS TotalRows_, t.*
            FROM [${tipoInfo.view}] t
            ${whereClause}
            ORDER BY t.[${sortColumn}] ${sortDir}
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `);

        const rows = result.recordset;
        const total = rows.length > 0 ? rows[0].TotalRows_ : 0;
        const columns = Object.keys(result.recordset.columns || {}).filter(c => c !== 'TotalRows_');
        rows.forEach(r => delete r.TotalRows_);

        res.json({ total, page, pageSize, columns, rows, sortColumn, sortDir: sortDir.toLowerCase() });
    } catch (err) {
        console.error(`[DW] Erro ao consultar ${tipoInfo.view}:`, err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dw/atualizar/:tipo/count', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });

    const tipoInfo = DW_UPDATE_TYPES[req.params.tipo];
    if (!tipoInfo) return res.status(404).json({ error: 'Tipo de atualização desconhecido' });

    try {
        const dw = await ensurePoolDW();
        const result = await dw.request().query(`SELECT COUNT(*) AS total FROM [${tipoInfo.view}]`);
        res.json({ total: result.recordset[0].total });
    } catch (err) {
        console.error(`[DW] Erro ao contar ${tipoInfo.view}:`, err);
        res.status(500).json({ error: err.message });
    }
});

async function initDB() {
    try {
        pool = await sql.connect(config);
        console.log('Conectado ao SQL Server (PowerBIPortal)');
        sql.on('error', err => {
            console.error('mssql global error:', err);
        });
    } catch (err) {
        console.error('Erro ao conectar ao SQL Server:', err);
        pool = null;
    }
    
    // Conecta ao banco Fonte para sistema de carga
    try {
        poolFonte = await new sql.ConnectionPool(configFonte).connect();
        console.log('Conectado ao SQL Server (Fonte)');
    } catch (err) {
        console.error('Erro ao conectar ao banco Fonte:', err);
        poolFonte = null;
    }

    // Conecta ao banco DataWarehouse para atualização de custos por período
    try {
        poolDW = await new sql.ConnectionPool(configDW).connect();
        console.log('Conectado ao SQL Server (DataWarehouse)');
    } catch (err) {
        console.error('Erro ao conectar ao banco DataWarehouse:', err);
        poolDW = null;
    }
}

async function ensurePagesOrderColumn() {
    if (!pool || !pool.connected) return;
    try {
        const check = await pool.request().query(`
            SELECT 1
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Pages' AND COLUMN_NAME = 'Order'
        `);
        if (check.recordset.length === 0) {
            console.log('[MIGRATION] Adicionando coluna [Order] em Pages...');
            await pool.request().batch(`
                ALTER TABLE dbo.Pages ADD [Order] INT NOT NULL CONSTRAINT DF_Pages_Order DEFAULT(0);
            `);
            console.log('[MIGRATION] Coluna [Order] criada. Preenchendo valores...');
            await pool.request().batch(`
                ;WITH cte AS (
                    SELECT Id, ROW_NUMBER() OVER (ORDER BY Title, Id) AS rn
                    FROM dbo.Pages WITH (UPDLOCK, HOLDLOCK)
                )
                UPDATE p SET [Order] = cte.rn * 10
                FROM dbo.Pages p
                JOIN cte ON cte.Id = p.Id
                WHERE p.[Order] = 0;
            `);
            console.log('[MIGRATION] Valores de [Order] preenchidos.');
        } else {
            await pool.request().batch(`
                IF EXISTS (SELECT 1 FROM dbo.Pages WHERE [Order] = 0)
                BEGIN
                    ;WITH cte AS (
                        SELECT Id, ROW_NUMBER() OVER (ORDER BY Title, Id) AS rn
                        FROM dbo.Pages WITH (UPDLOCK, HOLDLOCK)
                    )
                    UPDATE p SET [Order] = cte.rn * 10
                    FROM dbo.Pages p
                    JOIN cte ON cte.Id = p.Id
                    WHERE p.[Order] = 0;
                END
            `);
        }
    } catch (e) {
        console.warn('[MIGRATION] Falha ao garantir coluna [Order] em Pages:', e.message || e);
    }
}

async function ensurePagesEmbedColumns() {
    if (!pool || !pool.connected) return;
    const adds = [
        { col: 'UseEmbed', sql: 'ALTER TABLE dbo.Pages ADD UseEmbed BIT NOT NULL CONSTRAINT DF_Pages_UseEmbed DEFAULT(0);' },
        { col: 'EmbedWorkspaceId', sql: 'ALTER TABLE dbo.Pages ADD EmbedWorkspaceId UNIQUEIDENTIFIER NULL;' },
        { col: 'EmbedReportId', sql: 'ALTER TABLE dbo.Pages ADD EmbedReportId UNIQUEIDENTIFIER NULL;' },
        { col: 'AllowedAADGroups', sql: 'ALTER TABLE dbo.Pages ADD AllowedAADGroups NVARCHAR(MAX) NULL;' },
        { col: 'EmbedRoles', sql: 'ALTER TABLE dbo.Pages ADD EmbedRoles NVARCHAR(MAX) NULL;' },
        { col: 'RedirectEmbedWorkspaceId', sql: 'ALTER TABLE dbo.Pages ADD RedirectEmbedWorkspaceId UNIQUEIDENTIFIER NULL;' },
        { col: 'RedirectEmbedReportId', sql: 'ALTER TABLE dbo.Pages ADD RedirectEmbedReportId UNIQUEIDENTIFIER NULL;' },
    ];
    for (const { col, sql: ddl } of adds) {
        try {
            const check = await pool.request().query(`
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Pages' AND COLUMN_NAME='${col}'
            `);
            if (check.recordset.length === 0) {
                console.log(`[MIGRATION] Adicionando coluna ${col} em Pages...`);
                await pool.request().query(ddl);
            }
        } catch (e) {
            console.warn(`[MIGRATION] Falha ao garantir coluna ${col} em Pages:`, e.message || e);
        }
    }
}

async function ensurePagesRedirectColumns() {
    if (!pool || !pool.connected) return;
    try {
        const redirectUrlCheck = await pool.request().query(`
            SELECT 1
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Pages' AND COLUMN_NAME = 'RedirectPowerBIUrl'
        `);
        if (redirectUrlCheck.recordset.length === 0) {
            console.log('[MIGRATION] Adicionando coluna RedirectPowerBIUrl em Pages...');
            await pool.request().query(`ALTER TABLE dbo.Pages ADD RedirectPowerBIUrl NVARCHAR(2000) NULL;`);
        }

        const redirectEmailsCheck = await pool.request().query(`
            SELECT 1
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Pages' AND COLUMN_NAME = 'RedirectEmails'
        `);
        if (redirectEmailsCheck.recordset.length === 0) {
            console.log('[MIGRATION] Adicionando coluna RedirectEmails em Pages...');
            await pool.request().query(`ALTER TABLE dbo.Pages ADD RedirectEmails NVARCHAR(MAX) NULL;`);
        }
    } catch (e) {
        console.warn('[MIGRATION] Falha ao garantir colunas de redirecionamento em Pages:', e.message || e);
    }
}

// Tabela de permissoes granulares por aplicacao satelite (ex.: /fatura).
// Usuarios com IsAdmin=1 acessam tudo sem precisar de entry; demais
// precisam de (UserId, AppKey) registrado.
async function ensureUserAppPermissionsTable() {
    if (!pool || !pool.connected) return;
    try {
        const check = await pool.request().query(`
            SELECT 1 FROM sys.objects
            WHERE object_id = OBJECT_ID(N'[dbo].[UserAppPermissions]') AND type = 'U'
        `);
        if (check.recordset.length === 0) {
            console.log('[DB] Criando tabela UserAppPermissions');
            await pool.request().batch(`
                CREATE TABLE dbo.UserAppPermissions (
                    Id        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    UserId    INT          NOT NULL,
                    AppKey    NVARCHAR(60) NOT NULL,
                    GrantedAt DATETIME2    NOT NULL CONSTRAINT DF_UserAppPermissions_GrantedAt DEFAULT (SYSDATETIME()),
                    CONSTRAINT UQ_UserAppPermissions_User_App UNIQUE (UserId, AppKey),
                    CONSTRAINT FK_UserAppPermissions_Users FOREIGN KEY (UserId)
                        REFERENCES dbo.Users(Id) ON DELETE CASCADE
                );
                CREATE INDEX IX_UserAppPermissions_AppKey ON dbo.UserAppPermissions(AppKey);
            `);
            console.log('[DB] Tabela UserAppPermissions criada');
        }
    } catch (e) {
        console.warn('[DB] Falha ao garantir UserAppPermissions:', e.message || e);
    }
}

// Helper interno: adiciona uma coluna a uma tabela do banco Fonte se ela
// nao existir ainda. ddl deve ser apenas o trecho "TIPO NULL" (sem nome).
async function addFonteColumnIfMissing(table, name, ddl) {
    const r = await poolFonte.request().query(`
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'[dbo].[${table}]') AND name = N'${name}'
    `);
    if (r.recordset.length === 0) {
        console.log(`[DB] ALTER ${table} ADD ${name}`);
        await poolFonte.request().batch(`ALTER TABLE dbo.${table} ADD ${name} ${ddl};`);
    }
}

// Tabela mae de faturas (banco Fonte). Schema rico cobrindo fatura
// de cartao de credito empresarial Itau: cabecalho, boleto, resumo,
// limites, encargos cobrados, encargos do proximo periodo e totalizadores.
// uploaded_by referencia logicamente PowerBIPortal.dbo.Users.Id.
// Itens (lancamentos) ficam em OCR_FATURA_ITAU_ITENS.
async function ensureOcrFaturaItauTable() {
    if (!poolFonte || !poolFonte.connected) return;
    try {
        const check = await poolFonte.request().query(`
            SELECT 1 FROM sys.objects
            WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FATURA_ITAU]') AND type = 'U'
        `);
        if (check.recordset.length === 0) {
            console.log('[DB] Criando tabela OCR_FATURA_ITAU em Fonte');
            await poolFonte.request().batch(`
                CREATE TABLE dbo.OCR_FATURA_ITAU (
                    Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    numero_fatura   NVARCHAR(100)  NULL,
                    data_emissao    DATE           NULL,
                    data_vencimento DATE           NULL,
                    fornecedor_nome NVARCHAR(300)  NULL,
                    fornecedor_cnpj NVARCHAR(20)   NULL,
                    valor_total     DECIMAL(18,2)  NULL,
                    descricao       NVARCHAR(MAX)  NULL,
                    pdf_filename    NVARCHAR(300)  NULL,
                    pdf_size_bytes  INT            NULL,
                    model_used      NVARCHAR(60)   NULL,
                    raw_response    NVARCHAR(MAX)  NULL,
                    uploaded_by     INT            NULL,
                    uploaded_at     DATETIME2      NOT NULL CONSTRAINT DF_OCR_FATURA_ITAU_uploaded_at DEFAULT (SYSDATETIME())
                );
                CREATE INDEX IX_OCR_FATURA_ITAU_uploaded_at ON dbo.OCR_FATURA_ITAU(uploaded_at DESC);
                CREATE INDEX IX_OCR_FATURA_ITAU_uploaded_by ON dbo.OCR_FATURA_ITAU(uploaded_by);
            `);
            console.log('[DB] Tabela OCR_FATURA_ITAU criada');
        } else {
            // Migracao: versao antiga tinha coluna 'itens' (JSON). Drop se existir.
            const colCheck = await poolFonte.request().query(`
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FATURA_ITAU]')
                  AND name = N'itens'
            `);
            if (colCheck.recordset.length > 0) {
                console.log('[DB] Removendo coluna obsoleta OCR_FATURA_ITAU.itens');
                await poolFonte.request().batch(`ALTER TABLE dbo.OCR_FATURA_ITAU DROP COLUMN itens;`);
            }
        }

        // Colunas adicionadas para cobrir fatura empresarial Itau completa.
        // Idempotente — adiciona so o que falta.
        const cols = [
            // Cabecalho/identificacao
            ['tipo_documento',         'NVARCHAR(60) NULL'],
            ['empresa',                'NVARCHAR(300) NULL'],
            ['numero_conta',           'NVARCHAR(40) NULL'],
            ['linha_digitavel',        'NVARCHAR(80) NULL'],
            ['nosso_numero',           'NVARCHAR(40) NULL'],
            ['agencia_beneficiario',   'NVARCHAR(40) NULL'],
            ['carteira',               'NVARCHAR(20) NULL'],
            ['data_postagem',          'DATE NULL'],
            ['data_proximo_fechamento','DATE NULL'],
            ['moeda',                  'NVARCHAR(5) NULL'],
            // Pagador (a empresa que paga)
            ['pagador_nome',           'NVARCHAR(300) NULL'],
            ['pagador_cnpj',           'NVARCHAR(20) NULL'],
            ['pagador_endereco',       'NVARCHAR(500) NULL'],
            // Resumo da fatura
            ['total_fatura_anterior',  'DECIMAL(18,2) NULL'],
            ['pagamentos_efetuados',   'DECIMAL(18,2) NULL'],
            ['saldo_atraso',           'DECIMAL(18,2) NULL'],
            ['lancamentos_atuais',     'DECIMAL(18,2) NULL'],
            // Limites
            ['limite_total_credito',   'DECIMAL(18,2) NULL'],
            ['limite_disponivel',      'DECIMAL(18,2) NULL'],
            ['limite_total_utilizado', 'DECIMAL(18,2) NULL'],
            // Encargos cobrados nesta fatura
            ['juros_atraso_percent',           'DECIMAL(9,4) NULL'],
            ['juros_atraso_valor',             'DECIMAL(18,2) NULL'],
            ['juros_mora_percent_mensal',      'DECIMAL(9,4) NULL'],
            ['juros_mora_valor',               'DECIMAL(18,2) NULL'],
            ['multa_atraso_percent',           'DECIMAL(9,4) NULL'],
            ['multa_atraso_valor',             'DECIMAL(18,2) NULL'],
            ['iof_financiamento_descricao',    'NVARCHAR(200) NULL'],
            ['iof_financiamento_valor',        'DECIMAL(18,2) NULL'],
            // Encargos do proximo periodo
            ['juros_max_proximo_mensal_percent', 'DECIMAL(9,4) NULL'],
            ['juros_max_proximo_anual_percent',  'DECIMAL(9,4) NULL'],
            ['juros_pgto_contas_mensal_percent', 'DECIMAL(9,4) NULL'],
            // Totalizadores
            ['total_pagamentos',                       'DECIMAL(18,2) NULL'],
            ['total_lancamentos_atuais',               'DECIMAL(18,2) NULL'],
            ['total_transacoes_internacionais_brl',    'DECIMAL(18,2) NULL'],
            ['repasse_iof_brl',                        'DECIMAL(18,2) NULL'],
            ['total_lancamentos_internacionais_brl',   'DECIMAL(18,2) NULL']
        ];
        for (const [name, ddl] of cols) {
            await addFonteColumnIfMissing('OCR_FATURA_ITAU', name, ddl);
        }
    } catch (e) {
        console.warn('[DB] Falha ao garantir OCR_FATURA_ITAU:', e.message || e);
    }
}

// Tabelas mestras de fornecedor/categoria normalizados (banco Fonte).
// Permitem marcar flags de classificacao (ex.: despesa_ti) que valem para
// qualquer fatura passada/futura — basta JOIN por fornecedor_id/categoria_id
// na tabela de itens.
async function ensureOcrFornecedoresTable() {
    if (!poolFonte || !poolFonte.connected) return;
    try {
        const check = await poolFonte.request().query(`
            SELECT 1 FROM sys.objects
            WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FORNECEDORES]') AND type = 'U'
        `);
        if (check.recordset.length === 0) {
            console.log('[DB] Criando tabela OCR_FORNECEDORES em Fonte');
            await poolFonte.request().batch(`
                CREATE TABLE dbo.OCR_FORNECEDORES (
                    Id                   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    nome                 NVARCHAR(200) NOT NULL,
                    despesa_ti           BIT           NOT NULL CONSTRAINT DF_OCR_FORNECEDORES_TI DEFAULT(0),
                    observacao           NVARCHAR(500) NULL,
                    first_seen_fatura_id INT           NULL,
                    created_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_FORNECEDORES_created DEFAULT(SYSDATETIME()),
                    updated_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_FORNECEDORES_updated DEFAULT(SYSDATETIME()),
                    CONSTRAINT UQ_OCR_FORNECEDORES_nome UNIQUE (nome)
                );
            `);
            console.log('[DB] Tabela OCR_FORNECEDORES criada');
        }
    } catch (e) {
        console.warn('[DB] Falha ao garantir OCR_FORNECEDORES:', e.message || e);
    }
}

async function ensureOcrCategoriasTable() {
    if (!poolFonte || !poolFonte.connected) return;
    try {
        const check = await poolFonte.request().query(`
            SELECT 1 FROM sys.objects
            WHERE object_id = OBJECT_ID(N'[dbo].[OCR_CATEGORIAS]') AND type = 'U'
        `);
        if (check.recordset.length === 0) {
            console.log('[DB] Criando tabela OCR_CATEGORIAS em Fonte');
            await poolFonte.request().batch(`
                CREATE TABLE dbo.OCR_CATEGORIAS (
                    Id                   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    nome                 NVARCHAR(100) NOT NULL,
                    despesa_ti           BIT           NOT NULL CONSTRAINT DF_OCR_CATEGORIAS_TI DEFAULT(0),
                    observacao           NVARCHAR(500) NULL,
                    first_seen_fatura_id INT           NULL,
                    created_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_CATEGORIAS_created DEFAULT(SYSDATETIME()),
                    updated_at           DATETIME2     NOT NULL CONSTRAINT DF_OCR_CATEGORIAS_updated DEFAULT(SYSDATETIME()),
                    CONSTRAINT UQ_OCR_CATEGORIAS_nome UNIQUE (nome)
                );
            `);
            console.log('[DB] Tabela OCR_CATEGORIAS criada');
        }
    } catch (e) {
        console.warn('[DB] Falha ao garantir OCR_CATEGORIAS:', e.message || e);
    }
}

// Adiciona fornecedor_id / categoria_id em OCR_FATURA_ITAU_ITENS e cria
// as FKs apontando pras tabelas mestras. Chamada APOS as duas mestras
// existirem (depende de ensureOcrFornecedoresTable / ensureOcrCategoriasTable).
async function ensureItensFkColumns() {
    if (!poolFonte || !poolFonte.connected) return;
    try {
        await addFonteColumnIfMissing('OCR_FATURA_ITAU_ITENS', 'fornecedor_id', 'INT NULL');
        await addFonteColumnIfMissing('OCR_FATURA_ITAU_ITENS', 'categoria_id',  'INT NULL');

        const fkFornecedor = await poolFonte.request().query(`
            SELECT 1 FROM sys.foreign_keys
            WHERE name = N'FK_OCR_FATURA_ITAU_ITENS_Fornecedor'
        `);
        if (fkFornecedor.recordset.length === 0) {
            console.log('[DB] Criando FK FK_OCR_FATURA_ITAU_ITENS_Fornecedor');
            await poolFonte.request().batch(`
                ALTER TABLE dbo.OCR_FATURA_ITAU_ITENS
                ADD CONSTRAINT FK_OCR_FATURA_ITAU_ITENS_Fornecedor
                    FOREIGN KEY (fornecedor_id) REFERENCES dbo.OCR_FORNECEDORES(Id);
            `);
        }

        const fkCategoria = await poolFonte.request().query(`
            SELECT 1 FROM sys.foreign_keys
            WHERE name = N'FK_OCR_FATURA_ITAU_ITENS_Categoria'
        `);
        if (fkCategoria.recordset.length === 0) {
            console.log('[DB] Criando FK FK_OCR_FATURA_ITAU_ITENS_Categoria');
            await poolFonte.request().batch(`
                ALTER TABLE dbo.OCR_FATURA_ITAU_ITENS
                ADD CONSTRAINT FK_OCR_FATURA_ITAU_ITENS_Categoria
                    FOREIGN KEY (categoria_id) REFERENCES dbo.OCR_CATEGORIAS(Id);
            `);
        }
    } catch (e) {
        console.warn('[DB] Falha ao garantir FKs em OCR_FATURA_ITAU_ITENS:', e.message || e);
    }
}

// Tabela filha: lancamentos linha-a-linha (compras nacionais, internacionais,
// saques, pagamentos, encargos individuais, ajustes). Inclui dados do
// portador/cartao, centro de custo e moeda original.
async function ensureOcrFaturaItauItensTable() {
    if (!poolFonte || !poolFonte.connected) return;
    try {
        const check = await poolFonte.request().query(`
            SELECT 1 FROM sys.objects
            WHERE object_id = OBJECT_ID(N'[dbo].[OCR_FATURA_ITAU_ITENS]') AND type = 'U'
        `);
        if (check.recordset.length === 0) {
            console.log('[DB] Criando tabela OCR_FATURA_ITAU_ITENS em Fonte');
            await poolFonte.request().batch(`
                CREATE TABLE dbo.OCR_FATURA_ITAU_ITENS (
                    Id             INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    fatura_id      INT            NOT NULL,
                    ordem          INT            NOT NULL,
                    descricao      NVARCHAR(1000) NULL,
                    quantidade     DECIMAL(18,4)  NULL,
                    valor_unitario DECIMAL(18,4)  NULL,
                    valor_total    DECIMAL(18,2)  NULL,
                    CONSTRAINT FK_OCR_FATURA_ITAU_ITENS_Fatura FOREIGN KEY (fatura_id)
                        REFERENCES dbo.OCR_FATURA_ITAU(Id) ON DELETE CASCADE
                );
                CREATE INDEX IX_OCR_FATURA_ITAU_ITENS_fatura
                    ON dbo.OCR_FATURA_ITAU_ITENS(fatura_id, ordem);
            `);
            console.log('[DB] Tabela OCR_FATURA_ITAU_ITENS criada');
        }

        // Colunas adicionadas para cobrir lancamentos de fatura Itau empresarial.
        const cols = [
            ['tipo',                  'NVARCHAR(40) NULL'],   // compra_nacional | compra_internacional | saque | pagamento | encargo | ajuste | outro
            ['data',                  'DATE NULL'],
            ['estabelecimento',       'NVARCHAR(300) NULL'],
            ['cidade',                'NVARCHAR(150) NULL'],
            ['categoria',             'NVARCHAR(100) NULL'],  // categoria conforme aparece no PDF (ex: "DIVERSOS")
            ['portador_nome',         'NVARCHAR(200) NULL'],
            ['portador_cartao_final', 'NVARCHAR(10) NULL'],
            ['centro_custo',          'NVARCHAR(50) NULL'],
            ['moeda_original',        'NVARCHAR(5) NULL'],    // BRL/USD/EUR/...
            ['valor_original',        'DECIMAL(18,4) NULL'],
            ['taxa_cambio',           'DECIMAL(18,6) NULL'],
            ['valor_brl',             'DECIMAL(18,2) NULL'],
            // Normalizacao via IA (para agrupar/relatorios sem depender do texto bruto)
            ['fornecedor_normalizado', 'NVARCHAR(200) NULL'],  // ex.: "Microsoft", "GOL Linhas Aereas", "Zoom"
            ['categoria_normalizada',  'NVARCHAR(100) NULL'],  // ex.: "Software/SaaS", "Viagem - Aereo"
            ['produto_servico',        'NVARCHAR(200) NULL']   // ex.: "Microsoft 365", "Microsoft Azure", "Zoom Meetings"
        ];
        for (const [name, ddl] of cols) {
            await addFonteColumnIfMissing('OCR_FATURA_ITAU_ITENS', name, ddl);
        }
    } catch (e) {
        console.warn('[DB] Falha ao garantir OCR_FATURA_ITAU_ITENS:', e.message || e);
    }
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    jwt.verify(token, secret, (err, user) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
}

// Verifica se o usuario tem permissao para acessar uma "app satelite".
// Admin (IsAdmin=1) sempre tem acesso. Caso contrario consulta UserAppPermissions.
async function userHasAppPermission(userId, appKey) {
    if (!pool || !pool.connected) return false;
    try {
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .input('appKey', sql.NVarChar(60), appKey)
            .query(`
                SELECT TOP 1 1 AS ok
                FROM dbo.UserAppPermissions
                WHERE UserId = @userId AND AppKey = @appKey
            `);
        return result.recordset.length > 0;
    } catch (e) {
        console.warn('[AUTH] userHasAppPermission falhou:', e.message || e);
        return false;
    }
}

// Middleware: exige token valido E (IsAdmin OR permissao explicita pra appKey).
function requireAppPermission(appKey) {
    return (req, res, next) => {
        authenticateToken(req, res, async () => {
            if (req.user && req.user.isAdmin) return next();
            const allowed = await userHasAppPermission(req.user && req.user.id, appKey);
            if (!allowed) return res.status(403).json({ error: 'Acesso negado a esta aplicacao' });
            return next();
        });
    };
}

function optionalAuthenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    jwt.verify(token, secret, (err, user) => {
        if (!err && user) req.user = user;
        return next();
    });
}

app.use('/api/users', createUserManagementRouter({
    getPool: () => pool,
    authenticateToken,
    sql,
    bcrypt
}));

// ROTAS DE AUTENTICAÇÃO

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!pool) {
            console.error('DB não disponível. Impossível autenticar.');
            return res.status(500).json({ error: 'Serviço indisponível: banco de dados' });
        }

        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT * FROM Users WHERE Username = @username AND IsActive = 1');
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
        
        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.PasswordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        try {
            await pool.request()
                .input('userId', sql.Int, user.Id)
                .query('UPDATE Users SET LastLogin = GETDATE() WHERE Id = @userId');
        } catch (e) {
            console.warn('Não foi possível atualizar LastLogin:', e);
        }

        const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
        const token = jwt.sign(
            {
                id: user.Id,
                username: user.Username,
                isAdmin: !!user.IsAdmin,
                fullName: user.FullName || null,
                email: user.Email || null
            },
            secret,
            { expiresIn: '24h' }
        );
        res.json({
            token,
            user: {
                id: user.Id,
                username: user.Username,
                isAdmin: !!user.IsAdmin,
                fullName: user.FullName || null,
                email: user.Email || null
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// SSO via Microsoft: o cliente passa um id_token MSAL valido. Validamos a
// assinatura (msalVerify), extraimos o email, e procuramos um admin ativo
// com Email igual (case-insensitive). Se encontrar, emite um JWT do portal
// no mesmo formato de /api/login — assim o resto do front (verify-token,
// authenticateToken, isAdmin) funciona sem alteracao.
// Se o email nao for de um admin cadastrado, devolvemos 401 (o caller cai
// pro fluxo de usuario/senha tradicional).
app.post('/api/login-microsoft', async (req, res) => {
    try {
        const idToken = (req.body && req.body.idToken) || req.headers['x-ms-id-token'];
        if (!idToken) return res.status(400).json({ error: 'idToken_required' });
        if (!pool) return res.status(500).json({ error: 'Servico indisponivel: banco de dados' });

        let payload;
        try {
            payload = await msalVerify.verify(idToken);
        } catch (e) {
            return res.status(401).json({ error: 'invalid_msal_token', message: e.message });
        }

        const email = (msalVerify.extractEmail(payload) || '').toLowerCase().trim();
        if (!email) return res.status(401).json({ error: 'email_not_found' });

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT TOP 1 * FROM Users WHERE LOWER(Email) = @email AND IsActive = 1 AND IsAdmin = 1');

        if (result.recordset.length === 0) {
            // Email autenticado pelo Microsoft mas nao bate com nenhum admin
            // ativo cadastrado. Front cai pro modal de usuario/senha.
            return res.status(401).json({ error: 'not_admin' });
        }

        const user = result.recordset[0];

        try {
            await pool.request()
                .input('userId', sql.Int, user.Id)
                .query('UPDATE Users SET LastLogin = GETDATE() WHERE Id = @userId');
        } catch (e) {
            console.warn('Nao foi possivel atualizar LastLogin (MSAL SSO):', e);
        }

        const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
        const token = jwt.sign(
            {
                id: user.Id,
                username: user.Username,
                isAdmin: !!user.IsAdmin,
                fullName: user.FullName || null,
                email: user.Email || null
            },
            secret,
            { expiresIn: '24h' }
        );
        return res.json({
            token,
            user: {
                id: user.Id,
                username: user.Username,
                isAdmin: !!user.IsAdmin,
                fullName: user.FullName || null,
                email: user.Email || null
            }
        });
    } catch (err) {
        console.error('[login-microsoft] erro:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.get('/api/verify-token', authenticateToken, async (req, res) => {
    let apps = [];
    try {
        apps = await loadAppsByUserId(pool, sql, req.user && req.user.id);
    } catch (e) {
        console.warn('[verify-token] loadAppsByUserId falhou:', e && e.message);
    }
    res.json({ user: { ...req.user, apps } });
});

// ROTAS DE PÁGINAS

app.get('/api/pages', optionalAuthenticate, async (req, res) => {
    try {
        console.log('GET /api/pages - requester', req.user ? `${req.user.username} (id:${req.user.id})` : 'anonymous');
        const result = await pool.request()
            .query('SELECT * FROM Pages WHERE IsActive = 1 ORDER BY [Order], Title');
        return res.json(result.recordset);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao buscar páginas' });
    }
});

app.get('/api/pages/:id', optionalAuthenticate, async (req, res) => {
    try {
        console.log(`GET /api/pages/${req.params.id} - requester`, req.user ? `${req.user.username} (id:${req.user.id})` : 'anonymous');
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Pages WHERE Id = @id AND IsActive = 1');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Página não encontrada' });
        }
        
        try {
            await pool.request()
                .input('userId', sql.Int, req.user ? req.user.id : null)
                .input('pageId', sql.Int, req.params.id)
                .input('action', sql.NVarChar, 'VIEW')
                .input('ipAddress', sql.NVarChar, req.ip)
                .input('userAgent', sql.NVarChar, req.headers['user-agent'] || '')
                .query(`
                    INSERT INTO AccessLogs (UserId, PageId, Action, AccessTime, IpAddress, UserAgent)
                    VALUES (@userId, @pageId, @action, GETDATE(), @ipAddress, @userAgent)
                `);
        } catch (logErr) {
            console.warn('Falha ao registrar acesso (não crítico):', logErr);
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar página' });
    }
});

app.post('/api/pages', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const { title, subtitle, description, powerBIUrl, redirectPowerBIUrl, redirectEmails, showInHome, icon, order,
                useEmbed, embedWorkspaceId, embedReportId, allowedAADGroups, embedRoles,
                redirectEmbedWorkspaceId, redirectEmbedReportId, isHomologation,
                homologationStartedAt } = req.body;

        const allowedAADGroupsJson = Array.isArray(allowedAADGroups)
            ? JSON.stringify(allowedAADGroups)
            : (typeof allowedAADGroups === 'string' && allowedAADGroups.trim() ? allowedAADGroups : null);

        const embedRolesValue = Array.isArray(embedRoles)
            ? embedRoles.join(',')
            : (typeof embedRoles === 'string' && embedRoles.trim() ? embedRoles.trim() : null);

        // homologationStartedAt vem como string 'YYYY-MM-DD' do <input type="date">.
        // CUIDADO TIMEZONE: como a pool esta configurada com useUTC: false (ver
        // sql.connect config), passar a string crua faz o driver mssql parsa-la
        // como `new Date('YYYY-MM-DD')` que e' UTC midnight. Em horario de SP
        // (UTC-3), UTC midnight = 21:00 do dia anterior LOCAL — o DATE column
        // trunca pra esse dia, perdendo 1 dia. Construimos o Date com
        // componentes locais (ano, mes-1, dia) pra que o driver veja a mesma
        // data em local time.
        const homologationStartedAtValue = (() => {
            if (!homologationStartedAt || typeof homologationStartedAt !== 'string') return null;
            const m = homologationStartedAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return null;
            return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        })();

        const result = await pool.request()
            .input('title', sql.NVarChar, title)
            .input('subtitle', sql.NVarChar, subtitle)
            .input('description', sql.NVarChar, description)
            .input('powerBIUrl', sql.NVarChar, powerBIUrl)
            .input('redirectPowerBIUrl', sql.NVarChar, redirectPowerBIUrl || null)
            .input('redirectEmails', sql.NVarChar(sql.MAX), redirectEmails || null)
            .input('showInHome', sql.Bit, showInHome !== false ? 1 : 0)
            .input('icon', sql.NVarChar, icon || null)
            .input('order', sql.Int, Number.isInteger(order) ? order : null)
            .input('useEmbed', sql.Bit, useEmbed ? 1 : 0)
            .input('embedWorkspaceId', sql.UniqueIdentifier, embedWorkspaceId || null)
            .input('embedReportId', sql.UniqueIdentifier, embedReportId || null)
            .input('allowedAADGroups', sql.NVarChar(sql.MAX), allowedAADGroupsJson)
            .input('embedRoles', sql.NVarChar(sql.MAX), embedRolesValue)
            .input('redirectEmbedWorkspaceId', sql.UniqueIdentifier, redirectEmbedWorkspaceId || null)
            .input('redirectEmbedReportId', sql.UniqueIdentifier, redirectEmbedReportId || null)
            .input('isHomologation', sql.Bit, isHomologation ? 1 : 0)
            .input('homologationStartedAt', sql.Date, homologationStartedAtValue)
            .query(`
                INSERT INTO Pages (Title, Subtitle, Description, PowerBIUrl, RedirectPowerBIUrl, RedirectEmails, ShowInHome, Icon, [Order],
                                   UseEmbed, EmbedWorkspaceId, EmbedReportId, AllowedAADGroups, EmbedRoles,
                                   RedirectEmbedWorkspaceId, RedirectEmbedReportId, IsHomologation, HomologationStartedAt)
                OUTPUT INSERTED.*
                SELECT
                    @title, @subtitle, @description, @powerBIUrl, @redirectPowerBIUrl, @redirectEmails, @showInHome, @icon,
                    COALESCE(@order, (SELECT ISNULL(MAX([Order]), 0) + 10 FROM Pages)),
                    @useEmbed, @embedWorkspaceId, @embedReportId, @allowedAADGroups, @embedRoles,
                    @redirectEmbedWorkspaceId, @redirectEmbedReportId, @isHomologation, @homologationStartedAt
            `);

        return res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Erro ao criar página:', err);
        return res.status(500).json({ error: 'Erro ao criar página' });
    }
});

app.put('/api/pages/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const { title, subtitle, description, powerBIUrl, redirectPowerBIUrl, redirectEmails, showInHome, icon, order,
                useEmbed, embedWorkspaceId, embedReportId, allowedAADGroups, embedRoles,
                redirectEmbedWorkspaceId, redirectEmbedReportId, isHomologation,
                homologationStartedAt } = req.body;

        const allowedAADGroupsJson = Array.isArray(allowedAADGroups)
            ? JSON.stringify(allowedAADGroups)
            : (typeof allowedAADGroups === 'string' && allowedAADGroups.trim() ? allowedAADGroups : null);

        const embedRolesValue = Array.isArray(embedRoles)
            ? embedRoles.join(',')
            : (typeof embedRoles === 'string' && embedRoles.trim() ? embedRoles.trim() : null);

        // Mesma logica de timezone do POST acima — construir Date com componentes
        // locais pra useUTC:false nao shiftar 1 dia pra tras.
        const homologationStartedAtValue = (() => {
            if (!homologationStartedAt || typeof homologationStartedAt !== 'string') return null;
            const m = homologationStartedAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return null;
            return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
        })();

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('title', sql.NVarChar, title)
            .input('subtitle', sql.NVarChar, subtitle)
            .input('description', sql.NVarChar, description)
            .input('powerBIUrl', sql.NVarChar, powerBIUrl)
            .input('redirectPowerBIUrl', sql.NVarChar, redirectPowerBIUrl || null)
            .input('redirectEmails', sql.NVarChar(sql.MAX), redirectEmails || null)
            .input('showInHome', sql.Bit, showInHome !== false ? 1 : 0)
            .input('icon', sql.NVarChar, icon || null)
            .input('order', sql.Int, Number.isInteger(order) ? order : null)
            .input('useEmbed', sql.Bit, useEmbed ? 1 : 0)
            .input('embedWorkspaceId', sql.UniqueIdentifier, embedWorkspaceId || null)
            .input('embedReportId', sql.UniqueIdentifier, embedReportId || null)
            .input('allowedAADGroups', sql.NVarChar(sql.MAX), allowedAADGroupsJson)
            .input('embedRoles', sql.NVarChar(sql.MAX), embedRolesValue)
            .input('redirectEmbedWorkspaceId', sql.UniqueIdentifier, redirectEmbedWorkspaceId || null)
            .input('redirectEmbedReportId', sql.UniqueIdentifier, redirectEmbedReportId || null)
            .input('isHomologation', sql.Bit, isHomologation ? 1 : 0)
            .input('homologationStartedAt', sql.Date, homologationStartedAtValue)
            .query(`
                UPDATE Pages
                SET Title = @title,
                    Subtitle = @subtitle,
                    Description = @description,
                    PowerBIUrl = @powerBIUrl,
                    RedirectPowerBIUrl = @redirectPowerBIUrl,
                    RedirectEmails = @redirectEmails,
                    ShowInHome = @showInHome,
                    Icon = @icon,
                    [Order] = COALESCE(@order, [Order]),
                    UseEmbed = @useEmbed,
                    EmbedWorkspaceId = @embedWorkspaceId,
                    EmbedReportId = @embedReportId,
                    AllowedAADGroups = @allowedAADGroups,
                    EmbedRoles = @embedRoles,
                    RedirectEmbedWorkspaceId = @redirectEmbedWorkspaceId,
                    RedirectEmbedReportId = @redirectEmbedReportId,
                    IsHomologation = @isHomologation,
                    HomologationStartedAt = @homologationStartedAt,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Página não encontrada' });
        }
        return res.json(result.recordset[0]);
    } catch (err) {
        console.error('Erro ao atualizar página:', err);
        return res.status(500).json({ error: 'Erro ao atualizar página' });
    }
});

app.put('/api/pages/:id/order', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const { order } = req.body;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('order', sql.Int, order)
            .query(`
                UPDATE Pages 
                SET [Order] = @order, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND IsActive = 1
            `);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Página não encontrada' });
        }
        return res.json(result.recordset[0]);
    } catch (err) {
        console.error('Erro ao atualizar ordem da página:', err);
        return res.status(500).json({ error: 'Erro ao atualizar ordem da página' });
    }
});

app.delete('/api/pages/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE Pages SET IsActive = 0 WHERE Id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao deletar página' });
    }
});

// ROTAS DE MENU

app.get('/api/menu', optionalAuthenticate, async (req, res) => {
    try {
        console.log('GET /api/menu - requester', req.user ? `${req.user.username} (id:${req.user.id})` : 'anonymous');
        const result = await pool.request()
            .query(`
                SELECT Id, Name, Type, ParentId, PageId, Icon, [Order], IsActive, CreatedAt, UpdatedAt
                FROM MenuItems
                WHERE IsActive = 1
                ORDER BY [Order], Id
            `);
        
        const menuItems = result.recordset;
        const menuTree = buildMenuTree(menuItems);
        
        res.json(menuTree);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar menu' });
    }
});

function buildMenuTree(items) {
    const itemsMap = {};
    const rootItems = [];
    
    items.forEach(item => {
        itemsMap[item.Id] = { ...item, children: [] };
    });
    
    items.forEach(item => {
        if (item.ParentId) {
            if (itemsMap[item.ParentId]) {
                itemsMap[item.ParentId].children.push(itemsMap[item.Id]);
            }
        } else {
            rootItems.push(itemsMap[item.Id]);
        }
    });
    
    return rootItems;
}

app.post('/api/menu', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const { name, type, parentId, pageId, icon, order } = req.body;
        const result = await pool.request()
            .input('name', sql.NVarChar, name)
            .input('type', sql.VarChar, type)
            .input('parentId', sql.Int, parentId || null)
            .input('pageId', sql.Int, pageId || null)
            .input('icon', sql.NVarChar, icon || null)
            .input('order', sql.Int, order || 0)
            .query(`
                INSERT INTO MenuItems (Name, Type, ParentId, PageId, Icon, [Order])
                OUTPUT INSERTED.*
                VALUES (@name, @type, @parentId, @pageId, @icon, @order)
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar item de menu' });
    }
});

app.put('/api/menu/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const { name, type, parentId, pageId, icon, order } = req.body;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar, name)
            .input('type', sql.VarChar, type)
            .input('parentId', sql.Int, parentId || null)
            .input('pageId', sql.Int, pageId || null)
            .input('icon', sql.NVarChar, icon || null)
            .input('order', sql.Int, order || 0)
            .query(`
                UPDATE MenuItems 
                SET Name = @name,
                    Type = @type,
                    ParentId = @parentId,
                    PageId = @pageId,
                    Icon = @icon,
                    [Order] = @order,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Item de menu não encontrado' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar item de menu' });
    }
});

app.delete('/api/menu/:id', authenticateToken, async (req, res) => {
    console.log(`[DELETE /api/menu/${req.params.id}] User:`, req.user);
    
    if (!req.user.isAdmin) {
        console.log(`[DELETE /api/menu/${req.params.id}] Access denied - user is not admin:`, req.user);
        return res.status(403).json({ error: 'Acesso negado: usuário não é administrador' });
    }
    
    try {
        const menuItemId = parseInt(req.params.id);
        if (isNaN(menuItemId)) {
            return res.status(400).json({ error: 'ID do item inválido' });
        }
        
        console.log(`[DELETE /api/menu/${menuItemId}] Attempting to delete menu item`);
        
        const result = await pool.request()
            .input('id', sql.Int, menuItemId)
            .query('UPDATE MenuItems SET IsActive = 0 WHERE Id = @id');
        
        console.log(`[DELETE /api/menu/${menuItemId}] Query result:`, result);
        
        if (result.rowsAffected && result.rowsAffected[0] > 0) {
            console.log(`[DELETE /api/menu/${menuItemId}] Successfully deleted menu item`);
            res.json({ success: true, message: 'Item excluído com sucesso' });
        } else {
            console.log(`[DELETE /api/menu/${menuItemId}] No rows affected - item may not exist`);
            res.status(404).json({ error: 'Item de menu não encontrado ou já foi excluído' });
        }
    } catch (err) {
        console.error(`[DELETE /api/menu/${req.params.id}] Database error:`, err);
        res.status(500).json({ error: 'Erro ao deletar item de menu: ' + err.message });
    }
});

app.put('/api/menu/:id/order', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const { order } = req.body;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('order', sql.Int, order)
            .query(`
                UPDATE MenuItems 
                SET [Order] = @order,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND IsActive = 1
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Item de menu não encontrado' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar ordem do item' });
    }
});

// SEARCH

app.get('/api/search', optionalAuthenticate, async (req, res) => {
    try {
        const q = (req.query.q || req.query.query || '').trim();
        if (!q) return res.json([]);
        const like = `%${q.replace(/[%_]/g, '[$&]')}%`;

        const pagesResult = await pool.request()
            .input('like', sql.NVarChar, like)
            .query(`
                SELECT TOP 10 Id, Title, Subtitle, Description
                FROM Pages
                WHERE IsActive = 1
                  AND (Title LIKE @like OR Subtitle LIKE @like OR Description LIKE @like)
                ORDER BY Title
            `);

        const results = pagesResult.recordset.map(p => ({
            type: 'page',
            id: p.Id,
            label: p.Title,
            pageId: p.Id,
            description: p.Subtitle || p.Description || ''
        }));

        res.json(results);
    } catch (err) {
        console.error('Erro na busca:', err);
        res.status(500).json({ error: 'Erro ao executar busca' });
    }
});

// ROTAS DE CONFIGURAÇÕES

app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        const result = await pool.request()
            .query('SELECT [Key], Value FROM Settings');
        
        const settings = {};
        result.recordset.forEach(row => {
            settings[row.Key] = row.Value;
        });
        
        res.json(settings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

app.put('/api/settings/:key', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const { value } = req.body;
        const result = await pool.request()
            .input('key', sql.NVarChar(200), req.params.key)
            .input('value', sql.NVarChar(sql.MAX), value)
            .query(`
                MERGE Settings AS target
                USING (SELECT @key AS [Key], @value AS Value) AS source
                ON target.[Key] = source.[Key]
                WHEN MATCHED THEN
                    UPDATE SET Value = source.Value, UpdatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT ([Key], Value) VALUES (source.[Key], source.Value);
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar configuração' });
    }
});

app.post('/api/config', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
        const config = req.body;
        console.log('POST /api/config payload:', config);

        const keys = Object.keys(config || {});
        for (const key of keys) {
            await pool.request()
                .input('key', sql.NVarChar(200), key)
                .input('value', sql.NVarChar(sql.MAX), String(config[key]))
                .query(`
                    MERGE Settings AS target
                    USING (SELECT @key AS [Key], @value AS Value) AS source
                    ON target.[Key] = source.[Key]
                    WHEN MATCHED THEN
                        UPDATE SET Value = source.Value, UpdatedAt = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT ([Key], Value) VALUES (source.[Key], source.Value);
                `);
        }

        if (keys.length === 0) {
            return res.json({ success: true, settings: {} });
        }

        const request = pool.request();
        keys.forEach((k, i) => request.input(`k${i}`, sql.NVarChar(200), k));
        const inList = keys.map((k, i) => `@k${i}`).join(',');
        const selectResult = await request.query(`SELECT [Key], Value FROM Settings WHERE [Key] IN (${inList})`);
        const settings = {};
        selectResult.recordset.forEach(row => { settings[row.Key] = row.Value; });

        res.json({ success: true, settings });
    } catch (err) {
        console.error('Erro ao salvar configurações:', err);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const result = await pool.request()
            .query('SELECT [Key], Value FROM Settings');
        const settings = {};
        result.recordset.forEach(row => {
            settings[row.Key] = row.Value;
        });
        res.json(settings);
    } catch (err) {
        console.error('Erro ao buscar configurações:', err);
        res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

// ROTAS DE ESTATÍSTICAS

app.get('/api/stats', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const stats = {};
        
        const pagesResult = await pool.request()
            .query('SELECT COUNT(*) as total FROM Pages WHERE IsActive = 1');
        stats.totalPages = pagesResult.recordset[0].total;
        
        const usersResult = await pool.request()
            .query('SELECT COUNT(*) as total FROM Users WHERE IsActive = 1');
        stats.totalUsers = usersResult.recordset[0].total;
        
        const accessResult = await pool.request()
            .query(`
                SELECT COUNT(*) as total 
                FROM AccessLogs 
                WHERE CAST(AccessTime as DATE) = CAST(GETDATE() as DATE)
            `);
        stats.accessToday = accessResult.recordset[0].total;
        
        const topPagesResult = await pool.request()
            .query(`
                SELECT TOP 5 
                    p.Title,
                    COUNT(al.Id) as Views
                FROM AccessLogs al
                JOIN Pages p ON al.PageId = p.Id
                WHERE al.AccessTime >= DATEADD(day, -7, GETDATE())
                GROUP BY p.Title
                ORDER BY Views DESC
            `);
        stats.topPages = topPagesResult.recordset;
        
        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// UPLOAD LOGO

app.post('/api/upload-logo', authenticateToken, upload.single('logo'), async (req, res) => {
    if (!req.user.isAdmin) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting unauthorized upload:', err);
            });
        }
        return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    try {
        const logoUrl = `/uploads/${req.file.filename}`;
        
        await pool.request()
            .input('key', sql.NVarChar(200), 'logoUrl')
            .input('value', sql.NVarChar(sql.MAX), logoUrl)
            .query(`
                MERGE Settings AS target
                USING (SELECT @key AS [Key], @value AS Value) AS source
                ON target.[Key] = source.[Key]
                WHEN MATCHED THEN
                    UPDATE SET Value = source.Value, UpdatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT ([Key], Value) VALUES (source.[Key], source.Value);
            `);

        try {
            const files = fs.readdirSync(uploadsDir);
            const logoFiles = files.filter(file => file.startsWith('logo-') && file !== req.file.filename);
            logoFiles.forEach(file => {
                fs.unlink(path.join(uploadsDir, file), (err) => {
                    if (err) console.error('Error deleting old logo:', err);
                });
            });
        } catch (cleanupErr) {
            console.warn('Could not clean up old logo files:', cleanupErr);
        }

        res.json({ 
            success: true, 
            logoUrl: logoUrl,
            filename: req.file.filename 
        });
    } catch (err) {
        console.error('Error saving logo:', err);
        fs.unlink(req.file.path, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting failed upload:', unlinkErr);
        });
        res.status(500).json({ error: 'Erro ao salvar logo' });
    }
});

app.delete('/api/remove-logo', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
        const currentLogoResult = await pool.request()
            .input('key', sql.NVarChar(200), 'logoUrl')
            .query('SELECT Value FROM Settings WHERE [Key] = @key');

        await pool.request()
            .input('key', sql.NVarChar(200), 'logoUrl')
            .query('DELETE FROM Settings WHERE [Key] = @key');

        try {
            const files = fs.readdirSync(uploadsDir);
            const logoFiles = files.filter(file => file.startsWith('logo-'));
            logoFiles.forEach(file => {
                fs.unlink(path.join(uploadsDir, file), (err) => {
                    if (err) console.error('Error deleting logo file:', err);
                });
            });
        } catch (cleanupErr) {
            console.warn('Could not clean up logo files:', cleanupErr);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error removing logo:', err);
        res.status(500).json({ error: 'Erro ao remover logo' });
    }
});

// ROTAS DE CHATBOT AI

app.get('/api/chat/models', optionalAuthenticate, async (req, res) => {
    try {
        res.json({
            provider: 'copilot-agent',
            transport: 'botframework-directline',
            endpoint: DIRECT_LINE_ENDPOINT ? 'configured' : 'missing',
            note: 'Copilot Agent não expõe lista de modelos via Direct Line.'
        });
    } catch (err) {
        console.error('Erro ao listar modelos:', err);
        res.status(500).json({ error: 'Erro ao buscar modelos disponíveis' });
    }
});

async function validateSQLSyntax(sqlText) {
    if (!pool || !pool.connected) return { ok: true };
    
    try {
        const trimmedSQL = sqlText.trim().toUpperCase();
        
        // Para CTEs, modificar a query final para incluir TOP 0
        if (trimmedSQL.startsWith('WITH')) {
            console.log('[SQL-VALIDATION] CTE detectada - validando com TOP 0');
            
            // Encontrar o último SELECT (query principal após a CTE)
            const lastSelectIndex = sqlText.lastIndexOf('SELECT');
            if (lastSelectIndex === -1) {
                return { ok: false, error: 'CTE sem SELECT principal' };
            }
            
            // Inserir TOP 0 após o último SELECT
            const validationSQL = sqlText.substring(0, lastSelectIndex + 6) + // "SELECT"
                                  ' TOP 0' + 
                                  sqlText.substring(lastSelectIndex + 6);
            
            const req = pool.request();
            req.timeout = 5000;
            await req.query(validationSQL);
            console.log('[SQL-VALIDATION] CTE validada com sucesso');
            return { ok: true };
        }
        
        // Validação padrão para queries simples
        const req = pool.request();
        await req.batch(`SET NOEXEC ON; ${sqlText}; SET NOEXEC OFF;`);
        return { ok: true };
    } catch (e) {
        console.error('[SQL-VALIDATION] Erro na validação:', e.message);
        return { ok: false, error: e?.message || String(e) };
    }
}

function validateUserRequest(userQuery, dataDictionary) {
    const query = userQuery.toLowerCase().trim();
    
    // Validação básica: verificar se não está vazia
    if (!query || query.length < 3) {
        return {
            isValid: false,
            reason: 'empty_query',
            message: 'Por favor, faça uma pergunta sobre os dados disponíveis.'
        };
    }
    
    // Verificar se o dicionário está vazio
    if (!dataDictionary || !dataDictionary.tables || dataDictionary.tables.length === 0) {
        return {
            isValid: false,
            reason: 'no_dictionary',
            message: 'Nenhum dicionário de dados está configurado. Configure um dicionário no painel administrativo.'
        };
    }
    
    // DEIXAR O COPILOT VALIDAR SE É UMA PERGUNTA SOBRE DADOS
    // Não fazer validação restritiva de palavras-chave aqui
    return { isValid: true };
}

app.post('/api/chat/ai-sql', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, dataDictionary } = req.body || {};
        if (!userQuery || typeof userQuery !== 'string') {
            return res.status(400).json({ 
                error: 'userQuery é obrigatório',
                details: 'O campo userQuery deve ser uma string válida',
                stage: 'input_validation'
            });
        }
        
        console.log(`[AI-SQL] Processando pergunta: "${userQuery}"`);
        console.log(`[AI-SQL] Dicionário de dados:`, dataDictionary ? 'Presente' : 'Ausente');

        const validation = validateUserRequest(userQuery, dataDictionary);
        if (!validation.isValid) {
            console.log(`[AI-SQL] Solicitação inválida: ${validation.reason} - ${validation.message}`);
            return res.status(400).json({
                error: 'Solicitação inválida',
                details: validation.message,
                reason: validation.reason,
                stage: 'request_validation'
            });
        }
        
        if (!DIRECT_LINE_SECRET) {
            console.error('Direct Line não configurado - DIRECT_LINE_SECRET ausente');
            return res.status(500).json({ 
                error: 'Direct Line não configurado no servidor',
                details: 'Variável DIRECT_LINE_SECRET não encontrada no arquivo .env',
                stage: 'configuration_error'
            });
        }

        const rules = `INSTRUÇÃO ABSOLUTA: Responda APENAS com a consulta SQL. Não adicione explicações, comentários ou texto extra.

        Você é um assistente especializado em gerar consultas SQL para SQL Server (T-SQL).

        DICIONÁRIO DE DADOS DAS TABELAS DISPONÍVEIS:
        ${dataDictionary ? JSON.stringify(dataDictionary, null, 2) : '(Dicionário não informado)'}

        REGRAS OBRIGATÓRIAS:
        1. Use APENAS comandos SELECT
        2. Para filtros de data, SEMPRE use as funções MONTH() e YEAR()
        3. Para contagens, use COUNT(*) com alias descritivo
        4. Use TOP 100 para limitar resultados quando necessário
        5. Evite SELECT *, prefira colunas específicas
        6. Se a pergunta mencionar dados que não existem no dicionário, responda: "DADOS_NAO_ENCONTRADOS"
        7. **NOVO: Para queries "TOP N ao longo do tempo", use CTE para filtrar primeiro:**
        Exemplo: "top 3 setores ao longo dos meses" deve gerar:
        WITH TopN AS (SELECT TOP N coluna FROM tabela GROUP BY coluna ORDER BY SUM(valor) DESC)
        SELECT mes, ano, coluna, SUM(valor) FROM tabela WHERE coluna IN (SELECT coluna FROM TopN) GROUP BY mes, ano, coluna ORDER BY ano, mes

        MAPEAMENTO DE MESES EM PORTUGUÊS (OBRIGATÓRIO):
        - janeiro = 1, fevereiro = 2, março = 3, abril = 4
        - maio = 5, junho = 6, julho = 7, agosto = 8
        - setembro = 9, outubro = 10, novembro = 11, dezembro = 12

        PERGUNTA DO USUÁRIO: ${userQuery}

        Gere APENAS a consulta SQL (sem explicações):`;

        console.log(`[AI-SQL] Prompt completo sendo enviado:`);
        console.log(rules);

        console.log('[AI-SQL] Iniciando conversa com Direct Line...');
        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        if (!convResp.ok) {
            const errorText = await convResp.text().catch(() => 'Erro desconhecido');
            console.error(`[AI-SQL] Falha ao iniciar conversa: ${convResp.status} - ${errorText}`);
            return res.status(502).json({ 
                error: 'Falha ao conectar com Copilot Agent', 
                details: `Status: ${convResp.status}, Resposta: ${errorText}`,
                stage: 'conversation_start'
            });
        }
        const conv = await convResp.json();
        const conversationId = conv.conversationId;
        console.log(`[AI-SQL] Conversa iniciada: ${conversationId}`);

        console.log('[AI-SQL] Enviando pergunta para o Copilot...');
        const activity = { type: 'message', from: { id: 'user' }, text: rules };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activity)
        });
        if (!postResp.ok) {
            const errorText = await postResp.text().catch(() => 'Erro desconhecido');
            console.error(`[AI-SQL] Falha ao enviar mensagem: ${postResp.status} - ${errorText}`);
            return res.status(502).json({ 
                error: 'Falha ao enviar pergunta ao Copilot', 
                details: `Status: ${postResp.status}, Resposta: ${errorText}`,
                stage: 'message_send'
            });
        }
        console.log('[AI-SQL] Pergunta enviada com sucesso');

        console.log('[AI-SQL] Aguardando resposta do Copilot...');
        let watermark;
        let replyText = '';
        let attempts = 0;
        for (let i = 0; i < 30; i++) {
            attempts++;
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            if (!actResp.ok) {
                const errorText = await actResp.text().catch(() => 'Erro desconhecido');
                console.error(`[AI-SQL] Falha ao obter resposta (tentativa ${attempts}): ${actResp.status} - ${errorText}`);
                return res.status(502).json({ 
                    error: 'Falha ao obter resposta do Copilot', 
                    details: `Status: ${actResp.status}, Resposta: ${errorText}, Tentativa: ${attempts}`,
                    stage: 'response_polling'
                });
            }
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => a.type === 'message' && a.from && a.from.id && a.from.id !== 'user');
            const last = activities.length ? activities[activities.length - 1] : null;
            if (last && last.text) {
                replyText = last.text;
                console.log(`[AI-SQL] Resposta recebida após ${attempts} tentativas`);
                console.log(`[AI-SQL] Resposta completa do Copilot: "${replyText}"`);
                break;
            }
            await sleep(1000);
        }

        if (!replyText) {
            console.error(`[AI-SQL] Timeout após ${attempts} tentativas`);
            return res.status(504).json({ 
                error: 'Copilot Agent não respondeu dentro do tempo limite',
                details: `Nenhuma resposta após ${attempts} tentativas (${attempts} segundos)`,
                stage: 'response_timeout'
            });
        }

        console.log(`[AI-SQL] Iniciando limpeza da resposta...`);
        
        let sqlText = replyText;
        
        const sqlBlockMatch = replyText.match(/```sql\s*([\s\S]*?)\s*```/i);
        if (sqlBlockMatch) {
            sqlText = sqlBlockMatch[1];
            console.log(`[AI-SQL] SQL extraída do bloco: "${sqlText}"`);
        } else {
            sqlText = replyText
                .replace(/```sql\n?/gi, '')
                .replace(/```\n?/gi, '')
                .replace(/^sql\n?/i, '');
        }
        
        sqlText = sqlText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/\s*Nota:.*$/gim, '')
            .replace(/\s*Note:.*$/gim, '')
            .replace(/\s*Observação:.*$/gim, '')
            .replace(/\s*Esta consulta.*$/gim, '')
            .replace(/\s*This query.*$/gim, '')
            .trim();
        
        sqlText = sqlText.replace(/\n\s*\n/g, '\n').trim();
        
        console.log(`[AI-SQL] SQL após limpeza: "${sqlText}"`);

        if (sqlText.includes('DADOS_NAO_ENCONTRADOS') || sqlText.includes('dados não encontrados')) {
            console.log(`[AI-SQL] Copilot indicou que os dados não foram encontrados`);
            return res.status(400).json({
                error: 'Dados não encontrados',
                details: 'Não consegui encontrar os dados solicitados no dicionário disponível. Verifique se as tabelas e campos mencionados existem.',
                stage: 'data_not_found'
            });
        }

        // Aceitar SELECT ou CTEs (WITH)
        if (!/^(select|with)/i.test(sqlText)) {
            console.error(`[AI-SQL] Resposta não é SELECT/CTE válida: ${sqlText}`);
            return res.status(400).json({ 
                error: 'Copilot não gerou uma consulta SELECT ou CTE válida',
                details: `SQL limpa: "${sqlText}"`,
                originalResponse: replyText,
                stage: 'sql_validation'
            });
        }

        const userQueryLower = userQuery.toLowerCase();
        const monthsPortuguese = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const mentionedMonth = monthsPortuguese.find(month => userQueryLower.includes(month));
        
        if (mentionedMonth && !sqlText.includes('MONTH(') && !sqlText.includes('WHERE')) {
            console.warn(`[AI-SQL] Query não incluiu filtro de mês para "${mentionedMonth}"`);
            const monthNumber = monthsPortuguese.indexOf(mentionedMonth) + 1;
            
            if (sqlText.includes('COUNT(*)') && sqlText.includes('FROM Atendimentos')) {
                const alias = `Atendimentos${mentionedMonth.charAt(0).toUpperCase() + mentionedMonth.slice(1)}`;
                sqlText = sqlText.replace(
                    /SELECT COUNT\(\*\) AS \w+/i, 
                    `SELECT COUNT(*) AS ${alias}`
                ).replace(
                    /FROM Atendimentos/i, 
                    `FROM Atendimentos WHERE MONTH(DataAtendimento) = ${monthNumber} AND YEAR(DataAtendimento) = YEAR(GETDATE())`
                );
                console.log(`[AI-SQL] SQL corrigida automaticamente para incluir filtro de ${mentionedMonth}: ${sqlText}`);
            }
        }

        console.log('[AI-SQL] Validando sintaxe da SQL...');
        const syntaxCheck = await validateSQLSyntax(sqlText);
        if (!syntaxCheck.ok) {
            console.warn(`[AI-SQL] SQL com erro de sintaxe: ${syntaxCheck.error}`);
            return res.status(400).json({
                error: 'SQL gerada contém erros de sintaxe',
                details: `Erro: ${syntaxCheck.error}`,
                sql: sqlText,
                originalResponse: replyText,
                stage: 'syntax_validation'
            });
        }

        console.log(`[AI-SQL] ✅ SQL válida gerada: ${sqlText}`);
        return res.json({ 
            sql: sqlText,
            conversationId: conversationId,
            originalResponse: replyText
        });
        
    } catch (err) {
        console.error('[AI-SQL] Erro interno:', err);
        console.error('[AI-SQL] Stack trace:', err.stack);
        return res.status(500).json({ 
            error: 'Erro interno do servidor', 
            details: err.message,
            stage: 'internal_error'
        });
    }
});

app.post('/api/chat/analyze', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, sqlQuery, results } = req.body;
        
        if (!userQuery || !sqlQuery || !results) {
            return res.status(400).json({ 
                error: 'Dados insuficientes para análise',
                stage: 'input_validation'
            });
        }

        if (!DIRECT_LINE_SECRET) {
            console.error('[ANALYZE] Direct Line não configurado');
            return res.status(500).json({ 
                error: 'Serviço de análise não configurado',
                stage: 'configuration_error'
            });
        }

        // Preparar dados para análise
        const dataForAnalysis = results.slice(0, 50);
        
        // IMPORTANTE: Definir data e ano atual
        const currentYear = new Date().getFullYear();
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Prompt EXTREMAMENTE direto e imperativo
        const analysisPrompt = `CONTEXTO:
        - Data execução: ${currentDate}
        - Fonte: resultados SQL HISTÓRICOS (dados já existentes)
        - Ano referência: ${currentYear}

        PERGUNTA DO USUÁRIO:
        ${userQuery}

        SQL EXECUTADO:
        ${sqlQuery}

        RESULTADOS ( ${results.length} linhas, amostra ${dataForAnalysis.length} ):
        ${JSON.stringify(dataForAnalysis, null, 2)}

        REGRAS OBRIGATÓRIAS (seguir estritamente):
        1) Use APENAS os NÚMEROS e os nomes de COLUNAS presentes em "RESULTADOS". Não busque fontes externas.  
        2) NÃO peça clarificações: responda com os dados disponíveis.  
        3) Primeira frase obrigatória: resposta direta e conclusiva (ex.: "Sim — houve aumento." / "Não — houve redução.").  
        4) Inclua IMEDIATAMENTE a comparação quantitativa principal:
        - Séries temporais: calcule média por período (ex.: média mensal ano A → ano B), variação absoluta e percentual entre período inicial e final.
        - Agregados por ano: compare totais ano-a-ano (valor ano N vs ano N+1) com variação absoluta e percentual.
        - Perguntas "maior/menor/mais frequente": identifique o valor e a linha (Ano/Mês/Grupo) onde ocorreu.
        5) Depois da primeira frase, entregue 3–6 itens numéricos essenciais (totais, média, min/max + quando, comparação inicial→final, percentuais). Use os nomes das colunas como rótulos.  
        6) Sempre mostre o cálculo chave em forma explícita: "de X para Y → diferença Z (V%)".  
        7) Formatação numérica: contagens inteiras; médias com 1 casa decimal; percentuais com 1 casa decimal (use 2 casas apenas se <0,1%).  
        8) NÃO mencione limitações de IA, hipóteses futuras ou desculpas. Foque só nos fatos.  
        9) Idioma: Português (pt-BR). Seja conciso.

        FORMATO DE SAÍDA (obrigatório):
        - Linha 1: 1 frase curta com conclusão direta + comparação numérica principal.
        - Linhas seguintes: bullets numerados (3–6) com os itens essenciais (totais, média, min/max e quando, variação absoluta e percentual, observações numéricas importantes).
        - Sem perguntas de seguimento nem texto desnecessário.

        Exemplo de frase de saída (modelo): "Sim — houve aumento: média mensal 2024 = 14.197 → 2025 = 15.283 (+7,7% | +1.086/mês)."`;

        console.log('[ANALYZE] Solicitando análise ao Copilot...');

        
        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        
        if (!convResp.ok) {
            console.error('[ANALYZE] Falha ao iniciar conversa:', convResp.status);
            return res.status(502).json({ 
                error: 'Falha ao conectar com serviço de análise',
                stage: 'conversation_start'
            });
        }
        
        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: analysisPrompt };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activity)
        });
        
        if (!postResp.ok) {
            console.error('[ANALYZE] Falha ao enviar mensagem:', postResp.status);
            return res.status(502).json({ 
                error: 'Falha ao solicitar análise',
                stage: 'message_send'
            });
        }

        let watermark;
        let replyText = '';
        
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            
            if (!actResp.ok) {
                return res.status(502).json({ 
                    error: 'Falha ao obter análise',
                    stage: 'response_polling'
                });
            }
            
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => 
                a.type === 'message' && a.from && a.from.id && a.from.id !== 'user'
            );
            const last = activities.length ? activities[activities.length - 1] : null;
            
            if (last && last.text) {
                replyText = last.text;
                break;
            }
            
            await sleep(1000);
        }

        if (!replyText) {
            return res.status(504).json({ 
                error: 'Tempo esgotado aguardando análise',
                stage: 'response_timeout'
            });
        }

        replyText = replyText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/\s*Nota:.*$/gim, '')
            .replace(/\s*Note:.*$/gim, '')
            .trim();

        console.log('[ANALYZE] Análise concluída com sucesso');
        
        return res.json({ 
            analysis: replyText,
            conversationId: conversationId
        });
        
    } catch (err) {
        console.error('[ANALYZE] Erro interno:', err);
        return res.status(500).json({ 
            error: 'Erro interno ao processar análise',
            details: err.message,
            stage: 'internal_error'
        });
    }
});

app.post('/api/chat/generate-chart', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, sqlQuery, results, analysis } = req.body;
        
        if (!results || results.length === 0) {
            return res.status(400).json({ error: 'Sem dados', stage: 'validation' });
        }

        if (!DIRECT_LINE_SECRET) {
            return res.status(500).json({ error: 'Direct Line não configurado', stage: 'configuration' });
        }

        const columns = Object.keys(results[0]);
        const sampleData = results.slice(0, 15); // Mais amostras para melhor análise
        
        // Extrair ano do SQL se houver filtro
        let yearFromSQL = null;
        const yearMatch = sqlQuery.match(/YEAR\([^)]+\)\s*=\s*(\d{4})/i);
        if (yearMatch) {
            yearFromSQL = parseInt(yearMatch[1]);
        }

        const intelligentPrompt = `Você é um especialista em análise de dados e visualização.

        CONTEXTO:
        Pergunta: ${userQuery}
        SQL executada: ${sqlQuery}
        Análise: ${analysis || 'N/A'}
        ${yearFromSQL ? `Ano filtrado no SQL: ${yearFromSQL}` : ''}

        ESTRUTURA DOS DADOS:
        Colunas: ${columns.join(', ')}
        Total de linhas: ${results.length}

        AMOSTRA DOS DADOS (${sampleData.length} linhas):
        ${JSON.stringify(sampleData, null, 2)}

        SUA TAREFA:
        Analise a estrutura e retorne UM ÚNICO JSON com:

        {
        "dataAnalysis": {
            "hasTemporalData": true/false,
            "temporalColumns": {
            "year": "nome_coluna_ano" ou null,
            "month": "nome_coluna_mes" ou null,
            "date": "nome_coluna_data_completa" ou null
            },
            "hasCategoricalData": true/false,
            "categoricalColumn": "nome_coluna_categoria" ou null,
            "uniqueCategories": ["cat1", "cat2", "cat3"] (se houver),
            "valueColumns": ["coluna_valor1"],
            "dataFormat": "long|wide",
            "needsPivot": true/false,
            "pivotReason": "explicação"
        },
        "chartConfig": {
            "suitable": true/false,
            "chartType": "line|bar|doughnut",
            "xColumn": "coluna_para_eixo_x",
            "yColumn": "string_unica" OU ["coluna1", "coluna2"],
            "title": "título descritivo com período",
            "reasoning": "justificativa",
            "showVariation": true/false
        }
        }

        REGRAS CRÍTICAS PARA PIVOT:

        **Formato LONGO (Long Format):**
        \`\`\`
        mes | ano | TipoAtendimento | total
        1   | 2023| Fisioterapia    | 10
        1   | 2023| Hidroterapia    | 8
        2   | 2023| Fisioterapia    | 12
        \`\`\`

        **Formato LARGO (Wide Format) - NECESSÁRIO para múltiplas séries:**
        \`\`\`
        mes | ano | Fisioterapia | Hidroterapia
        1   | 2023| 10          | 8
        2   | 2023| 12          | 9
        \`\`\`

        **QUANDO FAZER PIVOT (needsPivot=true):**
        1. Dados estão em formato LONGO (coluna categórica repetida por período)
        2. Usuário quer COMPARAR ou ver EVOLUÇÃO de múltiplas categorias
        3. Tipo de gráfico é LINE ou BAR com múltiplas séries
        4. Há 2-5 categorias únicas

        **Exemplo - "evolução dos top 3 setores ao longo dos meses":**
        - dataFormat: "long" (TipoAtendimento repete por mês)
        - needsPivot: TRUE
        - pivotReason: "Precisa pivotar TipoAtendimento para colunas separadas, criando uma série por setor"
        - APÓS pivot, yColumn: ["Fisioterapia", "Hidroterapia", "Terapia_Ocupacional"]

        **QUANDO NÃO FAZER PIVOT (needsPivot=false):**
        1. Dados já estão em formato LARGO (cada métrica em sua coluna)
        2. Usuário quer apenas UMA série/categoria
        3. Tipo de gráfico é PIZZA/ROSCA

        TIPOS DE GRÁFICO:
        - Pizza/Rosca: 2-7 categorias, proporções
        - Linha: séries temporais 10+ pontos, comparação ao longo do tempo
        - Barras: comparações entre categorias, distribuições 7+

        **yColumn APÓS PIVOT:**
        Se needsPivot=true, yColumn deve ser ARRAY com nomes das categorias únicas (que se tornarão colunas).
        Se needsPivot=false, yColumn é string da coluna de valor OU array de colunas existentes.

        RESPONDA APENAS O JSON VÁLIDO (sem markdown):`;

        console.log('[CHART-INTELLIGENT] Solicitando análise inteligente ao Copilot...');

        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        
        if (!convResp.ok) {
            return res.status(502).json({ 
                error: 'Falha ao conectar',
                stage: 'conversation_start' 
            });
        }
        
        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: intelligentPrompt };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activity)
        });
        
        if (!postResp.ok) {
            return res.status(502).json({ 
                error: 'Falha ao enviar',
                stage: 'message_send' 
            });
        }

        let watermark;
        let replyText = '';
        
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            
            if (!actResp.ok) {
                return res.status(502).json({ 
                    error: 'Falha polling',
                    stage: 'response_polling' 
                });
            }
            
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => 
                a.type === 'message' && a.from && a.from.id && a.from.id !== 'user'
            );
            const last = activities.length ? activities[activities.length - 1] : null;
            
            if (last && last.text) {
                replyText = last.text;
                break;
            }
            
            await sleep(1000);
        }

        if (!replyText) {
            return res.status(504).json({ 
                error: 'Timeout',
                stage: 'timeout' 
            });
        }

        replyText = replyText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/gi, '')
            .trim();

        console.log('[CHART-INTELLIGENT] Resposta recebida:', replyText.substring(0, 500));

        let intelligentResponse;
        try {
            const jsonMatch = replyText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('JSON não encontrado');
            intelligentResponse = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('[CHART-INTELLIGENT] Erro parse:', replyText);
            return res.status(400).json({
                error: 'Resposta inválida',
                details: replyText.substring(0, 300),
                stage: 'parse_error'
            });
        }

        console.log('[CHART-INTELLIGENT] Análise recebida:', JSON.stringify(intelligentResponse, null, 2));

        let processedResults = results;
        
        // APLICAR TRANSFORMAÇÕES SUGERIDAS PELO COPILOT
        const dataAnalysis = intelligentResponse.dataAnalysis;
        
        // Criar coluna temporal formatada se necessário
        if (dataAnalysis.hasTemporalData && dataAnalysis.temporalColumns) {
            const { year, month } = dataAnalysis.temporalColumns;
            
            if (year && month) {
                console.log('[CHART-INTELLIGENT] Criando coluna AnoMes');
                processedResults = results.map(row => ({
                    ...row,
                    AnoMes: `${row[year]}-${String(row[month]).padStart(2, '0')}`
                }));
                
                // Atualizar xColumn na config do gráfico
                if (intelligentResponse.chartConfig.xColumn === month || 
                    intelligentResponse.chartConfig.xColumn === year) {
                    intelligentResponse.chartConfig.xColumn = 'AnoMes';
                }
            } else if (month && !year && yearFromSQL) {
                console.log('[CHART-INTELLIGENT] Criando coluna MesFormatado');
                const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
                const yearShort = String(yearFromSQL).slice(-2);
                
                processedResults = results.map(row => ({
                    ...row,
                    MesFormatado: `${monthNames[parseInt(row[month]) - 1]}-${yearShort}`
                }));
                
                if (intelligentResponse.chartConfig.xColumn === month) {
                    intelligentResponse.chartConfig.xColumn = 'MesFormatado';
                }
            }
        }
        
        // Aplicar pivot se necessário
        if (dataAnalysis.needsPivot && dataAnalysis.categoricalColumn) {
            console.log('[CHART-INTELLIGENT] Aplicando pivot conforme análise do Copilot');
            console.log('[CHART-INTELLIGENT] Categorias para pivot:', dataAnalysis.uniqueCategories);
            
            const categoryCol = dataAnalysis.categoricalColumn;
            const valueCol = dataAnalysis.valueColumns[0];
            let dateKey = intelligentResponse.chartConfig.xColumn;
            
            // Se xColumn ainda é mes/ano, usar temporalColumns
            if (dateKey === dataAnalysis.temporalColumns.month || dateKey === dataAnalysis.temporalColumns.year) {
                dateKey = 'AnoMes'; // Usar a coluna temporal criada
            }
            
            const grouped = {};
            
            processedResults.forEach(row => {
                const date = row[dateKey];
                if (!grouped[date]) {
                    grouped[date] = { [dateKey]: date };
                    // Preservar colunas temporais originais
                    if (dataAnalysis.temporalColumns.year) {
                        grouped[date][dataAnalysis.temporalColumns.year] = row[dataAnalysis.temporalColumns.year];
                    }
                    if (dataAnalysis.temporalColumns.month) {
                        grouped[date][dataAnalysis.temporalColumns.month] = row[dataAnalysis.temporalColumns.month];
                    }
                }
                
                const safeName = row[categoryCol].replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                grouped[date][safeName] = parseFloat(row[valueCol]) || 0;
            });
            
            processedResults = Object.values(grouped);
            
            // ATUALIZAR xColumn e yColumn do chartConfig
            intelligentResponse.chartConfig.xColumn = dateKey;
            
            // yColumn deve ser array com os nomes das colunas pivotadas
            const pivotedColumns = [...new Set(results.map(r => 
                r[categoryCol].replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
            ))];
            intelligentResponse.chartConfig.yColumn = pivotedColumns;
            
            console.log('[CHART-INTELLIGENT] Pivot concluído:', {
                dateKey,
                pivotedColumns,
                primeiraLinha: processedResults[0]
            });
        }
        
        // Ordenar por data se temporal
        if (dataAnalysis.hasTemporalData) {
            const { year, month } = dataAnalysis.temporalColumns;
            const xCol = intelligentResponse.chartConfig.xColumn;
            
            processedResults.sort((a, b) => {
                if (xCol === 'AnoMes' || xCol === 'MesFormatado') {
                    return a[xCol].localeCompare(b[xCol]);
                } else if (year && month) {
                    if (a[year] !== b[year]) return a[year] - b[year];
                    return a[month] - b[month];
                } else if (year) {
                    return a[year] - b[year];
                }
                return 0;
            });
            console.log('[CHART-INTELLIGENT] Dados ordenados temporalmente');
        }

        // Validação final
        const chartConfig = intelligentResponse.chartConfig;
        
        if (!chartConfig.suitable) {
            return res.json({
                suitable: false,
                reasoning: chartConfig.reasoning || 'Dados não adequados para visualização'
            });
        }

        const isMultiSeries = Array.isArray(chartConfig.yColumn) && chartConfig.yColumn.length >= 2;

        const chartData = {
            suitable: true,
            type: chartConfig.chartType,
            title: chartConfig.title,
            xColumn: chartConfig.xColumn,
            yColumn: chartConfig.yColumn,
            reasoning: chartConfig.reasoning,
            showVariation: chartConfig.showVariation || false,
            isMultiSeries: isMultiSeries,
            data: processedResults
        };

        console.log('[CHART-INTELLIGENT] ✅ Gráfico configurado:', {
            type: chartData.type,
            xColumn: chartData.xColumn,
            yColumn: chartData.yColumn,
            isMultiSeries: chartData.isMultiSeries,
            dataPoints: processedResults.length
        });
        
        return res.json(chartData);
        
    } catch (err) {
        console.error('[CHART-INTELLIGENT] Erro:', err);
        return res.status(500).json({ 
            error: 'Erro ao processar',
            details: err.message,
            stage: 'internal_error'
        });
    }
});

app.post('/api/chat/copilot-chart', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, sqlQuery, results } = req.body;
        
        if (!results || results.length === 0) {
            return res.status(400).json({ 
                error: 'Sem dados para visualização',
                stage: 'validation' 
            });
        }

        if (!DIRECT_LINE_SECRET) {
            return res.status(500).json({ 
                error: 'Direct Line não configurado',
                stage: 'configuration' 
            });
        }

        const columns = Object.keys(results[0]);
        const sampleData = results.slice(0, 50);
        
        const chartPrompt = `Você é um especialista em Chart.js. Analise os dados e gere código Chart.js COMPLETO e FUNCIONAL.

CONTEXTO:
Pergunta: ${userQuery}
SQL: ${sqlQuery}

ESTRUTURA:
Colunas: ${columns.join(', ')}
Registros: ${results.length}

AMOSTRA (${sampleData.length} linhas):
${JSON.stringify(sampleData, null, 2)}

TAREFA:
Gere código JavaScript EXECUTÁVEL que crie um gráfico Chart.js. O código será executado em sandbox com acesso a:
- Chart (Chart.js v4)
- ctx (canvas context)
- canvas (elemento canvas)

REQUISITOS OBRIGATÓRIOS:
1. Escolha o tipo mais adequado: line, bar, pie, doughnut
2. Para séries temporais: ordene por data/período
3. Detecte colunas temporais (ano, mes, data) e categóricas
4. Para múltiplas séries: crie datasets separados
5. Adicione plugins personalizados se útil (min/max em linhas, variações em barras)
6. Use cores gradientes profissionais
7. Configure tooltips informativos
8. Adicione título descritivo

FORMATO DE SAÍDA:
Retorne APENAS código JavaScript válido que instancia Chart. Exemplo:

new Chart(ctx, {
    type: 'line',
    data: {
        labels: [/* extrair dos dados */],
        datasets: [{
            label: 'Série 1',
            data: [/* valores */],
            borderColor: 'rgb(102, 126, 234)',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        plugins: {
            title: {
                display: true,
                text: 'Título Descritivo'
            },
            legend: {
                display: true
            }
        },
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

IMPORTANTE:
- NÃO use markdown ou backticks
- NÃO adicione comentários
- Código deve ser executável diretamente
- Use apenas dados fornecidos em "AMOSTRA"
- Retorne APENAS o código JavaScript`;

        console.log('[COPILOT-CHART] Solicitando código ao Copilot...');

        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        
        if (!convResp.ok) {
            return res.status(502).json({ 
                error: 'Falha ao conectar',
                stage: 'conversation_start' 
            });
        }
        
        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: chartPrompt };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activity)
        });
        
        if (!postResp.ok) {
            return res.status(502).json({ 
                error: 'Falha ao enviar',
                stage: 'message_send' 
            });
        }

        let watermark;
        let replyText = '';
        
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            
            if (!actResp.ok) {
                return res.status(502).json({ 
                    error: 'Falha polling',
                    stage: 'response_polling' 
                });
            }
            
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => 
                a.type === 'message' && a.from && a.from.id && a.from.id !== 'user'
            );
            const last = activities.length ? activities[activities.length - 1] : null;
            
            if (last && last.text) {
                replyText = last.text;
                break;
            }
            
            await sleep(1000);
        }

        if (!replyText) {
            return res.status(504).json({ 
                error: 'Timeout',
                stage: 'timeout' 
            });
        }

        // Limpar resposta
        let chartCode = replyText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/```javascript\n?/gi, '')
            .replace(/```js\n?/gi, '')
            .replace(/```\n?/gi, '')
            .trim();

        // Validação básica
        if (!chartCode.includes('new Chart')) {
            console.error('[COPILOT-CHART] Código inválido:', chartCode.substring(0, 200));
            return res.status(400).json({
                error: 'Código Chart.js inválido gerado',
                details: chartCode.substring(0, 300),
                stage: 'validation'
            });
        }

        console.log('[COPILOT-CHART] ✅ Código gerado:', chartCode.substring(0, 200) + '...');
        
        return res.json({ 
            chartCode: chartCode,
            conversationId: conversationId
        });
        
    } catch (err) {
        console.error('[COPILOT-CHART] Erro:', err);
        return res.status(500).json({ 
            error: 'Erro interno',
            details: err.message,
            stage: 'internal_error'
        });
    }
});

app.post('/api/chat/query', optionalAuthenticate, async (req, res) => {
    try {
        const { query } = req.body || {};
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ message: 'Query SQL é obrigatória', error: 'Query SQL é obrigatória' });
        }

        const normalized = query.trim().toUpperCase();
        const dangerous = ['INSERT','UPDATE','DELETE','DROP','CREATE','ALTER','TRUNCATE','EXEC','EXECUTE','MERGE','BULK'];
        for (const kw of dangerous) {
            if (normalized.includes(kw)) {
                return res.status(403).json({
                    message: `Operação não permitida: ${kw}. Apenas consultas SELECT são permitidas.`,
                    error: 'Operação não permitida'
                });
            }
        }
        // Aceitar SELECT ou CTEs (WITH)
        if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
            return res.status(403).json({ message: 'Apenas consultas SELECT ou CTEs são permitidas.', error: 'Apenas SELECT/CTE' });
        }

        if (!pool || !pool.connected) {
            return res.status(503).json({ message: 'Banco de dados indisponível', error: 'DB indisponível' });
        }

        const request = pool.request();
        request.timeout = 90000; // 90 segundos
        console.log('[CHATBOT QUERY] Timeout configurado:', request.timeout);

        const start = Date.now();
        let result;
        try {
            result = await request.query(query);
        } catch (err) {
            if (err && err.code === 'ETIMEOUT') {
                // Attempt to cancel the request if possible
                try { await request.cancel(); } catch (_) {}
                return res.status(408).json({
                    message: 'A consulta demorou muito para executar. Tente uma consulta mais simples.',
                    error: err.message,
                    sql: req.body?.query,
                    timestamp: new Date().toISOString()
                });
            }
            throw err;
        }
        const ms = Date.now() - start;

        if (req.user) {
            try {
                await pool.request()
                    .input('userId', sql.Int, req.user.id)
                    .input('action', sql.NVarChar, 'CHATBOT_QUERY')
                    .input('details', sql.NVarChar, query.substring(0, 500))
                    .query(`
                        INSERT INTO AccessLogs (UserId, Action, AccessTime, Details)
                        VALUES (@userId, @action, GETDATE(), @details)
                    `);
            } catch (_) { /* ignore */ }
        }

        return res.json({
            success: true,
            results: result.recordset || [],
            rowCount: (result.recordset || []).length,
            executionTime: ms
        });
    } catch (err) {
        // Log query and error for debugging
        console.error('[CHATBOT QUERY ERROR]');
        console.error('Query:', req.body?.query);
        console.error('Error:', err && err.message ? err.message : err);

        const msg = err && err.message ? err.message : String(err);
        let userMsg = 'Erro ao executar consulta';
        if (/Invalid object name/i.test(msg)) userMsg = 'Tabela não encontrada. Verifique o nome da tabela.';
        else if (/Invalid column name/i.test(msg)) userMsg = 'Coluna não encontrada. Verifique o nome da coluna.';
        else if (/timeout/i.test(msg)) userMsg = 'A consulta demorou muito para executar. Tente uma consulta mais simples.';
        else if (/Incorrect syntax/i.test(msg)) userMsg = 'Erro de sintaxe SQL. A query gerada está malformada.';

        // Return full error message for easier debugging
        return res.status(400).json({
            message: userMsg,
            error: msg,
            sql: req.body?.query,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/chat/dictionary', optionalAuthenticate, async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT 
                t.TABLE_NAME as tableName,
                c.COLUMN_NAME as columnName,
                c.DATA_TYPE as dataType,
                c.CHARACTER_MAXIMUM_LENGTH as maxLength,
                c.IS_NULLABLE as isNullable
            FROM INFORMATION_SCHEMA.TABLES t
            JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
            WHERE t.TABLE_TYPE = 'BASE TABLE'
                AND t.TABLE_SCHEMA = 'dbo'
                AND t.TABLE_NAME NOT LIKE 'sys%'
            ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
        `);
        
        const dictionary = {};
        result.recordset.forEach(row => {
            if (!dictionary[row.tableName]) {
                dictionary[row.tableName] = {
                    name: row.tableName,
                    columns: []
                };
            }
            dictionary[row.tableName].columns.push({
                name: row.columnName,
                type: row.dataType,
                maxLength: row.maxLength,
                nullable: row.isNullable === 'YES'
            });
        });
        
        res.json({ 
            success: true,
            dictionary: Object.values(dictionary)
        });
        
    } catch (err) {
        console.error('Erro ao buscar dicionário de dados:', err);
        res.status(500).json({ error: 'Erro ao buscar estrutura do banco de dados' });
    }
});

// ROTAS DE DICIONÁRIOS DE DADOS (Data Dictionaries)

app.get('/api/data-dictionaries', optionalAuthenticate, async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT 
                d.Id, d.Name, d.Description, d.IsDefault, d.IsActive,
                (SELECT COUNT(*) FROM DataDictionaryTables t WHERE t.DictionaryId = d.Id AND ISNULL(t.IsActive,1) = 1) AS TableCount
            FROM DataDictionaries d
            WHERE ISNULL(d.IsActive,1) = 1
            ORDER BY d.IsDefault DESC, d.Name
        `);
        const list = result.recordset.map(r => ({
            id: r.Id,
            name: r.Name,
            description: r.Description,
            isDefault: !!r.IsDefault,
            isActive: !!r.IsActive,
            tableCount: r.TableCount | 0
        }));
        res.json(list);
    } catch (err) {
        console.error('[DICT] list error:', err);
        res.status(500).json({ error: 'Erro ao listar dicionários' });
    }
});

// ⚠️ ROTA CRÍTICA: Buscar dicionário ativo (usado pelo chatbot)
app.get('/api/data-dictionaries/active', async (req, res) => {
    try {
        const dictResult = await pool.request().query(`
            SELECT TOP 1 
                d.Id as id,
                d.Name as name,
                d.Description as description
            FROM DataDictionaries d
            WHERE d.IsActive = 1 AND d.IsDefault = 1
            ORDER BY d.Id DESC
        `);
        
        if (dictResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Nenhum dicionário ativo encontrado' });
        }
        
        const dictionary = dictResult.recordset[0];
        
        const tablesResult = await pool.request()
            .input('dictionaryId', sql.Int, dictionary.id)
            .query(`
                SELECT 
                    dt.Id as id,
                    dt.Name as name,
                    dt.Description as description,
                    dt.[Order] as [order]
                FROM DataDictionaryTables dt
                WHERE dt.DictionaryId = @dictionaryId AND dt.IsActive = 1
                ORDER BY dt.[Order] ASC, dt.Name ASC
            `);
        
        for (let table of tablesResult.recordset) {
            const columnsResult = await pool.request()
                .input('tableId', sql.Int, table.id)
                .query(`
                    SELECT 
                        dc.Id as id,
                        dc.Name as name,
                        dc.Type as type,
                        dc.Description as description,
                        dc.[Order] as [order]
                    FROM DataDictionaryColumns dc
                    WHERE dc.TableId = @tableId AND dc.IsActive = 1
                    ORDER BY dc.[Order] ASC, dc.Name ASC
                `);            
            table.columns = columnsResult.recordset;
        }
        
        dictionary.tables = tablesResult.recordset;
        
        res.json(dictionary);
        
    } catch (error) {
        console.error('Erro ao buscar dicionário ativo:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.get('/api/data-dictionaries/:id', optionalAuthenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT TOP 1 Id, Name, Description, IsDefault, IsActive FROM DataDictionaries WHERE Id = @id`);
        if (!result.recordset.length) return res.status(404).json({ error: 'Dicionário não encontrado' });
        const d = result.recordset[0];
        res.json({
            id: d.Id,
            name: d.Name,
            description: d.Description,
            isDefault: !!d.IsDefault,
            isActive: !!d.IsActive
        });
    } catch (err) {
        console.error('[DICT] get error:', err);
        res.status(500).json({ error: 'Erro ao obter dicionário' });
    }
});

app.get('/api/data-dictionaries/:id/full', optionalAuthenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const dRes = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT TOP 1 Id, Name, Description, IsDefault, IsActive FROM DataDictionaries WHERE Id = @id`);
        if (!dRes.recordset.length) return res.status(404).json({ error: 'Dicionário não encontrado' });

        const tRes = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT Id, DictionaryId, Name, Description, [Order]
                FROM DataDictionaryTables
                WHERE DictionaryId = @id AND IsActive = 1
                ORDER BY [Order] ASC, Name
            `);
        const tableIds = tRes.recordset.map(t => t.Id);
        let cRes = { recordset: [] };
        if (tableIds.length) {
            const reqCols = pool.request();
            tableIds.forEach((tid, i) => reqCols.input('t' + i, sql.Int, tid));
            const inList = tableIds.map((_, i) => '@t' + i).join(',');
            cRes = await reqCols.query(`
                SELECT Id, TableId, Name, Type, Description, [Order]
                FROM DataDictionaryColumns
                WHERE TableId IN (${inList}) AND IsActive = 1
                ORDER BY TableId, [Order] ASC, Id
            `);
        }

        const tables = tRes.recordset.map(t => ({
            id: t.Id,
            dictionaryId: t.DictionaryId,
            name: t.Name,
            description: t.Description,
            order: t.Order,
            columns: []
        }));
        const map = new Map(tables.map(t => [t.id, t]));
        cRes.recordset.forEach(c => {
            const tbl = map.get(c.TableId);
            if (tbl) {
                tbl.columns.push({
                    id: c.Id,
                    tableId: c.TableId,
                    name: c.Name,
                    type: c.Type,
                    description: c.Description,
                    order: c.Order
                });
            }
        });

        const d = dRes.recordset[0];
        res.json({
            id: d.Id,
            name: d.Name,
            description: d.Description,
            isDefault: !!d.IsDefault,
            isActive: !!d.IsActive,
            tables
        });
    } catch (err) {
        console.error('[DICT] full error:', err);
        res.status(500).json({ error: 'Erro ao obter dicionário completo' });
    }
});

app.post('/api/data-dictionaries', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const { name, description, isDefault } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Nome é obrigatório' });

        // Se for default, limpar os demais
        if (isDefault) {
            await pool.request().query(`UPDATE DataDictionaries SET IsDefault = 0 WHERE IsDefault = 1`);
        }

        const result = await pool.request()
            .input('name', sql.NVarChar(200), String(name).trim())
            .input('description', sql.NVarChar(sql.MAX), description || null)
            .input('isDefault', sql.Bit, isDefault ? 1 : 0)
            .query(`
                INSERT INTO DataDictionaries (Name, Description, IsDefault, IsActive, CreatedAt)
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Description, INSERTED.IsDefault, INSERTED.IsActive
                VALUES (@name, @description, @isDefault, 1, GETDATE())
            `);
        const d = result.recordset[0];
        res.status(201).json({
            id: d.Id,
            name: d.Name,
            description: d.Description,
            isDefault: !!d.IsDefault,
            isActive: !!d.IsActive
        });
    } catch (err) {
        console.error('[DICT] create error:', err);
        res.status(500).json({ error: 'Erro ao criar dicionário' });
    }
});

app.put('/api/data-dictionaries/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const id = parseInt(req.params.id);
        const { name, description, isDefault, isActive } = req.body || {};

        if (isDefault) {
            await pool.request().query(`UPDATE DataDictionaries SET IsDefault = 0 WHERE IsDefault = 1 AND Id <> ${id}`);
        }

        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar(200), name || null)
            .input('description', sql.NVarChar(sql.MAX), description || null)
            .input('isDefault', sql.Bit, isDefault ? 1 : 0)
            .input('isActive', sql.Bit, typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null)
            .query(`
                UPDATE DataDictionaries
                SET 
                    Name = COALESCE(@name, Name),
                    Description = @description,
                    IsDefault = @isDefault,
                    IsActive = COALESCE(@isActive, IsActive),
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id
            `);
        if (!result.recordset.length) return res.status(404).json({ error: 'Dicionário não encontrado' });
        const d = result.recordset[0];
        res.json({
            id: d.Id,
            name: d.Name,
            description: d.Description,
            isDefault: !!d.IsDefault,
            isActive: !!d.IsActive
        });
    } catch (err) {
        console.error('[DICT] update error:', err);
        res.status(500).json({ error: 'Erro ao atualizar dicionário' });
    }
});

app.delete('/api/data-dictionaries/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const id = parseInt(req.params.id);
        // Soft delete
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE DataDictionaries SET IsActive = 0, UpdatedAt = GETDATE() WHERE Id = @id`);
        if (!result.rowsAffected || !result.rowsAffected[0]) return res.status(404).json({ error: 'Dicionário não encontrado' });
        res.json({ success: true });
    } catch (err) {
        console.error('[DICT] delete error:', err);
        res.status(500).json({ error: 'Erro ao excluir dicionário' });
    }
});

app.put('/api/data-dictionaries/:id/set-default', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const id = parseInt(req.params.id);
        await pool.request().query(`UPDATE DataDictionaries SET IsDefault = 0 WHERE IsDefault = 1`);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE DataDictionaries SET IsDefault = 1, IsActive = 1, UpdatedAt = GETDATE() OUTPUT INSERTED.* WHERE Id = @id`);
        if (!result.recordset.length) return res.status(404).json({ error: 'Dicionário não encontrado' });
        res.json({ success: true });
    } catch (err) {
        console.error('[DICT] set-default error:', err);
        res.status(500).json({ error: 'Erro ao definir padrão' });
    }
});

app.put('/api/data-dictionaries/:id/toggle-status', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const id = parseInt(req.params.id);
        const cur = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT TOP 1 IsActive, IsDefault FROM DataDictionaries WHERE Id = @id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Dicionário não encontrado' });
        const isActive = !!cur.recordset[0].IsActive;
        const isDefault = !!cur.recordset[0].IsDefault;
        if (isDefault && isActive) {
            return res.status(400).json({ error: 'Não é possível desativar o dicionário padrão' });
        }
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE DataDictionaries SET IsActive = CASE WHEN IsActive=1 THEN 0 ELSE 1 END, UpdatedAt = GETDATE() OUTPUT INSERTED.* WHERE Id = @id`);
        res.json({ success: true, isActive: !!result.recordset[0].IsActive });
    } catch (err) {
        console.error('[DICT] toggle error:', err);
        res.status(500).json({ error: 'Erro ao alternar status' });
    }
});

// Tabelas do dicionário
app.post('/api/data-dictionaries/:dictId/tables', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const dictId = parseInt(req.params.dictId);
        const { name, description } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'Nome da tabela é obrigatório' });
        
        // Calcular próxima ordem
        const orderResult = await pool.request()
            .input('dictId', sql.Int, dictId)
            .query('SELECT ISNULL(MAX([Order]), 0) + 10 AS NextOrder FROM DataDictionaryTables WHERE DictionaryId = @dictId');
        const nextOrder = orderResult.recordset[0].NextOrder;
        
        const result = await pool.request()
            .input('dictId', sql.Int, dictId)
            .input('name', sql.NVarChar(200), String(name).trim())
            .input('description', sql.NVarChar(sql.MAX), description || null)
            .input('order', sql.Int, nextOrder)
            .query(`
                INSERT INTO DataDictionaryTables (DictionaryId, Name, Description, [Order], IsActive, CreatedAt)
                OUTPUT INSERTED.*
                VALUES (@dictId, @name, @description, @order, 1, GETDATE())
            `);
        const t = result.recordset[0];
        res.status(201).json({ id: t.Id, dictionaryId: t.DictionaryId, name: t.Name, description: t.Description, order: t.Order });
    } catch (err) {
        console.error('[DICT] create table error:', err);
        res.status(500).json({ error: 'Erro ao criar tabela' });
    }
});

app.put('/api/data-dictionaries/:dictId/tables/:tableId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const dictId = parseInt(req.params.dictId);
        const tableId = parseInt(req.params.tableId);
        const { name, description } = req.body || {};
        const result = await pool.request()
            .input('dictId', sql.Int, dictId)
            .input('tableId', sql.Int, tableId)
            .input('name', sql.NVarChar(200), name || null)
            .input('description', sql.NVarChar(sql.MAX), description || null)
            .query(`
                UPDATE DataDictionaryTables
                SET Name = COALESCE(@name, Name),
                    Description = @description,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @tableId AND DictionaryId = @dictId
            `);
        if (!result.recordset.length) return res.status(404).json({ error: 'Tabela não encontrada' });
        const t = result.recordset[0];
        res.json({ id: t.Id, dictionaryId: t.DictionaryId, name: t.Name, description: t.Description, order: t.Order });
    } catch (err) {
        console.error('[DICT] update table error:', err);
        res.status(500).json({ error: 'Erro ao atualizar tabela' });
    }
});

app.delete('/api/data-dictionaries/:dictId/tables/:tableId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const dictId = parseInt(req.params.dictId);
        const tableId = parseInt(req.params.tableId);
        
        // Soft delete da tabela e suas colunas
        await pool.request()
            .input('tableId', sql.Int, tableId)
            .query(`
                UPDATE DataDictionaryTables SET IsActive = 0, UpdatedAt = GETDATE() WHERE Id = @tableId;
                UPDATE DataDictionaryColumns SET IsActive = 0, UpdatedAt = GETDATE() WHERE TableId = @tableId;
            `);
        res.json({ success: true });
    } catch (err) {
        console.error('[DICT] delete table error:', err);
        res.status(500).json({ error: 'Erro ao excluir tabela' });
    }
});

// Colunas da tabela
app.post('/api/data-dictionaries/:dictId/tables/:tableId/columns', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const tableId = parseInt(req.params.tableId);
        const { name, type, description } = req.body || {};
        if (!name || !type) return res.status(400).json({ message: 'Nome e Tipo são obrigatórios' });
        
        // Calcular próxima ordem
        const orderResult = await pool.request()
            .input('tableId', sql.Int, tableId)
            .query('SELECT ISNULL(MAX([Order]), 0) + 10 AS NextOrder FROM DataDictionaryColumns WHERE TableId = @tableId');
        const nextOrder = orderResult.recordset[0].NextOrder;
        
        const result = await pool.request()
            .input('tableId', sql.Int, tableId)
            .input('name', sql.NVarChar(200), String(name).trim())
            .input('type', sql.NVarChar(100), String(type).trim())
            .input('description', sql.NVarChar(sql.MAX), description || null)
            .input('order', sql.Int, nextOrder)
            .query(`
                INSERT INTO DataDictionaryColumns (TableId, Name, Type, Description, [Order], IsActive, CreatedAt)
                OUTPUT INSERTED.*
                VALUES (@tableId, @name, @type, @description, @order, 1, GETDATE())
            `);
        const c = result.recordset[0];
        res.status(201).json({ id: c.Id, tableId: c.TableId, name: c.Name, type: c.Type, description: c.Description, order: c.Order });
    } catch (err) {
        console.error('[DICT] create column error:', err);
        res.status(500).json({ error: 'Erro ao criar coluna' });
    }
});

app.put('/api/data-dictionaries/:dictId/tables/:tableId/columns/:columnId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const tableId = parseInt(req.params.tableId);
        const columnId = parseInt(req.params.columnId);
        const { name, type, description } = req.body || {};
        const result = await pool.request()
            .input('tableId', sql.Int, tableId)
            .input('columnId', sql.Int, columnId)
            .input('name', sql.NVarChar(200), name || null)
            .input('type', sql.NVarChar(100), type || null)
            .input('description', sql.NVarChar(sql.MAX), description || null)
            .query(`
                UPDATE DataDictionaryColumns
                SET 
                    Name = COALESCE(@name, Name),
                    Type = COALESCE(@type, Type),
                    Description = @description,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @columnId AND TableId = @tableId
            `);
        if (!result.recordset.length) return res.status(404).json({ error: 'Coluna não encontrada' });
        const c = result.recordset[0];
        res.json({ id: c.Id, tableId: c.TableId, name: c.Name, type: c.Type, description: c.Description, order: c.Order });
    } catch (err) {
        console.error('[DICT] update column error:', err);
        res.status(500).json({ error: 'Erro ao atualizar coluna' });
    }
});

app.delete('/api/data-dictionaries/:dictId/tables/:tableId/columns/:columnId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const tableId = parseInt(req.params.tableId);
        const columnId = parseInt(req.params.columnId);
        const result = await pool.request()
            .input('tableId', sql.Int, tableId)
            .input('columnId', sql.Int, columnId)
            .query(`UPDATE DataDictionaryColumns SET IsActive = 0, UpdatedAt = GETDATE() WHERE Id = @columnId AND TableId = @tableId`);
        if (!result.rowsAffected || !result.rowsAffected[0]) return res.status(404).json({ error: 'Coluna não encontrada' });
        res.json({ success: true });
    } catch (err) {
        console.error('[DICT] delete column error:', err);
        res.status(500).json({ error: 'Erro ao excluir coluna' });
    }
});

// ROTAS DE TUTORIAIS

// Listar todos os tutoriais
app.get('/api/tutorials', optionalAuthenticate, async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT Id, PageId, Steps, IsActive, CreatedAt, UpdatedAt
            FROM Tutorials
            WHERE IsActive = 1
            ORDER BY PageId, CreatedAt DESC
        `);
        
        const tutorials = result.recordset.map(t => ({
            id: t.Id,
            pageId: t.PageId,
            steps: t.Steps ? JSON.parse(t.Steps) : [],
            isActive: !!t.IsActive,
            createdAt: t.CreatedAt,
            updatedAt: t.UpdatedAt
        }));
        
        res.json(tutorials);
    } catch (err) {
        console.error('[TUTORIALS] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro ao listar tutoriais' });
    }
});

// Buscar tutorial por ID da página
app.get('/api/tutorials/page/:pageId', optionalAuthenticate, async (req, res) => {
    try {
        const pageId = parseInt(req.params.pageId);
        
        const result = await pool.request()
            .input('pageId', sql.Int, pageId)
            .query(`
                SELECT TOP 1 Id, PageId, Steps, IsActive, CreatedAt, UpdatedAt
                FROM Tutorials
                WHERE PageId = @pageId AND IsActive = 1
                ORDER BY UpdatedAt DESC
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Tutorial não encontrado' });
        }
        
        const tutorial = result.recordset[0];
        res.json({
            id: tutorial.Id,
            pageId: tutorial.PageId,
            steps: tutorial.Steps ? JSON.parse(tutorial.Steps) : [],
            isActive: !!tutorial.IsActive,
            createdAt: tutorial.CreatedAt,
            updatedAt: tutorial.UpdatedAt
        });
        
    } catch (err) {
        console.error('[TUTORIALS] Erro ao buscar por página:', err);
        res.status(500).json({ error: 'Erro ao buscar tutorial' });
    }
});

// Buscar tutorial por ID
app.get('/api/tutorials/:id', optionalAuthenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT Id, PageId, Steps, IsActive, CreatedAt, UpdatedAt
                FROM Tutorials
                WHERE Id = @id AND IsActive = 1
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Tutorial não encontrado' });
        }
        
        const tutorial = result.recordset[0];
        res.json({
            id: tutorial.Id,
            pageId: tutorial.PageId,
            steps: tutorial.Steps ? JSON.parse(tutorial.Steps) : [],
            isActive: !!tutorial.IsActive,
            createdAt: tutorial.CreatedAt,
            updatedAt: tutorial.UpdatedAt
        });
        
    } catch (err) {
        console.error('[TUTORIALS] Erro ao buscar:', err);
        res.status(500).json({ error: 'Erro ao buscar tutorial' });
    }
});

// Criar ou atualizar tutorial
app.post('/api/tutorials', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const { pageId, steps } = req.body;
        
        console.log('[TUTORIALS] Recebendo requisição:', { pageId, stepsCount: steps?.length });
        
        if (!pageId || !steps || !Array.isArray(steps)) {
            return res.status(400).json({ 
                error: 'Dados inválidos', 
                details: 'pageId e steps são obrigatórios' 
            });
        }
        
        if (steps.length === 0) {
            return res.status(400).json({ 
                error: 'Tutorial vazio', 
                details: 'Adicione pelo menos um passo' 
            });
        }
        
        // Serializar steps para JSON
        const stepsJson = JSON.stringify(steps);
        
        // Verificar se já existe tutorial para esta página
        const existing = await pool.request()
            .input('pageId', sql.Int, pageId)
            .query(`
                SELECT TOP 1 Id 
                FROM Tutorials 
                WHERE PageId = @pageId AND IsActive = 1
            `);
        
        let result;
        
        if (existing.recordset.length > 0) {
            // Atualizar tutorial existente
            const tutorialId = existing.recordset[0].Id;
            console.log('[TUTORIALS] Atualizando tutorial existente:', tutorialId);
            
            result = await pool.request()
                .input('id', sql.Int, tutorialId)
                .input('steps', sql.NVarChar(sql.MAX), stepsJson)
                .query(`
                    UPDATE Tutorials
                    SET Steps = @steps,
                        UpdatedAt = GETDATE()
                    OUTPUT INSERTED.*
                    WHERE Id = @id
                `);
        } else {
            // Criar novo tutorial
            console.log('[TUTORIALS] Criando novo tutorial');
            
            result = await pool.request()
                .input('pageId', sql.Int, pageId)
                .input('steps', sql.NVarChar(sql.MAX), stepsJson)
                .query(`
                    INSERT INTO Tutorials (PageId, Steps, IsActive, CreatedAt, UpdatedAt)
                    OUTPUT INSERTED.*
                    VALUES (@pageId, @steps, 1, GETDATE(), GETDATE())
                `);
        }
        
        const tutorial = result.recordset[0];
        
        console.log('[TUTORIALS] ✅ Tutorial salvo com sucesso:', tutorial.Id);
        
        res.status(201).json({
            id: tutorial.Id,
            pageId: tutorial.PageId,
            steps: JSON.parse(tutorial.Steps),
            isActive: !!tutorial.IsActive,
            createdAt: tutorial.CreatedAt,
            updatedAt: tutorial.UpdatedAt
        });
        
    } catch (err) {
        console.error('[TUTORIALS] Erro ao salvar:', err);
        res.status(500).json({ 
            error: 'Erro ao salvar tutorial',
            details: err.message 
        });
    }
});

// Atualizar tutorial
app.put('/api/tutorials/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const id = parseInt(req.params.id);
        const { steps } = req.body;
        
        if (!steps || !Array.isArray(steps)) {
            return res.status(400).json({ 
                error: 'Dados inválidos',
                details: 'steps é obrigatório e deve ser um array' 
            });
        }
        
        const stepsJson = JSON.stringify(steps);
        
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('steps', sql.NVarChar(sql.MAX), stepsJson)
            .query(`
                UPDATE Tutorials
                SET Steps = @steps,
                    UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND IsActive = 1
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Tutorial não encontrado' });
        }
        
        const tutorial = result.recordset[0];
        
        res.json({
            id: tutorial.Id,
            pageId: tutorial.PageId,
            steps: JSON.parse(tutorial.Steps),
            isActive: !!tutorial.IsActive,
            createdAt: tutorial.CreatedAt,
            updatedAt: tutorial.UpdatedAt
        });
        
    } catch (err) {
        console.error('[TUTORIALS] Erro ao atualizar:', err);
        res.status(500).json({ error: 'Erro ao atualizar tutorial' });
    }
});

// Deletar tutorial por pageId
app.delete('/api/tutorials/page/:pageId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const pageId = parseInt(req.params.pageId);
        
        console.log('[TUTORIALS] Deletando tutorial da página:', pageId);
        
        const result = await pool.request()
            .input('pageId', sql.Int, pageId)
            .query(`
                UPDATE Tutorials
                SET IsActive = 0,
                    UpdatedAt = GETDATE()
                WHERE PageId = @pageId AND IsActive = 1
            `);
        
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            console.log('[TUTORIALS] Nenhum tutorial encontrado para deletar');
            return res.status(404).json({ error: 'Tutorial não encontrado' });
        }
        
        console.log('[TUTORIALS] ✅ Tutorial deletado com sucesso');
        res.json({ success: true, message: 'Tutorial excluído com sucesso' });
        
    } catch (err) {
        console.error('[TUTORIALS] Erro ao excluir por pageId:', err);
        res.status(500).json({ error: 'Erro ao excluir tutorial' });
    }
});

// Deletar tutorial (soft delete)
app.delete('/api/tutorials/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const id = parseInt(req.params.id);
        
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                UPDATE Tutorials
                SET IsActive = 0,
                    UpdatedAt = GETDATE()
                WHERE Id = @id
            `);
        
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Tutorial não encontrado' });
        }
        
        res.json({ success: true, message: 'Tutorial excluído com sucesso' });
        
    } catch (err) {
        console.error('[TUTORIALS] Erro ao excluir:', err);
        res.status(500).json({ error: 'Erro ao excluir tutorial' });
    }
});

// ============================================================================
// /fatura — OCR de faturas em PDF via OpenAI Responses API
// ============================================================================

// Upload em memoria — o PDF nao precisa ser persistido em disco; so o JSON
// extraido + resposta bruta vao para o banco.
const uploadFaturaPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const okMime = (file.mimetype || '').toLowerCase() === 'application/pdf';
        if (ext === '.pdf' || okMime) return cb(null, true);
        cb(new Error('Apenas PDF e aceito'));
    }
});

// Cliente OpenAI lazy: nao instancia na inicializacao para que a falta de
// OPENAI_API_KEY nao quebre o boot do portal inteiro.
let _openaiClient = null;
function getOpenAIClient() {
    if (_openaiClient) return _openaiClient;
    if (!process.env.OPENAI_API_KEY) {
        const err = new Error('OPENAI_API_KEY nao configurada no .env');
        err.statusCode = 500;
        throw err;
    }
    const OpenAI = require('openai');
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openaiClient;
}

const FATURA_PRIMARY_MODEL = process.env.OPENAI_MODEL_PRIMARY || 'gpt-5-mini';
const FATURA_FALLBACK_MODEL = process.env.OPENAI_MODEL_FALLBACK || 'gpt-4.1-mini';

// Schema JSON para Structured Outputs. Modo strict exige todos os campos em
// "required" e additionalProperties:false em todos os niveis.
// Cobre cabecalho/boleto + resumo + limites + encargos cobrados + encargos
// proximo periodo + totalizadores + itens (lancamentos) com portador, cartao,
// moeda original, cambio, centro de custo e categoria.
const FATURA_JSON_SCHEMA = {
    name: 'fatura_extraida',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            // Identificacao
            tipo_documento:          { type: ['string', 'null'], description: 'Ex.: fatura_cartao_credito_empresa, fatura_cartao_credito_pessoa, nota_fiscal, boleto, outro' },
            numero_fatura:           { type: ['string', 'null'], description: 'Numero do documento / da fatura' },
            numero_conta:            { type: ['string', 'null'], description: 'Numero do cartao/conta principal mascarado, se houver' },
            empresa:                 { type: ['string', 'null'], description: 'Nome da empresa titular (cartao empresarial), se aplicavel' },
            linha_digitavel:         { type: ['string', 'null'], description: 'Linha digitavel do boleto, se houver' },
            nosso_numero:            { type: ['string', 'null'] },
            agencia_beneficiario:    { type: ['string', 'null'], description: 'Ex.: 2525/04516-3' },
            carteira:                { type: ['string', 'null'] },

            // Datas
            data_emissao:            { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            data_postagem:           { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            data_vencimento:         { type: ['string', 'null'], description: 'YYYY-MM-DD' },
            data_proximo_fechamento: { type: ['string', 'null'], description: 'YYYY-MM-DD' },

            // Partes
            fornecedor_nome:         { type: ['string', 'null'], description: 'Beneficiario/emissor (banco no caso de fatura de cartao)' },
            fornecedor_cnpj:         { type: ['string', 'null'], description: 'Apenas digitos, 14 caracteres' },
            pagador_nome:            { type: ['string', 'null'] },
            pagador_cnpj:            { type: ['string', 'null'], description: 'Apenas digitos' },
            pagador_endereco:        { type: ['string', 'null'] },

            // Totais e moeda
            moeda:                   { type: ['string', 'null'], description: 'Codigo ISO, ex.: BRL' },
            valor_total:             { type: ['number', 'null'], description: 'Valor total desta fatura' },
            descricao:               { type: ['string', 'null'], description: 'Descricao livre / objeto da fatura' },

            // Resumo da fatura
            resumo: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    total_fatura_anterior:  { type: ['number', 'null'] },
                    pagamentos_efetuados:   { type: ['number', 'null'], description: 'Sempre positivo, mesmo que apareca com sinal negativo no PDF' },
                    saldo_atraso:           { type: ['number', 'null'] },
                    lancamentos_atuais:     { type: ['number', 'null'] }
                },
                required: ['total_fatura_anterior', 'pagamentos_efetuados', 'saldo_atraso', 'lancamentos_atuais']
            },

            // Limites
            limites: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    limite_total_credito:   { type: ['number', 'null'] },
                    limite_disponivel:      { type: ['number', 'null'] },
                    limite_total_utilizado: { type: ['number', 'null'] }
                },
                required: ['limite_total_credito', 'limite_disponivel', 'limite_total_utilizado']
            },

            // Encargos cobrados nesta fatura
            encargos_cobrados: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    juros_atraso_percent:        { type: ['number', 'null'] },
                    juros_atraso_valor:          { type: ['number', 'null'] },
                    juros_mora_percent_mensal:   { type: ['number', 'null'] },
                    juros_mora_valor:            { type: ['number', 'null'] },
                    multa_atraso_percent:        { type: ['number', 'null'] },
                    multa_atraso_valor:          { type: ['number', 'null'] },
                    iof_financiamento_descricao: { type: ['string', 'null'], description: 'Texto da taxa, ex.: "0,38 % + 0,00820 % a.d."' },
                    iof_financiamento_valor:     { type: ['number', 'null'] }
                },
                required: ['juros_atraso_percent', 'juros_atraso_valor', 'juros_mora_percent_mensal', 'juros_mora_valor', 'multa_atraso_percent', 'multa_atraso_valor', 'iof_financiamento_descricao', 'iof_financiamento_valor']
            },

            // Encargos do proximo periodo
            encargos_proximo_periodo: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    juros_max_proximo_mensal_percent: { type: ['number', 'null'] },
                    juros_max_proximo_anual_percent:  { type: ['number', 'null'] },
                    juros_pgto_contas_mensal_percent: { type: ['number', 'null'] }
                },
                required: ['juros_max_proximo_mensal_percent', 'juros_max_proximo_anual_percent', 'juros_pgto_contas_mensal_percent']
            },

            // Totalizadores
            totalizadores: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    total_pagamentos:                     { type: ['number', 'null'] },
                    total_lancamentos_atuais:             { type: ['number', 'null'] },
                    total_transacoes_internacionais_brl:  { type: ['number', 'null'] },
                    repasse_iof_brl:                      { type: ['number', 'null'] },
                    total_lancamentos_internacionais_brl: { type: ['number', 'null'] }
                },
                required: ['total_pagamentos', 'total_lancamentos_atuais', 'total_transacoes_internacionais_brl', 'repasse_iof_brl', 'total_lancamentos_internacionais_brl']
            },

            // Lancamentos linha-a-linha
            itens: {
                type: 'array',
                description: 'Cada lancamento individual da fatura (compras, saques, pagamentos, encargos individuais, ajustes). Nao inclua subtotais nem totais.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        tipo:                  { type: ['string', 'null'], description: 'compra_nacional | compra_internacional | saque | pagamento | encargo | ajuste | outro' },
                        data:                  { type: ['string', 'null'], description: 'YYYY-MM-DD; se a fatura mostrar so DD/MM, complete o ano usando o ano de fechamento da fatura' },
                        estabelecimento:       { type: ['string', 'null'], description: 'Texto do estabelecimento como aparece no PDF (NAO normalizar)' },
                        cidade:                { type: ['string', 'null'] },
                        categoria:             { type: ['string', 'null'], description: 'Categoria que vem no PDF abaixo do estabelecimento, ex.: "DIVERSOS"' },
                        portador_nome:         { type: ['string', 'null'], description: 'Nome do portador do cartao (cartao adicional empresarial)' },
                        portador_cartao_final: { type: ['string', 'null'], description: 'Ultimos 4 digitos do cartao do portador' },
                        centro_custo:          { type: ['string', 'null'], description: 'Centro de custo / CCS quando o PDF informar' },
                        moeda_original:        { type: ['string', 'null'], description: 'Codigo ISO, ex.: BRL, USD, EUR' },
                        valor_original:        { type: ['number', 'null'], description: 'Valor na moeda original do lancamento' },
                        taxa_cambio:           { type: ['number', 'null'], description: 'Taxa BRL por unidade da moeda original (ex.: 5.90 para USD)' },
                        valor_brl:             { type: ['number', 'null'], description: 'Valor do lancamento convertido para BRL. Pagamentos como negativos.' },
                        descricao:             { type: ['string', 'null'], description: 'Descricao livre adicional, se houver' },

                        // Normalizacao para permitir agrupamento entre faturas (mesmo
                        // fornecedor aparece com codigo diferente todo mes).
                        fornecedor_normalizado: { type: ['string', 'null'], description: 'Nome canonico do fornecedor real por tras do estabelecimento (ex.: "Microsoft", "GOL Linhas Aereas", "Zoom"). Use o nome em portugues quando aplicavel. null se nao tiver certeza.' },
                        categoria_normalizada:  { type: ['string', 'null'], description: 'Categoria tematica controlada (ver lista no prompt). null se incerto.' },
                        produto_servico:        { type: ['string', 'null'], description: 'Produto/servico especifico quando identificavel (ex.: "Microsoft 365", "Microsoft Azure", "Zoom Meetings", "Voo GOL"). null se nao for possivel deduzir do texto.' }
                    },
                    required: ['tipo', 'data', 'estabelecimento', 'cidade', 'categoria', 'portador_nome', 'portador_cartao_final', 'centro_custo', 'moeda_original', 'valor_original', 'taxa_cambio', 'valor_brl', 'descricao', 'fornecedor_normalizado', 'categoria_normalizada', 'produto_servico']
                }
            }
        },
        required: [
            'tipo_documento', 'numero_fatura', 'numero_conta', 'empresa',
            'linha_digitavel', 'nosso_numero', 'agencia_beneficiario', 'carteira',
            'data_emissao', 'data_postagem', 'data_vencimento', 'data_proximo_fechamento',
            'fornecedor_nome', 'fornecedor_cnpj',
            'pagador_nome', 'pagador_cnpj', 'pagador_endereco',
            'moeda', 'valor_total', 'descricao',
            'resumo', 'limites', 'encargos_cobrados', 'encargos_proximo_periodo',
            'totalizadores', 'itens'
        ]
    }
};

const FATURA_PROMPT = [
    'Voce recebe uma fatura em PDF, tipicamente uma fatura de cartao de credito EMPRESARIAL do Itau, mas pode tambem ser fatura de pessoa fisica, nota fiscal ou boleto.',
    'Extraia TODOS os campos pedidos no schema. Se um campo nao existir no documento, retorne null.',
    'Datas sempre no formato YYYY-MM-DD. Quando o PDF mostrar so DD/MM em lancamentos, deduza o ano a partir das datas de emissao/fechamento da fatura.',
    'Valores monetarios em BRL como numero, sem "R$" e com ponto decimal (ex.: 39974.82). NAO interprete "1.640,62" como 1.64.',
    'CNPJ apenas digitos (14 caracteres), sem mascara.',
    'No bloco "encargos_cobrados", separe taxa percentual (campo *_percent) e o valor cobrado (campo *_valor). Em fatura sem atraso, valores sao 0.',
    'Em "totalizadores": "repasse_iof_brl" e o repasse de IOF sobre transacoes internacionais; "total_transacoes_internacionais_brl" e a soma das compras estrangeiras convertidas para BRL antes do repasse.',
    'Em "itens" liste APENAS lancamentos individuais (compras, saques, pagamentos, encargos individuais, ajustes), NUNCA subtotais nem totais.',
    'Para cada item: tipo deve ser um de [compra_nacional, compra_internacional, saque, pagamento, encargo, ajuste, outro].',
    'Para faturas Itau, o portador (nome do funcionario) e o final do cartao aparecem como cabecalho de cada bloco de lancamentos (ex.: "FERNANDA MAUES (final 6881)"). Aplique esses dados aos itens daquele bloco.',
    'Quando houver linha "Centro de Custo: 0" ou similar acima de um bloco, atribua esse centro de custo aos lancamentos do bloco.',
    'Lancamentos internacionais: preencha moeda_original, valor_original (na moeda original), taxa_cambio (BRL por unidade) e valor_brl (valor convertido).',
    'Para pagamentos efetuados (creditos do cliente), use tipo="pagamento" e valor_brl negativo.',
    'NORMALIZACAO: para cada lancamento, alem do "estabelecimento" bruto, preencha "fornecedor_normalizado", "categoria_normalizada" e (quando possivel) "produto_servico" — esses campos sao usados pra agregar lancamentos do mesmo fornecedor entre faturas. Se nao tiver certeza, prefira null a inventar.',
    'fornecedor_normalizado = nome canonico da entidade comercial real, em portugues. Exemplos:',
    '"MSFT * E0300YFJ4I" / "PPRO *MICROSOFT" / "Microsoft-G134104090" -> "Microsoft";',
    '"GOL LIN*WVELDR0134176" / "GOL LINHAS AEREAS" -> "GOL Linhas Aereas";',
    '"ZOOM.COM 888-799-9666" / "ZOOM.US" -> "Zoom";',
    '"UBER *TRIP" / "UBER *EATS" -> "Uber";',
    '"AMZN MKTP" / "AMAZON.COM" -> "Amazon";',
    '"AWS" / "AMAZON WEB SERVICES" -> "Amazon Web Services";',
    '"GOOGLE *ADS" / "GOOGLE WORKSPACE" -> "Google";',
    '"AZUL LINHAS AEREAS" -> "Azul Linhas Aereas"; "LATAM" -> "LATAM";',
    'Lojas pequenas/locais sem marca conhecida: use o proprio nome limpo (sem codigos, ex.: "AF LOJAS DOIS 02/02" -> "AF Lojas Dois").',
    'categoria_normalizada deve ser uma das (preferencialmente):',
    '"Software/SaaS" (Microsoft, Google Workspace, Adobe, Zoom, Slack, Atlassian, Notion, etc.);',
    '"Cloud/Infra" (AWS, Azure, GCP, Cloudflare, Digital Ocean);',
    '"Viagem - Aereo" (companhias aereas, agencias, taxas de embarque);',
    '"Viagem - Hospedagem" (hoteis, Airbnb, Booking);',
    '"Viagem - Transporte" (Uber, 99, taxi, locadoras, pedagio, estacionamento);',
    '"Alimentacao" (restaurantes, supermercados, iFood, Rappi);',
    '"Comunicacao" (telefonia, internet, correios);',
    '"Material/Escritorio" (papelarias, suprimentos);',
    '"Marketing/Publicidade" (Google Ads, Meta Ads, agencias);',
    '"Servicos Bancarios/Tarifas";',
    '"Saude";',
    '"Outros" (so quando realmente nao se encaixa). null = nao consegui categorizar.',
    'produto_servico: granular, so quando o estabelecimento ou contexto deixa claro o produto especifico (ex.: "Microsoft Azure" para "MSFT * AZURE"; "Microsoft 365" para "MSFT * O365"; "Zoom Meetings" para "ZOOM.COM"). Caso contrario null.',
    'Pagamentos efetuados pelo cliente NAO precisam de fornecedor_normalizado/categoria_normalizada (use null nos tres campos de normalizacao).',
    'Nao invente dados; quando incerto, retorne null.'
].join(' ');

async function callOpenAIForFatura(model, pdfBuffer, originalName) {
    const client = getOpenAIClient();
    const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
    const response = await client.responses.create({
        model,
        input: [{
            role: 'user',
            content: [
                { type: 'input_text', text: FATURA_PROMPT },
                { type: 'input_file', filename: originalName || 'fatura.pdf', file_data: dataUrl }
            ]
        }],
        text: { format: { type: 'json_schema', ...FATURA_JSON_SCHEMA } }
    });

    const text = response.output_text
        || (response.output && response.output[0] && response.output[0].content
            && response.output[0].content[0] && response.output[0].content[0].text)
        || '';
    if (!text) throw new Error('OpenAI retornou resposta vazia');
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error(`JSON invalido na resposta da IA: ${e.message}`); }
    return { parsed, raw: text };
}

// Tenta extrair com modelo primario; em erro, faz fallback para o secundario
// e devolve qual modelo realmente respondeu.
async function extractFaturaFromPdf(pdfBuffer, originalName) {
    let lastErr;
    for (const model of [FATURA_PRIMARY_MODEL, FATURA_FALLBACK_MODEL]) {
        try {
            const { parsed, raw } = await callOpenAIForFatura(model, pdfBuffer, originalName);
            return { model, parsed, raw };
        } catch (e) {
            console.warn(`[FATURA] Modelo ${model} falhou:`, e.message || e);
            lastErr = e;
        }
    }
    throw lastErr || new Error('Falha ao extrair fatura com todos os modelos disponiveis');
}

function toDateOrNull(value) {
    if (!value || typeof value !== 'string') return null;
    // espera YYYY-MM-DD; tolera DD/MM/YYYY
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/.exec(value);
    if (isoMatch) return value;
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    return null;
}

function toDecimalOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isFinite(n) ? n : null;
    }
    return null;
}

function digitsOnly(value, max) {
    if (!value || typeof value !== 'string') return null;
    const d = value.replace(/\D/g, '');
    if (!d) return null;
    return max ? d.slice(0, max) : d;
}

// Upsert por nome em uma tabela mestre (OCR_FORNECEDORES / OCR_CATEGORIAS).
// MERGE com HOLDLOCK pra evitar race entre INSERTs concorrentes.
// Retorna {id, novo: bool}; "novo" = true se INSERT real (primeira vez).
async function upsertNomeMaster(tx, table, nome, faturaId) {
    if (!nome) return { id: null, novo: false };
    const r = await new sql.Request(tx)
        .input('nome',     sql.NVarChar(200), nome)
        .input('faturaId', sql.Int,           faturaId)
        .query(`
            MERGE dbo.${table} WITH (HOLDLOCK) AS target
            USING (SELECT @nome AS nome) AS src
                ON target.nome = src.nome
            WHEN NOT MATCHED THEN
                INSERT (nome, first_seen_fatura_id) VALUES (@nome, @faturaId)
            WHEN MATCHED THEN
                UPDATE SET updated_at = SYSDATETIME()
            OUTPUT INSERTED.Id AS Id, $action AS act;
        `);
    if (!r.recordset || r.recordset.length === 0) return { id: null, novo: false };
    const row = r.recordset[0];
    return { id: row.Id, novo: row.act === 'INSERT' };
}

function trimOrNull(value, max) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;
    return max && s.length > max ? s.slice(0, max) : s;
}

// POST /api/fatura/upload — recebe PDF, manda pra IA, grava em Fonte.
// Fatura mae em OCR_FATURA_ITAU; lancamentos linha-a-linha em OCR_FATURA_ITAU_ITENS.
// Tudo em transacao: se um insert falhar, nada e persistido.
app.post('/api/fatura/upload', requireAppPermission('fatura'), uploadFaturaPdf.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Arquivo PDF e obrigatorio (campo "file")' });
        if (!poolFonte || !poolFonte.connected) {
            return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        }

        const { model, parsed, raw } = await extractFaturaFromPdf(req.file.buffer, req.file.originalname);
        const itens   = Array.isArray(parsed.itens) ? parsed.itens : [];
        const resumo  = parsed.resumo || {};
        const limites = parsed.limites || {};
        const enc     = parsed.encargos_cobrados || {};
        const encProx = parsed.encargos_proximo_periodo || {};
        const tot     = parsed.totalizadores || {};

        const tx = new sql.Transaction(poolFonte);
        await tx.begin();
        let faturaId, uploadedAt;
        try {
            const insertFatura = await new sql.Request(tx)
                // Identificacao
                .input('tipo_documento',          sql.NVarChar(60),  trimOrNull(parsed.tipo_documento, 60))
                .input('numero_fatura',           sql.NVarChar(100), trimOrNull(parsed.numero_fatura, 100))
                .input('numero_conta',            sql.NVarChar(40),  trimOrNull(parsed.numero_conta, 40))
                .input('empresa',                 sql.NVarChar(300), trimOrNull(parsed.empresa, 300))
                .input('linha_digitavel',         sql.NVarChar(80),  trimOrNull(parsed.linha_digitavel, 80))
                .input('nosso_numero',            sql.NVarChar(40),  trimOrNull(parsed.nosso_numero, 40))
                .input('agencia_beneficiario',    sql.NVarChar(40),  trimOrNull(parsed.agencia_beneficiario, 40))
                .input('carteira',                sql.NVarChar(20),  trimOrNull(parsed.carteira, 20))
                // Datas
                .input('data_emissao',            sql.Date, toDateOrNull(parsed.data_emissao))
                .input('data_postagem',           sql.Date, toDateOrNull(parsed.data_postagem))
                .input('data_vencimento',         sql.Date, toDateOrNull(parsed.data_vencimento))
                .input('data_proximo_fechamento', sql.Date, toDateOrNull(parsed.data_proximo_fechamento))
                // Partes
                .input('fornecedor_nome',         sql.NVarChar(300), trimOrNull(parsed.fornecedor_nome, 300))
                .input('fornecedor_cnpj',         sql.NVarChar(20),  digitsOnly(parsed.fornecedor_cnpj, 14))
                .input('pagador_nome',            sql.NVarChar(300), trimOrNull(parsed.pagador_nome, 300))
                .input('pagador_cnpj',            sql.NVarChar(20),  digitsOnly(parsed.pagador_cnpj, 14))
                .input('pagador_endereco',        sql.NVarChar(500), trimOrNull(parsed.pagador_endereco, 500))
                // Totais
                .input('moeda',                   sql.NVarChar(5),   trimOrNull(parsed.moeda, 5))
                .input('valor_total',             sql.Decimal(18,2), toDecimalOrNull(parsed.valor_total))
                .input('descricao',               sql.NVarChar(sql.MAX), parsed.descricao || null)
                // Resumo
                .input('total_fatura_anterior',   sql.Decimal(18,2), toDecimalOrNull(resumo.total_fatura_anterior))
                .input('pagamentos_efetuados',    sql.Decimal(18,2), toDecimalOrNull(resumo.pagamentos_efetuados))
                .input('saldo_atraso',            sql.Decimal(18,2), toDecimalOrNull(resumo.saldo_atraso))
                .input('lancamentos_atuais',      sql.Decimal(18,2), toDecimalOrNull(resumo.lancamentos_atuais))
                // Limites
                .input('limite_total_credito',    sql.Decimal(18,2), toDecimalOrNull(limites.limite_total_credito))
                .input('limite_disponivel',       sql.Decimal(18,2), toDecimalOrNull(limites.limite_disponivel))
                .input('limite_total_utilizado',  sql.Decimal(18,2), toDecimalOrNull(limites.limite_total_utilizado))
                // Encargos cobrados
                .input('juros_atraso_percent',           sql.Decimal(9,4),  toDecimalOrNull(enc.juros_atraso_percent))
                .input('juros_atraso_valor',             sql.Decimal(18,2), toDecimalOrNull(enc.juros_atraso_valor))
                .input('juros_mora_percent_mensal',      sql.Decimal(9,4),  toDecimalOrNull(enc.juros_mora_percent_mensal))
                .input('juros_mora_valor',               sql.Decimal(18,2), toDecimalOrNull(enc.juros_mora_valor))
                .input('multa_atraso_percent',           sql.Decimal(9,4),  toDecimalOrNull(enc.multa_atraso_percent))
                .input('multa_atraso_valor',             sql.Decimal(18,2), toDecimalOrNull(enc.multa_atraso_valor))
                .input('iof_financiamento_descricao',    sql.NVarChar(200), trimOrNull(enc.iof_financiamento_descricao, 200))
                .input('iof_financiamento_valor',        sql.Decimal(18,2), toDecimalOrNull(enc.iof_financiamento_valor))
                // Encargos proximo periodo
                .input('juros_max_proximo_mensal_percent', sql.Decimal(9,4), toDecimalOrNull(encProx.juros_max_proximo_mensal_percent))
                .input('juros_max_proximo_anual_percent',  sql.Decimal(9,4), toDecimalOrNull(encProx.juros_max_proximo_anual_percent))
                .input('juros_pgto_contas_mensal_percent', sql.Decimal(9,4), toDecimalOrNull(encProx.juros_pgto_contas_mensal_percent))
                // Totalizadores
                .input('total_pagamentos',                     sql.Decimal(18,2), toDecimalOrNull(tot.total_pagamentos))
                .input('total_lancamentos_atuais',             sql.Decimal(18,2), toDecimalOrNull(tot.total_lancamentos_atuais))
                .input('total_transacoes_internacionais_brl',  sql.Decimal(18,2), toDecimalOrNull(tot.total_transacoes_internacionais_brl))
                .input('repasse_iof_brl',                      sql.Decimal(18,2), toDecimalOrNull(tot.repasse_iof_brl))
                .input('total_lancamentos_internacionais_brl', sql.Decimal(18,2), toDecimalOrNull(tot.total_lancamentos_internacionais_brl))
                // Auditoria
                .input('pdf_filename',    sql.NVarChar(300),     req.file.originalname || null)
                .input('pdf_size_bytes',  sql.Int,               req.file.size || null)
                .input('model_used',      sql.NVarChar(60),      model)
                .input('raw_response',    sql.NVarChar(sql.MAX), raw)
                .input('uploaded_by',     sql.Int,               req.user.id)
                .query(`
                    INSERT INTO dbo.OCR_FATURA_ITAU (
                        tipo_documento, numero_fatura, numero_conta, empresa,
                        linha_digitavel, nosso_numero, agencia_beneficiario, carteira,
                        data_emissao, data_postagem, data_vencimento, data_proximo_fechamento,
                        fornecedor_nome, fornecedor_cnpj,
                        pagador_nome, pagador_cnpj, pagador_endereco,
                        moeda, valor_total, descricao,
                        total_fatura_anterior, pagamentos_efetuados, saldo_atraso, lancamentos_atuais,
                        limite_total_credito, limite_disponivel, limite_total_utilizado,
                        juros_atraso_percent, juros_atraso_valor,
                        juros_mora_percent_mensal, juros_mora_valor,
                        multa_atraso_percent, multa_atraso_valor,
                        iof_financiamento_descricao, iof_financiamento_valor,
                        juros_max_proximo_mensal_percent, juros_max_proximo_anual_percent, juros_pgto_contas_mensal_percent,
                        total_pagamentos, total_lancamentos_atuais,
                        total_transacoes_internacionais_brl, repasse_iof_brl, total_lancamentos_internacionais_brl,
                        pdf_filename, pdf_size_bytes, model_used, raw_response, uploaded_by
                    )
                    OUTPUT INSERTED.Id, INSERTED.uploaded_at
                    VALUES (
                        @tipo_documento, @numero_fatura, @numero_conta, @empresa,
                        @linha_digitavel, @nosso_numero, @agencia_beneficiario, @carteira,
                        @data_emissao, @data_postagem, @data_vencimento, @data_proximo_fechamento,
                        @fornecedor_nome, @fornecedor_cnpj,
                        @pagador_nome, @pagador_cnpj, @pagador_endereco,
                        @moeda, @valor_total, @descricao,
                        @total_fatura_anterior, @pagamentos_efetuados, @saldo_atraso, @lancamentos_atuais,
                        @limite_total_credito, @limite_disponivel, @limite_total_utilizado,
                        @juros_atraso_percent, @juros_atraso_valor,
                        @juros_mora_percent_mensal, @juros_mora_valor,
                        @multa_atraso_percent, @multa_atraso_valor,
                        @iof_financiamento_descricao, @iof_financiamento_valor,
                        @juros_max_proximo_mensal_percent, @juros_max_proximo_anual_percent, @juros_pgto_contas_mensal_percent,
                        @total_pagamentos, @total_lancamentos_atuais,
                        @total_transacoes_internacionais_brl, @repasse_iof_brl, @total_lancamentos_internacionais_brl,
                        @pdf_filename, @pdf_size_bytes, @model_used, @raw_response, @uploaded_by
                    )
                `);
            faturaId   = insertFatura.recordset[0].Id;
            uploadedAt = insertFatura.recordset[0].uploaded_at;

            // Upsert em massa de fornecedores e categorias unicos da fatura.
            // Evita N upserts redundantes quando o mesmo fornecedor aparece em
            // varios lancamentos.
            const fornecedoresSet = new Set();
            const categoriasSet = new Set();
            for (const it of itens) {
                const f = trimOrNull(it && it.fornecedor_normalizado, 200);
                const c = trimOrNull(it && it.categoria_normalizada, 100);
                if (f) fornecedoresSet.add(f);
                if (c) categoriasSet.add(c);
            }

            const fornecedorMap = new Map(); // nome -> id
            const categoriaMap = new Map();
            const novosFornecedores = []; // {id, nome}
            const novasCategorias = [];

            for (const nome of fornecedoresSet) {
                const { id, novo } = await upsertNomeMaster(tx, 'OCR_FORNECEDORES', nome, faturaId);
                if (id != null) {
                    fornecedorMap.set(nome, id);
                    if (novo) novosFornecedores.push({ id, nome });
                }
            }
            for (const nome of categoriasSet) {
                const { id, novo } = await upsertNomeMaster(tx, 'OCR_CATEGORIAS', nome, faturaId);
                if (id != null) {
                    categoriaMap.set(nome, id);
                    if (novo) novasCategorias.push({ id, nome });
                }
            }

            for (let i = 0; i < itens.length; i++) {
                const it = itens[i] || {};
                const fornecNome = trimOrNull(it.fornecedor_normalizado, 200);
                const categNome  = trimOrNull(it.categoria_normalizada, 100);
                const fornecedorId = fornecNome ? (fornecedorMap.get(fornecNome) || null) : null;
                const categoriaId  = categNome  ? (categoriaMap.get(categNome)  || null) : null;

                await new sql.Request(tx)
                    .input('fatura_id',             sql.Int,            faturaId)
                    .input('ordem',                 sql.Int,            i + 1)
                    .input('tipo',                  sql.NVarChar(40),   trimOrNull(it.tipo, 40))
                    .input('data',                  sql.Date,           toDateOrNull(it.data))
                    .input('descricao',             sql.NVarChar(1000), trimOrNull(it.descricao, 1000))
                    .input('estabelecimento',       sql.NVarChar(300),  trimOrNull(it.estabelecimento, 300))
                    .input('cidade',                sql.NVarChar(150),  trimOrNull(it.cidade, 150))
                    .input('categoria',             sql.NVarChar(100),  trimOrNull(it.categoria, 100))
                    .input('portador_nome',         sql.NVarChar(200),  trimOrNull(it.portador_nome, 200))
                    .input('portador_cartao_final', sql.NVarChar(10),   digitsOnly(it.portador_cartao_final, 10))
                    .input('centro_custo',          sql.NVarChar(50),   trimOrNull(it.centro_custo, 50))
                    .input('moeda_original',        sql.NVarChar(5),    trimOrNull(it.moeda_original, 5))
                    .input('valor_original',        sql.Decimal(18,4),  toDecimalOrNull(it.valor_original))
                    .input('taxa_cambio',           sql.Decimal(18,6),  toDecimalOrNull(it.taxa_cambio))
                    .input('valor_brl',             sql.Decimal(18,2),  toDecimalOrNull(it.valor_brl))
                    .input('valor_total',           sql.Decimal(18,2),  toDecimalOrNull(it.valor_brl)) // legacy/compat
                    .input('fornecedor_normalizado', sql.NVarChar(200), fornecNome)
                    .input('categoria_normalizada',  sql.NVarChar(100), categNome)
                    .input('produto_servico',        sql.NVarChar(200), trimOrNull(it.produto_servico, 200))
                    .input('fornecedor_id',          sql.Int,           fornecedorId)
                    .input('categoria_id',           sql.Int,           categoriaId)
                    .query(`
                        INSERT INTO dbo.OCR_FATURA_ITAU_ITENS (
                            fatura_id, ordem, tipo, data, descricao, estabelecimento, cidade, categoria,
                            portador_nome, portador_cartao_final, centro_custo,
                            moeda_original, valor_original, taxa_cambio, valor_brl, valor_total,
                            fornecedor_normalizado, categoria_normalizada, produto_servico,
                            fornecedor_id, categoria_id
                        ) VALUES (
                            @fatura_id, @ordem, @tipo, @data, @descricao, @estabelecimento, @cidade, @categoria,
                            @portador_nome, @portador_cartao_final, @centro_custo,
                            @moeda_original, @valor_original, @taxa_cambio, @valor_brl, @valor_total,
                            @fornecedor_normalizado, @categoria_normalizada, @produto_servico,
                            @fornecedor_id, @categoria_id
                        )
                    `);
            }

            await tx.commit();

            // Resposta carrega tracking dos novos para o frontend destacar
            res.locals.novosFornecedores = novosFornecedores;
            res.locals.novasCategorias = novasCategorias;
        } catch (txErr) {
            try { await tx.rollback(); } catch (_) { /* swallow */ }
            throw txErr;
        }

        return res.json({
            id: faturaId,
            uploaded_at: uploadedAt,
            model_used: model,
            novos_fornecedores: res.locals.novosFornecedores || [],
            novas_categorias:   res.locals.novasCategorias   || [],
            // O front nao precisa mais do "data" inteiro — agora detalhes
            // sao carregados sob demanda via GET /api/fatura/:id.
            resumo: {
                total: parsed.valor_total || null,
                vencimento: parsed.data_vencimento || null,
                empresa: parsed.empresa || parsed.pagador_nome || null,
                fornecedor: parsed.fornecedor_nome || null,
                qtd_itens: itens.length
            }
        });
    } catch (err) {
        console.error('[FATURA] Falha no upload:', err);
        const status = err.statusCode || 500;
        return res.status(status).json({ error: err.message || 'Erro ao processar fatura' });
    }
});

// ----- Fornecedores normalizados (tabela mestra) -----------------------------

// GET /api/fatura/fornecedores — lista todos com contagem de uso.
app.get('/api/fatura/fornecedores', requireAppPermission('fatura'), async (req, res) => {
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const result = await poolFonte.request().query(`
            SELECT f.Id, f.nome, f.despesa_ti, f.observacao,
                   f.first_seen_fatura_id, f.created_at, f.updated_at,
                   (SELECT COUNT(*) FROM dbo.OCR_FATURA_ITAU_ITENS i WHERE i.fornecedor_id = f.Id) AS occurrences,
                   (SELECT SUM(i.valor_brl) FROM dbo.OCR_FATURA_ITAU_ITENS i WHERE i.fornecedor_id = f.Id) AS total_brl
            FROM dbo.OCR_FORNECEDORES f
            ORDER BY f.nome
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('[FATURA] Falha ao listar fornecedores:', err);
        return res.status(500).json({ error: 'Erro ao listar fornecedores' });
    }
});

// PATCH /api/fatura/fornecedores/:id — atualiza despesa_ti e/ou observacao.
app.patch('/api/fatura/fornecedores/:id', requireAppPermission('fatura'), async (req, res) => {
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const id = parseInt(req.params.id, 10);
        const reqBuilder = poolFonte.request().input('id', sql.Int, id);

        const sets = [];
        if (typeof req.body.despesa_ti === 'boolean') {
            reqBuilder.input('despesa_ti', sql.Bit, req.body.despesa_ti);
            sets.push('despesa_ti = @despesa_ti');
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'observacao')) {
            reqBuilder.input('observacao', sql.NVarChar(500), trimOrNull(req.body.observacao, 500));
            sets.push('observacao = @observacao');
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo permitido foi fornecido' });
        sets.push('updated_at = SYSDATETIME()');

        const r = await reqBuilder.query(`
            UPDATE dbo.OCR_FORNECEDORES SET ${sets.join(', ')}
            OUTPUT INSERTED.Id, INSERTED.nome, INSERTED.despesa_ti, INSERTED.observacao, INSERTED.updated_at
            WHERE Id = @id
        `);
        if (!r.recordset || r.recordset.length === 0) return res.status(404).json({ error: 'Fornecedor nao encontrado' });
        return res.json(r.recordset[0]);
    } catch (err) {
        console.error('[FATURA] Falha ao atualizar fornecedor:', err);
        return res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
    }
});

// ----- Categorias normalizadas (tabela mestra) -------------------------------

app.get('/api/fatura/categorias', requireAppPermission('fatura'), async (req, res) => {
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const result = await poolFonte.request().query(`
            SELECT c.Id, c.nome, c.despesa_ti, c.observacao,
                   c.first_seen_fatura_id, c.created_at, c.updated_at,
                   (SELECT COUNT(*) FROM dbo.OCR_FATURA_ITAU_ITENS i WHERE i.categoria_id = c.Id) AS occurrences,
                   (SELECT SUM(i.valor_brl) FROM dbo.OCR_FATURA_ITAU_ITENS i WHERE i.categoria_id = c.Id) AS total_brl
            FROM dbo.OCR_CATEGORIAS c
            ORDER BY c.nome
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('[FATURA] Falha ao listar categorias:', err);
        return res.status(500).json({ error: 'Erro ao listar categorias' });
    }
});

app.patch('/api/fatura/categorias/:id', requireAppPermission('fatura'), async (req, res) => {
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const id = parseInt(req.params.id, 10);
        const reqBuilder = poolFonte.request().input('id', sql.Int, id);

        const sets = [];
        if (typeof req.body.despesa_ti === 'boolean') {
            reqBuilder.input('despesa_ti', sql.Bit, req.body.despesa_ti);
            sets.push('despesa_ti = @despesa_ti');
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'observacao')) {
            reqBuilder.input('observacao', sql.NVarChar(500), trimOrNull(req.body.observacao, 500));
            sets.push('observacao = @observacao');
        }
        if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo permitido foi fornecido' });
        sets.push('updated_at = SYSDATETIME()');

        const r = await reqBuilder.query(`
            UPDATE dbo.OCR_CATEGORIAS SET ${sets.join(', ')}
            OUTPUT INSERTED.Id, INSERTED.nome, INSERTED.despesa_ti, INSERTED.observacao, INSERTED.updated_at
            WHERE Id = @id
        `);
        if (!r.recordset || r.recordset.length === 0) return res.status(404).json({ error: 'Categoria nao encontrada' });
        return res.json(r.recordset[0]);
    } catch (err) {
        console.error('[FATURA] Falha ao atualizar categoria:', err);
        return res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
});

// GET /api/fatura/stats — numeros agregados para os KPIs do topo do front.
// total_gasto_brl / total_ti_brl consideram apenas valores positivos (gasto),
// excluindo pagamentos e creditos (valor_brl < 0). "Despesa de TI" vale se o
// fornecedor OU a categoria do lancamento estiver marcado.
app.get('/api/fatura/stats', requireAppPermission('fatura'), async (req, res) => {
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const r = await poolFonte.request().query(`
            SELECT
                (SELECT COUNT(*) FROM dbo.OCR_FATURA_ITAU)        AS total_faturas,
                (SELECT COUNT(*) FROM dbo.OCR_FATURA_ITAU_ITENS)  AS total_itens,
                (SELECT SUM(valor_brl) FROM dbo.OCR_FATURA_ITAU_ITENS WHERE valor_brl > 0) AS total_gasto_brl,
                (SELECT SUM(i.valor_brl)
                   FROM dbo.OCR_FATURA_ITAU_ITENS i
                   LEFT JOIN dbo.OCR_FORNECEDORES fo ON fo.Id = i.fornecedor_id
                   LEFT JOIN dbo.OCR_CATEGORIAS   ca ON ca.Id = i.categoria_id
                   WHERE i.valor_brl > 0 AND (fo.despesa_ti = 1 OR ca.despesa_ti = 1)) AS total_ti_brl
        `);
        return res.json(r.recordset[0] || { total_faturas: 0, total_itens: 0, total_gasto_brl: 0, total_ti_brl: 0 });
    } catch (err) {
        console.error('[FATURA] Falha ao calcular stats:', err);
        return res.status(500).json({ error: 'Erro ao calcular estatisticas' });
    }
});

// GET /api/fatura/fornecedores/:id/itens — detalhamento: todos os lancamentos
// (de todas as faturas) atribuidos a este fornecedor normalizado. Alimenta o
// modal de drill-down quando o usuario clica numa linha da tabela mestra.
app.get('/api/fatura/fornecedores/:id/itens', requireAppPermission('fatura'), async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Fornecedor nao encontrado' });
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const r = await poolFonte.request()
            .input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`
                SELECT i.Id, i.fatura_id, i.data, i.tipo, i.estabelecimento, i.descricao,
                       i.cidade, i.portador_nome, i.portador_cartao_final,
                       i.produto_servico, i.categoria_normalizada, i.valor_brl,
                       f.numero_fatura, f.empresa, f.uploaded_at
                FROM dbo.OCR_FATURA_ITAU_ITENS i
                JOIN dbo.OCR_FATURA_ITAU f ON f.Id = i.fatura_id
                WHERE i.fornecedor_id = @id
                ORDER BY i.data DESC, i.Id DESC
            `);
        return res.json(r.recordset);
    } catch (err) {
        console.error('[FATURA] Falha ao detalhar fornecedor:', err);
        return res.status(500).json({ error: 'Erro ao carregar lancamentos do fornecedor' });
    }
});

// GET /api/fatura/categorias/:id/itens — mesmo detalhamento, por categoria.
app.get('/api/fatura/categorias/:id/itens', requireAppPermission('fatura'), async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Categoria nao encontrada' });
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const r = await poolFonte.request()
            .input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`
                SELECT i.Id, i.fatura_id, i.data, i.tipo, i.estabelecimento, i.descricao,
                       i.cidade, i.portador_nome, i.portador_cartao_final,
                       i.produto_servico, i.fornecedor_normalizado, i.valor_brl,
                       f.numero_fatura, f.empresa, f.uploaded_at
                FROM dbo.OCR_FATURA_ITAU_ITENS i
                JOIN dbo.OCR_FATURA_ITAU f ON f.Id = i.fatura_id
                WHERE i.categoria_id = @id
                ORDER BY i.data DESC, i.Id DESC
            `);
        return res.json(r.recordset);
    } catch (err) {
        console.error('[FATURA] Falha ao detalhar categoria:', err);
        return res.status(500).json({ error: 'Erro ao carregar lancamentos da categoria' });
    }
});

// GET /api/fatura/list — historico enxuto pra tabela do front. Sem itens
// (carregue via GET /api/fatura/:id quando o usuario clicar em Detalhes).
// IMPORTANTE: declarado ANTES de /api/fatura/:id porque Express 5 nao
// suporta mais regex inline (:id(\d+)) e a rota :id capturaria "list".
app.get('/api/fatura/list', requireAppPermission('fatura'), async (req, res) => {
    try {
        if (!poolFonte || !poolFonte.connected) {
            return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        }
        const limitRaw = parseInt(req.query.limit, 10);
        const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 500);

        const result = await poolFonte.request().query(`
            SELECT TOP ${limit}
                f.Id, f.numero_fatura, f.empresa, f.pagador_nome, f.fornecedor_nome,
                f.data_emissao, f.data_vencimento, f.valor_total, f.repasse_iof_brl,
                f.model_used, f.uploaded_by, f.uploaded_at,
                (SELECT COUNT(*) FROM dbo.OCR_FATURA_ITAU_ITENS i WHERE i.fatura_id = f.Id) AS qtd_itens
            FROM dbo.OCR_FATURA_ITAU f
            ORDER BY f.uploaded_at DESC
        `);
        return res.json(result.recordset);
    } catch (err) {
        console.error('[FATURA] Falha no list:', err);
        return res.status(500).json({ error: 'Erro ao listar faturas' });
    }
});

// GET /api/fatura/:id — detalhes completos (mae + itens).
// Validacao manual do id: Express 5 nao aceita mais regex inline na rota,
// entao filtro o param aqui. Se nao for numerico, devolve 404 "Fatura nao
// encontrada" — comportamento equivalente.
app.get('/api/fatura/:id', requireAppPermission('fatura'), async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Fatura nao encontrada' });
    try {
        if (!poolFonte || !poolFonte.connected) return res.status(503).json({ error: 'Banco Fonte indisponivel' });
        const id = parseInt(req.params.id, 10);
        const fr = await poolFonte.request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM dbo.OCR_FATURA_ITAU WHERE Id = @id');
        if (!fr.recordset.length) return res.status(404).json({ error: 'Fatura nao encontrada' });
        const fatura = fr.recordset[0];
        delete fatura.raw_response;

        const ir = await poolFonte.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT i.*, fo.despesa_ti AS fornecedor_despesa_ti, ca.despesa_ti AS categoria_despesa_ti
                FROM dbo.OCR_FATURA_ITAU_ITENS i
                LEFT JOIN dbo.OCR_FORNECEDORES fo ON fo.Id = i.fornecedor_id
                LEFT JOIN dbo.OCR_CATEGORIAS   ca ON ca.Id = i.categoria_id
                WHERE i.fatura_id = @id
                ORDER BY i.ordem
            `);
        return res.json({ ...fatura, itens: ir.recordset });
    } catch (err) {
        console.error('[FATURA] Falha ao detalhar fatura:', err);
        return res.status(500).json({ error: 'Erro ao carregar fatura' });
    }
});

// Inicializar servidor
async function startServer() {
    await initDB();
    await ensurePagesOrderColumn();
    await ensurePagesRedirectColumns();
    await ensureUploadJobsTable();
    await ensureUserAppPermissionsTable();
    await ensureOcrFaturaItauTable();
    await ensureOcrFaturaItauItensTable();
    await ensureOcrFornecedoresTable();
    await ensureOcrCategoriasTable();
    await ensureItensFkColumns();
    await ensurePagesEmbedColumns();
    await ensureMapDbTables(pool);
    await mountMapDb({
        app,
        express,
        baseDir: __dirname,
        getPool: () => pool,
        authenticateToken
    });
    // Power BI Embedded — gera embed token e enforça allowlist baseada
    // nas permissoes do Power BI Service (workspace/report users).
    // /api/embed/token exige id_token MSAL (header X-MS-Id-Token); nao exige
    // JWT do portal porque o usuario final acessa via MSAL apenas.
    mountPbiEmbed({ app, getPool: () => pool });
    // Export server-side de reports embedados (PDF/PPTX/PNG) via ExportTo.
    mountPbiExport({ app, getPool: () => pool });
    // Presence — usuarios online em tempo real para o widget do admin.
    mountPresence({ app, authenticateToken });

    // Endpoint Windows Auth — best effort SILENCIOSO. Como o URL Rewrite
    // atropela <location> por path, Windows Auth ficou habilitada no nivel
    // do site (web.config root) em conjunto com Anonymous. NAO disparamos
    // challenge 401 (evita prompt de credenciais em PCs fora da zona intranet).
    //
    // Captura acontece automaticamente quando:
    //   - PC esta joined no dominio AACD
    //   - Site esta na zona "Local Intranet" do browser (GPO ou manual em
    //     Edge/Chrome: Settings > Privacy > Cookies > Trusted sites)
    //   - Browser entao envia Negotiate preemptivamente, IIS valida e popula
    //     LOGON_USER → respondemos com o user
    //
    // Se nao houver as condicoes acima, LOGON_USER vem vazio e respondemos
    // 200 com user=''. Sem prompt, sem regressao. Pra ativar em escala
    // basta IT adicionar *.aacd.org.br na zona intranet via GPO.
    app.get('/api/whoami-windows', (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const winUser = (req.headers['x-iisnode-logon_user'] || '').toString().trim();
        res.json({ user: winUser });
    });
    // Garantir rota /chatbot mesmo se regras de rewrite modificarem a URL
    // Colocada aqui perto do start para evitar qualquer interferência de outras rotas/middlewares.
    // Se o IIS reescrever /chatbot -> /public/chatbot, podemos também atender /public/chatbot.
    const chatbotFile = path.join(__dirname, 'public', 'chatbot.html');
    app.get(['/chatbot', '/chatbot/', '/public/chatbot', '/public/chatbot/'], (req, res) => {
        try {
            return res.sendFile(chatbotFile);
        } catch (err) {
            console.error('[CHATBOT ROUTE] Erro ao servir chatbot:', err);
            return res.status(404).send('Chatbot não encontrado');
        }
    });
    const server = app.listen(PORT, HOST, () => {
        console.log(`Servidor rodando em http://${HOST}:${PORT}`);
        console.log(`Acesse: http://localhost:${PORT}`);
    });

    // Habilitar upgrade de WebSocket
    server.on('upgrade', (request, socket, head) => {
        console.log('[SERVER] Upgrade request para:', request.url);
        if (request.url.startsWith('/ws')) {
            wsProxy.upgrade(request, socket, head);
        } else {
            socket.destroy();
        }
    });
}

startServer();