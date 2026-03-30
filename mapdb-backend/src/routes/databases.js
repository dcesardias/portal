import { Router } from 'express';
import { getConnection } from '../services/connectionManager.js';
import { getPool } from '../config/database.js';
export const databasesRouter = Router();
databasesRouter.get('/:connId/databases', async (req, res) => {
    try {
        const conn = getConnection(req.params.connId);
        if (!conn) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }
        if (conn.engine === 'oracle') {
            const oracledb = await import('oracledb');
            const { getOracleConnection } = await import('../config/oracleDatabase.js');
            // Oracle: list schemas instead of databases
            const oraConn = await getOracleConnection(conn);
            try {
                const result = await oraConn.execute(`
          SELECT DISTINCT owner AS "name"
          FROM all_objects
          WHERE owner NOT IN (
            'SYS','SYSTEM','PUBLIC','WMSYS','XDB','CTXSYS','MDSYS',
            'OLAPSYS','ORDDATA','ORDSYS','OUTLN','DBSNMP','APPQOSSYS',
            'DBSFWUSER','REMOTE_SCHEDULER_AGENT','GSMADMIN_INTERNAL',
            'LBACSYS','DVSYS','DVF','GSMCATUSER','GSMUSER','SYSBACKUP',
            'SYSDG','SYSKM','SYSRAC','AUDSYS','OJVMSYS','XS$NULL',
            'ANONYMOUS','APEX_PUBLIC_USER','FLOWS_FILES','ORDS_PUBLIC_USER',
            'ORDS_METADATA','APEX_040000','APEX_050000','APEX_200200'
          )
          ORDER BY owner
        `, {}, { outFormat: oracledb.default.OUT_FORMAT_OBJECT });
                const response = {
                    databases: (result.rows || []).map((row, i) => ({
                        name: row.name,
                        databaseId: i + 1,
                        stateDesc: 'ONLINE',
                    })),
                };
                res.json(response);
            }
            finally {
                await oraConn.close();
            }
        }
        else {
            // SQL Server
            const pool = await getPool(conn, 'master');
            const result = await pool.request().query(`
        SELECT name, database_id AS databaseId, state_desc AS stateDesc
        FROM sys.databases
        WHERE state = 0
          AND name NOT IN ('master', 'tempdb', 'model', 'msdb')
        ORDER BY name
      `);
            const response = {
                databases: result.recordset.map((row) => ({
                    name: row.name,
                    databaseId: row.databaseId,
                    stateDesc: row.stateDesc,
                })),
            };
            res.json(response);
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=databases.js.map