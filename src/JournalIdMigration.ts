import {
    SyncJournal,
    TaskSyncEntry,
    DeletedTaskEntry,
    SyncOperation,
} from "./SyncJournal";
import { TodoistIdManager } from "./TodoistIdManager";
import { TodoistContextBridgeSettings } from "./Settings";

/**
 * Journal ID Migration Utility
 * Handles migration of existing journal data from V1 to V2 Todoist IDs
 * Ensures all stored IDs are in canonical V2 format for consistency
 */
export class JournalIdMigration {
    private idManager: TodoistIdManager;
    private settings: TodoistContextBridgeSettings;

    constructor(settings: TodoistContextBridgeSettings) {
        this.settings = settings;
        this.idManager = new TodoistIdManager(settings);
    }

    /**
     * Migrate entire journal to use V2 IDs
     * This is a one-time migration that updates all stored Todoist IDs to V2 format
     */
    async migrateJournalToV2(journal: SyncJournal): Promise<{
        migratedJournal: SyncJournal;
        migrationStats: {
            tasksProcessed: number;
            tasksMigrated: number;
            deletedTasksProcessed: number;
            deletedTasksMigrated: number;
            operationsProcessed: number;
            operationsMigrated: number;
            errors: string[];
        };
    }> {
        if (this.settings.showSyncProgress) {
            console.log(
                "[JOURNAL MIGRATION] Starting V1 to V2 ID migration...",
            );
        }

        const migrationStats: {
            tasksProcessed: number;
            tasksMigrated: number;
            deletedTasksProcessed: number;
            deletedTasksMigrated: number;
            operationsProcessed: number;
            operationsMigrated: number;
            errors: string[];
        } = {
            tasksProcessed: 0,
            tasksMigrated: 0,
            deletedTasksProcessed: 0,
            deletedTasksMigrated: 0,
            operationsProcessed: 0,
            operationsMigrated: 0,
            errors: [],
        };

        // Create a deep copy of the journal for migration
        const migratedJournal: SyncJournal = JSON.parse(
            JSON.stringify(journal),
        );

        // Update version to indicate V2 migration completed
        migratedJournal.version = "1.2.0-v2";

        try {
            // Migrate task entries
            const taskMigrationResult = await this.migrateTaskEntries(
                migratedJournal.tasks,
            );
            migrationStats.tasksProcessed = taskMigrationResult.processed;
            migrationStats.tasksMigrated = taskMigrationResult.migrated;
            migrationStats.errors = migrationStats.errors.concat(
                taskMigrationResult.errors,
            );
            migratedJournal.tasks = taskMigrationResult.migratedTasks;

            // Migrate deleted task entries
            const deletedTaskMigrationResult =
                await this.migrateDeletedTaskEntries(
                    migratedJournal.deletedTasks,
                );
            migrationStats.deletedTasksProcessed =
                deletedTaskMigrationResult.processed;
            migrationStats.deletedTasksMigrated =
                deletedTaskMigrationResult.migrated;
            migrationStats.errors = migrationStats.errors.concat(
                deletedTaskMigrationResult.errors,
            );
            migratedJournal.deletedTasks =
                deletedTaskMigrationResult.migratedDeletedTasks;

            // Migrate pending operations
            const pendingOpsMigrationResult = await this.migrateOperations(
                migratedJournal.pendingOperations,
            );
            migratedJournal.pendingOperations =
                pendingOpsMigrationResult.migratedOperations;
            migrationStats.operationsProcessed +=
                pendingOpsMigrationResult.processed;
            migrationStats.operationsMigrated +=
                pendingOpsMigrationResult.migrated;
            migrationStats.errors = migrationStats.errors.concat(
                pendingOpsMigrationResult.errors,
            );

            // Migrate failed operations
            const failedOpsMigrationResult = await this.migrateOperations(
                migratedJournal.failedOperations,
            );
            migratedJournal.failedOperations =
                failedOpsMigrationResult.migratedOperations;
            migrationStats.operationsProcessed +=
                failedOpsMigrationResult.processed;
            migrationStats.operationsMigrated +=
                failedOpsMigrationResult.migrated;
            migrationStats.errors = migrationStats.errors.concat(
                failedOpsMigrationResult.errors,
            );

            if (this.settings.showSyncProgress) {
                console.log(
                    "[JOURNAL MIGRATION] Migration completed:",
                    migrationStats,
                );
            }

            return { migratedJournal, migrationStats };
        } catch (error: any) {
            // Always show migration errors as they are critical
            console.error("[JOURNAL MIGRATION] Migration failed:", error);
            migrationStats.errors.push(
                `Migration failed: ${error?.message || "Unknown error"}`,
            );
            return { migratedJournal: journal, migrationStats }; // Return original on failure
        }
    }

