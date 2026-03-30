import sql from 'mssql';
import { getPool } from '../config/database.js';
import { getConnection } from './connectionManager.js';
import { getAllStepMappings, findStepsForTable, findStepsReadingFrom } from './jobService.js';
// No hard limit - frontend handles rendering limits via expand/collapse
const TYPE_MAP = {
    'U': 'TABLE',
    'V': 'VIEW',
    'P': 'PROCEDURE',
    'FN': 'FUNCTION',
    'IF': 'FUNCTION',
    'TF': 'FUNCTION',
    'TR': 'TRIGGER',
    'USER_TABLE': 'TABLE',
    'VIEW': 'VIEW',
    'SQL_STORED_PROCEDURE': 'PROCEDURE',
    'SQL_SCALAR_FUNCTION': 'FUNCTION',
    'SQL_INLINE_TABLE_VALUED_FUNCTION': 'FUNCTION',
    'SQL_TABLE_VALUED_FUNCTION': 'FUNCTION',
    'SQL_TRIGGER': 'TRIGGER',
};
function resolveType(typeCode) {
    if (!typeCode)
        return 'TABLE';
    return TYPE_MAP[typeCode.trim()] || 'TABLE';
}
// Normalize node IDs to avoid mismatches (lowercase, trim)
function nodeId(database, schema, name) {
    return `${database.toLowerCase().trim()}.${(schema || 'dbo').toLowerCase().trim()}.${name.toLowerCase().trim()}`;
}
// Display-friendly name (preserves original case)
function displayId(database, schema, name) {
    return `${database}.${schema || 'dbo'}.${name}`;
}
/**
 * Get direct dependencies of an object using sys.dm_sql_referenced_entities
 * Falls back to sys.sql_expression_dependencies if the DMV fails
 */
async function getDirectReferences(connectionId, database, schemaName, objectName) {
    const conn = getConnection(connectionId);
    if (!conn)
        return [];
    try {
        const pool = await getPool(conn, database);
        // Try sys.dm_sql_referenced_entities first - more complete
        try {
            const result = await pool.request()
                .input('objName', sql.NVarChar, `${schemaName}.${objectName}`)
                .query(`
          SELECT DISTINCT
            ref.referenced_database_name AS refDatabase,
            COALESCE(ref.referenced_schema_name, 'dbo') AS refSchema,
            ref.referenced_entity_name AS refName,
            (
              SELECT TOP 1 o.type
              FROM sys.objects o
              JOIN sys.schemas s ON o.schema_id = s.schema_id
              WHERE o.name = ref.referenced_entity_name
                AND s.name = COALESCE(ref.referenced_schema_name, 'dbo')
                AND ref.referenced_database_name IS NULL
            ) AS refType
          FROM sys.dm_sql_referenced_entities(@objName, 'OBJECT') ref
          WHERE ref.referenced_entity_name IS NOT NULL
            AND ref.referenced_minor_id = 0
        `);
            return result.recordset.map((r) => ({
                database: r.refDatabase || database,
                schema: r.refSchema || 'dbo',
                name: r.refName,
                type: resolveType(r.refType),
            }));
        }
        catch {
            // DMV can fail for some objects, fall back to sys.sql_expression_dependencies
        }
        // Fallback: sys.sql_expression_dependencies
        const result = await pool.request()
            .input('schema', sql.NVarChar, schemaName)
            .input('name', sql.NVarChar, objectName)
            .query(`
        SELECT DISTINCT
          sed.referenced_database_name AS refDatabase,
          COALESCE(sed.referenced_schema_name, OBJECT_SCHEMA_NAME(sed.referenced_id), 'dbo') AS refSchema,
          COALESCE(sed.referenced_entity_name, OBJECT_NAME(sed.referenced_id)) AS refName,
          CASE
            WHEN sed.referenced_id IS NOT NULL
            THEN (SELECT TOP 1 o.type FROM sys.objects o WHERE o.object_id = sed.referenced_id)
            ELSE NULL
          END AS refType
        FROM sys.sql_expression_dependencies sed
        WHERE sed.referencing_id = OBJECT_ID(@schema + '.' + @name)
          AND COALESCE(sed.referenced_entity_name, OBJECT_NAME(sed.referenced_id)) IS NOT NULL
      `);
        return result.recordset.map((r) => ({
            database: r.refDatabase || database,
            schema: r.refSchema || 'dbo',
            name: r.refName,
            type: resolveType(r.refType),
        }));
    }
    catch (err) {
        console.warn(`[MapDB] Error getting refs for ${database}.${schemaName}.${objectName}: ${err.message}`);
        return [];
    }
}
/**
 * Get objects that reference this object (upward / "used by")
 * Scans ALL databases on the server
 */
