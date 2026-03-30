import oracledb from 'oracledb';
import { getOracleConnection } from '../../config/oracleDatabase.js';
import { getConnection } from '../connectionManager.js';
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
export async function searchObjects(connectionId, schema, search, typeFilter, limit = 50) {
    const conn = getConnection(connectionId);
    if (!conn)
        throw new Error('Connection not found');
    const oraConn = await getOracleConnection(conn);
    try {
        let query = `
      SELECT
        object_id AS "objectId",
        owner AS "schemaName",
        object_name AS "objectName",
        object_type AS "objectType",
        object_type AS "typeDesc",
        TO_CHAR(created, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createDate",
        TO_CHAR(last_ddl_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "modifyDate"
      FROM all_objects
      WHERE owner = :schema
        AND object_type IN ('TABLE','VIEW','PROCEDURE','FUNCTION','TRIGGER','PACKAGE','SYNONYM','SEQUENCE')
    `;
        const binds = { schema: schema.toUpperCase() };
        if (search) {
            query += ` AND UPPER(object_name) LIKE '%' || UPPER(:search) || '%'`;
            binds.search = search;
        }
        if (typeFilter) {
            query += ` AND object_type = :typeFilter`;
            binds.typeFilter = typeFilter.toUpperCase();
        }
        query += ` ORDER BY
      CASE object_type WHEN 'TABLE' THEN 1 WHEN 'VIEW' THEN 2 WHEN 'PROCEDURE' THEN 3 WHEN 'FUNCTION' THEN 4 ELSE 5 END,
      object_name
    FETCH FIRST :lim ROWS ONLY`;
        binds.lim = limit;
        const result = await oraConn.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return (result.rows || []).map((row) => ({
            objectId: row.objectId,
            schemaName: row.schemaName,
            objectName: row.objectName,
            objectType: TYPE_MAP[row.objectType] || 'TABLE',
            typeDesc: row.typeDesc,
            createDate: row.createDate || '',
            modifyDate: row.modifyDate || '',
            database: schema,
        }));
    }
    finally {
        await oraConn.close();
    }
}
//# sourceMappingURL=objectService.js.map