    /**
     * Check if journal needs V2 ID migration
     */
    needsMigration(journal: SyncJournal): boolean {
        // Check version first
        if (journal.version && journal.version.includes("v2")) {
            return false;
        }

        // Check if any task IDs are V1 (numeric)
        for (const taskEntry of Object.values(journal.tasks || {})) {
            if (this.idManager.isV1Id(taskEntry.todoistId)) {
                return true;
            }
        }

        // Check deleted tasks
        for (const deletedEntry of Object.values(journal.deletedTasks || {})) {
            if (this.idManager.isV1Id(deletedEntry.todoistId)) {
                return true;
            }
        }

        // Check operations
        for (const operation of [
            ...(journal.pendingOperations || []),
            ...(journal.failedOperations || []),
        ]) {
            if (this.idManager.isV1Id(operation.taskId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Migrate task entries to V2 IDs
     */
    private async migrateTaskEntries(
        tasks: Record<string, TaskSyncEntry>,
    ): Promise<{
        migratedTasks: Record<string, TaskSyncEntry>;
        processed: number;
        migrated: number;
        errors: string[];
    }> {
        const migratedTasks: Record<string, TaskSyncEntry> = {};
        const errors: string[] = [];
        let processed = 0;
        let migrated = 0;

        // Collect all unique V1 IDs for batch conversion
        const v1Ids = Object.values(tasks)
            .map((task) => task.todoistId)
            .filter((id) => this.idManager.isV1Id(id));

        const uniqueV1Ids = [...new Set(v1Ids)];

        if (uniqueV1Ids.length > 0) {
            if (this.settings.showSyncProgress) {
                console.log(
                    `[JOURNAL MIGRATION] Converting ${uniqueV1Ids.length} unique V1 task IDs...`,
                );
            }

            // Batch convert V1 IDs to V2
            const idMappings =
                await this.idManager.getCanonicalIds(uniqueV1Ids);

            // Migrate each task entry
            for (const [oldKey, taskEntry] of Object.entries(tasks)) {
                processed++;

                try {
                    const originalId = taskEntry.todoistId;
                    const canonicalId =
                        await this.idManager.getCanonicalId(originalId);

                    if (canonicalId !== originalId) {
                        // ID was migrated
                        const migratedEntry = {
                            ...taskEntry,
                            todoistId: canonicalId,
                        };
                        migratedTasks[canonicalId] = migratedEntry;
                        migrated++;

                        if (this.settings.showSyncProgress) {
                            console.log(
                                `[JOURNAL MIGRATION] Task ${originalId} -> ${canonicalId}`,
                            );
                        }
                    } else {
                        // ID was already V2 or couldn't be converted
                        migratedTasks[oldKey] = taskEntry;
                    }
                } catch (error: any) {
                    errors.push(
                        `Failed to migrate task ${taskEntry.todoistId}: ${error.message}`,
                    );
                    migratedTasks[oldKey] = taskEntry; // Keep original on error
                }
            }
        } else {
            // No V1 IDs found, copy all entries as-is
            Object.assign(migratedTasks, tasks);
            processed = Object.keys(tasks).length;
        }

        return { migratedTasks, processed, migrated, errors };
    }

    /**
     * Migrate deleted task entries to V2 IDs
     * Note: For deleted tasks, we use local conversion logic to avoid API calls
     */
    private async migrateDeletedTaskEntries(
        deletedTasks: Record<string, DeletedTaskEntry>,
    ): Promise<{
        migratedDeletedTasks: Record<string, DeletedTaskEntry>;
        processed: number;
        migrated: number;
        errors: string[];
    }> {
        const migratedDeletedTasks: Record<string, DeletedTaskEntry> = {};
        const errors: string[] = [];
        let processed = 0;
        let migrated = 0;

        for (const [oldKey, deletedEntry] of Object.entries(deletedTasks)) {
            processed++;

            try {
                const originalId = deletedEntry.todoistId;

                // For deleted tasks, we cannot make API calls since they no longer exist
                // Simply check if the ID is in V1 format and mark it for potential future migration
                // but keep the entry as-is to avoid errors

                const isV1Id = this.idManager.isV1Id(originalId);

                if (isV1Id) {
                    // This is a V1 ID for a deleted task
                    // We cannot convert it without API calls, so keep it as-is
                    // Future sync operations will handle this gracefully
                    migratedDeletedTasks[oldKey] = deletedEntry;
                    // Don't increment migrated count since we didn't actually migrate
                } else {
                    // Already appears to be V2 format or unknown format, keep as-is
                    migratedDeletedTasks[oldKey] = deletedEntry;
                }
            } catch (error) {
                errors.push(
                    `Failed to migrate deleted task ${deletedEntry.todoistId}: ${error.message}`,
                );
                migratedDeletedTasks[oldKey] = deletedEntry; // Keep original on error
            }
        }

        return { migratedDeletedTasks, processed, migrated, errors };
    }

    /**
     * Migrate sync operations to V2 IDs
     */
    private async migrateOperations(operations: SyncOperation[]): Promise<{
        migratedOperations: SyncOperation[];
        processed: number;
        migrated: number;
        errors: string[];
    }> {
        const migratedOperations: SyncOperation[] = [];
        const errors: string[] = [];
        let processed = 0;
        let migrated = 0;

        for (const operation of operations) {
            processed++;

            try {
                const originalTaskId = operation.taskId;
                const canonicalTaskId =
                    await this.idManager.getCanonicalId(originalTaskId);

                if (canonicalTaskId !== originalTaskId) {
                    // ID was migrated
                    const migratedOperation = {
                        ...operation,
                        taskId: canonicalTaskId,
                    };
                    migratedOperations.push(migratedOperation);
                    migrated++;
                } else {
                    // ID was already V2 or couldn't be converted
                    migratedOperations.push(operation);
                }
            } catch (error: any) {
                errors.push(
                    `Failed to migrate operation ${operation.id} with task ${operation.taskId}: ${error.message}`,
                );
                migratedOperations.push(operation); // Keep original on error
            }
        }

        return { migratedOperations, processed, migrated, errors };
    }

    /**
     * Create a backup of the journal before migration
     */
    createBackup(journal: SyncJournal): SyncJournal {
        return JSON.parse(JSON.stringify(journal));
    }

    /**
     * Validate migrated journal integrity
     */
    validateMigratedJournal(
        original: SyncJournal,
        migrated: SyncJournal,
    ): {
        isValid: boolean;
        issues: string[];
    } {
        const issues: string[] = [];

        // Check that no tasks were lost
        const originalTaskCount = Object.keys(original.tasks).length;
        const migratedTaskCount = Object.keys(migrated.tasks).length;

        if (originalTaskCount !== migratedTaskCount) {
            issues.push(
                `Task count mismatch: ${originalTaskCount} -> ${migratedTaskCount}`,
            );
        }

        // Check that no deleted tasks were lost
        const originalDeletedCount = Object.keys(original.deletedTasks).length;
        const migratedDeletedCount = Object.keys(migrated.deletedTasks).length;

        if (originalDeletedCount !== migratedDeletedCount) {
            issues.push(
                `Deleted task count mismatch: ${originalDeletedCount} -> ${migratedDeletedCount}`,
            );
        }

        // Check that all migrated IDs are V2 format
        for (const taskEntry of Object.values(migrated.tasks)) {
            if (this.idManager.isV1Id(taskEntry.todoistId)) {
                issues.push(
                    `Task ${taskEntry.todoistId} still has V1 ID after migration`,
                );
            }
        }

        for (const deletedEntry of Object.values(migrated.deletedTasks)) {
            if (this.idManager.isV1Id(deletedEntry.todoistId)) {
                issues.push(
                    `Deleted task ${deletedEntry.todoistId} still has V1 ID after migration`,
                );
            }
        }

        return {
            isValid: issues.length === 0,
            issues,
        };
    }
}
