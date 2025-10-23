'use strict';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    require('jsonwebtoken').verify(token, secret, (err, user) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.sendStatus(403);
        }
        req.user = user;
        next();
    });
}

function optionalAuthenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    const secret = process.env.JWT_SECRET || 'seu_secret_key_aqui';
    require('jsonwebtoken').verify(token, secret, (err, user) => {
        if (!err && user) req.user = user;
        return next();
    });
}

module.exports = { authenticateToken, optionalAuthenticate };
