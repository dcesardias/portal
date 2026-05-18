// msalVerify.js
//
// Verifica um id_token (ou access_token) emitido pelo Entra ID (AAD) v2.0
// usando as chaves publicas do tenant. Retorna o payload se valido.
//
// Validacoes:
//   - Assinatura (RS256 via JWKs do AAD)
//   - iss = https://login.microsoftonline.com/{tenantId}/v2.0
//   - aud = expectedAudience (client_id do app MSAL do portal)
//   - exp / nbf
//
// Variaveis: usa MICROSOFT_AUTH_TENANT_ID e MICROSOFT_AUTH_CLIENT_ID (fallback
// pros mesmos defaults hardcoded em server.js).

'use strict';

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const TENANT_ID = process.env.MICROSOFT_AUTH_TENANT_ID || '1ebad822-ee55-4814-9f70-6defb1fb0694';
const CLIENT_ID = process.env.MICROSOFT_AUTH_CLIENT_ID || 'b97df545-f361-4a9b-913f-f6a4b957486c';

const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const JWKS_URI = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;

const client = jwksClient({
    jwksUri: JWKS_URI,
    cache: true,
    cacheMaxAge: 60 * 60 * 1000, // 1h
    rateLimit: true,
    jwksRequestsPerMinute: 10,
});

function getSigningKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
    });
}

function verify(token) {
    return new Promise((resolve, reject) => {
        if (!token || typeof token !== 'string') return reject(new Error('token vazio'));
        jwt.verify(
            token,
            getSigningKey,
            {
                algorithms: ['RS256'],
                issuer: ISSUER,
                audience: CLIENT_ID,
            },
            (err, payload) => {
                if (err) return reject(err);
                resolve(payload);
            }
        );
    });
}

function extractEmail(payload) {
    // id_token v2: preferred_username e' geralmente o UPN/email
    return (
        payload.preferred_username ||
        payload.email ||
        payload.upn ||
        (Array.isArray(payload.emails) ? payload.emails[0] : null) ||
        null
    );
}

module.exports = { verify, extractEmail, TENANT_ID, CLIENT_ID };