async function getReferencingObjects(connectionId, targetDatabase, targetSchema, targetName) {
    const conn = getConnection(connectionId);
    if (!conn)
        return [];
    const results = [];
    // Get all databases
    const masterPool = await getPool(conn, 'master');
    const dbResult = await masterPool.request().query(`
    SELECT name FROM sys.databases WHERE state = 0 AND name NOT IN ('master','tempdb','model','msdb')
  `);
    const databases = dbResult.recordset.map((r) => r.name);
    // Search each database for objects that reference our target
    await Promise.all(databases.map(async (db) => {
        try {
            const pool = await getPool(conn, db);
            // Objects in this DB that reference our target (same DB or cross-DB)
            const result = await pool.request()
                .input('targetName', sql.NVarChar, targetName)
                .input('targetSchema', sql.NVarChar, targetSchema)
                .input('targetDb', sql.NVarChar, targetDatabase)
                .query(`
          SELECT DISTINCT
            OBJECT_SCHEMA_NAME(sed.referencing_id) AS srcSchema,
            OBJECT_NAME(sed.referencing_id) AS srcName,
            (SELECT TOP 1 o.type FROM sys.objects o WHERE o.object_id = sed.referencing_id) AS srcType
          FROM sys.sql_expression_dependencies sed
          WHERE (
            -- Same database reference
            (sed.referenced_database_name IS NULL AND DB_NAME() = @targetDb
             AND COALESCE(sed.referenced_entity_name, OBJECT_NAME(sed.referenced_id)) = @targetName
             AND COALESCE(sed.referenced_schema_name, OBJECT_SCHEMA_NAME(sed.referenced_id), 'dbo') = @targetSchema)
            OR
            -- Cross database reference
            (sed.referenced_database_name = @targetDb
             AND sed.referenced_entity_name = @targetName
             AND COALESCE(sed.referenced_schema_name, 'dbo') = @targetSchema)
          )
          AND OBJECT_NAME(sed.referencing_id) IS NOT NULL
        `);
            for (const r of result.recordset) {
                if (r.srcName) {
                    results.push({
                        database: db,
                        schema: r.srcSchema || 'dbo',
                        name: r.srcName,
                        type: resolveType(r.srcType),
                    });
                }
            }
        }
        catch (err) {
            // Skip databases we can't access
        }
    }));
    return results;
}
/**
 * Resolve the actual type of a cross-database object by querying that database
 */
