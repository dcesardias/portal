const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { pathToFileURL } = require('url');

let mapDbMounted = false;
let mapDbModulesPromise = null;

function sanitizeConnection(conn) {
    return {
        id: conn.id,
        name: conn.name,
        engine: conn.engine,
        server: conn.server,
        defaultDatabase: conn.defaultDatabase,
        port: conn.port,
        authenticationType: conn.authenticationType,
        user: conn.user
    };
}

function normalizeConnectionRow(row) {
    return {
        id: row.Id,
        name: row.Name,
        engine: row.Engine,
        server: row.ServerName,
        defaultDatabase: row.DefaultDatabase,
        port: row.Port,
        authenticationType: row.AuthenticationType,
        user: row.Username,
        password: row.PasswordValue,
        encrypt: !!row.Encrypt,
        trustServerCertificate: !!row.TrustServerCertificate,
        serviceName: row.ServiceName,
        sid: row.Sid
    };
}

async function importMapDbModules(baseDir) {
    if (!mapDbModulesPromise) {
        const mapDbBackendDir = path.join(baseDir, 'mapdb-backend', 'src');
        mapDbModulesPromise = Promise.all([
            import(pathToFileURL(path.join(mapDbBackendDir, 'services', 'connectionManager.js')).href),
            import(pathToFileURL(path.join(mapDbBackendDir, 'config', 'database.js')).href),
            import(pathToFileURL(path.join(mapDbBackendDir, 'routes', 'databases.js')).href),
            import(pathToFileURL(path.join(mapDbBackendDir, 'routes', 'objects.js')).href),
            import(pathToFileURL(path.join(mapDbBackendDir, 'routes', 'dependencies.js')).href),
            import(pathToFileURL(path.join(mapDbBackendDir, 'routes', 'script.js')).href),
            import(pathToFileURL(path.join(mapDbBackendDir, 'middleware', 'errorHandler.js')).href)
        ]).then(([
            connectionManager,
            database,
            databases,
            objects,
            dependencies,
            script,
            errorHandler
        ]) => ({
            connectionManager,
            database,
            databasesRouter: databases.databasesRouter,
            objectsRouter: objects.objectsRouter,
            dependenciesRouter: dependencies.dependenciesRouter,
            scriptRouter: script.scriptRouter,
            errorHandler: errorHandler.errorHandler,
            loadOracleDatabase: () => import(pathToFileURL(path.join(mapDbBackendDir, 'config', 'oracleDatabase.js')).href)
        }));
    }

    return mapDbModulesPromise;
}

