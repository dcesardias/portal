// server.js
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

try { require('dotenv').config(); } catch (e) { console.warn('dotenv não encontrado (opcional)'); }

const app = express();
// No IIS/iisnode, PORT é um named pipe (string), não um número
const PORT = process.env.PORT || process.env.IISNODE_VERSION ? process.env.PORT : 3000;
const HOST = process.env.IISNODE_VERSION ? undefined : (process.env.HOST || '0.0.0.0');

const DIRECT_LINE_SECRET = process.env.DIRECT_LINE_SECRET;
const DIRECT_LINE_ENDPOINT = process.env.DIRECT_LINE_ENDPOINT || 'https://directline.botframework.com/v3/directline';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fetchFn = (typeof fetch !== 'undefined')
    ? fetch
    : (...args) => import('node-fetch').then(({ default: f }) => f(...args));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static('uploads'));

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
        trustServerCertificate: true
    }
};

let pool;

async function initDB() {
    try {
        pool = await sql.connect(config);
        console.log('Conectado ao SQL Server');
        sql.on('error', err => {
            console.error('mssql global error:', err);
        });
    } catch (err) {
        console.error('Erro ao conectar ao SQL Server:', err);
        pool = null;
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
            { id: user.Id, username: user.Username, isAdmin: !!user.IsAdmin },
            secret,
            { expiresIn: '24h' }
        );
        res.json({ token, user: { id: user.Id, username: user.Username, isAdmin: !!user.IsAdmin } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.get('/api/verify-token', authenticateToken, (req, res) => {
    res.json({ user: req.user });
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
        const { title, subtitle, description, powerBIUrl, showInHome, icon, order } = req.body;

        const result = await pool.request()
            .input('title', sql.NVarChar, title)
            .input('subtitle', sql.NVarChar, subtitle)
            .input('description', sql.NVarChar, description)
            .input('powerBIUrl', sql.NVarChar, powerBIUrl)
            .input('showInHome', sql.Bit, showInHome !== false ? 1 : 0)
            .input('icon', sql.NVarChar, icon || null)
            .input('order', sql.Int, Number.isInteger(order) ? order : null)
            .query(`
                INSERT INTO Pages (Title, Subtitle, Description, PowerBIUrl, ShowInHome, Icon, [Order])
                OUTPUT INSERTED.*
                SELECT 
                    @title, @subtitle, @description, @powerBIUrl, @showInHome, @icon,
                    COALESCE(@order, (SELECT ISNULL(MAX([Order]), 0) + 10 FROM Pages))
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
        const { title, subtitle, description, powerBIUrl, showInHome, icon, order } = req.body;

        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('title', sql.NVarChar, title)
            .input('subtitle', sql.NVarChar, subtitle)
            .input('description', sql.NVarChar, description)
            .input('powerBIUrl', sql.NVarChar, powerBIUrl)
            .input('showInHome', sql.Bit, showInHome !== false ? 1 : 0)
            .input('icon', sql.NVarChar, icon || null)
            .input('order', sql.Int, Number.isInteger(order) ? order : null)
            .query(`
                UPDATE Pages
                SET Title = @title,
                    Subtitle = @subtitle,
                    Description = @description,
                    PowerBIUrl = @powerBIUrl,
                    ShowInHome = @showInHome,
                    Icon = @icon,
                    [Order] = COALESCE(@order, [Order]),
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
            return res.status(502).json({ error: 'Falha ao conectar', stage: 'conversation_start' });
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
            return res.status(502).json({ error: 'Falha ao enviar', stage: 'message_send' });
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
                return res.status(502).json({ error: 'Falha polling', stage: 'response_polling' });
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
            return res.status(504).json({ error: 'Timeout', stage: 'timeout' });
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

// Adicione esta rota APÓS a rota /api/chat/generate-chart (por volta da linha 1460)

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
        request.timeout = 30000;
        const start = Date.now();
        const result = await request.query(query);
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
        const msg = err && err.message ? err.message : String(err);
        let userMsg = 'Erro ao executar consulta';
        if (/Invalid object name/i.test(msg)) userMsg = 'Tabela não encontrada. Verifique o nome da tabela.';
        else if (/Invalid column name/i.test(msg)) userMsg = 'Coluna não encontrada. Verifique o nome da coluna.';
        else if (/timeout/i.test(msg)) userMsg = 'A consulta demorou muito para executar. Tente uma consulta mais simples.';
        else if (/Incorrect syntax/i.test(msg)) userMsg = 'Erro de sintaxe SQL. A query gerada está malformada.';

        return res.status(400).json({
            message: userMsg,
            error: msg,
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

// ROTAS DE DICIONÁRIO DE DADOS

app.get('/api/data-dictionaries', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const result = await pool.request().query(`
            SELECT 
                d.Id as id,
                d.Name as name,
                d.Description as description,
                d.IsActive as isActive,
                d.IsDefault as isDefault,
                d.CreatedAt as createdAt,
                d.UpdatedAt as updatedAt,
                COUNT(dt.Id) as tableCount
            FROM DataDictionaries d
            LEFT JOIN DataDictionaryTables dt ON d.Id = dt.DictionaryId AND dt.IsActive = 1
            GROUP BY d.Id, d.Name, d.Description, d.IsActive, d.IsDefault, d.CreatedAt, d.UpdatedAt
            ORDER BY d.IsDefault DESC, d.Name ASC
        `);
        
        res.json(result.recordset);
        
    } catch (error) {
        console.error('Erro ao listar dicionários:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

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

app.get('/api/data-dictionaries/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        
        const result = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query(`
                SELECT 
                    Id as id,
                    Name as name,
                    Description as description,
                    IsActive as isActive,
                    IsDefault as isDefault,
                    CreatedAt as createdAt,
                    UpdatedAt as updatedAt
                FROM DataDictionaries
                WHERE Id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Dicionário não encontrado' });
        }
        
        res.json(result.recordset[0]);
        
    } catch (error) {
        console.error('Erro ao buscar dicionário:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.get('/api/data-dictionaries/:id/full', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        
        const dictResult = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query(`
                SELECT 
                    Id as id,
                    Name as name,
                    Description as description,
                    IsActive as isActive,
                    IsDefault as isDefault,
                    CreatedAt as createdAt,
                    UpdatedAt as updatedAt
                FROM DataDictionaries
                WHERE Id = @id
            `);
        
        if (dictResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Dicionário não encontrado' });
        }
        
        const dictionary = dictResult.recordset[0];
        
        const tablesResult = await pool.request()
            .input('dictionaryId', sql.Int, dictionaryId)
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
        console.error('Erro ao buscar dicionário completo:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.post('/api/data-dictionaries', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const { name, description, isDefault } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Nome do dicionário é obrigatório' });
        }
        
        const existingResult = await pool.request()
            .input('name', sql.NVarChar(200), name.trim())
            .query('SELECT Id FROM DataDictionaries WHERE Name = @name');
        
        if (existingResult.recordset.length > 0) {
            return res.status(409).json({ message: 'Já existe um dicionário com esse nome' });
        }
        
        if (isDefault) {
            await pool.request().query('UPDATE DataDictionaries SET IsDefault = 0');
        }
        
        const result = await pool.request()
            .input('name', sql.NVarChar(200), name.trim())
            .input('description', sql.NVarChar(1000), description ? description.trim() : null)
            .input('isDefault', sql.Bit, isDefault || false)
            .query(`
                INSERT INTO DataDictionaries (Name, Description, IsDefault, IsActive)
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Description, INSERTED.IsActive, INSERTED.IsDefault
                VALUES (@name, @description, @isDefault, 1)
            `);
        
        res.status(201).json(result.recordset[0]);
        
    } catch (error) {
        console.error('Erro ao criar dicionário:', error);
        if (error.number === 2627) {
            res.status(409).json({ message: 'Já existe um dicionário com esse nome' });
        } else {
            res.status(500).json({ message: 'Erro interno do servidor' });
        }
    }
});

app.put('/api/data-dictionaries/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        const { name, description, isDefault } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Nome do dicionário é obrigatório' });
        }
        
        const existingResult = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaries WHERE Id = @id');
        
        if (existingResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Dicionário não encontrado' });
        }
        
        const duplicateResult = await pool.request()
            .input('name', sql.NVarChar(200), name.trim())
            .input('id', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaries WHERE Name = @name AND Id != @id');
        
        if (duplicateResult.recordset.length > 0) {
            return res.status(409).json({ message: 'Já existe outro dicionário com esse nome' });
        }
        
        if (isDefault) {
            await pool.request()
                .input('id', sql.Int, dictionaryId)
                .query('UPDATE DataDictionaries SET IsDefault = 0 WHERE Id != @id');
        }
        
        const result = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('description', sql.NVarChar(1000), description ? description.trim() : null)
            .input('isDefault', sql.Bit, isDefault || false)
            .query(`
                UPDATE DataDictionaries 
                SET Name = @name, Description = @description, IsDefault = @isDefault, UpdatedAt = GETDATE()
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Description, INSERTED.IsActive, INSERTED.IsDefault
                WHERE Id = @id
            `);
        
        res.json(result.recordset[0]);
        
    } catch (error) {
        console.error('Erro ao atualizar dicionário:', error);
        if (error.number === 2627) {
            res.status(409).json({ message: 'Já existe um dicionário com esse nome' });
        } else {
            res.status(500).json({ message: 'Erro interno do servidor' });
        }
    }
});

app.put('/api/data-dictionaries/:id/set-default', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        
        const existingResult = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaries WHERE Id = @id AND IsActive = 1');
        
        if (existingResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Dicionário não encontrado ou inativo' });
        }
        
        await pool.request().query('UPDATE DataDictionaries SET IsDefault = 0');
        
        await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query('UPDATE DataDictionaries SET IsDefault = 1, UpdatedAt = GETDATE() WHERE Id = @id');
        
        res.json({ message: 'Dicionário definido como padrão com sucesso' });
        
    } catch (error) {
        console.error('Erro ao definir dicionário padrão:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.put('/api/data-dictionaries/:id/toggle-status', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        
        console.log(`[TOGGLE-STATUS] Request to toggle dictionary ${dictionaryId} by user ${req.user.username}`);
        
        const existingResult = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query('SELECT Id, IsActive, IsDefault, Name FROM DataDictionaries WHERE Id = @id');
        
        if (existingResult.recordset.length === 0) {
            console.log(`[TOGGLE-STATUS] Dictionary ${dictionaryId} not found`);
            return res.status(404).json({ message: 'Dicionário não encontrado' });
        }
        
        const dictionary = existingResult.recordset[0];
        console.log(`[TOGGLE-STATUS] Current status: IsActive=${dictionary.IsActive}, IsDefault=${dictionary.IsDefault}, Name=${dictionary.Name}`);
        
        if (dictionary.IsDefault && dictionary.IsActive) {
            console.log(`[TOGGLE-STATUS] Cannot deactivate default dictionary ${dictionaryId}`);
            return res.status(400).json({ message: 'Não é possível desativar o dicionário padrão' });
        }
        
        const newStatus = !dictionary.IsActive;
        console.log(`[TOGGLE-STATUS] Changing status from ${dictionary.IsActive} to ${newStatus}`);
        
        const result = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .input('newStatus', sql.Bit, newStatus)
            .query(`
                UPDATE DataDictionaries 
                SET IsActive = @newStatus, UpdatedAt = GETDATE()
                OUTPUT INSERTED.IsActive, INSERTED.Name
                WHERE Id = @id
            `);
        
        const updated = result.recordset[0];
        console.log(`[TOGGLE-STATUS] Successfully updated dictionary ${dictionaryId}: IsActive=${updated.IsActive}`);
        
        res.json({ 
            message: `Dicionário "${updated.Name}" ${updated.IsActive ? 'ativado' : 'desativado'} com sucesso`,
            isActive: updated.IsActive,
            dictionaryId: dictionaryId
        });
        
    } catch (error) {
        console.error('[TOGGLE-STATUS] Database error:', error);
        res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
    }
});

// NOVA ROTA DELETE
app.delete('/api/data-dictionaries/:id', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const id = parseInt(req.params.id);
        
        const checkResult = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT IsDefault FROM DataDictionaries WHERE Id = @id');
        
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Dicionário não encontrado' });
        }
        
        if (checkResult.recordset[0].IsDefault) {
            return res.status(400).json({ message: 'Não é possível excluir o dicionário padrão' });
        }
        
        await pool.request()
            .input('id', sql.Int, id)
            .query(`
                UPDATE DataDictionaries SET IsActive = 0 WHERE Id = @id;
                UPDATE DataDictionaryTables SET IsActive = 0 WHERE DictionaryId = @id;
            `);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Erro ao excluir dicionário:', error);
        res.status(500).json({ message: 'Erro interno' });
    }
});

// ROTAS DE GERENCIAMENTO DE TABELAS E COLUNAS

// Criar tabela
app.post('/api/data-dictionaries/:id/tables', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        const { name, description } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Nome da tabela é obrigatório' });
        }
        
        // Verificar se dicionário existe
        const dictCheck = await pool.request()
            .input('id', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaries WHERE Id = @id');
        
        if (dictCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Dicionário não encontrado' });
        }
        
        // Verificar duplicata
        const dupCheck = await pool.request()
            .input('dictionaryId', sql.Int, dictionaryId)
            .input('name', sql.NVarChar(200), name.trim())
            .query('SELECT Id FROM DataDictionaryTables WHERE DictionaryId = @dictionaryId AND Name = @name AND IsActive = 1');
        
        if (dupCheck.recordset.length > 0) {
            return res.status(409).json({ message: 'Já existe uma tabela com esse nome neste dicionário' });
        }
        
        // Calcular próxima ordem
        const orderResult = await pool.request()
            .input('dictionaryId', sql.Int, dictionaryId)
            .query('SELECT ISNULL(MAX([Order]), 0) + 10 AS NextOrder FROM DataDictionaryTables WHERE DictionaryId = @dictionaryId');
        
        const nextOrder = orderResult.recordset[0].NextOrder;
        
        // Inserir
        const result = await pool.request()
            .input('dictionaryId', sql.Int, dictionaryId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('description', sql.NVarChar(1000), description ? description.trim() : null)
            .input('order', sql.Int, nextOrder)
            .query(`
                INSERT INTO DataDictionaryTables (DictionaryId, Name, Description, [Order], IsActive)
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Description, INSERTED.[Order]
                VALUES (@dictionaryId, @name, @description, @order, 1)
            `);
        
        res.status(201).json(result.recordset[0]);
        
    } catch (error) {
        console.error('Erro ao criar tabela:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Editar tabela
app.put('/api/data-dictionaries/:id/tables/:tableId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        const tableId = parseInt(req.params.tableId);
        const { name, description } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Nome da tabela é obrigatório' });
        }
        
        // Verificar se tabela existe
        const tableCheck = await pool.request()
            .input('id', sql.Int, tableId)
            .input('dictionaryId', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaryTables WHERE Id = @id AND DictionaryId = @dictionaryId AND IsActive = 1');
        
        if (tableCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Tabela não encontrada' });
        }
        
        // Verificar duplicata
        const dupCheck = await pool.request()
            .input('dictionaryId', sql.Int, dictionaryId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('id', sql.Int, tableId)
            .query('SELECT Id FROM DataDictionaryTables WHERE DictionaryId = @dictionaryId AND Name = @name AND Id != @id AND IsActive = 1');
        
        if (dupCheck.recordset.length > 0) {
            return res.status(409).json({ message: 'Já existe outra tabela com esse nome neste dicionário' });
        }
        
        // Atualizar
        const result = await pool.request()
            .input('id', sql.Int, tableId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('description', sql.NVarChar(1000), description ? description.trim() : null)
            .query(`
                UPDATE DataDictionaryTables 
                SET Name = @name, Description = @description, UpdatedAt = GETDATE()
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Description, INSERTED.[Order]
                WHERE Id = @id
            `);
        
        res.json(result.recordset[0]);
        
    } catch (error) {
        console.error('Erro ao editar tabela:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Excluir tabela
app.delete('/api/data-dictionaries/:id/tables/:tableId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        const tableId = parseInt(req.params.tableId);
        
        // Verificar se tabela existe
        const tableCheck = await pool.request()
            .input('id', sql.Int, tableId)
            .input('dictionaryId', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaryTables WHERE Id = @id AND DictionaryId = @dictionaryId AND IsActive = 1');
        
        if (tableCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Tabela não encontrada' });
        }
        
        // Soft delete da tabela e suas colunas
        await pool.request()
            .input('id', sql.Int, tableId)
            .query(`
                UPDATE DataDictionaryTables SET IsActive = 0, UpdatedAt = GETDATE() WHERE Id = @id;
                UPDATE DataDictionaryColumns SET IsActive = 0, UpdatedAt = GETDATE() WHERE TableId = @id;
            `);
        
        res.json({ success: true, message: 'Tabela excluída com sucesso' });
        
    } catch (error) {
        console.error('Erro ao excluir tabela:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Criar coluna
app.post('/api/data-dictionaries/:id/tables/:tableId/columns', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const dictionaryId = parseInt(req.params.id);
        const tableId = parseInt(req.params.tableId);
        const { name, type, description } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Nome da coluna é obrigatório' });
        }
        
        if (!type || type.trim().length === 0) {
            return res.status(400).json({ message: 'Tipo da coluna é obrigatório' });
        }
        
        // Verificar se tabela existe
        const tableCheck = await pool.request()
            .input('id', sql.Int, tableId)
            .input('dictionaryId', sql.Int, dictionaryId)
            .query('SELECT Id FROM DataDictionaryTables WHERE Id = @id AND DictionaryId = @dictionaryId AND IsActive = 1');
        
        if (tableCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Tabela não encontrada' });
        }
        
        // Verificar duplicata
        const dupCheck = await pool.request()
            .input('tableId', sql.Int, tableId)
            .input('name', sql.NVarChar(200), name.trim())
            .query('SELECT Id FROM DataDictionaryColumns WHERE TableId = @tableId AND Name = @name AND IsActive = 1');
        
        if (dupCheck.recordset.length > 0) {
            return res.status(409).json({ message: 'Já existe uma coluna com esse nome nesta tabela' });
        }
        
        // Calcular próxima ordem
        const orderResult = await pool.request()
            .input('tableId', sql.Int, tableId)
            .query('SELECT ISNULL(MAX([Order]), 0) + 10 AS NextOrder FROM DataDictionaryColumns WHERE TableId = @tableId');
        
        const nextOrder = orderResult.recordset[0].NextOrder;
        
        // Inserir - usando sql.NVarChar(sql.MAX) para descrição
        const result = await pool.request()
            .input('tableId', sql.Int, tableId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('type', sql.NVarChar(50), type.trim())
            .input('description', sql.NVarChar(sql.MAX), description ? description.trim() : null)
            .input('order', sql.Int, nextOrder)
            .query(`
                INSERT INTO DataDictionaryColumns (TableId, Name, Type, Description, [Order], IsActive)
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Type, INSERTED.Description, INSERTED.[Order]
                VALUES (@tableId, @name, @type, @description, @order, 1)
            `);
        
        res.status(201).json(result.recordset[0]);
        
    } catch (error) {
        console.error('Erro ao criar coluna:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Editar coluna
app.put('/api/data-dictionaries/:id/tables/:tableId/columns/:columnId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const columnId = parseInt(req.params.columnId);
        const tableId = parseInt(req.params.tableId);
        const { name, type, description } = req.body;
        
        console.log(`[EDIT COLUMN] ID: ${columnId}, Table: ${tableId}, Name: ${name}, Type: ${type}, Desc length: ${description?.length || 0}`);
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: 'Nome da coluna é obrigatório' });
        }
        
        if (!type || type.trim().length === 0) {
            return res.status(400).json({ message: 'Tipo da coluna é obrigatório' });
        }
        
        // Sem limitação de tamanho - usando NVARCHAR(MAX)
        const finalDesc = description ? description.trim() : null;
        
        // Verificar se coluna existe
        const colCheck = await pool.request()
            .input('id', sql.Int, columnId)
            .input('tableId', sql.Int, tableId)
            .query('SELECT Id FROM DataDictionaryColumns WHERE Id = @id AND TableId = @tableId AND IsActive = 1');
        
        if (colCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Coluna não encontrada' });
        }
        
        // Verificar duplicata
        const dupCheck = await pool.request()
            .input('tableId', sql.Int, tableId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('id', sql.Int, columnId)
            .query('SELECT Id FROM DataDictionaryColumns WHERE TableId = @tableId AND Name = @name AND Id != @id AND IsActive = 1');
        
        if (dupCheck.recordset.length > 0) {
            return res.status(409).json({ message: 'Já existe outra coluna com esse nome nesta tabela' });
        }
        
        // Atualizar - usando sql.NVarChar(sql.MAX) para descrição
        const result = await pool.request()
            .input('id', sql.Int, columnId)
            .input('name', sql.NVarChar(200), name.trim())
            .input('type', sql.NVarChar(50), type.trim())
            .input('description', sql.NVarChar(sql.MAX), finalDesc)
            .query(`
                UPDATE DataDictionaryColumns 
                SET Name = @name, Type = @type, Description = @description, UpdatedAt = GETDATE()
                OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Type, INSERTED.Description, INSERTED.[Order]
                WHERE Id = @id
            `);
        
        console.log(`[EDIT COLUMN] Sucesso! Coluna ${columnId} atualizada`);
        res.json(result.recordset[0]);
        
    } catch (error) {
        console.error('[EDIT COLUMN] Erro:', error);
        console.error('[EDIT COLUMN] Stack:', error.stack);
        res.status(500).json({ 
            message: 'Erro interno do servidor', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Excluir coluna
app.delete('/api/data-dictionaries/:id/tables/:tableId/columns/:columnId', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const columnId = parseInt(req.params.columnId);
        const tableId = parseInt(req.params.tableId);
        
        // Verificar se coluna existe
        const colCheck = await pool.request()
            .input('id', sql.Int, columnId)
            .input('tableId', sql.Int, tableId)
            .query('SELECT Id FROM DataDictionaryColumns WHERE Id = @id AND TableId = @tableId AND IsActive = 1');
        
        if (colCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Coluna não encontrada' });
        }
        
        // Soft delete
        await pool.request()
            .input('id', sql.Int, columnId)
            .query('UPDATE DataDictionaryColumns SET IsActive = 0, UpdatedAt = GETDATE() WHERE Id = @id');
        
        res.json({ success: true, message: 'Coluna excluída com sucesso' });
        
    } catch (error) {
        console.error('Erro ao excluir coluna:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Inicializar servidor
async function startServer() {
    await initDB();
    await ensurePagesOrderColumn();
    app.listen(PORT, HOST, () => {
        console.log(`Servidor rodando em http://${HOST}:${PORT}`);
        console.log(`Acesse: http://localhost:${PORT}`);
    });
}

startServer();