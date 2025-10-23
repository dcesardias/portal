'use strict';
const sql = require('mssql');

const config = {
    user: process.env.DB_USER || 'servicedw',
    password: process.env.DB_PASS || '@aacdservice',
    server: process.env.DB_SERVER || 'SERVER55',
    database: process.env.DB_NAME || 'PowerBIPortal',
    options: { encrypt: false, trustServerCertificate: true }
};

let pool;

async function initDB() {
    try {
        pool = await sql.connect(config);
        console.log('Conectado ao SQL Server');
        sql.on('error', err => console.error('mssql global error:', err));
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

function getPool() {
    return pool;
}

async function reconnect() {
    if (pool && pool.connected) return pool;
    try {
        if (pool) {
            try { await pool.close(); } catch (_) {}
        }
        pool = await sql.connect(config);
        console.log('Reconnected to SQL Server');
        return pool;
    } catch (err) {
        console.error('DB reconnection failed:', err.message || err);
        throw err;
    }
}

module.exports = {
    sql,
    config,
    initDB,
    ensurePagesOrderColumn,
    getPool,
    reconnect
};
