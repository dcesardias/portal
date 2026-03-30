import { DependencyTree } from '@mapdb/shared';
export declare function getDependencies(connectionId: string, schema: string, objectName: string, direction?: 'both' | 'up' | 'down', maxDepth?: number): Promise<DependencyTree>;
export declare function getScript(connectionId: string, schema: string, objectName: string): Promise<{
    script: string;
    typeDesc: string;
}>;
//# sourceMappingURL=dependencyService.d.ts.map