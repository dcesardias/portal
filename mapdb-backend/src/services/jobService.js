import { getPool } from '../config/database.js';
import { getConnection } from './connectionManager.js';
/**
 * Get ALL job steps from the server, each with parsed source/target objects.
 */
export async function getAllStepMappings(connectionId) {
    const conn = getConnection(connectionId);
    if (!conn)
        return [];
    try {
        const pool = await getPool(conn, 'msdb');
        const result = await pool.request().query(`
      SELECT
        j.name AS jobName,
        js.step_id AS stepId,
        js.step_name AS stepName,
        ISNULL(js.command, '') AS command,
        ISNULL(js.database_name, '') AS databaseName,
        ISNULL(js.subsystem, 'TSQL') AS subsystem
      FROM msdb.dbo.sysjobs j
      JOIN msdb.dbo.sysjobsteps js ON j.job_id = js.job_id
      ORDER BY j.name, js.step_id
    `);
        const mappings = [];
        for (const row of result.recordset) {
            const { targets, sources } = parseObjectReferences(row.command, row.databaseName || 'master');
            // Heuristic: if no targets found in the SQL but the step name looks like a table name,
            // use the step name as the target in the step's database context
            if (targets.length === 0 && row.stepName && row.databaseName) {
                // Only if the step name doesn't look like a generic name
                const generic = ['start', 'end', 'init', 'cleanup', 'log', 'notify', 'email'];
                if (!generic.some(g => row.stepName.toLowerCase().includes(g))) {
                    targets.push({ database: row.databaseName, schema: 'dbo', name: row.stepName });
                }
            }
            mappings.push({
                jobName: row.jobName,
                stepId: row.stepId,
                stepName: row.stepName,
                command: row.command,
                databaseName: row.databaseName,
                subsystem: row.subsystem,
                targets,
                sources,
            });
        }
        return mappings;
    }
    catch (err) {
        console.warn(`[MapDB] Could not load job steps: ${err.message}`);
        return [];
    }
}
/**
 * Find steps that write to a specific table.
 * Returns only the specific steps, not the whole job.
 */
export function findStepsForTable(allSteps, database, schema, tableName) {
    return allSteps.filter(s => s.targets.some(t => t.name.toLowerCase() === tableName.toLowerCase() &&
        t.database.toLowerCase() === database.toLowerCase()));
}
/**
 * Find steps that read from a specific object.
 */
export function findStepsReadingFrom(allSteps, database, schema, objectName) {
    return allSteps.filter(s => s.sources.some(src => src.name.toLowerCase() === objectName.toLowerCase() &&
        src.database.toLowerCase() === database.toLowerCase()));
}
/**
 * Parse SQL command text to extract referenced objects.
 */
function parseObjectReferences(command, defaultDatabase) {
    const targets = [];
    const sources = [];
    if (!command)
        return { targets, sources };
    // Normalize: remove square brackets, collapse whitespace
    const clean = command
        .replace(/\[([^\]]+)\]/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    const objPattern = '([\\w]+(?:\\.[\\w]+){0,2})';
    // TARGET patterns (what the step writes TO)
    const targetPatterns = [
        new RegExp(`INSERT\\s+INTO\\s+${objPattern}`, 'gi'),
        new RegExp(`INTO\\s+${objPattern}\\s+(?:SELECT|FROM|\\()`, 'gi'),
        new RegExp(`UPDATE\\s+${objPattern}`, 'gi'),
        new RegExp(`MERGE\\s+(?:INTO\\s+)?${objPattern}`, 'gi'),
        new RegExp(`TRUNCATE\\s+TABLE\\s+${objPattern}`, 'gi'),
    ];
    // SOURCE patterns (what the step reads FROM)
    const sourcePatterns = [
        new RegExp(`FROM\\s+${objPattern}`, 'gi'),
        new RegExp(`JOIN\\s+${objPattern}`, 'gi'),
    ];
    const seen = new Set();
    function parseObjectName(raw, defaultDb) {
        const parts = raw.split('.').map(p => p.trim()).filter(Boolean);
        const keywords = new Set([
            'set', 'where', 'and', 'or', 'on', 'as', 'select', 'exec', 'execute',
            'declare', 'begin', 'end', 'if', 'else', 'values', 'output', 'deleted',
            'inserted', 'top', 'distinct', 'nolock', 'with', 'null', 'not', 'in',
            'exists', 'case', 'when', 'then', 'group', 'order', 'by', 'having',
            'union', 'all', 'inner', 'outer', 'left', 'right', 'cross', 'full',
            'openquery', 'openrowset', 'opendatasource', 'linkedserver',
        ]);
        if (parts.length === 0 || keywords.has(parts[parts.length - 1].toLowerCase()))
            return null;
        if (parts[parts.length - 1].startsWith('#') || parts[parts.length - 1].startsWith('@'))
            return null;
        // Skip pure numbers
        if (/^\d+$/.test(parts[parts.length - 1]))
            return null;
        if (parts.length === 3)
            return { database: parts[0], schema: parts[1], name: parts[2] };
        if (parts.length === 2)
            return { database: defaultDb, schema: parts[0], name: parts[1] };
        if (parts.length === 1)
            return { database: defaultDb, schema: 'dbo', name: parts[0] };
        return null;
    }
    for (const pattern of targetPatterns) {
        let match;
        while ((match = pattern.exec(clean)) !== null) {
            if (match[1]) {
                const obj = parseObjectName(match[1], defaultDatabase);
                if (obj) {
                    const key = `T:${obj.database}.${obj.schema}.${obj.name}`.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        targets.push(obj);
                    }
                }
            }
        }
    }
    for (const pattern of sourcePatterns) {
        let match;
        while ((match = pattern.exec(clean)) !== null) {
            if (match[1]) {
                const obj = parseObjectName(match[1], defaultDatabase);
                if (obj) {
                    const key = `S:${obj.database}.${obj.schema}.${obj.name}`.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        sources.push(obj);
                    }
                }
            }
        }
    }
    return { targets, sources };
}
//# sourceMappingURL=jobService.js.map