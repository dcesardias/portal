import { DbConnection, CreateConnectionRequest } from '@mapdb/shared';
export declare function createConnection(req: CreateConnectionRequest): DbConnection;
export declare function setConnection(conn: DbConnection): DbConnection;
export declare function replaceConnections(nextConnections: DbConnection[]): void;
export declare function clearConnections(): void;
export declare function getConnection(id: string): DbConnection | undefined;
export declare function getAllConnections(): DbConnection[];
export declare function deleteConnection(id: string): boolean;
//# sourceMappingURL=connectionManager.d.ts.map