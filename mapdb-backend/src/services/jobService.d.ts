/**
 * Represents a single job step with its parsed source/target objects.
 * This is the unit of granularity - each step is one node in the graph.
 */
export interface StepMapping {
    jobName: string;
    stepId: number;
    stepName: string;
    command: string;
    databaseName: string;
    subsystem: string;
    targets: Array<{
        database: string;
        schema: string;
        name: string;
    }>;
    sources: Array<{
        database: string;
        schema: string;
        name: string;
    }>;
}
/**
 * Get ALL job steps from the server, each with parsed source/target objects.
 */
export declare function getAllStepMappings(connectionId: string): Promise<StepMapping[]>;
/**
 * Find steps that write to a specific table.
 * Returns only the specific steps, not the whole job.
 */
export declare function findStepsForTable(allSteps: StepMapping[], database: string, schema: string, tableName: string): StepMapping[];
/**
 * Find steps that read from a specific object.
 */
export declare function findStepsReadingFrom(allSteps: StepMapping[], database: string, schema: string, objectName: string): StepMapping[];
//# sourceMappingURL=jobService.d.ts.map