async function resolveObjectType(connectionId, database, schema, name) {
    const conn = getConnection(connectionId);
    if (!conn)
        return 'TABLE';
    try {
        const pool = await getPool(conn, database);
        const result = await pool.request()
            .input('schema', sql.NVarChar, schema)
            .input('name', sql.NVarChar, name)
            .query(`
        SELECT TOP 1 o.type AS objType
        FROM sys.objects o
        JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE o.name = @name AND s.name = @schema
      `);
        if (result.recordset.length > 0) {
            return resolveType(result.recordset[0].objType);
        }
    }
    catch { }
    return 'TABLE';
}
// Types that can have their own dependencies (not leaf nodes)
const EXPANDABLE_TYPES = new Set(['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER']);
/** Resolve objectId from name + schema. Used when objectId is 0 (cross-db nodes). */
export async function resolveObjectId(connectionId, database, schemaName, objectName) {
    const conn = getConnection(connectionId);
    if (!conn)
        throw new Error('Connection not found');
    const pool = await getPool(conn, database);
    const result = await pool.request()
        .input('schema', sql.NVarChar, schemaName)
        .input('name', sql.NVarChar, objectName)
        .query(`
      SELECT TOP 1 o.object_id AS objectId
      FROM sys.objects o
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.name = @name AND s.name = @schema
    `);
    if (result.recordset.length === 0)
        throw new Error(`Object ${schemaName}.${objectName} not found in ${database}`);
    return result.recordset[0].objectId;
}
export async function getDependencies(connectionId, database, objectId, direction = 'both', maxDepth = 10) {
    const conn = getConnection(connectionId);
    if (!conn)
        throw new Error('Connection not found');
    // 1. Get root object info
    const pool = await getPool(conn, database);
    const rootResult = await pool.request()
        .input('objectId', sql.Int, objectId)
        .query(`
      SELECT
        o.object_id AS objectId,
        s.name AS schemaName,
        o.name AS objectName,
        o.type AS objectType
      FROM sys.objects o
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.object_id = @objectId
    `);
    if (rootResult.recordset.length === 0) {
        throw new Error('Object not found');
    }
    const rootRow = rootResult.recordset[0];
    const rootType = resolveType(rootRow.objectType);
    const root = {
        objectId: rootRow.objectId,
        schemaName: rootRow.schemaName,
        objectName: rootRow.objectName,
        objectType: rootType,
        database,
    };
    const rootNId = nodeId(database, root.schemaName, root.objectName);
    const nodesMap = new Map();
    const edges = [];
    // Add root node
    nodesMap.set(rootNId, {
        id: rootNId,
        objectId: root.objectId,
        schemaName: root.schemaName,
        objectName: root.objectName,
        objectType: rootType,
        database,
        depth: 0,
    });
    console.log(`[MapDB] Starting cascade from ${database}.${root.schemaName}.${root.objectName} (${rootType})`);
    // Load all step mappings once (cached for this request)
    let allSteps = [];
    try {
        allSteps = await getAllStepMappings(connectionId);
        console.log(`[MapDB] Loaded ${allSteps.length} job step mappings`);
    }
    catch (err) {
        console.warn(`[MapDB] Could not load job steps: ${err.message}`);
    }
    const processedSteps = new Set(); // Track which steps we've already added
    // 2. DOWNWARD cascade: recursively expand every object's references
    if (direction === 'both' || direction === 'down') {
        const queue = [];
        // Seed: get root's direct references
        const rootRefs = await getDirectReferences(connectionId, database, root.schemaName, root.objectName);
        console.log(`[MapDB]   Root ${root.objectName} -> ${rootRefs.length} direct references`);
        for (const ref of rootRefs) {
            queue.push({ db: ref.database, schema: ref.schema, name: ref.name, type: ref.type, depth: 1, parentId: rootNId });
        }
        const expandedDown = new Set([rootNId]);
        while (queue.length > 0) {
            const item = queue.shift();
            const nId = nodeId(item.db, item.schema, item.name);
            // Resolve type if unknown (cross-database objects often have unknown type)
            let objType = item.type;
            if (objType === 'TABLE') {
                // Might actually be a view in another DB - verify
                const actualType = await resolveObjectType(connectionId, item.db, item.schema, item.name);
                objType = actualType;
            }
            // Add node if not exists
            if (!nodesMap.has(nId)) {
                nodesMap.set(nId, {
                    id: nId,
                    objectId: 0,
                    schemaName: item.schema,
                    objectName: item.name,
                    objectType: objType,
                    database: item.db,
                    depth: item.depth,
                });
            }
            // Add edge from parent
            const edgeKey = `${item.parentId}->${nId}`;
            if (!edges.some(e => `${e.source}->${e.target}` === edgeKey)) {
                edges.push({
                    source: item.parentId,
                    target: nId,
                    direction: 'references',
                    depth: item.depth,
                });
            }
            // CASCADE: if this is a view/proc/function and we haven't expanded it yet, get ITS refs too
            if (EXPANDABLE_TYPES.has(objType) && !expandedDown.has(nId) && item.depth < maxDepth) {
                expandedDown.add(nId);
                console.log(`[MapDB]   Expanding ${item.db}.${item.schema}.${item.name} (${objType}) at depth ${item.depth}`);
                const childRefs = await getDirectReferences(connectionId, item.db, item.schema, item.name);
                console.log(`[MapDB]     -> ${childRefs.length} references found`);
                for (const ref of childRefs) {
                    queue.push({
                        db: ref.database,
                        schema: ref.schema,
                        name: ref.name,
                        type: ref.type,
                        depth: item.depth + 1,
                        parentId: nId,
                    });
                }
            }
            // JOB STEP INTEGRATION: if this is a TABLE, check if there's a step that populates it
            if (objType === 'TABLE' && item.depth < maxDepth) {
                const steps = findStepsForTable(allSteps, item.db, item.schema, item.name);
                for (const step of steps) {
                    const stepKey = `${step.jobName}::${step.stepId}`;
                    if (processedSteps.has(stepKey))
                        continue;
                    processedSteps.add(stepKey);
                    const stepNId = nodeId('agent', 'step', `${step.jobName}_step${step.stepId}`);
                    console.log(`[MapDB]   Found Step "${step.jobName} > ${step.stepName}" that populates ${item.db}.${item.name}`);
                    // Add JOB_STEP node
                    if (!nodesMap.has(stepNId)) {
                        nodesMap.set(stepNId, {
                            id: stepNId,
                            objectId: 0,
                            schemaName: step.jobName,
                            objectName: step.stepName,
                            objectType: 'JOB_STEP',
                            database: 'SQL Agent',
                            depth: item.depth + 1,
                        });
                    }
                    // Edge: STEP -> TABLE (step populates this table)
                    const stepToTableKey = `${stepNId}->${nId}`;
                    if (!edges.some(e => `${e.source}->${e.target}` === stepToTableKey)) {
                        edges.push({
                            source: stepNId,
                            target: nId,
                            direction: 'references',
                            depth: item.depth + 1,
                        });
                    }
                    // Add the STEP's SOURCE objects (what this specific step reads from)
                    for (const src of step.sources) {
                        const srcNId = nodeId(src.database, src.schema, src.name);
                        let srcType = 'TABLE';
                        try {
                            srcType = await resolveObjectType(connectionId, src.database, src.schema, src.name);
                        }
                        catch { }
                        if (!nodesMap.has(srcNId)) {
                            nodesMap.set(srcNId, {
                                id: srcNId,
                                objectId: 0,
                                schemaName: src.schema,
                                objectName: src.name,
                                objectType: srcType,
                                database: src.database,
                                depth: item.depth + 2,
                            });
                        }
                        // Edge: SOURCE -> STEP (step reads from this source)
                        const srcToStepKey = `${srcNId}->${stepNId}`;
                        if (!edges.some(e => `${e.source}->${e.target}` === srcToStepKey)) {
                            edges.push({
                                source: srcNId,
                                target: stepNId,
                                direction: 'references',
                                depth: item.depth + 2,
                            });
                        }
                        // If the source is a VIEW/PROC, cascade into it too
                        if (EXPANDABLE_TYPES.has(srcType) && !expandedDown.has(srcNId) && (item.depth + 2) < maxDepth) {
                            queue.push({
                                db: src.database,
                                schema: src.schema,
                                name: src.name,
                                type: srcType,
                                depth: item.depth + 3,
                                parentId: srcNId,
                            });
                        }
                    }
                }
            }
        }
    }
    // 3. UPWARD cascade: recursively expand what references this object
    if (direction === 'both' || direction === 'up') {
        const queue = [];
        // Seed: find everything that references the root
        const rootRefs = await getReferencingObjects(connectionId, database, root.schemaName, root.objectName);
        console.log(`[MapDB]   Root ${root.objectName} <- ${rootRefs.length} referencing objects`);
        for (const ref of rootRefs) {
            queue.push({ db: ref.database, schema: ref.schema, name: ref.name, type: ref.type, depth: 1, childId: rootNId });
        }
        const expandedUp = new Set([rootNId]);
        while (queue.length > 0) {
            const item = queue.shift();
            const nId = nodeId(item.db, item.schema, item.name);
            // Add node
            if (!nodesMap.has(nId)) {
                nodesMap.set(nId, {
                    id: nId,
                    objectId: 0,
                    schemaName: item.schema,
                    objectName: item.name,
                    objectType: item.type,
                    database: item.db,
                    depth: -item.depth,
                });
            }
            // Add edge: this object references the child
            const edgeKey = `${nId}->${item.childId}`;
            if (!edges.some(e => `${e.source}->${e.target}` === edgeKey)) {
                edges.push({
                    source: nId,
                    target: item.childId,
                    direction: 'referenced_by',
                    depth: item.depth,
                });
            }
            // CASCADE upward
            if (!expandedUp.has(nId) && item.depth < maxDepth) {
                expandedUp.add(nId);
                const parentRefs = await getReferencingObjects(connectionId, item.db, item.schema, item.name);
                for (const ref of parentRefs) {
                    queue.push({
                        db: ref.database,
                        schema: ref.schema,
                        name: ref.name,
                        type: ref.type,
                        depth: item.depth + 1,
                        childId: nId,
                    });
                }
                // JOB STEP INTEGRATION (upward): find steps that READ from this object
                const readingSteps = findStepsReadingFrom(allSteps, item.db, item.schema, item.name);
                for (const step of readingSteps) {
                    const stepKey = `${step.jobName}::${step.stepId}`;
                    if (processedSteps.has(stepKey))
                        continue;
                    processedSteps.add(stepKey);
                    const stepNId = nodeId('agent', 'step', `${step.jobName}_step${step.stepId}`);
                    if (!nodesMap.has(stepNId)) {
                        nodesMap.set(stepNId, {
                            id: stepNId,
                            objectId: 0,
                            schemaName: step.jobName,
                            objectName: step.stepName,
                            objectType: 'JOB_STEP',
                            database: 'SQL Agent',
                            depth: -(item.depth + 1),
                        });
                    }
                    // Edge: SOURCE -> STEP (step reads from this object)
                    const srcToStepKey = `${nId}->${stepNId}`;
                    if (!edges.some(e => `${e.source}->${e.target}` === srcToStepKey)) {
                        edges.push({
                            source: nId,
                            target: stepNId,
                            direction: 'referenced_by',
                            depth: item.depth + 1,
                        });
                    }
                    // Add step's targets (what this specific step writes to)
                    for (const tgt of step.targets) {
                        const tgtNId = nodeId(tgt.database, tgt.schema, tgt.name);
                        if (!nodesMap.has(tgtNId)) {
                            let tgtType = 'TABLE';
                            try {
                                tgtType = await resolveObjectType(connectionId, tgt.database, tgt.schema, tgt.name);
                            }
                            catch { }
                            nodesMap.set(tgtNId, {
                                id: tgtNId,
                                objectId: 0,
                                schemaName: tgt.schema,
                                objectName: tgt.name,
                                objectType: tgtType,
                                database: tgt.database,
                                depth: -(item.depth + 2),
                            });
                        }
                        // Edge: STEP -> TARGET
                        const stepToTgtKey = `${stepNId}->${tgtNId}`;
                        if (!edges.some(e => `${e.source}->${e.target}` === stepToTgtKey)) {
                            edges.push({
                                source: stepNId,
                                target: tgtNId,
                                direction: 'referenced_by',
                                depth: item.depth + 2,
                            });
                        }
                    }
                }
            }
        }
    }
    console.log(`[MapDB] Final result for ${root.objectName}: ${nodesMap.size} nodes, ${edges.length} edges`);
    return {
        root,
        nodes: Array.from(nodesMap.values()),
        edges,
    };
}
//# sourceMappingURL=dependencyService.js.map