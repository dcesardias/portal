import oracledb from 'oracledb';
import { DbConnection } from '@mapdb/shared';
export declare function getOraclePool(conn: DbConnection): Promise<oracledb.Pool>;
export declare function getOracleConnection(conn: DbConnection): Promise<oracledb.Connection>;
export declare function testOracleConnection(conn: DbConnection): Promise<boolean>;
export declare function closeOraclePool(connectionId: string): Promise<void>;
//# sourceMappingURL=oracleDatabase.d.ts.map