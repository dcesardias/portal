import sql from 'mssql';
import { DbConnection } from '@mapdb/shared';
export declare function buildConfig(conn: DbConnection, database?: string): sql.config;
export declare function getPool(conn: DbConnection, database?: string): Promise<sql.ConnectionPool>;
export declare function testConnection(conn: DbConnection): Promise<boolean>;
export declare function closePool(connectionId: string): Promise<void>;
export declare function closeAllPools(): Promise<void>;
//# sourceMappingURL=database.d.ts.map