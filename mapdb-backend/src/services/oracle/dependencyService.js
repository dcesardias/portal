import { getOracleConnection } from '../../config/oracleDatabase.js';
import { getConnection } from '../connectionManager.js';
// No hard limit on total nodes - frontend handles rendering via expand/collapse
// FETCH FIRST 50 per query protects individual Oracle queries
const TYPE_MAP = {
    'TABLE': 'TABLE',
    'VIEW': 'VIEW',
    'PROCEDURE': 'PROCEDURE',
    'FUNCTION': 'FUNCTION',
    'TRIGGER': 'TRIGGER',
    'PACKAGE': 'PACKAGE',
    'PACKAGE BODY': 'PACKAGE',
    'SYNONYM': 'SYNONYM',
    'SEQUENCE': 'SEQUENCE',
};
// Oracle system schemas to always exclude
const SYSTEM_SCHEMAS = new Set([
    'SYS', 'SYSTEM', 'PUBLIC', 'WMSYS', 'XDB', 'CTXSYS', 'MDSYS',
    'OLAPSYS', 'ORDDATA', 'ORDSYS', 'OUTLN', 'DBSNMP', 'APPQOSSYS',
    'DBSFWUSER', 'REMOTE_SCHEDULER_AGENT', 'GSMADMIN_INTERNAL',
    'LBACSYS', 'DVSYS', 'DVF', 'GSMCATUSER', 'GSMUSER', 'SYSBACKUP',
    'SYSDG', 'SYSKM', 'SYSRAC', 'AUDSYS', 'OJVMSYS', 'XS$NULL',
    'ANONYMOUS', 'APEX_PUBLIC_USER', 'FLOWS_FILES', 'APEX_030200',
    'APEX_040000', 'APEX_050000', 'APEX_200200',
]);
function resolveType(t) {
    if (!t)
        return 'TABLE';
    return TYPE_MAP[t.trim().toUpperCase()] || 'TABLE';
}
function nodeId(schema, name) {
    return `${schema.toLowerCase().trim()}.${name.toLowerCase().trim()}`;
}
const EXPANDABLE_TYPES = new Set(['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'PACKAGE']);
async function getDirectReferences(oraConn, owner, objectName) {
    try {
        const result = await oraConn.execute(`
      SELECT DISTINCT
        d.referenced_owner AS "refOwner",
        d.referenced_name AS "refName",
        d.referenced_type AS "refType"
      FROM all_dependencies d
      WHERE d.owner = :owner
        AND d.name = :objectName
        AND d.referenced_type IN ('TABLE','VIEW','PROCEDURE','FUNCTION','TRIGGER','PACKAGE','PACKAGE BODY','SYNONYM','SEQUENCE')
      FETCH FIRST 50 ROWS ONLY
    `, { owner: owner.toUpperCase(), objectName: objectName.toUpperCase() });
        return (result.rows || [])
            .filter((r) => !SYSTEM_SCHEMAS.has(r.refOwner))
            .map((r) => ({
            schema: r.refOwner,
            name: r.refName,
            type: resolveType(r.refType),
        }));
    }
    catch (err) {
        console.warn(`[MapDB/Oracle] Error getting refs for ${owner}.${objectName}: ${err.message}`);
        return [];
    }
}
async function getReferencingObjects(oraConn, owner, objectName) {
    try {
        const result = await oraConn.execute(`
      SELECT DISTINCT
        d.owner AS "srcOwner",
        d.name AS "srcName",
        d.type AS "srcType"
      FROM all_dependencies d
      WHERE d.referenced_owner = :owner
        AND d.referenced_name = :objectName
        AND d.type IN ('TABLE','VIEW','PROCEDURE','FUNCTION','TRIGGER','PACKAGE','PACKAGE BODY','SYNONYM','SEQUENCE')
      FETCH FIRST 50 ROWS ONLY
    `, { owner: owner.toUpperCase(), objectName: objectName.toUpperCase() });
        return (result.rows || [])
            .filter((r) => !SYSTEM_SCHEMAS.has(r.srcOwner))
            .map((r) => ({
            schema: r.srcOwner,
            name: r.srcName,
            type: resolveType(r.srcType),
        }));
    }
    catch (err) {
        console.warn(`[MapDB/Oracle] Error getting referencing objects for ${owner}.${objectName}: ${err.message}`);
        return [];
    }
}
export async function getDependencies(connectionId, schema, objectName, direction = 'both', maxDepth = 10) {
    const conn = getConnection(connectionId);
    if (!conn)
        throw new Error('Connection not found');
    const oraConn = await getOracleConnection(conn);
    try {
        const rootResult = await oraConn.execute(`
      SELECT
        object_id AS "objectId",
        owner AS "schemaName",
        object_name AS "objectName",
        object_type AS "objectType"
      FROM all_objects
      WHERE owner = :owner AND object_name = :name
        AND object_type IN ('TABLE','VIEW','PROCEDURE','FUNCTION','TRIGGER','PACKAGE','SYNONYM','SEQUENCE')
      FETCH FIRST 1 ROWS ONLY
    `, { owner: schema.toUpperCase(), name: objectName.toUpperCase() });
        const rows = rootResult.rows;
        if (!rows || rows.length === 0)
            throw new Error(`Object ${schema}.${objectName} not found`);
        const rootRow = rows[0];
        const rootType = resolveType(rootRow.objectType);
        const root = {
            objectId: rootRow.objectId,
            schemaName: rootRow.schemaName,
            objectName: rootRow.objectName,
            objectType: rootType,
            database: rootRow.schemaName,
        };
        const rootNId = nodeId(root.schemaName, root.objectName);
        const nodesMap = new Map();
        const edges = [];
        nodesMap.set(rootNId, {
            id: rootNId,
            objectId: root.objectId,
            schemaName: root.schemaName,
            objectName: root.objectName,
            objectType: rootType,
            database: root.schemaName,
            depth: 0,
        });
        console.log(`[MapDB/Oracle] Starting cascade from ${root.schemaName}.${root.objectName} (${rootType})`);
        // DOWNWARD
        if (direction === 'both' || direction === 'down') {
            const queue = [];
            const expandedDown = new Set([rootNId]);
            const rootRefs = await getDirectReferences(oraConn, root.schemaName, root.objectName);
            console.log(`[MapDB/Oracle]   Root -> ${rootRefs.length} direct references`);
            for (const ref of rootRefs) {
                queue.push({ schema: ref.schema, name: ref.name, type: ref.type, depth: 1, parentId: rootNId });
            }
            while (queue.length > 0) {
                const item = queue.shift();
                const nId = nodeId(item.schema, item.name);
                if (!nodesMap.has(nId)) {
                    nodesMap.set(nId, {
                        id: nId,
                        objectId: 0,
                        schemaName: item.schema,
                        objectName: item.name,
                        objectType: item.type,
                        database: item.schema,
                        depth: item.depth,
                    });
                }
                const edgeKey = `${item.parentId}->${nId}`;
                if (!edges.some(e => `${e.source}->${e.target}` === edgeKey)) {
                    edges.push({ source: item.parentId, target: nId, direction: 'references', depth: item.depth });
                }
                if (EXPANDABLE_TYPES.has(item.type) && !expandedDown.has(nId) && item.depth < maxDepth) {
                    expandedDown.add(nId);
                    const childRefs = await getDirectReferences(oraConn, item.schema, item.name);
                    for (const ref of childRefs) {
                        queue.push({ schema: ref.schema, name: ref.name, type: ref.type, depth: item.depth + 1, parentId: nId });
                    }
                }
            }
        }
        // UPWARD
        if (direction === 'both' || direction === 'up') {
            const queue = [];
            const expandedUp = new Set([rootNId]);
            const rootRefs = await getReferencingObjects(oraConn, root.schemaName, root.objectName);
            console.log(`[MapDB/Oracle]   Root <- ${rootRefs.length} referencing objects`);
            for (const ref of rootRefs) {
                queue.push({ schema: ref.schema, name: ref.name, type: ref.type, depth: 1, childId: rootNId });
            }
            while (queue.length > 0) {
                const item = queue.shift();
                const nId = nodeId(item.schema, item.name);
                if (!nodesMap.has(nId)) {
                    nodesMap.set(nId, {
                        id: nId,
                        objectId: 0,
                        schemaName: item.schema,
                        objectName: item.name,
                        objectType: item.type,
                        database: item.schema,
                        depth: -item.depth,
                    });
                }
                const edgeKey = `${nId}->${item.childId}`;
                if (!edges.some(e => `${e.source}->${e.target}` === edgeKey)) {
                    edges.push({ source: nId, target: item.childId, direction: 'referenced_by', depth: item.depth });
                }
                if (!expandedUp.has(nId) && item.depth < maxDepth) {
                    expandedUp.add(nId);
                    const parentRefs = await getReferencingObjects(oraConn, item.schema, item.name);
                    for (const ref of parentRefs) {
                        queue.push({ schema: ref.schema, name: ref.name, type: ref.type, depth: item.depth + 1, childId: nId });
                    }
                }
            }
        }
        console.log(`[MapDB/Oracle] Final: ${nodesMap.size} nodes, ${edges.length} edges`);
        return { root, nodes: Array.from(nodesMap.values()), edges };
    }
    finally {
        await oraConn.close();
    }
}
export async function getScript(connectionId, schema, objectName) {
    const conn = getConnection(connectionId);
    if (!conn)
        throw new Error('Connection not found');
    const oraConn = await getOracleConnection(conn);
    try {
        // Try ALL_SOURCE first
        const result = await oraConn.execute(`
      SELECT text AS "text", type AS "type"
      FROM all_source
      WHERE owner = :owner AND name = :name
      ORDER BY type, line
    `, { owner: schema.toUpperCase(), name: objectName.toUpperCase() });
        const rows = result.rows;
        if (rows && rows.length > 0) {
            const script = rows.map((r) => r.text).join('');
            return { script, typeDesc: rows[0].type };
        }
        // Fallback: DBMS_METADATA
        const metaResult = await oraConn.execute(`
      SELECT
        DBMS_METADATA.GET_DDL(object_type, object_name, owner) AS "ddl",
        object_type AS "objectType"
      FROM all_objects
      WHERE owner = :owner AND object_name = :name
        AND object_type IN ('TABLE','VIEW','PROCEDURE','FUNCTION','TRIGGER','PACKAGE','SYNONYM','SEQUENCE')
      FETCH FIRST 1 ROWS ONLY
    `, { owner: schema.toUpperCase(), name: objectName.toUpperCase() });
        const metaRows = metaResult.rows;
        if (metaRows && metaRows.length > 0) {
            let ddl = metaRows[0].ddl;
            if (ddl && typeof ddl.getData === 'function') {
                ddl = await ddl.getData();
            }
            return { script: ddl || '-- No script available', typeDesc: metaRows[0].objectType };
        }
        throw new Error('Script not found for this object');
    }
    finally {
        await oraConn.close();
    }
}
//# sourceMappingURL=dependencyService.js.map