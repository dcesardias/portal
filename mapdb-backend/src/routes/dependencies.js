import { Router } from 'express';
import { getConnection } from '../services/connectionManager.js';
import { getDependencies as getSqlServerDeps, resolveObjectId } from '../services/dependencyService.js';
export const dependenciesRouter = Router();
dependenciesRouter.get('/:connId/databases/:dbName/objects/:objectId/dependencies', async (req, res) => {
    try {
        const connId = req.params.connId;
        const dbName = req.params.dbName;
        const objectId = req.params.objectId;
        const { direction, maxDepth } = req.query;
        const conn = getConnection(connId);
        if (!conn) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }
        let tree;
        if (conn.engine === 'oracle') {
            const { getDependencies: getOracleDeps } = await import('../services/oracle/dependencyService.js');
            // For Oracle, we need the object name - resolve from objectId
            // The objectId from Oracle is the OBJECT_ID from ALL_OBJECTS
            const oracledb = await import('oracledb');
            const { getOracleConnection } = await import('../config/oracleDatabase.js');
            const oraConn = await getOracleConnection(conn);
            try {
                const result = await oraConn.execute(`SELECT owner AS "owner", object_name AS "name" FROM all_objects WHERE object_id = :id`, { id: parseInt(objectId) }, { outFormat: oracledb.default.OUT_FORMAT_OBJECT });
                const rows = result.rows;
                if (!rows || rows.length === 0)
                    throw new Error('Object not found');
                tree = await getOracleDeps(connId, rows[0].owner, rows[0].name, direction || 'both', maxDepth ? parseInt(maxDepth) : 10);
            }
            finally {
                await oraConn.close();
            }
        }
        else {
            tree = await getSqlServerDeps(connId, dbName, parseInt(objectId), direction || 'both', maxDepth ? parseInt(maxDepth) : 10);
        }
        res.json(tree);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Resolve by name (for cross-database objects that have objectId=0)
dependenciesRouter.get('/:connId/databases/:dbName/dependencies-by-name', async (req, res) => {
    try {
        const connId = req.params.connId;
        const dbName = req.params.dbName;
        const { schema, name, direction, maxDepth } = req.query;
        if (!name) {
            res.status(400).json({ error: 'name is required' });
            return;
        }
        const conn = getConnection(connId);
        if (!conn) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }
        let tree;
        if (conn.engine === 'oracle') {
            const { getDependencies: getOracleDeps } = await import('../services/oracle/dependencyService.js');
            tree = await getOracleDeps(connId, schema || dbName, name, direction || 'both', maxDepth ? parseInt(maxDepth) : 10);
        }
        else {
            const objectId = await resolveObjectId(connId, dbName, schema || 'dbo', name);
            tree = await getSqlServerDeps(connId, dbName, objectId, direction || 'both', maxDepth ? parseInt(maxDepth) : 10);
        }
        res.json(tree);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=dependencies.js.map