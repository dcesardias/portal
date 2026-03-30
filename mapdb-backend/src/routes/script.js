import { Router } from 'express';
import { getConnection } from '../services/connectionManager.js';
import { getPool } from '../config/database.js';
export const scriptRouter = Router();
scriptRouter.get('/:connId/databases/:dbName/objects/:objectName/script', async (req, res) => {
    try {
        const connId = req.params.connId;
        const dbName = req.params.dbName;
        const objectName = req.params.objectName;
        const schema = req.query.schema || 'dbo';
        const conn = getConnection(connId);
        if (!conn) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }
        if (conn.engine === 'oracle') {
            const { getScript: getOracleScript } = await import('../services/oracle/dependencyService.js');
            const result = await getOracleScript(connId, schema, objectName);
            res.json(result);
        }
        else {
            const pool = await getPool(conn, dbName);
            const result = await pool.request()
                .input('schema', schema)
                .input('name', objectName)
                .query(`
          SELECT
            m.definition,
            o.type_desc AS typeDesc
          FROM sys.sql_modules m
          JOIN sys.objects o ON m.object_id = o.object_id
          JOIN sys.schemas s ON o.schema_id = s.schema_id
          WHERE o.name = @name AND s.name = @schema
        `);
            if (result.recordset.length === 0) {
                res.status(404).json({ error: 'Script not found. It may be a table or an encrypted object.' });
                return;
            }
            res.json({
                script: result.recordset[0].definition,
                typeDesc: result.recordset[0].typeDesc,
            });
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=script.js.map