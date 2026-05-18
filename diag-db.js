const sql = require('mssql');
try { require('dotenv').config(); } catch (_) {}

const config = {
    user: process.env.DB_USER || 'servicedw',
    password: process.env.DB_PASS || '@aacdservice',
    server: process.env.DB_SERVER || 'SERVER55\\DW',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 15000 },
};

(async () => {
    try {
        const pool = await sql.connect(config);

        const dbs = await pool.request().query(`
            SELECT name FROM sys.databases
            WHERE name NOT IN ('master','tempdb','model','msdb','distribution','ReportServer','ReportServerTempDB')
            ORDER BY name
        `);
        console.log('=== DATABASES no server', config.server, '===');
        console.table(dbs.recordset);

        // pra cada DB que tenha 'Portal' no nome, tentar contar Users
        for (const row of dbs.recordset) {
            const dbName = row.name;
            if (!/portal/i.test(dbName)) continue;
            try {
                const r = await pool.request().query(`
                    SELECT '${dbName}' AS db,
                           (SELECT COUNT(*) FROM [${dbName}].dbo.Users) AS users_total
                `);
                console.log(`  ${dbName}: Users.Count =`, r.recordset[0].users_total);
            } catch (e) {
                console.log(`  ${dbName}: sem tabela Users acessivel (${e.message})`);
            }
        }

        await pool.close();
    } catch (e) {
        console.error('Falha:', e.message);
    }
})();
