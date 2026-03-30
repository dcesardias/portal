import { DependencyTree } from '@mapdb/shared';
/** Resolve objectId from name + schema. Used when objectId is 0 (cross-db nodes). */
export declare function resolveObjectId(connectionId: string, database: string, schemaName: string, objectName: string): Promise<number>;
export declare function getDependencies(connectionId: string, database: string, objectId: number, direction?: 'both' | 'up' | 'down', maxDepth?: number): Promise<DependencyTree>;
//# sourceMappingURL=dependencyService.d.ts.map