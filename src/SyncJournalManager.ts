/**
 * SyncJournalManager - Manages persistent sync state and operations
 */

import { App } from "obsidian";
import {
    SyncJournal,
    TaskSyncEntry,
    DeletedTaskEntry,
    SyncOperation,
    SyncStats,
    DEFAULT_SYNC_JOURNAL,
} from "./SyncJournal";
import { TodoistContextBridgeSettings } from "./Settings";
import { JournalIdMigration } from "./JournalIdMigration";
import { TodoistIdManager } from "./TodoistIdManager";
import { BACKUP_CONSTANTS } from "./constants";
import { createHash } from "crypto";

export class SyncJournalManager {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private journalPath: string;
    private journal: SyncJournal;
    private isLoaded = false;
    private lastSaveLogTime = 0;
    private readonly SAVE_LOG_THROTTLE = 5000; // Only log saves every 5 seconds
    private isDirty = false;
    private autoSaveEnabled = true;
    private autoSaveTimeout: number | null = null;
    private idManager: TodoistIdManager;
    private migrationUtil: JournalIdMigration;

    constructor(app: App, settings: TodoistContextBridgeSettings) {
        this.app = app;
        this.settings = settings;
        this.journalPath =
            ".obsidian/plugins/todoist-context-bridge/sync-journal.json";
        // ✅ DON'T reset journal here - let loadJournal() handle initialization
        // This prevents journal data loss on plugin restart
        this.journal = {} as SyncJournal; // Temporary empty state until loadJournal() is called

        // Initialize ID management and migration utilities
        this.idManager = new TodoistIdManager(settings);
        this.migrationUtil = new JournalIdMigration(settings);

        // SyncJournalManager constructed - journal will be loaded via loadJournal()
    }

    /**
     * Perform V1→V2 ID migration (called only when migration is actually needed)
     */
    async performIdMigrationIfNeeded(): Promise<void> {
        try {
            if (this.settings.showSyncProgress) {
                console.log("[SYNC JOURNAL] 🔄 Starting V1→V2 ID migration...");
            }
            const migrationResult = await this.migrationUtil.migrateJournalToV2(
                this.journal,
            );
            this.journal = migrationResult.migratedJournal;
            this.isDirty = true;
            await this.saveJournal();
            if (this.settings.showSyncProgress) {
                console.log(
                    "[SYNC JOURNAL] ✅ ID migration completed and saved:",
                    migrationResult.migrationStats,
                );
            }
        } catch (error) {
            console.error("[SYNC JOURNAL] ❌ ID migration failed:", error);
        }
    }

    /**
     * Get canonical V2 ID for a given Todoist ID
     */
    async getCanonicalId(todoistId: string): Promise<string> {
        return await this.idManager.getCanonicalId(todoistId);
    }

    /**
     * Check if two Todoist IDs match (handles V1/V2 conversion)
     */
    async idsMatch(id1: string, id2: string): Promise<boolean> {
        return await this.idManager.idsMatch(id1, id2);
    }

    /**
     * Get task by Todoist ID (handles V1/V2 ID matching)
     */
    async getTaskByTodoistId(
        todoistId: string,
    ): Promise<TaskSyncEntry | undefined> {
        const canonicalId = await this.getCanonicalId(todoistId);
        return this.journal.tasks[canonicalId];
    }

    /**
     * Get deleted task by Todoist ID (handles V1/V2 ID matching)
     */
    async getDeletedTaskByTodoistId(
        todoistId: string,
    ): Promise<DeletedTaskEntry | undefined> {
        const canonicalId = await this.getCanonicalId(todoistId);
        return this.journal.deletedTasks?.[canonicalId];
    }

