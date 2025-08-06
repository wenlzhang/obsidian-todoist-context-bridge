/**
 * SyncJournalManager - Manages persistent sync state and operations
 */

import { App } from "obsidian";
import {
    SyncJournal,
    TaskSyncEntry,
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

    constructor(app: App, settings: TodoistContextBridgeSettings) {
        this.app = app;
        this.settings = settings;
        this.journalPath =
            ".obsidian/plugins/todoist-context-bridge/sync-journal.json";
        this.journal = { ...DEFAULT_SYNC_JOURNAL };
    }

    /**
     * Load sync journal from file
     */
    async loadJournal(): Promise<void> {
        try {
            if (await this.app.vault.adapter.exists(this.journalPath)) {
                const journalData = await this.app.vault.adapter.read(
                    this.journalPath,
                );
                const parsedJournal = JSON.parse(journalData) as SyncJournal;

                // Validate and migrate if needed
                this.journal = this.validateAndMigrateJournal(parsedJournal);

                console.log(
                    `[SYNC JOURNAL] Loaded journal with ${Object.keys(this.journal.tasks).length} tasks`,
                );
            } else {
                console.log(
                    "[SYNC JOURNAL] No existing journal found, starting fresh",
                );
                this.journal = { ...DEFAULT_SYNC_JOURNAL };
            }

            this.isLoaded = true;
        } catch (error) {
            console.error("[SYNC JOURNAL] Error loading journal:", error);
            // Fallback to empty journal
            this.journal = { ...DEFAULT_SYNC_JOURNAL };
            this.isLoaded = true;
        }
    }

    /**
     * Save sync journal to file
     */
    async saveJournal(): Promise<void> {
        try {
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

            // Save to file
            const journalData = JSON.stringify(this.journal, null, 2);
            await this.app.vault.adapter.write(this.journalPath, journalData);

            console.log(
                `[SYNC JOURNAL] Saved journal with ${Object.keys(this.journal.tasks).length} tasks`,
            );
        } catch (error) {
            console.error("[SYNC JOURNAL] Error saving journal:", error);
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
     * Add a new task to the journal
     */
    async addTask(task: TaskSyncEntry): Promise<void> {
        if (!this.isLoaded) {
            throw new Error("Journal not loaded");
        }

        this.journal.tasks[task.todoistId] = task;
        this.journal.stats.totalTasks = Object.keys(this.journal.tasks).length;
        this.journal.stats.newTasksFound++;

        console.log(
            `[SYNC JOURNAL] Added new task: ${task.todoistId} in ${task.obsidianFile}:${task.obsidianLine}`,
        );
    }

    /**
     * Update an existing task in the journal
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
        console.log(`[SYNC JOURNAL] Updated task: ${taskId}`);
    }

    /**
     * Remove a task from the journal
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
     * Get tasks that need sync checking
     */
    getTasksNeedingSync(): TaskSyncEntry[] {
        if (!this.isLoaded) {
            return [];
        }

        const now = Date.now();
        const timeWindow = this.settings.enableSyncTimeWindow
            ? this.settings.syncTimeWindowDays * 24 * 60 * 60 * 1000
            : 0;
        const cutoff = timeWindow > 0 ? now - timeWindow : 0;

        return Object.values(this.journal.tasks).filter((task) => {
            // Always include tasks with future due dates
            if (
                task.todoistDueDate &&
                new Date(task.todoistDueDate).getTime() > now
            ) {
                return true;
            }

            // Include tasks within time window
            if (timeWindow === 0) {
                return true; // No time window filtering
            }

            return (
                task.lastObsidianCheck > cutoff ||
                task.lastTodoistCheck > cutoff
            );
        });
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
     * Reset the journal (for troubleshooting)
     */
    async resetJournal(): Promise<void> {
        this.journal = { ...DEFAULT_SYNC_JOURNAL };
        await this.saveJournal();
        console.log("[SYNC JOURNAL] Journal reset to default state");
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

        console.log(
            `[SYNC JOURNAL] Updated last scan time in memory: ${new Date(scanTime).toISOString()}`,
        );
    }
}
