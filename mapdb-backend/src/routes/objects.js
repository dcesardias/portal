import { Router } from 'express';
import { getConnection } from '../services/connectionManager.js';
import { searchObjects as searchSqlServer } from '../services/objectService.js';
export const objectsRouter = Router();
objectsRouter.get('/:connId/databases/:dbName/objects', async (req, res) => {
    try {
        const connId = req.params.connId;
        const dbName = req.params.dbName;
        const { search, type, limit } = req.query;
        const conn = getConnection(connId);
        if (!conn) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }
        let objects;
        if (conn.engine === 'oracle') {
            const { searchObjects: searchOracle } = await import('../services/oracle/objectService.js');
            objects = await searchOracle(connId, dbName, search, type, limit ? parseInt(limit) : undefined);
        }
        else {
            objects = await searchSqlServer(connId, dbName, search, type, limit ? parseInt(limit) : undefined);
        }
        const response = { objects };
        res.json(response);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
//# sourceMappingURL=objects.js.map