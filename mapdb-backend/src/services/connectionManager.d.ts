import { DbConnection, CreateConnectionRequest } from '@mapdb/shared';
export declare function createConnection(req: CreateConnectionRequest): DbConnection;
export declare function getConnection(id: string): DbConnection | undefined;
export declare function getAllConnections(): DbConnection[];
export declare function deleteConnection(id: string): boolean;
//# sourceMappingURL=connectionManager.d.ts.map