async function loadUserConnections(pool, userId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT
                Id,
                UserId,
                Name,
                Engine,
                ServerName,
                Port,
                DefaultDatabase,
                AuthenticationType,
                Username,
                PasswordValue,
                Encrypt,
                TrustServerCertificate,
                ServiceName,
                Sid
            FROM dbo.MapDBConnections
            WHERE UserId = @userId
            ORDER BY Name, CreatedAt
        `);

    return result.recordset.map(normalizeConnectionRow);
}

async function ensureOwnedConnection(pool, userId, connectionId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('id', sql.UniqueIdentifier, connectionId)
        .query(`
            SELECT TOP 1
                Id,
                UserId,
                Name,
                Engine,
                ServerName,
                Port,
                DefaultDatabase,
                AuthenticationType,
                Username,
                PasswordValue,
                Encrypt,
                TrustServerCertificate,
                ServiceName,
                Sid
            FROM dbo.MapDBConnections
            WHERE UserId = @userId AND Id = @id
        `);

    return result.recordset[0] ? normalizeConnectionRow(result.recordset[0]) : null;
}

async function syncConnectionsForUser(modules, pool, userId) {
    const connections = await loadUserConnections(pool, userId);
    modules.connectionManager.replaceConnections(connections);
    return connections;
}

async function ensureMapDbTables(pool) {
    if (!pool || !pool.connected) return;

    await pool.request().batch(`
        IF OBJECT_ID('dbo.MapDBConnections', 'U') IS NULL
        BEGIN
            CREATE TABLE dbo.MapDBConnections (
                Id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_MapDBConnections PRIMARY KEY DEFAULT NEWID(),
                UserId INT NOT NULL,
                Name NVARCHAR(150) NOT NULL,
                Engine NVARCHAR(20) NOT NULL,
                ServerName NVARCHAR(255) NOT NULL,
                Port INT NOT NULL,
                DefaultDatabase NVARCHAR(255) NULL,
                AuthenticationType NVARCHAR(20) NOT NULL,
                Username NVARCHAR(255) NULL,
                PasswordValue NVARCHAR(500) NULL,
                Encrypt BIT NOT NULL CONSTRAINT DF_MapDBConnections_Encrypt DEFAULT(0),
                TrustServerCertificate BIT NOT NULL CONSTRAINT DF_MapDBConnections_TrustServerCertificate DEFAULT(1),
                ServiceName NVARCHAR(255) NULL,
                Sid NVARCHAR(255) NULL,
                CreatedAt DATETIME NOT NULL CONSTRAINT DF_MapDBConnections_CreatedAt DEFAULT(GETDATE()),
                UpdatedAt DATETIME NOT NULL CONSTRAINT DF_MapDBConnections_UpdatedAt DEFAULT(GETDATE()),
                CONSTRAINT FK_MapDBConnections_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
            );
        END;

        IF NOT EXISTS (
            SELECT 1
            FROM sys.indexes
            WHERE name = 'IX_MapDBConnections_UserId_Name'
              AND object_id = OBJECT_ID('dbo.MapDBConnections')
        )
        BEGIN
            CREATE INDEX IX_MapDBConnections_UserId_Name
                ON dbo.MapDBConnections(UserId, Name);
        END;

        IF COL_LENGTH('dbo.MapDBConnections', 'DefaultDatabase') IS NULL
        BEGIN
            ALTER TABLE dbo.MapDBConnections ADD DefaultDatabase NVARCHAR(255) NULL;
        END;
    `);
}

async function mountMapDb({ app, express, baseDir, getPool, authenticateToken }) {
    if (mapDbMounted) {
        return;
    }

    const pool = getPool();
    if (!pool || !pool.connected) {
        console.warn('[MapDB] Banco PowerBIPortal indisponivel. Rotas do MapDB nao foram montadas.');
        return;
    }

    const mapDbFrontendDir = path.join(baseDir, 'public', 'mapdb');
    const mapDbIndexFile = path.join(mapDbFrontendDir, 'index.html');
    const mapDbBackendDir = path.join(baseDir, 'mapdb-backend', 'src');

    if (!fs.existsSync(mapDbIndexFile)) {
        console.warn('[MapDB] Frontend nao encontrado em public/mapdb.');
        return;
    }

    if (!fs.existsSync(mapDbBackendDir)) {
        console.warn('[MapDB] Backend nao encontrado em mapdb-backend/src.');
        return;
    }

    const modules = await importMapDbModules(baseDir);

    const mapDbSync = async (req, res, next) => {
        try {
            const currentPool = getPool();
            if (!currentPool || !currentPool.connected) {
                return res.status(503).json({ error: 'Banco de configuracao indisponivel' });
            }
            req.mapDbConnections = await syncConnectionsForUser(modules, currentPool, req.user.id);
            return next();
        } catch (error) {
            console.error('[MapDB] Erro ao sincronizar conexoes:', error);
            return res.status(500).json({ error: 'Erro ao carregar conexoes do usuario' });
        }
    };

    const mapDbEnsureConnectionAccess = async (req, res, next) => {
        const connectionId = req.params.connId || req.params.id;
        if (!connectionId) {
            return next();
        }

        const ownedConnection = Array.isArray(req.mapDbConnections)
            ? req.mapDbConnections.find((conn) => conn.id === connectionId)
            : null;

        if (!ownedConnection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        req.mapDbConnection = ownedConnection;
        return next();
    };

    app.get('/mapdb/api/connections', authenticateToken, mapDbSync, async (req, res) => {
        res.json((req.mapDbConnections || []).map(sanitizeConnection));
    });

    app.get('/mapdb/api/connections/:id', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, async (req, res) => {
        res.json({
            ...req.mapDbConnection,
            password: undefined,
        });
    });

    app.post('/mapdb/api/connections', authenticateToken, async (req, res) => {
        try {
            const currentPool = getPool();
            if (!currentPool || !currentPool.connected) {
                return res.status(503).json({ error: 'Banco de configuracao indisponivel' });
            }

            const body = req.body || {};
            const engine = body.engine === 'oracle' ? 'oracle' : 'sqlserver';
            const name = String(body.name || '').trim();
            const serverName = String(body.server || '').trim();
            const defaultDatabase = body.defaultDatabase ? String(body.defaultDatabase).trim() : null;
            const authenticationType = engine === 'oracle'
                ? 'sql'
                : (body.authenticationType === 'windows' ? 'windows' : 'sql');
            const port = Number(body.port) || (engine === 'oracle' ? 1521 : 1433);
            const username = body.user ? String(body.user).trim() : null;
            const passwordValue = body.password ? String(body.password) : null;
            const encrypt = body.encrypt === true;
            const trustServerCertificate = body.trustServerCertificate !== false;
            const serviceName = body.serviceName ? String(body.serviceName).trim() : null;
            const sid = body.sid ? String(body.sid).trim() : null;

            if (!name || !serverName) {
                return res.status(400).json({ error: 'Nome e servidor sao obrigatorios' });
            }

            const insertResult = await currentPool.request()
                .input('userId', sql.Int, req.user.id)
                .input('name', sql.NVarChar(150), name)
                .input('engine', sql.NVarChar(20), engine)
                .input('serverName', sql.NVarChar(255), serverName)
                .input('defaultDatabase', sql.NVarChar(255), defaultDatabase)
                .input('port', sql.Int, port)
                .input('authenticationType', sql.NVarChar(20), authenticationType)
                .input('username', sql.NVarChar(255), username)
                .input('passwordValue', sql.NVarChar(500), passwordValue)
                .input('encrypt', sql.Bit, encrypt)
                .input('trustServerCertificate', sql.Bit, trustServerCertificate)
                .input('serviceName', sql.NVarChar(255), serviceName)
                .input('sid', sql.NVarChar(255), sid)
                .query(`
                    INSERT INTO dbo.MapDBConnections (
                        UserId, Name, Engine, ServerName, Port, DefaultDatabase, AuthenticationType,
                        Username, PasswordValue, Encrypt, TrustServerCertificate,
                        ServiceName, Sid, UpdatedAt
                    )
                    OUTPUT INSERTED.Id
                    VALUES (
                        @userId, @name, @engine, @serverName, @port, @defaultDatabase, @authenticationType,
                        @username, @passwordValue, @encrypt, @trustServerCertificate,
                        @serviceName, @sid, GETDATE()
                    )
                `);

            const connection = {
                id: String(insertResult.recordset[0].Id),
                name,
                engine,
                server: serverName,
                defaultDatabase: defaultDatabase || undefined,
                port,
                authenticationType,
                user: username || undefined,
                password: passwordValue || undefined,
                encrypt,
                trustServerCertificate,
                serviceName: serviceName || undefined,
                sid: sid || undefined
            };

            try {
                if (engine === 'oracle') {
                    const oracleDatabase = await modules.loadOracleDatabase();
                    await oracleDatabase.testOracleConnection(connection);
                } else {
                    await modules.database.testConnection(connection);
                }
            } catch (error) {
                console.warn('[MapDB] Conexao salva, mas o teste falhou:', error.message || error);
            }

            await syncConnectionsForUser(modules, currentPool, req.user.id);
            return res.status(201).json(sanitizeConnection(connection));
        } catch (error) {
            console.error('[MapDB] Erro ao criar conexao:', error);
            return res.status(500).json({ error: error.message || 'Erro ao salvar conexao' });
        }
    });

    app.put('/mapdb/api/connections/:id', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, async (req, res) => {
        try {
            const currentPool = getPool();
            if (!currentPool || !currentPool.connected) {
                return res.status(503).json({ error: 'Banco de configuracao indisponivel' });
            }

            const existing = req.mapDbConnection;
            const body = req.body || {};
            const engine = body.engine === 'oracle' ? 'oracle' : 'sqlserver';
            const name = String(body.name || '').trim();
            const serverName = String(body.server || '').trim();
            const defaultDatabase = body.defaultDatabase ? String(body.defaultDatabase).trim() : null;
            const authenticationType = engine === 'oracle'
                ? 'sql'
                : (body.authenticationType === 'windows' ? 'windows' : 'sql');
            const port = Number(body.port) || (engine === 'oracle' ? 1521 : 1433);
            const username = body.user ? String(body.user).trim() : null;
            const passwordValue = body.password ? String(body.password) : (existing.password || null);
            const encrypt = body.encrypt === true;
            const trustServerCertificate = body.trustServerCertificate !== false;
            const serviceName = body.serviceName ? String(body.serviceName).trim() : null;
            const sid = body.sid ? String(body.sid).trim() : null;

            if (!name || !serverName) {
                return res.status(400).json({ error: 'Nome e servidor sao obrigatorios' });
            }

            await currentPool.request()
                .input('userId', sql.Int, req.user.id)
                .input('id', sql.UniqueIdentifier, existing.id)
                .input('name', sql.NVarChar(150), name)
                .input('engine', sql.NVarChar(20), engine)
                .input('serverName', sql.NVarChar(255), serverName)
                .input('defaultDatabase', sql.NVarChar(255), defaultDatabase)
                .input('port', sql.Int, port)
                .input('authenticationType', sql.NVarChar(20), authenticationType)
                .input('username', sql.NVarChar(255), username)
                .input('passwordValue', sql.NVarChar(500), passwordValue)
                .input('encrypt', sql.Bit, encrypt)
                .input('trustServerCertificate', sql.Bit, trustServerCertificate)
                .input('serviceName', sql.NVarChar(255), serviceName)
                .input('sid', sql.NVarChar(255), sid)
                .query(`
                    UPDATE dbo.MapDBConnections
                    SET Name = @name,
                        Engine = @engine,
                        ServerName = @serverName,
                        DefaultDatabase = @defaultDatabase,
                        Port = @port,
                        AuthenticationType = @authenticationType,
                        Username = @username,
                        PasswordValue = @passwordValue,
                        Encrypt = @encrypt,
                        TrustServerCertificate = @trustServerCertificate,
                        ServiceName = @serviceName,
                        Sid = @sid,
                        UpdatedAt = GETDATE()
                    WHERE UserId = @userId AND Id = @id
                `);

            if (existing.engine === 'oracle') {
                const oracleDatabase = await modules.loadOracleDatabase();
                await oracleDatabase.closeOraclePool(existing.id);
            } else {
                await modules.database.closePool(existing.id);
            }

            if (engine === 'oracle' && existing.engine !== 'oracle') {
                const oracleDatabase = await modules.loadOracleDatabase();
                await oracleDatabase.closeOraclePool(existing.id);
            }
            if (engine !== 'oracle' && existing.engine === 'oracle') {
                await modules.database.closePool(existing.id);
            }

            await syncConnectionsForUser(modules, currentPool, req.user.id);

            return res.json(sanitizeConnection({
                ...existing,
                name,
                engine,
                server: serverName,
                defaultDatabase: defaultDatabase || undefined,
                port,
                authenticationType,
                user: username || undefined,
                password: passwordValue || undefined,
                encrypt,
                trustServerCertificate,
                serviceName: serviceName || undefined,
                sid: sid || undefined,
            }));
        } catch (error) {
            console.error('[MapDB] Erro ao atualizar conexao:', error);
            return res.status(500).json({ error: error.message || 'Erro ao atualizar conexao' });
        }
    });

    app.post('/mapdb/api/connections/:id/test', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, async (req, res) => {
        try {
            const connection = req.mapDbConnection;
            if (connection.engine === 'oracle') {
                const oracleDatabase = await modules.loadOracleDatabase();
                await oracleDatabase.testOracleConnection(connection);
            } else {
                await modules.database.testConnection(connection);
            }
            return res.json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: `Connection test failed: ${error.message}` });
        }
    });

    app.delete('/mapdb/api/connections/:id', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, async (req, res) => {
        try {
            const currentPool = getPool();
            if (!currentPool || !currentPool.connected) {
                return res.status(503).json({ error: 'Banco de configuracao indisponivel' });
            }

            const connection = req.mapDbConnection;
            if (connection.engine === 'oracle') {
                const oracleDatabase = await modules.loadOracleDatabase();
                await oracleDatabase.closeOraclePool(connection.id);
            } else {
                await modules.database.closePool(connection.id);
            }

            await currentPool.request()
                .input('userId', sql.Int, req.user.id)
                .input('id', sql.UniqueIdentifier, connection.id)
                .query('DELETE FROM dbo.MapDBConnections WHERE UserId = @userId AND Id = @id');

            await syncConnectionsForUser(modules, currentPool, req.user.id);
            return res.status(204).send();
        } catch (error) {
            console.error('[MapDB] Erro ao excluir conexao:', error);
            return res.status(500).json({ error: error.message || 'Erro ao excluir conexao' });
        }
    });

    app.use('/mapdb/api/connections', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, modules.databasesRouter);
    app.use('/mapdb/api/connections', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, modules.objectsRouter);
    app.use('/mapdb/api/connections', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, modules.dependenciesRouter);
    app.use('/mapdb/api/connections', authenticateToken, mapDbSync, mapDbEnsureConnectionAccess, modules.scriptRouter);
    app.use('/mapdb/api', modules.errorHandler);

    app.use('/mapdb', express.static(mapDbFrontendDir));
    app.get(/^\/mapdb(?:\/(?!api(?:\/|$)).*)?$/, (_req, res) => {
        res.sendFile(mapDbIndexFile);
    });

    mapDbMounted = true;
    console.log('[MapDB] Aplicacao montada em /mapdb');
}

module.exports = {
    ensureMapDbTables,
    ensureOwnedConnection,
    loadUserConnections,
    mountMapDb
};
