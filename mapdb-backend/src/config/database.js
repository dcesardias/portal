import sql from 'mssql';
const pools = new Map();
export function buildConfig(conn, database) {
    return {
        server: conn.server,
        port: conn.port,
        database: database || 'master',
        user: conn.authenticationType === 'sql' ? conn.user : undefined,
        password: conn.authenticationType === 'sql' ? conn.password : undefined,
        options: {
            encrypt: conn.encrypt,
            trustServerCertificate: conn.trustServerCertificate,
        },
        connectionTimeout: 15000,
        requestTimeout: 30000,
    };
}
function poolKey(connectionId, database) {
    return `${connectionId}::${database || 'master'}`;
}
export async function getPool(conn, database) {
    const key = poolKey(conn.id, database);
    let pool = pools.get(key);
    if (pool?.connected)
        return pool;
    pool = new sql.ConnectionPool(buildConfig(conn, database));
    await pool.connect();
    pools.set(key, pool);
    return pool;
}
export async function testConnection(conn) {
    const pool = await getPool(conn);
    const result = await pool.request().query('SELECT 1 AS ok');
    return result.recordset[0]?.ok === 1;
}
export async function closePool(connectionId) {
    for (const [key, pool] of pools.entries()) {
        if (key.startsWith(connectionId + '::')) {
            await pool.close();
            pools.delete(key);
        }
    }
}
export async function closeAllPools() {
    for (const pool of pools.values()) {
        await pool.close();
    }
    pools.clear();
}
//# sourceMappingURL=database.js.map