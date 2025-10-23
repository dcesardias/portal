'use strict';
const { getPool, reconnect } = require('../db');

module.exports = async function dbReconnect(req, res, next) {
    if (!req.path.startsWith('/api')) return next();
    const pool = getPool();
    if (pool && pool.connected) return next();
    try {
        console.log('DB pool is null or disconnected — attempting to reconnect...');
        await reconnect();
        return next();
    } catch (err) {
        console.error('DB reconnection failed:', err.message || err);
        return res.status(503).json({ error: 'Serviço indisponível: banco de dados' });
    }
};