    /**
     * Load sync journal from file with safe recovery mechanisms
     */
    async loadJournal(): Promise<void> {
        // ANTI-CORRUPTION: Prevent multiple loads that overwrite in-memory changes
        if (this.isLoaded) {
            const taskCount = Object.keys(this.journal.tasks).length;
            console.warn(
                `[SYNC JOURNAL] ⚠️ PREVENTED DOUBLE LOAD - Journal already loaded with ${taskCount} tasks. Skipping to prevent data loss.`,
            );
            return;
        }

        try {
            const sessionId = Date.now().toString().slice(-6);
            // Loading journal from file...

            if (await this.app.vault.adapter.exists(this.journalPath)) {
                await this.loadExistingJournal();
            } else {
                // No existing journal found, starting fresh
                this.journal = { ...DEFAULT_SYNC_JOURNAL };
            }

            this.isLoaded = true;
            const finalTaskCount = Object.keys(this.journal.tasks).length;
            const finalDeletedCount = Object.keys(
                this.journal.deletedTasks || {},
            ).length;

            // Perform V1→V2 ID migration if needed (only if actually required)
            if (this.migrationUtil.needsMigration(this.journal)) {
                await this.performIdMigrationIfNeeded();
            } else {
                // Migration already completed - no action needed
                if (this.settings.showSyncProgress) {
                    console.log(
                        "[SYNC JOURNAL] ✅ V1→V2 ID migration already completed, skipping",
                    );
                }
            }

            // Journal loaded successfully

            // ✅ VERIFICATION: Ensure journal was loaded properly and not reset
            if (
                finalTaskCount === 0 &&
                (await this.app.vault.adapter.exists(this.journalPath))
            ) {
                console.warn(
                    `[SYNC JOURNAL] ⚠️ [${sessionId}] WARNING: Journal file exists but no tasks loaded - possible data loss!`,
                );

                // Try to read the raw file again for debugging
                try {
                    const rawData = await this.app.vault.adapter.read(
                        this.journalPath,
                    );
                    const rawParsed = JSON.parse(rawData);
                    const rawTaskCount = rawParsed.tasks
                        ? Object.keys(rawParsed.tasks).length
                        : 0;

                    if (rawTaskCount > 0) {
                        console.error(
                            `[SYNC JOURNAL] 🚨 CRITICAL: Raw file has ${rawTaskCount} tasks but journal is empty! Migration failed!`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `[SYNC JOURNAL] Failed to verify raw journal data:`,
                        error,
                    );
                }
            }
        } catch (error) {
            console.error(
                "[SYNC JOURNAL] Critical error loading journal:",
                error,
            );
            // Try to recover from backup before giving up
            await this.attemptJournalRecovery();
            this.isLoaded = true;
        }
    }

    /**
     * Safely load existing journal with detailed debugging and conservative error handling
     */
    private async loadExistingJournal(): Promise<void> {
        try {
            // Reading journal file
            const journalData = await this.app.vault.adapter.read(
                this.journalPath,
            );

            // Journal file loaded - reduced logging

            // Basic corruption check - ensure it's not empty or malformed
            if (!journalData || journalData.trim().length === 0) {
                console.error(
                    "[SYNC JOURNAL] ⚠️ Journal file exists but is empty!",
                );
                throw new Error("Journal file is empty");
            }

            // Log first 200 chars for debugging (without sensitive data)
            const preview = journalData
                .substring(0, 200)
                .replace(/"todoistId":\s*"\d+"/g, '"todoistId":"***"');
            // Journal preview - reduced logging

            let parsedJournal: any;
            try {
                parsedJournal = JSON.parse(journalData);
                // JSON parsing successful - reduced logging
            } catch (jsonError) {
                console.error(
                    "[SYNC JOURNAL] 🚨 JSON parsing failed:",
                    jsonError,
                );
                console.error(
                    "[SYNC JOURNAL] Corrupted journal data, attempting recovery...",
                );
                throw new Error(`JSON parsing failed: ${jsonError.message}`);
            }

            // Log what we found before migration
            const originalTaskCount = parsedJournal.tasks
                ? Object.keys(parsedJournal.tasks).length
                : 0;
            const originalDeletedCount = parsedJournal.deletedTasks
                ? Object.keys(parsedJournal.deletedTasks).length
                : 0;

            // Validate and migrate if needed
            this.journal = this.validateAndMigrateJournal(parsedJournal);

            const finalTaskCount = Object.keys(this.journal.tasks).length;
            if (finalTaskCount === 0 && originalTaskCount > 0) {
                console.error(
                    `[SYNC JOURNAL] 🚨 CRITICAL: Migration lost ${originalTaskCount} tasks! This should not happen!`,
                );

                // Create emergency backup before throwing error
                try {
                    const emergencyPath =
                        this.journalPath + `.migration-loss-${Date.now()}`;
                    const rawData = JSON.stringify(parsedJournal, null, 2);
                    await this.app.vault.adapter.write(emergencyPath, rawData);
                } catch (backupError) {
                    console.error(
                        "[SYNC JOURNAL] Failed to create emergency backup:",
                        backupError,
                    );
                }

                // This is a critical issue - trigger recovery attempt
                throw new Error(
                    `Migration resulted in task loss: ${originalTaskCount} -> ${finalTaskCount}`,
                );
            }

            console.log(
                `[SYNC JOURNAL] ✅ Successfully loaded journal with ${finalTaskCount} tasks`,
            );

            // Create backup only on first load or after significant time gap
            await this.createSmartBackup(
                BACKUP_CONSTANTS.OPERATION_TYPES.JOURNAL_LOAD,
                false,
            );
        } catch (error) {
            console.error(
                "[SYNC JOURNAL] 🚨 FAILED to load existing journal:",
                error,
            );
            throw error;
        }
    }

    /**
     * Attempt to recover journal using robust backup system
     */
    private async attemptJournalRecovery(): Promise<void> {
        // Try automatic recovery first (uses all available backups)
        const automaticRecovery = await this.attemptAutomaticRecovery();

        if (automaticRecovery) {
            console.log("[SYNC JOURNAL] ✅ Automatic recovery successful");
            return;
        }

        // Fallback: Try the traditional .backup file
        const traditionalBackupPath = this.journalPath + ".backup";

        try {
            if (await this.app.vault.adapter.exists(traditionalBackupPath)) {
                const success = await this.restoreFromBackup(
                    traditionalBackupPath,
                );

                if (success) {
                    console.log(
                        "[SYNC JOURNAL] ✅ Traditional backup recovery successful",
                    );
                    return;
                }
            }
        } catch (error) {
            console.error(
                "[SYNC JOURNAL] Traditional backup recovery failed:",
                error,
            );
        }

        // Last resort: Start fresh but create emergency backup for investigation
        console.error(
            "[SYNC JOURNAL] 🚨 ALL RECOVERY ATTEMPTS FAILED - Starting with empty journal",
        );

        // Try to save current corrupted state for debugging
        try {
            const emergencyPath = this.journalPath + `.emergency-${Date.now()}`;
            const currentContent = await this.app.vault.adapter.read(
                this.journalPath,
            );
            await this.app.vault.adapter.write(emergencyPath, currentContent);
            console.log(
                `[SYNC JOURNAL] 🚑 Saved corrupted journal for debugging: ${emergencyPath}`,
            );
        } catch (e) {
            console.warn(
                "[SYNC JOURNAL] Could not save corrupted journal for debugging:",
                e,
            );
        }

        // ✅ PRESERVE EXISTING DATA: Only reset if journal is completely empty/uninitialized
        if (!this.journal || Object.keys(this.journal).length === 0) {
            this.journal = { ...DEFAULT_SYNC_JOURNAL };
        } else {
            console.log(
                "[SYNC JOURNAL] ⚠️ Recovery failed but preserving existing in-memory journal data",
            );
            // Keep existing journal data - don't reset!
        }
    }

    // Smart backup system properties
    private lastBackupTime = 0;
    private readonly BACKUP_THROTTLE_MS =
        BACKUP_CONSTANTS.CONFIG.BACKUP_THROTTLE_MS;

    // Generate backup retention policies from constants
    private readonly BACKUP_RETENTION_POLICIES: Record<
        string,
        { maxFiles: number; autoCleanup: boolean }
    > = {
        [BACKUP_CONSTANTS.OPERATION_TYPES.AUTO_SAVE]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.AUTO_SAVE,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.AUTO_SAVE,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.JOURNAL_LOAD]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.JOURNAL_LOAD,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.JOURNAL_LOAD,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.PRE_SAVE]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.PRE_SAVE,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.PRE_SAVE,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.AUTOSAVE]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.AUTOSAVE,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.AUTOSAVE,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.RESET]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.RESET,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.RESET,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.PRE_RESTORE]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.PRE_RESTORE,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.PRE_RESTORE,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.MIGRATION]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.MIGRATION,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.MIGRATION,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.MANUAL]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.MANUAL,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.MANUAL,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.USER_BACKUP]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.USER_BACKUP,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.USER_BACKUP,
        },
        [BACKUP_CONSTANTS.OPERATION_TYPES.DEFAULT]: {
            maxFiles: BACKUP_CONSTANTS.RETENTION_LIMITS.DEFAULT,
            autoCleanup: BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED.DEFAULT,
        },
    };

    /**
     * Create a smart backup that respects throttling and retention policies
     * Only creates backups when truly needed, not on every save
     */
    private async createSmartBackup(
        operation: string,
        force = false,
    ): Promise<void> {
        try {
            const now = Date.now();

            // Skip backup if throttled (unless forced for critical operations)
            if (!force && now - this.lastBackupTime < this.BACKUP_THROTTLE_MS) {
                return; // Skip routine backup - too recent
            }

            // Create timestamped backup
            const backupPath = await this.createTimestampedBackup(operation);
            if (backupPath) {
                this.lastBackupTime = now;

                // Clean up old backups for this operation type (only if auto-cleanup enabled)
                const policy =
                    this.BACKUP_RETENTION_POLICIES[operation] ||
                    this.BACKUP_RETENTION_POLICIES["default"];
                if (policy.autoCleanup) {
                    await this.cleanupBackupsByType(operation, policy.maxFiles);
                }

                if (this.settings.showSyncProgress) {
                    console.log(
                        `[SYNC JOURNAL] 💾 Created backup: ${operation}`,
                    );
                }
            }
        } catch (error) {
            console.warn(
                "[SYNC JOURNAL] Warning: Could not create backup:",
                error,
            );
        }
    }

    /**
     * Clean up old backup files for a specific operation type
     */
    private async cleanupBackupsByType(
        operationType: string,
        maxFiles: number,
    ): Promise<number> {
        try {
            const backupPattern =
                this.journalPath + `.backup-${operationType}-`;
            const journalDir = this.journalPath.substring(
                0,
                this.journalPath.lastIndexOf("/"),
            );
            const allFiles = await this.app.vault.adapter.list(journalDir);

            // Find backup files for this specific operation type
            const backupFiles = allFiles.files
                .filter((file) => file.includes(`.backup-${operationType}-`))
                .map((file) => ({
                    path: file,
                    timestamp: this.extractTimestampFromBackupFilename(file),
                }))
                .filter((backup) => backup.timestamp > 0)
                .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first

            if (backupFiles.length <= maxFiles) {
                return 0; // Nothing to clean up
            }

            const filesToDelete = backupFiles.slice(maxFiles);
            let deletedCount = 0;

            for (const backup of filesToDelete) {
                try {
                    await this.app.vault.adapter.remove(backup.path);
                    deletedCount++;
                    if (this.settings.showSyncProgress) {
                        console.log(
                            `[SYNC JOURNAL] 🗑️ Cleaned up old ${operationType} backup: ${backup.path}`,
                        );
                    }
                } catch (error) {
                    console.warn(
                        `[SYNC JOURNAL] Warning: Could not delete backup ${backup.path}:`,
                        error,
                    );
                }
            }

            return deletedCount;
        } catch (error) {
            console.warn(
                `[SYNC JOURNAL] Warning: Could not clean up ${operationType} backups:`,
                error,
            );
            return 0;
        }
    }

    /**
     * Extract timestamp from backup filename for sorting
     */
    private extractTimestampFromBackupFilename(filename: string): number {
        try {
            // Extract timestamp from filename like: sync-journal.json.backup-auto-save-2025-08-07T17-26-33-467Z
            const match = filename.match(
                BACKUP_CONSTANTS.CONFIG.TIMESTAMP_FORMAT_REGEX,
            );
            if (match) {
                const timestampStr = match[1]
                    .replace(/-/g, ":")
                    .replace(
                        /T([0-9]{2})-([0-9]{2})-([0-9]{2})-([0-9]{3})Z/,
                        "T$1:$2:$3.$4Z",
                    );
                return new Date(timestampStr).getTime();
            }
        } catch (error) {
            // Ignore parsing errors
        }
        return 0;
    }

    /**
     * Create timestamped backup before risky operations
     */
    async createTimestampedBackup(operation: string): Promise<string | null> {
        try {
            const timestamp = BACKUP_CONSTANTS.HELPERS.generateTimestamp();
            const backupPath = BACKUP_CONSTANTS.HELPERS.generateBackupFilename(
                this.journalPath,
                operation,
                timestamp,
            );
            const currentData = JSON.stringify(this.journal, null, 2);

            await this.app.vault.adapter.write(backupPath, currentData);
            return backupPath;
        } catch (error) {
            console.error(
                `[SYNC JOURNAL] ❌ Failed to create timestamped backup for ${operation}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Get all available backup files
     * FIXED: Properly handles different vault adapter responses and improves error handling
     */
    async getAvailableBackups(): Promise<
        { path: string; created: Date; operation?: string; size?: number }[]
    > {
        try {
            const backupDir = this.journalPath.substring(
                0,
                this.journalPath.lastIndexOf("/"),
            );

            // Check if backup directory exists
            if (!(await this.app.vault.adapter.exists(backupDir))) {
                console.log(
                    "[SYNC JOURNAL] Backup directory does not exist:",
                    backupDir,
                );
                return [];
            }

            const files = await this.app.vault.adapter.list(backupDir);
            console.log(
                "[SYNC JOURNAL] 🔍 Scanning for backups in:",
                backupDir,
            );

            const backups: {
                path: string;
                created: Date;
                operation?: string;
                size?: number;
            }[] = [];
            const journalFilename = this.journalPath.substring(
                this.journalPath.lastIndexOf("/") + 1,
            );

            // ✅ FIXED: Handle different vault adapter response formats
            let fileList: string[] = [];
            if (Array.isArray(files)) {
                // Some adapters return array directly
                fileList = files;
            } else if (files && typeof files === "object") {
                // Standard Obsidian adapter returns {files: [], folders: []}
                fileList = (files as any).files || [];
            }

            console.log(
                `[SYNC JOURNAL] Found ${fileList.length} files in backup directory`,
            );

            for (const file of fileList) {
                try {
                    if (
                        file.includes(journalFilename) &&
                        file.includes(".backup")
                    ) {
                        const stat = await this.app.vault.adapter.stat(file);
                        if (!stat) {
                            console.warn(
                                `[SYNC JOURNAL] Could not get stats for backup file: ${file}`,
                            );
                            continue;
                        }

                        // ✅ UNIFIED: All backups now use timestamped format
                        let operation: string | undefined;

                        // Extract operation from unified timestamped format: .backup-operation-timestamp
                        // Updated regex to handle multi-word operations like 'auto-save', 'pre-restore', 'legacy-auto-save'
                        const backupMatch = file.match(
                            /\.backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/,
                        );
                        if (backupMatch) {
                            operation = backupMatch[1]; // Extract operation name before timestamp
                        } else if (file.endsWith(".backup")) {
                            // Legacy simple backup format (if any still exist)
                            operation = "legacy-auto-save";
                        }

                        backups.push({
                            path: file,
                            created: new Date(stat.mtime || stat.ctime || 0),
                            operation,
                            size: stat.size || 0,
                        });
                    }
                } catch (fileError) {
                    console.warn(
                        `[SYNC JOURNAL] Error processing backup file ${file}:`,
                        fileError,
                    );
                    continue; // Skip this file and continue with others
                }
            }

            // Sort by creation time (newest first)
            backups.sort((a, b) => b.created.getTime() - a.created.getTime());

            console.log(
                `[SYNC JOURNAL] ✅ Found ${backups.length} valid backup files`,
            );
            return backups;
        } catch (error) {
            console.error("[SYNC JOURNAL] ❌ Error listing backups:", error);
            return [];
        }
    }

    /**
     * Clean up old backups using categorized retention policies
     * This is the improved manual cleanup command that respects backup types
     */
    async cleanupOldBackups(keepCount?: number): Promise<number> {
        try {
            let totalDeleted = 0;
            const backupTypes = new Set<string>();

            // First, identify all backup types present
            const journalDir = this.journalPath.substring(
                0,
                this.journalPath.lastIndexOf("/"),
            );
            const allFiles = await this.app.vault.adapter.list(journalDir);
            const backupFiles = allFiles.files.filter((file) =>
                file.includes(".backup-"),
            );

            // Extract operation types from backup filenames
            // Handle compound operation names like 'auto-save', 'journal-load', etc.
            for (const file of backupFiles) {
                // Match pattern: .backup-OPERATION-TIMESTAMP
                // Where OPERATION can contain hyphens (e.g., 'auto-save', 'journal-load')
                const match = file.match(
                    BACKUP_CONSTANTS.CONFIG.BACKUP_FILE_PATTERN,
                );
                if (match) {
                    const operationType = match[1];
                    backupTypes.add(operationType);
                    if (this.settings.showSyncProgress) {
                        console.log(
                            `[SYNC JOURNAL] 🔍 Detected backup type: '${operationType}' in file: ${file}`,
                        );
                    }
                }
            }

            // Clean up each backup type according to its policy
            for (const backupType of backupTypes) {
                const policy =
                    this.BACKUP_RETENTION_POLICIES[backupType] ||
                    this.BACKUP_RETENTION_POLICIES["default"];
                const maxFilesForType =
                    keepCount !== undefined ? keepCount : policy.maxFiles;

                const deletedForType = await this.cleanupBackupsByType(
                    backupType,
                    maxFilesForType,
                );
                totalDeleted += deletedForType;

                if (deletedForType > 0 && this.settings.showSyncProgress) {
                    console.log(
                        `[SYNC JOURNAL] 🧹 Cleaned up ${deletedForType} old '${backupType}' backups, kept ${maxFilesForType} recent ones`,
                    );
                }
            }

            if (totalDeleted > 0) {
                console.log(
                    `[SYNC JOURNAL] 🧹 Total cleanup: ${totalDeleted} old backups removed across all types`,
                );
            }

            return totalDeleted;
        } catch (error) {
            console.error("[SYNC JOURNAL] Error cleaning up backups:", error);
            return 0;
        }
    }

    /**
     * Restore journal from a specific backup
     */
    async restoreFromBackup(backupPath: string): Promise<boolean> {
        try {
            console.log(
                `[SYNC JOURNAL] 🔄 Attempting to restore from backup: ${backupPath}`,
            );

            if (!(await this.app.vault.adapter.exists(backupPath))) {
                console.error(
                    `[SYNC JOURNAL] ❌ Backup file not found: ${backupPath}`,
                );
                return false;
            }

            const backupData = await this.app.vault.adapter.read(backupPath);

            if (!backupData || backupData.trim().length === 0) {
                console.error(
                    `[SYNC JOURNAL] ❌ Backup file is empty: ${backupPath}`,
                );
                return false;
            }

            // Validate backup data
            let parsedBackup: any;
            try {
                parsedBackup = JSON.parse(backupData);
            } catch (parseError) {
                console.error(
                    `[SYNC JOURNAL] ❌ Backup file is corrupted: ${backupPath}`,
                    parseError,
                );
                return false;
            }

            // Create a backup of current state before restoring
            await this.createSmartBackup(
                BACKUP_CONSTANTS.OPERATION_TYPES.PRE_RESTORE,
                true,
            ); // Force backup before restore

            // Validate and migrate the backup data
            this.journal = this.validateAndMigrateJournal(parsedBackup);
            const taskCount = Object.keys(this.journal.tasks).length;

            // Save the restored journal
            await this.saveJournal();

            console.log(
                `[SYNC JOURNAL] ✅ Successfully restored journal from backup with ${taskCount} tasks`,
            );
            return true;
        } catch (error) {
            console.error(
                `[SYNC JOURNAL] ❌ Error restoring from backup ${backupPath}:`,
                error,
            );
            return false;
        }
    }

    /**
     * Attempt automatic recovery when journal is empty or corrupted
     */
    async attemptAutomaticRecovery(): Promise<boolean> {
        console.log("[SYNC JOURNAL] 🔄 Attempting automatic recovery...");

        const backups = await this.getAvailableBackups();
        if (backups.length === 0) {
            console.warn(
                "[SYNC JOURNAL] ⚠️ No backup files found for automatic recovery",
            );
            return false;
        }

        // Try backups in order (newest first)
        for (const backup of backups) {
            console.log(
                `[SYNC JOURNAL] 🔄 Trying backup: ${backup.path} (created: ${backup.created.toISOString()})`,
            );

            try {
                const backupData = await this.app.vault.adapter.read(
                    backup.path,
                );

                if (!backupData || backupData.trim().length === 0) {
                    console.warn(
                        `[SYNC JOURNAL] ⚠️ Backup file is empty: ${backup.path}`,
                    );
                    continue;
                }

                const parsedBackup = JSON.parse(backupData);
                const taskCount = parsedBackup.tasks
                    ? Object.keys(parsedBackup.tasks).length
                    : 0;

                if (taskCount === 0) {
                    console.warn(
                        `[SYNC JOURNAL] ⚠️ Backup has no tasks: ${backup.path}`,
                    );
                    continue;
                }

                // This backup looks good - restore from it
                console.log(
                    `[SYNC JOURNAL] ✅ Found valid backup with ${taskCount} tasks: ${backup.path}`,
                );
                return await this.restoreFromBackup(backup.path);
            } catch (error) {
                console.warn(
                    `[SYNC JOURNAL] ⚠️ Backup file is corrupted: ${backup.path}`,
                    error,
                );
                continue;
            }
        }

        console.error(
            "[SYNC JOURNAL] ❌ All backup files are empty or corrupted - automatic recovery failed",
        );
        return false;
    }

    /**
     * Save sync journal to file safely with backup protection
     */
    async saveJournal(): Promise<void> {
        try {
            // Cancel any pending auto-save since we're saving now
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = null;
            }

            // Ensure directory exists
            const journalDir = this.journalPath.substring(
                0,
                this.journalPath.lastIndexOf("/"),
            );
            if (!(await this.app.vault.adapter.exists(journalDir))) {
                await this.app.vault.adapter.mkdir(journalDir);
            }

            // Update timestamp
            const syncTimestamp = Date.now();
            this.journal.lastSyncTimestamp = syncTimestamp;
            this.journal.stats.lastSyncTimestamp = syncTimestamp;

            // Smart backup - only if significant time has passed or forced
            if (await this.app.vault.adapter.exists(this.journalPath)) {
                await this.createSmartBackup(
                    BACKUP_CONSTANTS.OPERATION_TYPES.PRE_SAVE,
                    false,
                );
            }

            // Prepare data and validate before writing
            const journalData = JSON.stringify(this.journal, null, 2);

            // Basic validation - ensure data is not empty or corrupted
            if (!journalData || journalData.trim().length < 10) {
                throw new Error("Journal data appears corrupted or empty");
            }

            // Additional validation - ensure critical fields exist
            if (!this.journal.tasks || !this.journal.stats) {
                throw new Error("Critical journal fields missing");
            }

            // Save to temporary file first, then move (atomic operation)
            const tempPath = this.journalPath + ".tmp";
            await this.app.vault.adapter.write(tempPath, journalData);

            // Verify temp file was written correctly
            const tempData = await this.app.vault.adapter.read(tempPath);
            if (tempData !== journalData) {
                throw new Error("Temp file verification failed");
            }

            // Atomic move from temp to actual file
            if (await this.app.vault.adapter.exists(this.journalPath)) {
                await this.app.vault.adapter.remove(this.journalPath);
            }
            await this.app.vault.adapter.rename(tempPath, this.journalPath);

            // Mark as clean after successful save
            this.isDirty = false;

            const now = Date.now();
            const taskCount = Object.keys(this.journal.tasks).length;
            const deletedCount = Object.keys(this.journal.deletedTasks).length;

            // Journal saved successfully (logging removed to reduce console noise)
        } catch (error) {
            console.error("[SYNC JOURNAL] ❌ Error saving journal:", error);

            // Clean up temp file if it exists
            const tempPath = this.journalPath + ".tmp";
            if (await this.app.vault.adapter.exists(tempPath)) {
                await this.app.vault.adapter.remove(tempPath);
            }

            throw error;
        }
    }

    /**
     * Validate and migrate journal from older versions with detailed logging
     */
    private validateAndMigrateJournal(journal: any): SyncJournal {
        // Don't migrate if journal already has V2 version (e.g., "1.2.0-v2")
        const isV2Version = journal.version && journal.version.includes("v2");
        const needsMigration =
            !isV2Version && journal.version !== DEFAULT_SYNC_JOURNAL.version;

        if (needsMigration && this.settings.showSyncProgress) {
            console.log(
                `[SYNC JOURNAL] 🔄 Migrating from version ${journal.version || "unknown"} to ${DEFAULT_SYNC_JOURNAL.version}`,
            );
        }

        // Start with default structure
        const migratedJournal: SyncJournal = { ...DEFAULT_SYNC_JOURNAL };

        // Copy valid fields
        if (journal.version) {
            migratedJournal.version = journal.version;
        }
        if (journal.lastSyncTimestamp)
            migratedJournal.lastSyncTimestamp = journal.lastSyncTimestamp;
        if (journal.lastObsidianScan)
            migratedJournal.lastObsidianScan = journal.lastObsidianScan;
        if (journal.lastTodoistSync)
            migratedJournal.lastTodoistSync = journal.lastTodoistSync;

        // Migrate tasks (CRITICAL - this is what's getting lost)
        if (journal.tasks && typeof journal.tasks === "object") {
            const taskCount = Object.keys(journal.tasks).length;
            if (needsMigration && this.settings.showSyncProgress) {
                console.log(
                    `[SYNC JOURNAL] 📦 Migrating ${taskCount} existing tasks`,
                );
            }

            migratedJournal.tasks = { ...journal.tasks }; // Deep copy to be safe

            // 🔍 VERIFICATION: Ensure migration worked
            const migratedCount = Object.keys(migratedJournal.tasks).length;
            if (migratedCount !== taskCount) {
                console.error(
                    `[SYNC JOURNAL] 🚨 MIGRATION FAILED: Expected ${taskCount} tasks, got ${migratedCount}!`,
                );
            } else {
                if (needsMigration && this.settings.showSyncProgress) {
                    console.log(
                        `[SYNC JOURNAL] ✅ Task migration verified: ${migratedCount} tasks preserved`,
                    );
                }
            }
        } else {
            console.warn(
                `[SYNC JOURNAL] ⚠️ No tasks found in journal to migrate. Original journal tasks type: ${typeof journal.tasks}`,
            );

            // 🔍 DEBUG: Log what the journal object looks like
            console.log(
                `[SYNC JOURNAL] 🔍 Journal object keys: ${Object.keys(journal).join(", ")}`,
            );
        }

        // Migrate deleted tasks (new in v1.1.0 - may not exist in old journals)
        if (journal.deletedTasks && typeof journal.deletedTasks === "object") {
            const deletedCount = Object.keys(journal.deletedTasks).length;
            if (needsMigration && this.settings.showSyncProgress) {
                console.log(
                    `[SYNC JOURNAL] 🗑️ Migrating ${deletedCount} deleted task entries`,
                );
            }
            migratedJournal.deletedTasks = { ...journal.deletedTasks };
        } else {
            console.log(
                `[SYNC JOURNAL] No deleted tasks to migrate (expected for v1.0.0 journals)`,
            );
        }

        // Migrate operations
        if (Array.isArray(journal.pendingOperations)) {
            migratedJournal.pendingOperations = [...journal.pendingOperations];
        }
        if (Array.isArray(journal.failedOperations)) {
            migratedJournal.failedOperations = [...journal.failedOperations];
        }

        // Migrate stats
        if (journal.stats && typeof journal.stats === "object") {
            migratedJournal.stats = {
                ...DEFAULT_SYNC_JOURNAL.stats,
                ...journal.stats,
            };
        }

        // Update to current version after successful migration
        // Preserve V2 versions (e.g., "1.2.0-v2") instead of downgrading them
        if (isV2Version) {
            migratedJournal.version = journal.version; // Keep the V2 version
        } else {
            migratedJournal.version = DEFAULT_SYNC_JOURNAL.version;
        }

        const finalTaskCount = Object.keys(migratedJournal.tasks).length;
        if (needsMigration && this.settings.showSyncProgress) {
            console.log(
                `[SYNC JOURNAL] ✅ Migration complete: ${finalTaskCount} tasks preserved`,
            );
        }

        return migratedJournal;
    }

    /**
     * Add a new task to the journal with auto-save
     */
    async addTask(task: TaskSyncEntry): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        // Ensure we use canonical V2 ID for storage
        const canonicalId = await this.getCanonicalId(task.todoistId);

        // Calculate and set completion state for new task (always ensure it's set)
        const taskWithState = {
            ...task,
            todoistId: canonicalId, // Use canonical V2 ID
            completionState: this.calculateCompletionState(
                task.obsidianCompleted,
                task.todoistCompleted,
            ),
        };

        // Adding task to journal - reduced logging

        // Add task to journal using canonical ID as key
        this.journal.tasks[canonicalId] = taskWithState;
        this.journal.stats.totalTasks = Object.keys(this.journal.tasks).length;
        this.journal.stats.newTasksFound++;
        this.markDirty();

        // Only log new task additions if sync progress is enabled
        if (this.settings.showSyncProgress) {
            console.log(
                `[SYNC JOURNAL] Added new task: ${canonicalId} in ${task.obsidianFile}:${task.obsidianLine}`,
            );
        }

        // Auto-save after adding critical task data
        if (this.autoSaveEnabled) {
            await this.scheduleAutoSave();
        }
    }

    /**
     * Calculate the completion state category for a task based on Obsidian and Todoist status
     */
    private calculateCompletionState(
        obsidianCompleted: boolean,
        todoistCompleted: boolean,
    ):
        | "obsidian-completed-todoist-open"
        | "obsidian-open-todoist-completed"
        | "both-open"
        | "both-completed" {
        const obsCompleted = obsidianCompleted || false;
        const todCompleted = todoistCompleted || false;

        if (obsCompleted && !todCompleted) {
            return "obsidian-completed-todoist-open"; // HIGH PRIORITY: Needs sync to Todoist
        } else if (!obsCompleted && todCompleted) {
            return "obsidian-open-todoist-completed"; // HIGH PRIORITY: Needs sync to Obsidian
        } else if (!obsCompleted && !todCompleted) {
            return "both-open"; // MEDIUM PRIORITY: Both active, might change
        } else {
            return "both-completed"; // LOW PRIORITY: Both done, unlikely to reopen
        }
    }

    /**
     * Update an existing task entry in the journal
     */
    async updateTask(
        taskId: string,
        updates: Partial<TaskSyncEntry>,
    ): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        if (!this.journal.tasks[taskId]) {
            throw new Error(`Task ${taskId} not found in journal`);
        }

        // Check if this is a meaningful change (not just timestamp/hash updates)
        const meaningfulFields = [
            "obsidianCompleted", // Completion status in Obsidian (MOST IMPORTANT)
            "todoistCompleted", // Completion status in Todoist (MOST IMPORTANT)
            "obsidianFile", // File path changes (when tasks move between files)
            "todoistDueDate", // Due date changes in Todoist
            // Note: obsidianLine removed - line numbers change when other items are added above
        ];
        const hasMeaningfulChange = meaningfulFields.some(
            (field) =>
                updates.hasOwnProperty(field) &&
                updates[field as keyof TaskSyncEntry] !==
                    this.journal.tasks[taskId][field as keyof TaskSyncEntry],
        );

        // Merge updates
        this.journal.tasks[taskId] = {
            ...this.journal.tasks[taskId],
            ...updates,
        };

        // Update completion state if completion status changed
        if (
            updates.hasOwnProperty("obsidianCompleted") ||
            updates.hasOwnProperty("todoistCompleted")
        ) {
            this.journal.tasks[taskId].completionState =
                this.calculateCompletionState(
                    this.journal.tasks[taskId].obsidianCompleted,
                    this.journal.tasks[taskId].todoistCompleted,
                );
        }

        this.markDirty();

        // Only log meaningful changes, not routine maintenance updates
        if (hasMeaningfulChange) {
            const changedFields = meaningfulFields.filter(
                (field) =>
                    updates.hasOwnProperty(field) &&
                    updates[field as keyof TaskSyncEntry] !==
                        this.journal.tasks[taskId][
                            field as keyof TaskSyncEntry
                        ],
            );
            console.log(
                `[SYNC JOURNAL] Updated task ${taskId}: ${changedFields.join(", ")} changed`,
            );
        }

        // Auto-save after important updates
        if (this.autoSaveEnabled) {
            await this.scheduleAutoSave();
        }
    }

    /**
     * Remove a task from the journal (use markAsDeleted for permanent tracking)
{{ ... }}
     */
    async removeTask(taskId: string): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        if (this.journal.tasks[taskId]) {
            delete this.journal.tasks[taskId];
            this.journal.stats.totalTasks = Object.keys(
                this.journal.tasks,
            ).length;
            // Task removed from journal - reduced logging
        }
    }

    /**
     * Permanently mark a task as deleted - never sync again
     */
    async markAsDeleted(
        taskId: string,
        reason: "deleted" | "inaccessible" | "user_removed",
        httpStatus?: number,
        obsidianFile?: string,
        notes?: string,
    ): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        // Remove from active tasks if present
        if (this.journal.tasks[taskId]) {
            delete this.journal.tasks[taskId];
            this.journal.stats.totalTasks = Object.keys(
                this.journal.tasks,
            ).length;
        }

        // Add to deleted tasks for permanent tracking
        const deletedEntry: DeletedTaskEntry = {
            todoistId: taskId,
            reason,
            deletedAt: Date.now(),
            lastObsidianFile: obsidianFile,
            httpStatus,
            notes,
        };

        this.journal.deletedTasks[taskId] = deletedEntry;
        this.markDirty();

        console.log(
            `[SYNC JOURNAL] 🗑️ Permanently marked task as ${reason}: ${taskId}`,
        );

        // Auto-save for important deletions
        if (this.autoSaveEnabled) {
            await this.scheduleAutoSave();
        }
    }

    /**
     * Check if a task is permanently deleted
     */
    isTaskDeleted(taskId: string): boolean {
        if (!this.isLoaded) {
            return false;
        }
        return !!this.journal.deletedTasks[taskId];
    }

    /**
     * Get deleted task entry
     */
    getDeletedTask(taskId: string): DeletedTaskEntry | null {
        if (!this.isLoaded || !this.journal.deletedTasks[taskId]) {
            return null;
        }
        return this.journal.deletedTasks[taskId];
    }

    /**
     * Get all deleted tasks
     */
    getAllDeletedTasks(): Record<string, DeletedTaskEntry> {
        return this.isLoaded ? { ...this.journal.deletedTasks } : {};
    }

    /**
     * Clean up old deleted task entries (older than specified days)
     */
    async cleanupOldDeletedTasks(olderThanDays = 90): Promise<number> {
        if (!this.isLoaded) {
            return 0;
        }

        const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
        let cleanedCount = 0;

        for (const [taskId, entry] of Object.entries(
            this.journal.deletedTasks,
        )) {
            if (entry.deletedAt < cutoffTime) {
                delete this.journal.deletedTasks[taskId];
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.markDirty();
            console.log(
                `[SYNC JOURNAL] 🧹 Cleaned up ${cleanedCount} old deleted task entries (older than ${olderThanDays} days)`,
            );

            if (this.autoSaveEnabled) {
                await this.scheduleAutoSave();
            }
        }

        return cleanedCount;
    }

    /**
     * Get deleted task count by age
     */
    getDeletedTaskAgeStats(): {
        total: number;
        lastWeek: number;
        lastMonth: number;
        older: number;
    } {
        if (!this.isLoaded) {
            return { total: 0, lastWeek: 0, lastMonth: 0, older: 0 };
        }

        const now = Date.now();
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

        const deletedEntries = Object.values(this.journal.deletedTasks);

        return {
            total: deletedEntries.length,
            lastWeek: deletedEntries.filter((e) => e.deletedAt > weekAgo)
                .length,
            lastMonth: deletedEntries.filter((e) => e.deletedAt > monthAgo)
                .length,
            older: deletedEntries.filter((e) => e.deletedAt <= monthAgo).length,
        };
    }

    /**
     * Add a sync operation to the queue
     */
    async addOperation(operation: SyncOperation): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        this.journal.pendingOperations.push(operation);
        console.log(
            `[SYNC JOURNAL] Added operation: ${operation.type} for task ${operation.taskId}`,
        );
    }

    /**
     * Mark an operation as completed
     */
    async completeOperation(operationId: string): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        // Remove from pending
        this.journal.pendingOperations = this.journal.pendingOperations.filter(
            (op) => op.id !== operationId,
        );

        // Update stats
        this.journal.stats.successfulOperations++;
        this.journal.stats.totalSyncOperations++;

        // Operation completed - reduced logging
    }

    /**
     * Mark an operation as failed
     */
    async failOperation(operationId: string, error: string): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        // Find and move to failed operations
        const operationIndex = this.journal.pendingOperations.findIndex(
            (op) => op.id === operationId,
        );
        if (operationIndex !== -1) {
            const operation = this.journal.pendingOperations[operationIndex];
            operation.status = "failed";
            operation.error = error;
            operation.retryCount++;

            // Move to failed operations
            this.journal.failedOperations.push(operation);
            this.journal.pendingOperations.splice(operationIndex, 1);

            // Update stats
            this.journal.stats.failedOperations++;

            console.log(
                `[SYNC JOURNAL] Failed operation: ${operationId} - ${error}`,
            );
        }
    }

    /**
     * Get tasks that need sync checking - CONSERVATIVE approach to minimize API calls
     */
    getTasksNeedingSync(): TaskSyncEntry[] {
        if (!this.isLoaded) {
            return [];
        }

        const now = Date.now();
        const allTasks = Object.values(this.journal.tasks);

        // Calculate sync interval in milliseconds
        const syncIntervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
        const MIN_CHECK_INTERVAL = syncIntervalMs;
        const STALE_THRESHOLD = syncIntervalMs * 4; // 4x the sync interval = stale

        // Filtering tasks for sync checking - reduced logging to avoid repetition

        const filteredTasks = allTasks.filter((task) => {
            const timeSinceLastTodoistCheck = now - task.lastTodoistCheck;

            // PRIORITY 1: Tasks with completion status mismatches (CRITICAL)
            if (task.obsidianCompleted !== task.todoistCompleted) {
                return true;
            }

            // PRIORITY 2: Tasks with future due dates that haven't been checked recently
            if (
                task.todoistDueDate &&
                new Date(task.todoistDueDate).getTime() > now &&
                timeSinceLastTodoistCheck > MIN_CHECK_INTERVAL
            ) {
                return true;
            }

            // PRIORITY 3: Tasks that are stale (haven't been checked in 4x sync interval)
            if (timeSinceLastTodoistCheck > STALE_THRESHOLD) {
                return true;
            }

            // Journal-based optimization with four-category prioritization is sufficient
            // Time window filtering removed as redundant - journal tracking is more precise
            // Always include tasks for four-category prioritization logic
            return true;
        });

        // Tasks filtered for sync checking - reduced logging to avoid repetition

        return filteredTasks;
    }

    /**
     * Get pending operations
     */
    getPendingOperations(): SyncOperation[] {
        return this.isLoaded ? [...this.journal.pendingOperations] : [];
    }

    /**
     * Get failed operations for retry
     */
    getFailedOperations(): SyncOperation[] {
        return this.isLoaded ? [...this.journal.failedOperations] : [];
    }

    /**
     * Get sync statistics
     */
    getStats(): SyncStats {
        return this.isLoaded
            ? { ...this.journal.stats }
            : { ...DEFAULT_SYNC_JOURNAL.stats };
    }

    /**
     * Reset the journal (for troubleshooting) - ONLY called by explicit user action
     */
    async resetJournal(): Promise<void> {
        // Create backup before resetting using unified system
        try {
            await this.createSmartBackup(
                BACKUP_CONSTANTS.OPERATION_TYPES.RESET,
                true,
            ); // Force backup before reset
        } catch (error) {
            console.warn(
                "[SYNC JOURNAL] Could not create reset backup:",
                error,
            );
        }

        // Reset journal to default state
        this.journal = { ...DEFAULT_SYNC_JOURNAL };
        await this.saveJournal();
        console.log(
            "[SYNC JOURNAL] ⚠️ Journal reset to default state - backup created",
        );
    }

    /**
     * Generate content hash for change detection
     */
    generateContentHash(content: string): string {
        return createHash("md5").update(content).digest("hex");
    }

    /**
     * Update sync statistics
     */
    updateStats(updates: Partial<SyncStats>): void {
        if (!this.isLoaded) {
            return;
        }

        this.journal.stats = { ...this.journal.stats, ...updates };

        // Calculate averages
        if (this.journal.stats.totalSyncOperations > 0) {
            this.journal.stats.averageSyncDuration =
                (this.journal.stats.averageSyncDuration *
                    (this.journal.stats.totalSyncOperations - 1) +
                    (updates.lastSyncDuration || 0)) /
                this.journal.stats.totalSyncOperations;
        }
    }

    /**
     * Get all tasks in the journal
     */
    getAllTasks(): Record<string, TaskSyncEntry> {
        return this.isLoaded ? { ...this.journal.tasks } : {};
    }

    /**
     * Check if journal is loaded
     */
    isJournalLoaded(): boolean {
        return this.isLoaded;
    }

    /**
     * Public method to create timestamped backup
     */
    async createBackupForOperation(operation: string): Promise<string | null> {
        return await this.createTimestampedBackup(operation); // Manual backups always created
    }

    /**
     * Public method to get available backups
     */
    async listAvailableBackups(): Promise<
        { path: string; created: Date; operation?: string }[]
    > {
        return await this.getAvailableBackups();
    }

    /**
     * Public method to restore from backup
     */
    async restoreJournalFromBackup(backupPath: string): Promise<boolean> {
        return await this.restoreFromBackup(backupPath);
    }

    /**
     * Public method to clean up old backups
     */
    async performBackupCleanup(
        keepCount = BACKUP_CONSTANTS.CONFIG.DEFAULT_MANUAL_CLEANUP_COUNT,
    ): Promise<number> {
        return await this.cleanupOldBackups(keepCount);
    }

    /**
     * Public method for manual recovery attempt
     */
    async attemptManualRecovery(): Promise<boolean> {
        return await this.attemptAutomaticRecovery();
    }

    /**
     * Get journal file path for debugging
     */
    getJournalPath(): string {
        return this.journalPath;
    }

    /**
     * Get the last scan time for incremental file scanning
     */
    getLastScanTime(): number {
        return this.isLoaded ? this.journal.lastObsidianScan || 0 : 0;
    }

    /**
     * Update the last scan time in memory (does not auto-save journal)
     */
    updateLastScanTime(scanTime: number): void {
        if (!this.isLoaded) {
            return;
        }

        this.journal.lastObsidianScan = scanTime;
        this.markDirty();

        // Updated last scan time - reduced logging to avoid routine noise
    }

    /**
     * Mark journal as dirty (needs saving)
     */
    private markDirty(): void {
        this.isDirty = true;
    }

    /**
     * Schedule an auto-save after a short delay to batch multiple changes
     */
    private async scheduleAutoSave(): Promise<void> {
        if (!this.isDirty || !this.autoSaveEnabled) {
            return;
        }

        // Cancel existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Schedule new auto-save after 2 seconds
        this.autoSaveTimeout = window.setTimeout(async () => {
            if (this.isDirty) {
                try {
                    await this.saveJournal();
                    // Auto-save completed - reduced logging to avoid routine noise
                } catch (error) {
                    console.error("[SYNC JOURNAL] ❌ Auto-save failed:", error);
                }
            }
        }, 2000);
    }

    /**
     * Check if journal has unsaved changes
     */
    isDirtyState(): boolean {
        return this.isDirty;
    }

    /**
     * Force save if there are pending changes
     */
    async forceSaveIfDirty(): Promise<void> {
        if (this.isDirty) {
            await this.saveJournal();
        }
    }

    /**
     * Disable auto-save (useful during bulk operations)
     */
    setAutoSave(enabled: boolean): void {
        this.autoSaveEnabled = enabled;
        if (!enabled && this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
    }

    /**
     * Get the timestamp of the last journal validation
     * Used for intelligent pre-check to avoid redundant validations
     */
    getLastValidationTime(): number | undefined {
        return this.journal.lastValidationTime;
    }

    /**
     * Update the timestamp of the last journal validation
     * Called after successful validation to enable intelligent pre-check
     */
    updateLastValidationTime(): void {
        this.journal.lastValidationTime = Date.now();
        this.markDirty();
    }

    /**
     * Clean up duplicate entries between active and deleted task sections
     * Removes duplicates from deleted section to prevent double-counting
     */
    async cleanupDuplicateEntries(overlappingIds: string[]): Promise<void> {
        if (!this.isLoaded || overlappingIds.length === 0) {
            return;
        }

        let cleanedCount = 0;

        for (const taskId of overlappingIds) {
            // If task exists in both active and deleted, remove from deleted
            if (
                this.journal.tasks[taskId] &&
                this.journal.deletedTasks?.[taskId]
            ) {
                console.log(
                    `[SYNC JOURNAL] 🔧 Removing duplicate task ${taskId} from deleted section (keeping active entry)`,
                );
                delete this.journal.deletedTasks[taskId];
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.markDirty();
            await this.scheduleAutoSave();
            console.log(
                `[SYNC JOURNAL] ✅ Cleaned up ${cleanedCount} duplicate entries`,
            );
        }
    }
}
