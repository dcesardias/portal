import { Router } from 'express';
import { createConnection, getAllConnections, getConnection, deleteConnection } from '../services/connectionManager.js';
import { testConnection, closePool } from '../config/database.js';
export const connectionsRouter = Router();
connectionsRouter.post('/', async (req, res) => {
    try {
        const body = req.body;
        const conn = createConnection(body);
        try {
            if (conn.engine === 'oracle') {
                const { testOracleConnection } = await import('../config/oracleDatabase.js');
                await testOracleConnection(conn);
            }
            else {
                await testConnection(conn);
            }
        }
        catch (err) {
            console.warn(`Connection created but test failed: ${err.message}`);
        }
        const response = {
            id: conn.id,
            name: conn.name,
            engine: conn.engine,
            server: conn.server,
            port: conn.port,
            authenticationType: conn.authenticationType,
            user: conn.user,
        };
        res.status(201).json(response);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
connectionsRouter.get('/', (_req, res) => {
    const connections = getAllConnections().map(conn => ({
        id: conn.id,
        name: conn.name,
        engine: conn.engine || 'sqlserver',
        server: conn.server,
        port: conn.port,
        authenticationType: conn.authenticationType,
        user: conn.user,
    }));
    res.json(connections);
});
connectionsRouter.post('/:id/test', async (req, res) => {
    try {
        const conn = getConnection(req.params.id);
        if (!conn) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }
        if (conn.engine === 'oracle') {
            const { testOracleConnection } = await import('../config/oracleDatabase.js');
            await testOracleConnection(conn);
        }
        else {
            await testConnection(conn);
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: `Connection test failed: ${err.message}` });
    }
});
connectionsRouter.delete('/:id', async (req, res) => {
    const id = req.params.id;
    const conn = getConnection(id);
    if (conn?.engine === 'oracle') {
        const { closeOraclePool } = await import('../config/oracleDatabase.js');
        await closeOraclePool(id);
    }
    else {
        await closePool(id);
    }
    const deleted = deleteConnection(id);
    if (!deleted) {
        res.status(404).json({ error: 'Connection not found' });
        return;
    }
    res.status(204).send();
});
//# sourceMappingURL=connections.js.map