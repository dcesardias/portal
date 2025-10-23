'use strict';
const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');
const { authenticateToken, optionalAuthenticate } = require('../middleware/auth');

// Listar dicionários
router.get('/', optionalAuthenticate, async (req, res) => {
	const pool = getPool();
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

// Buscar dicionário ativo (padrão)
router.get('/active', optionalAuthenticate, async (req, res) => {
	const pool = getPool();
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
		if (!dictResult.recordset.length) return res.status(404).json({ message: 'Nenhum dicionário ativo encontrado' });
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

// Obter dicionário por ID (resumo)
router.get('/:id', optionalAuthenticate, async (req, res) => {
	const pool = getPool();
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

// Obter dicionário completo (com tabelas e colunas)
router.get('/:id/full', optionalAuthenticate, async (req, res) => {
	const pool = getPool();
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
				WHERE DictionaryId = @id AND ISNULL(IsActive,1) = 1
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
				WHERE TableId IN (${inList}) AND ISNULL(IsActive,1) = 1
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

// Criar dicionário
router.post('/', authenticateToken, async (req, res) => {
	const pool = getPool();
	if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
	try {
		const { name, description, isDefault } = req.body || {};
		if (!name || !String(name).trim()) return res.status(400).json({ message: 'Nome é obrigatório' });

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

// Atualizar dicionário
router.put('/:id', authenticateToken, async (req, res) => {
	const pool = getPool();
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

// Deletar dicionário (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
	const pool = getPool();
	if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
	try {
		const id = parseInt(req.params.id);
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

// Definir como padrão
router.put('/:id/set-default', authenticateToken, async (req, res) => {
	const pool = getPool();
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

// Alternar status ativo
router.put('/:id/toggle-status', authenticateToken, async (req, res) => {
	const pool = getPool();
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
router.post('/:dictId/tables', authenticateToken, async (req, res) => {
	const pool = getPool();
	if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
	try {
		const dictId = parseInt(req.params.dictId);
		const { name, description } = req.body || {};
		if (!name || !String(name).trim()) return res.status(400).json({ message: 'Nome da tabela é obrigatório' });

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

router.put('/:dictId/tables/:tableId', authenticateToken, async (req, res) => {
	const pool = getPool();
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

router.delete('/:dictId/tables/:tableId', authenticateToken, async (req, res) => {
	const pool = getPool();
	if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
	try {
		const tableId = parseInt(req.params.tableId);
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
router.post('/:dictId/tables/:tableId/columns', authenticateToken, async (req, res) => {
	const pool = getPool();
	if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
	try {
		const tableId = parseInt(req.params.tableId);
		const { name, type, description } = req.body || {};
		if (!name || !type) return res.status(400).json({ message: 'Nome e Tipo são obrigatórios' });

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

router.put('/:dictId/tables/:tableId/columns/:columnId', authenticateToken, async (req, res) => {
	const pool = getPool();
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

router.delete('/:dictId/tables/:tableId/columns/:columnId', authenticateToken, async (req, res) => {
	const pool = getPool();
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

module.exports = router;
