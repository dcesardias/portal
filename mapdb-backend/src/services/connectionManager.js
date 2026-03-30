import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.json');
const connections = new Map();
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function saveToDisk() {
    ensureDataDir();
    const data = Array.from(connections.values());
    fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
function loadFromDisk() {
    try {
        if (fs.existsSync(CONNECTIONS_FILE)) {
            const raw = fs.readFileSync(CONNECTIONS_FILE, 'utf-8');
            const data = JSON.parse(raw);
            for (const conn of data) {
                connections.set(conn.id, conn);
            }
            console.log(`[MapDB] Loaded ${data.length} saved connections`);
        }
    }
    catch (err) {
        console.warn(`[MapDB] Could not load saved connections: ${err.message}`);
    }
}
// Load on startup
loadFromDisk();
export function createConnection(req) {
    const engine = req.engine || 'sqlserver';
    const conn = {
        id: uuid(),
        name: req.name,
        engine,
        server: req.server,
        port: req.port || (engine === 'oracle' ? 1521 : 1433),
        authenticationType: req.authenticationType,
        user: req.user,
        password: req.password,
        encrypt: req.encrypt ?? false,
        trustServerCertificate: req.trustServerCertificate ?? true,
        serviceName: req.serviceName,
        sid: req.sid,
    };
    connections.set(conn.id, conn);
    saveToDisk();
    return conn;
}
export function getConnection(id) {
    return connections.get(id);
}
export function getAllConnections() {
    return Array.from(connections.values());
}
export function deleteConnection(id) {
    const deleted = connections.delete(id);
    if (deleted)
        saveToDisk();
    return deleted;
}
//# sourceMappingURL=connectionManager.js.map