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
import { createHash } from "crypto";

export class SyncJournalManager {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private journalPath: string;
    private journal: SyncJournal;
    private isLoaded = false;
    private isDirty = false;
    private autoSaveEnabled = true;
    private autoSaveTimeout: number | null = null;

    constructor(app: App, settings: TodoistContextBridgeSettings) {
        this.app = app;
        this.settings = settings;
        this.journalPath =
            ".obsidian/plugins/todoist-context-bridge/sync-journal.json";
        this.journal = { ...DEFAULT_SYNC_JOURNAL };
    }

    /**
     * Load sync journal from file with safe recovery mechanisms
     */
    async loadJournal(): Promise<void> {
        try {
            if (await this.app.vault.adapter.exists(this.journalPath)) {
                await this.loadExistingJournal();
            } else {
                console.log(
                    "[SYNC JOURNAL] No existing journal found, starting fresh",
                );
                this.journal = { ...DEFAULT_SYNC_JOURNAL };
            }

            this.isLoaded = true;
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
     * Safely load existing journal with corruption handling
     */
    private async loadExistingJournal(): Promise<void> {
        try {
            const journalData = await this.app.vault.adapter.read(
                this.journalPath,
            );

            // Basic corruption check - ensure it's not empty or malformed
            if (!journalData || journalData.trim().length === 0) {
                throw new Error("Journal file is empty");
            }

            let parsedJournal: any;
            try {
                parsedJournal = JSON.parse(journalData);
            } catch (jsonError) {
                console.error("[SYNC JOURNAL] JSON parsing failed:", jsonError);
                // Try to recover from backup
                await this.attemptJournalRecovery();
                return;
            }

            // Validate and migrate if needed
            this.journal = this.validateAndMigrateJournal(parsedJournal);

            const taskCount = Object.keys(this.journal.tasks).length;
            console.log(
                `[SYNC JOURNAL] ✅ Loaded journal with ${taskCount} tasks`,
            );

            // Create backup of successfully loaded journal
            await this.createJournalBackup();
        } catch (error) {
            console.error(
                "[SYNC JOURNAL] Error in loadExistingJournal:",
                error,
            );
            throw error;
        }
    }

    /**
     * Attempt to recover journal from backup
     */
    private async attemptJournalRecovery(): Promise<void> {
        const backupPath = this.journalPath + ".backup";

        try {
            if (await this.app.vault.adapter.exists(backupPath)) {
                console.log(
                    "[SYNC JOURNAL] 🔄 Attempting recovery from backup...",
                );
                const backupData =
                    await this.app.vault.adapter.read(backupPath);
                const parsedBackup = JSON.parse(backupData);

                this.journal = this.validateAndMigrateJournal(parsedBackup);
                const taskCount = Object.keys(this.journal.tasks).length;

                console.log(
                    `[SYNC JOURNAL] ✅ Recovered from backup with ${taskCount} tasks`,
                );

                // Save the recovered journal immediately
                await this.saveJournal();
                return;
            }
        } catch (backupError) {
            console.error(
                "[SYNC JOURNAL] Backup recovery failed:",
                backupError,
            );
        }

        // Only as last resort, start fresh
        console.warn(
            "[SYNC JOURNAL] ⚠️ No recovery possible, starting with empty journal. Previous data may be lost.",
        );
        this.journal = { ...DEFAULT_SYNC_JOURNAL };
    }

    /**
     * Create a backup of the current journal
     */
    private async createJournalBackup(): Promise<void> {
        try {
            const backupPath = this.journalPath + ".backup";
            const currentData = JSON.stringify(this.journal, null, 2);
            await this.app.vault.adapter.write(backupPath, currentData);
        } catch (error) {
            console.warn(
                "[SYNC JOURNAL] Warning: Could not create backup:",
                error,
            );
        }
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
            this.journal.lastSyncTimestamp = Date.now();

            // Create backup before overwriting (if file exists)
            if (await this.app.vault.adapter.exists(this.journalPath)) {
                await this.createJournalBackup();
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

            const taskCount = Object.keys(this.journal.tasks).length;
            console.log(
                `[SYNC JOURNAL] ✅ Safely saved journal with ${taskCount} tasks`,
            );
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
     * Validate and migrate journal from older versions
     */
    private validateAndMigrateJournal(journal: any): SyncJournal {
        // Start with default structure
        const migratedJournal: SyncJournal = { ...DEFAULT_SYNC_JOURNAL };

        // Copy valid fields
        if (journal.version) migratedJournal.version = journal.version;
        if (journal.lastSyncTimestamp)
            migratedJournal.lastSyncTimestamp = journal.lastSyncTimestamp;
        if (journal.lastObsidianScan)
            migratedJournal.lastObsidianScan = journal.lastObsidianScan;
        if (journal.lastTodoistSync)
            migratedJournal.lastTodoistSync = journal.lastTodoistSync;

        // Migrate tasks
        if (journal.tasks && typeof journal.tasks === "object") {
            migratedJournal.tasks = journal.tasks;
        }

        // Migrate deleted tasks (new in v1.1.0)
        if (journal.deletedTasks && typeof journal.deletedTasks === "object") {
            migratedJournal.deletedTasks = journal.deletedTasks;
        }

        // Migrate operations
        if (Array.isArray(journal.pendingOperations)) {
            migratedJournal.pendingOperations = journal.pendingOperations;
        }
        if (Array.isArray(journal.failedOperations)) {
            migratedJournal.failedOperations = journal.failedOperations;
        }

        // Migrate stats
        if (journal.stats && typeof journal.stats === "object") {
            migratedJournal.stats = {
                ...DEFAULT_SYNC_JOURNAL.stats,
                ...journal.stats,
            };
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

        this.journal.tasks[task.todoistId] = task;
        this.journal.stats.totalTasks = Object.keys(this.journal.tasks).length;
        this.journal.stats.newTasksFound++;
        this.markDirty();

        console.log(
            `[SYNC JOURNAL] Added new task: ${task.todoistId} in ${task.obsidianFile}:${task.obsidianLine}`,
        );

        // Auto-save after adding critical task data
        if (this.autoSaveEnabled) {
            await this.scheduleAutoSave();
        }
    }

    /**
     * Update an existing task in the journal with auto-save
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

        this.journal.tasks[taskId] = {
            ...this.journal.tasks[taskId],
            ...updates,
        };
        this.markDirty();
        console.log(`[SYNC JOURNAL] Updated task: ${taskId}`);

        // Auto-save after important updates
        if (this.autoSaveEnabled) {
            await this.scheduleAutoSave();
        }
    }

    /**
     * Remove a task from the journal (use markAsDeleted for permanent tracking)
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
            console.log(`[SYNC JOURNAL] Removed task: ${taskId}`);
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
    async cleanupOldDeletedTasks(olderThanDays: number = 90): Promise<number> {
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
        this.journal.stats.operationsCompleted++;
        this.journal.stats.totalSyncOperations++;

        console.log(`[SYNC JOURNAL] Completed operation: ${operationId}`);
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
            this.journal.stats.operationsFailed++;

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

        console.log(
            `[SYNC JOURNAL] Filtering ${allTasks.length} tasks for sync checking...`,
        );

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

            // Apply time window filtering if enabled
            if (
                this.settings.enableSyncTimeWindow &&
                this.settings.syncTimeWindowDays > 0
            ) {
                const timeWindow =
                    this.settings.syncTimeWindowDays * 24 * 60 * 60 * 1000;
                const cutoff = now - timeWindow;

                // Only include tasks that have been active within the time window
                return (
                    task.lastObsidianCheck > cutoff ||
                    task.lastTodoistCheck > cutoff ||
                    task.discoveredAt > cutoff
                );
            }

            // Default: Don't check (conservative approach)
            return false;
        });

        console.log(
            `[SYNC JOURNAL] ✅ ${filteredTasks.length}/${allTasks.length} tasks need sync checking`,
        );

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
        // Create backup before resetting
        const resetBackupPath =
            this.journalPath + ".reset-backup-" + Date.now();
        try {
            if (await this.app.vault.adapter.exists(this.journalPath)) {
                const currentData = JSON.stringify(this.journal, null, 2);
                await this.app.vault.adapter.write(
                    resetBackupPath,
                    currentData,
                );
                console.log(
                    `[SYNC JOURNAL] Created reset backup: ${resetBackupPath}`,
                );
            }
        } catch (error) {
            console.warn(
                "[SYNC JOURNAL] Could not create reset backup:",
                error,
            );
        }

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
     * Get a specific task by its Todoist ID
     */
    getTaskByTodoistId(todoistId: string): TaskSyncEntry | null {
        if (!this.isLoaded) {
            return null;
        }

        // Search through all tasks to find one with matching Todoist ID
        for (const [, task] of Object.entries(this.journal.tasks)) {
            if (task.todoistId === todoistId) {
                return task;
            }
        }

        return null;
    }

    /**
     * Check if journal is loaded
     */
    isJournalLoaded(): boolean {
        return this.isLoaded;
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

        console.log(
            `[SYNC JOURNAL] Updated last scan time in memory: ${new Date(scanTime).toISOString()}`,
        );
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
                    console.log("[SYNC JOURNAL] 🔄 Auto-save completed");
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
}
