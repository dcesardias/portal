'use strict';
const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');
const { authenticateToken, optionalAuthenticate } = require('../middleware/auth');

// Listar todos os tutoriais
router.get('/', optionalAuthenticate, async (req, res) => {
    try {
        const pool = getPool();
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
        res.status(500).json({ error: 'Erro ao listar tutoriais' });
    }
});

// Buscar tutorial por ID da página
router.get('/page/:pageId', optionalAuthenticate, async (req, res) => {
    try {
        const pool = getPool();
        const pageId = parseInt(req.params.pageId);
        const result = await pool.request()
            .input('pageId', sql.Int, pageId)
            .query(`
                SELECT TOP 1 Id, PageId, Steps, IsActive, CreatedAt, UpdatedAt
                FROM Tutorials
                WHERE PageId = @pageId AND IsActive = 1
                ORDER BY UpdatedAt DESC
            `);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Tutorial não encontrado' });
        const t = result.recordset[0];
        res.json({
            id: t.Id,
            pageId: t.PageId,
            steps: t.Steps ? JSON.parse(t.Steps) : [],
            isActive: !!t.IsActive,
            createdAt: t.CreatedAt,
            updatedAt: t.UpdatedAt
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar tutorial' });
    }
});

// Buscar tutorial por ID
router.get('/:id', optionalAuthenticate, async (req, res) => {
    try {
        const pool = getPool();
        const id = parseInt(req.params.id);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT Id, PageId, Steps, IsActive, CreatedAt, UpdatedAt
                FROM Tutorials
                WHERE Id = @id AND IsActive = 1
            `);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Tutorial não encontrado' });
        const t = result.recordset[0];
        res.json({
            id: t.Id,
            pageId: t.PageId,
            steps: t.Steps ? JSON.parse(t.Steps) : [],
            isActive: !!t.IsActive,
            createdAt: t.CreatedAt,
            updatedAt: t.UpdatedAt
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar tutorial' });
    }
});

// Criar ou atualizar (upsert) tutorial por PageId
router.post('/', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const pool = getPool();
        const { pageId, steps } = req.body;
        if (!pageId || !steps || !Array.isArray(steps) || steps.length === 0) {
            return res.status(400).json({ error: 'Dados inválidos', details: 'pageId e steps (array) são obrigatórios' });
        }
        const stepsJson = JSON.stringify(steps);
        const existing = await pool.request()
            .input('pageId', sql.Int, pageId)
            .query(`SELECT TOP 1 Id FROM Tutorials WHERE PageId = @pageId AND IsActive = 1`);

        let result;
        if (existing.recordset.length > 0) {
            const tutorialId = existing.recordset[0].Id;
            result = await pool.request()
                .input('id', sql.Int, tutorialId)
                .input('steps', sql.NVarChar(sql.MAX), stepsJson)
                .query(`
                    UPDATE Tutorials
                    SET Steps = @steps, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.*
                    WHERE Id = @id
                `);
        } else {
            result = await pool.request()
                .input('pageId', sql.Int, pageId)
                .input('steps', sql.NVarChar(sql.MAX), stepsJson)
                .query(`
                    INSERT INTO Tutorials (PageId, Steps, IsActive, CreatedAt, UpdatedAt)
                    OUTPUT INSERTED.*
                    VALUES (@pageId, @steps, 1, GETDATE(), GETDATE())
                `);
        }
        const t = result.recordset[0];
        res.status(201).json({
            id: t.Id,
            pageId: t.PageId,
            steps: JSON.parse(t.Steps),
            isActive: !!t.IsActive,
            createdAt: t.CreatedAt,
            updatedAt: t.UpdatedAt
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar tutorial', details: err.message });
    }
});

// Atualizar tutorial por Id
router.put('/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const pool = getPool();
        const id = parseInt(req.params.id);
        const { steps } = req.body;
        if (!steps || !Array.isArray(steps)) {
            return res.status(400).json({ error: 'Dados inválidos', details: 'steps é obrigatório e deve ser um array' });
        }
        const stepsJson = JSON.stringify(steps);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('steps', sql.NVarChar(sql.MAX), stepsJson)
            .query(`
                UPDATE Tutorials
                SET Steps = @steps, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND IsActive = 1
            `);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Tutorial não encontrado' });
        const t = result.recordset[0];
        res.json({
            id: t.Id,
            pageId: t.PageId,
            steps: JSON.parse(t.Steps),
            isActive: !!t.IsActive,
            createdAt: t.CreatedAt,
            updatedAt: t.UpdatedAt
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar tutorial' });
    }
});

// Soft delete
router.delete('/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const pool = getPool();
        const id = parseInt(req.params.id);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                UPDATE Tutorials
                SET IsActive = 0, UpdatedAt = GETDATE()
                WHERE Id = @id
            `);
        if (!result.rowsAffected || result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Tutorial não encontrado' });
        }
        res.json({ success: true, message: 'Tutorial excluído com sucesso' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir tutorial' });
    }
});

module.exports = router;
