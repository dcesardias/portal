const express = require('express');

function sanitizeUser(user) {
    return {
        id: user.Id,
        username: user.Username,
        email: user.Email,
        fullName: user.FullName,
        isAdmin: !!user.IsAdmin,
        isActive: !!user.IsActive,
        createdAt: user.CreatedAt,
        lastLogin: user.LastLogin
    };
}

function normalizeNullableString(value, maxLength) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

async function countActiveAdmins(pool, excludedUserId = null) {
    const request = pool.request();
    let query = 'SELECT COUNT(*) AS total FROM dbo.Users WHERE IsAdmin = 1 AND IsActive = 1';
    if (excludedUserId !== null) {
        request.input('excludedUserId', excludedUserId);
        query += ' AND Id <> @excludedUserId';
    }
    const result = await request.query(query);
    return result.recordset[0].total;
}

function ensureAdmin(req, res) {
    if (!req.user || !req.user.isAdmin) {
        res.status(403).json({ error: 'Acesso negado' });
        return false;
    }
    return true;
}

function createUserManagementRouter({ getPool, authenticateToken, sql, bcrypt }) {
    const router = express.Router();

    router.post('/me/password', authenticateToken, async (req, res) => {
        try {
            const pool = getPool();
            if (!pool || !pool.connected) {
                return res.status(503).json({ error: 'Banco de dados indisponivel' });
            }

            const currentPassword = normalizeNullableString(req.body.currentPassword, 200);
            const newPassword = normalizeNullableString(req.body.newPassword, 200);

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Senha atual e nova senha sao obrigatorias' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
            }

            const userResult = await pool.request()
                .input('id', sql.Int, req.user.id)
                .query('SELECT TOP 1 Id, PasswordHash, IsActive FROM dbo.Users WHERE Id = @id');

            if (userResult.recordset.length === 0 || !userResult.recordset[0].IsActive) {
                return res.status(404).json({ error: 'Usuario nao encontrado ou inativo' });
            }

            const user = userResult.recordset[0];
            const validPassword = await bcrypt.compare(currentPassword, user.PasswordHash);
            if (!validPassword) {
                return res.status(400).json({ error: 'Senha atual invalida' });
            }

            const isSamePassword = await bcrypt.compare(newPassword, user.PasswordHash);
            if (isSamePassword) {
                return res.status(400).json({ error: 'A nova senha deve ser diferente da atual' });
            }

            const passwordHash = await bcrypt.hash(newPassword, 10);
            await pool.request()
                .input('id', sql.Int, req.user.id)
                .input('passwordHash', sql.NVarChar(500), passwordHash)
                .query('UPDATE dbo.Users SET PasswordHash = @passwordHash WHERE Id = @id');

            return res.json({ message: 'Senha atualizada com sucesso' });
        } catch (error) {
            console.error('[Users] Erro ao alterar a propria senha:', error);
            return res.status(500).json({ error: 'Erro ao alterar senha' });
        }
    });

    router.get('/', authenticateToken, async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        try {
            const pool = getPool();
            if (!pool || !pool.connected) {
                return res.status(503).json({ error: 'Banco de dados indisponivel' });
            }

            const result = await pool.request().query(`
                SELECT Id, Username, Email, FullName, IsAdmin, IsActive, CreatedAt, LastLogin
                FROM dbo.Users
                ORDER BY Username
            `);

            return res.json(result.recordset.map(sanitizeUser));
        } catch (error) {
            console.error('[Users] Erro ao listar usuarios:', error);
            return res.status(500).json({ error: 'Erro ao listar usuarios' });
        }
    });

    router.post('/', authenticateToken, async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        try {
            const pool = getPool();
            if (!pool || !pool.connected) {
                return res.status(503).json({ error: 'Banco de dados indisponivel' });
            }

            const username = normalizeNullableString(req.body.username, 100);
            const password = normalizeNullableString(req.body.password, 200);
            const email = normalizeNullableString(req.body.email, 200);
            const fullName = normalizeNullableString(req.body.fullName, 200);
            const isAdmin = !!req.body.isAdmin;
            const isActive = req.body.isActive !== false;

            if (!username || !password) {
                return res.status(400).json({ error: 'Usuario e senha sao obrigatorios' });
            }

            const exists = await pool.request()
                .input('username', sql.NVarChar(100), username)
                .query('SELECT TOP 1 Id FROM dbo.Users WHERE Username = @username');

            if (exists.recordset.length > 0) {
                return res.status(409).json({ error: 'Ja existe um usuario com esse login' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const insert = await pool.request()
                .input('username', sql.NVarChar(100), username)
                .input('passwordHash', sql.NVarChar(500), passwordHash)
                .input('email', sql.NVarChar(200), email)
                .input('fullName', sql.NVarChar(200), fullName)
                .input('isAdmin', sql.Bit, isAdmin)
                .input('isActive', sql.Bit, isActive)
                .query(`
                    INSERT INTO dbo.Users (Username, PasswordHash, Email, FullName, IsAdmin, IsActive, CreatedAt)
                    OUTPUT INSERTED.Id, INSERTED.Username, INSERTED.Email, INSERTED.FullName, INSERTED.IsAdmin, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.LastLogin
                    VALUES (@username, @passwordHash, @email, @fullName, @isAdmin, @isActive, GETDATE())
                `);

            return res.status(201).json(sanitizeUser(insert.recordset[0]));
        } catch (error) {
            console.error('[Users] Erro ao criar usuario:', error);
            return res.status(500).json({ error: 'Erro ao criar usuario' });
        }
    });

    router.put('/:id', authenticateToken, async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        try {
            const pool = getPool();
            if (!pool || !pool.connected) {
                return res.status(503).json({ error: 'Banco de dados indisponivel' });
            }

            const targetUserId = parseInt(req.params.id, 10);
            if (!Number.isFinite(targetUserId)) {
                return res.status(400).json({ error: 'Id de usuario invalido' });
            }

            const existingResult = await pool.request()
                .input('id', sql.Int, targetUserId)
                .query('SELECT TOP 1 * FROM dbo.Users WHERE Id = @id');

            if (existingResult.recordset.length === 0) {
                return res.status(404).json({ error: 'Usuario nao encontrado' });
            }

            const existing = existingResult.recordset[0];
            const username = normalizeNullableString(req.body.username, 100);
            const password = normalizeNullableString(req.body.password, 200);
            const email = normalizeNullableString(req.body.email, 200);
            const fullName = normalizeNullableString(req.body.fullName, 200);
            const isAdmin = req.body.isAdmin !== undefined ? !!req.body.isAdmin : !!existing.IsAdmin;
            const isActive = req.body.isActive !== undefined ? !!req.body.isActive : !!existing.IsActive;

            if (!username) {
                return res.status(400).json({ error: 'Usuario e obrigatorio' });
            }

            const duplicate = await pool.request()
                .input('username', sql.NVarChar(100), username)
                .input('id', sql.Int, targetUserId)
                .query('SELECT TOP 1 Id FROM dbo.Users WHERE Username = @username AND Id <> @id');

            if (duplicate.recordset.length > 0) {
                return res.status(409).json({ error: 'Ja existe um usuario com esse login' });
            }

            if (targetUserId === req.user.id && (!isActive || !isAdmin)) {
                return res.status(400).json({ error: 'Voce nao pode remover seu proprio acesso administrativo' });
            }

            if (existing.IsAdmin && (!isAdmin || !isActive)) {
                const otherAdmins = await countActiveAdmins(pool, targetUserId);
                if (otherAdmins === 0) {
                    return res.status(400).json({ error: 'O ultimo administrador ativo nao pode ser desativado' });
                }
            }

            const passwordHash = password ? await bcrypt.hash(password, 10) : null;
            const update = await pool.request()
                .input('id', sql.Int, targetUserId)
                .input('username', sql.NVarChar(100), username)
                .input('passwordHash', sql.NVarChar(500), passwordHash)
                .input('email', sql.NVarChar(200), email)
                .input('fullName', sql.NVarChar(200), fullName)
                .input('isAdmin', sql.Bit, isAdmin)
                .input('isActive', sql.Bit, isActive)
                .query(`
                    UPDATE dbo.Users
                    SET Username = @username,
                        PasswordHash = COALESCE(@passwordHash, PasswordHash),
                        Email = @email,
                        FullName = @fullName,
                        IsAdmin = @isAdmin,
                        IsActive = @isActive
                    OUTPUT INSERTED.Id, INSERTED.Username, INSERTED.Email, INSERTED.FullName, INSERTED.IsAdmin, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.LastLogin
                    WHERE Id = @id
                `);

            return res.json(sanitizeUser(update.recordset[0]));
        } catch (error) {
            console.error('[Users] Erro ao atualizar usuario:', error);
            return res.status(500).json({ error: 'Erro ao atualizar usuario' });
        }
    });

    router.delete('/:id', authenticateToken, async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        try {
            const pool = getPool();
            if (!pool || !pool.connected) {
                return res.status(503).json({ error: 'Banco de dados indisponivel' });
            }

            const targetUserId = parseInt(req.params.id, 10);
            if (!Number.isFinite(targetUserId)) {
                return res.status(400).json({ error: 'Id de usuario invalido' });
            }

            if (targetUserId === req.user.id) {
                return res.status(400).json({ error: 'Voce nao pode excluir seu proprio usuario' });
            }

            const current = await pool.request()
                .input('id', sql.Int, targetUserId)
                .query('SELECT TOP 1 Id, IsAdmin, IsActive FROM dbo.Users WHERE Id = @id');

            if (current.recordset.length === 0) {
                return res.status(404).json({ error: 'Usuario nao encontrado' });
            }

            const user = current.recordset[0];
            if (user.IsAdmin && user.IsActive) {
                const otherAdmins = await countActiveAdmins(pool, targetUserId);
                if (otherAdmins === 0) {
                    return res.status(400).json({ error: 'O ultimo administrador ativo nao pode ser excluido' });
                }
            }

            await pool.request()
                .input('id', sql.Int, targetUserId)
                .query('UPDATE dbo.Users SET IsActive = 0 WHERE Id = @id');

            return res.status(204).send();
        } catch (error) {
            console.error('[Users] Erro ao excluir usuario:', error);
            return res.status(500).json({ error: 'Erro ao excluir usuario' });
        }
    });

    return router;
}

module.exports = {
    createUserManagementRouter
};
