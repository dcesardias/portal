import oracledb from 'oracledb';
const oracleClientLibDir = process.env.MAPDB_ORACLE_CLIENT_LIB_DIR ||
    process.env.ORACLE_CLIENT_LIB_DIR ||
    'C:\\oracle\\instantclient_19_23';
// Use Thick mode with Oracle Instant Client for full compatibility
try {
    oracledb.initOracleClient({ libDir: oracleClientLibDir });
    console.log('[MapDB] Oracle Thick mode initialized');
}
catch (err) {
    if (!err.message?.includes('already initialized')) {
        console.warn(`[MapDB] Oracle Thick mode init warning: ${err.message}`);
    }
}
// Global: fetch as objects, not arrays
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// Global: auto-commit off (read-only intent)
oracledb.autoCommit = false;
const pools = new Map();
function poolKey(connectionId) {
    return connectionId;
}
function buildConnectString(conn) {
    if (conn.serviceName) {
        return `${conn.server}:${conn.port}/${conn.serviceName}`;
    }
    if (conn.sid) {
        return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${conn.server})(PORT=${conn.port}))(CONNECT_DATA=(SID=${conn.sid})))`;
    }
    return `${conn.server}:${conn.port}/${conn.server.split('/').pop() || 'ORCL'}`;
}
export async function getOraclePool(conn) {
    const key = poolKey(conn.id);
    let pool = pools.get(key);
    if (pool) {
        try {
            const testConn = await pool.getConnection();
            await testConn.close();
            return pool;
        }
        catch {
            try {
                await pool.close(0);
            }
            catch { }
            pools.delete(key);
        }
    }
    pool = await oracledb.createPool({
        user: conn.user,
        password: conn.password,
        connectString: buildConnectString(conn),
        poolMin: 1,
        poolMax: 4,
        poolTimeout: 60,
    });
    pools.set(key, pool);
    return pool;
}
export async function getOracleConnection(conn) {
    const pool = await getOraclePool(conn);
    const connection = await pool.getConnection();
    // Force read-only transaction
    await connection.execute('SET TRANSACTION READ ONLY');
    return connection;
}
export async function testOracleConnection(conn) {
    const pool = await getOraclePool(conn);
    const connection = await pool.getConnection();
    try {
        await connection.execute('SELECT 1 FROM DUAL');
        return true;
    }
    finally {
        await connection.close();
    }
}
export async function closeOraclePool(connectionId) {
    const key = poolKey(connectionId);
    const pool = pools.get(key);
    if (pool) {
        try {
            await pool.close(0);
        }
        catch { }
        pools.delete(key);
    }
}
//# sourceMappingURL=oracleDatabase.js.map