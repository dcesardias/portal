import { getPool } from '../config/database.js';
import { getConnection } from './connectionManager.js';
const TYPE_MAP = {
    'U': 'TABLE',
    'V': 'VIEW',
    'P': 'PROCEDURE',
    'FN': 'FUNCTION',
    'IF': 'FUNCTION',
    'TF': 'FUNCTION',
    'TR': 'TRIGGER',
};
export async function searchObjects(connectionId, database, search, typeFilter, limit = 50) {
    const conn = getConnection(connectionId);
    if (!conn)
        throw new Error('Connection not found');
    const pool = await getPool(conn, database);
    const request = pool.request();
    let query = `
    SELECT TOP (@limit)
      o.object_id AS objectId,
      s.name AS schemaName,
      o.name AS objectName,
      o.type AS objectType,
      o.type_desc AS typeDesc,
      o.create_date AS createDate,
      o.modify_date AS modifyDate
    FROM sys.objects o
    JOIN sys.schemas s ON o.schema_id = s.schema_id
    WHERE o.is_ms_shipped = 0
      AND o.type IN ('U','V','P','FN','IF','TF','TR')
  `;
    request.input('limit', limit);
    if (search) {
        query += ` AND (o.name LIKE '%' + @search + '%' OR s.name + '.' + o.name LIKE '%' + @search + '%')`;
        request.input('search', search);
    }
    if (typeFilter) {
        query += ` AND o.type = @typeFilter`;
        request.input('typeFilter', typeFilter);
    }
    query += `
    ORDER BY
      CASE o.type WHEN 'U' THEN 1 WHEN 'V' THEN 2 WHEN 'P' THEN 3 ELSE 4 END,
      o.name
  `;
    const result = await request.query(query);
    return result.recordset.map((row) => ({
        objectId: row.objectId,
        schemaName: row.schemaName,
        objectName: row.objectName,
        objectType: TYPE_MAP[row.objectType.trim()] || 'TABLE',
        typeDesc: row.typeDesc,
        createDate: row.createDate?.toISOString(),
        modifyDate: row.modifyDate?.toISOString(),
        database,
    }));
}
//# sourceMappingURL=objectService.js.map