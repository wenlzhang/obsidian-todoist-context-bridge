/**
 * Enhanced Bidirectional Sync Service with Log-Based Journal
 * Replaces the scanning approach with intelligent state tracking
 */

import { App, Notice, TFile } from "obsidian";
import { TodoistContextBridgeSettings } from "./Settings";
import { TextParsing } from "./TextParsing";
import { TodoistApi, Task } from "@doist/todoist-api-typescript";
import { TodoistV2IDs } from "./TodoistV2IDs";
import { UIDProcessing } from "./UIDProcessing";
import { NotificationHelper } from "./NotificationHelper";
import { SyncJournalManager } from "./SyncJournalManager";
import { ChangeDetector } from "./ChangeDetector";
import {
    SyncOperation,
    SyncProgress,
    TaskSyncEntry,
    ChangeDetectionResult,
} from "./SyncJournal";

export class EnhancedBidirectionalSyncService {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private textParsing: TextParsing;
    private todoistApi: TodoistApi;
    private todoistV2IDs: TodoistV2IDs;
    private uidProcessing: UIDProcessing;
    private notificationHelper: NotificationHelper;
    private journalManager: SyncJournalManager;
    private changeDetector: ChangeDetector;

    private syncInterval: number | null = null;
    private isRunning: boolean = false;
    private currentProgress: SyncProgress | null = null;

    constructor(
        app: App,
        settings: TodoistContextBridgeSettings,
        textParsing: TextParsing,
        todoistApi: TodoistApi,
        todoistV2IDs: TodoistV2IDs,
        notificationHelper: NotificationHelper,
    ) {
        this.app = app;
        this.settings = settings;
        this.textParsing = textParsing;
        this.todoistApi = todoistApi;
        this.todoistV2IDs = todoistV2IDs;
        this.uidProcessing = new UIDProcessing(settings, app);
        this.notificationHelper = notificationHelper;

        // Initialize journal and change detector
        this.journalManager = new SyncJournalManager(app, settings);
        this.changeDetector = new ChangeDetector(
            app,
            settings,
            textParsing,
            todoistApi,
            this.journalManager,
        );
    }

    /**
     * Start the enhanced sync service
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log("[ENHANCED SYNC] Service already running");
            return;
        }

        try {
            console.log(
                "[ENHANCED SYNC] Starting enhanced bidirectional sync service...",
            );

            // Load sync journal
            await this.journalManager.loadJournal();

            // Migrate existing entries to note ID tracking
            await this.migrateJournalToNoteIdTracking();

            // Validate and correct file paths using note ID tracking
            await this.validateJournalFilePaths();

            // Perform initial sync
            await this.performSync();

            // Set up periodic sync
            if (this.settings.syncIntervalMinutes > 0) {
                this.syncInterval = window.setInterval(
                    () => this.performSync(),
                    this.settings.syncIntervalMinutes * 60 * 1000,
                );
                console.log(
                    `[ENHANCED SYNC] Scheduled sync every ${this.settings.syncIntervalMinutes} minutes`,
                );
            }

            this.isRunning = true;
            console.log(
                "[ENHANCED SYNC] ✅ Enhanced sync service started successfully",
            );
        } catch (error) {
            console.error(
                "[ENHANCED SYNC] ❌ Error starting sync service:",
                error,
            );
            this.notificationHelper.showError(
                "Failed to start enhanced bidirectional sync. Check console for details.",
            );
        }
    }

    /**
     * Stop the sync service
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        console.log("[ENHANCED SYNC] Stopping enhanced sync service...");

        if (this.syncInterval) {
            window.clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        // Save final journal state
        try {
            await this.journalManager.saveJournal();
        } catch (error) {
            console.error(
                "[ENHANCED SYNC] Error saving journal on stop:",
                error,
            );
        }

        this.isRunning = false;
        this.currentProgress = null;
        console.log("[ENHANCED SYNC] ✅ Enhanced sync service stopped");
    }

    /**
     * Perform a complete sync operation
     */
    async performSync(): Promise<void> {
        if (!this.journalManager.isJournalLoaded()) {
            console.log("[ENHANCED SYNC] Journal not loaded, skipping sync");
            return;
        }

        const startTime = Date.now();

        try {
            console.log("[ENHANCED SYNC] 🔄 Starting sync operation...");

            // Initialize progress tracking
            this.currentProgress = {
                phase: "discovery",
                completedOperations: 0,
                totalOperations: 0,
                errors: [],
                startTime,
            };

            // Phase 1: Change Detection
            this.updateProgress("discovery", "Detecting changes...");
            const changes = await this.changeDetector.detectChanges();

            // Add new tasks to journal
            for (const newTask of changes.newTasks) {
                await this.journalManager.addTask(newTask);
            }

            // Phase 2: Process Operations
            this.updateProgress("operations", "Processing sync operations...");
            const allOperations = [
                ...changes.operations,
                ...this.journalManager.getPendingOperations(),
            ];

            this.currentProgress.totalOperations = allOperations.length;

            // Add new operations to journal
            for (const operation of changes.operations) {
                await this.journalManager.addOperation(operation);
            }

            // Process all operations
            await this.processOperations(allOperations);

            // Phase 3: Retry Failed Operations
            await this.retryFailedOperations();

            // Update statistics
            const duration = Date.now() - startTime;
            this.journalManager.updateStats({
                lastSyncDuration: duration,
                tasksProcessedLastSync:
                    changes.newTasks.length + changes.modifiedTasks.length,
                apiCallsLastSync: allOperations.length,
            });

            // Save journal
            await this.journalManager.saveJournal();

            // Complete progress
            this.updateProgress("complete", "Sync completed");

            console.log(`[ENHANCED SYNC] ✅ Sync completed in ${duration}ms`);
            console.log(
                `[ENHANCED SYNC] Stats: ${changes.newTasks.length} new tasks, ${changes.modifiedTasks.length} modified, ${allOperations.length} operations`,
            );
        } catch (error) {
            console.error("[ENHANCED SYNC] ❌ Error during sync:", error);
            this.notificationHelper.showError(
                "Enhanced bidirectional sync failed. Check console for details.",
            );

            if (this.currentProgress) {
                this.currentProgress.errors.push(
                    error.message || "Unknown error",
                );
            }
        } finally {
            // Reset progress after a delay
            setTimeout(() => {
                this.currentProgress = null;
            }, 5000);
        }
    }

    /**
     * Process sync operations
     */
    private async processOperations(
        operations: SyncOperation[],
    ): Promise<void> {
        for (const operation of operations) {
            try {
                this.updateProgress(
                    "operations",
                    `Processing ${operation.type}...`,
                );

                await this.executeOperation(operation);
                await this.journalManager.completeOperation(operation.id);

                this.currentProgress!.completedOperations++;
            } catch (error) {
                console.error(
                    `[ENHANCED SYNC] Error executing operation ${operation.id}:`,
                    error,
                );
                await this.journalManager.failOperation(
                    operation.id,
                    error.message || "Unknown error",
                );

                if (this.currentProgress) {
                    this.currentProgress.errors.push(
                        `Operation ${operation.id}: ${error.message}`,
                    );
                }
            }
        }
    }

    /**
     * Execute a single sync operation
     */
    private async executeOperation(operation: SyncOperation): Promise<void> {
        const taskEntry = this.journalManager.getAllTasks()[operation.taskId];
        if (!taskEntry) {
            throw new Error(`Task ${operation.taskId} not found in journal`);
        }

        switch (operation.type) {
            case "obsidian_to_todoist":
                await this.syncCompletionToTodoist(operation, taskEntry);
                break;

            case "todoist_to_obsidian":
                await this.syncCompletionToObsidian(operation, taskEntry);
                break;

            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }

        // Update task entry with sync timestamp
        await this.journalManager.updateTask(operation.taskId, {
            lastSyncOperation: Date.now(),
        });
    }

    /**
     * Sync completion from Obsidian to Todoist
     */
    private async syncCompletionToTodoist(
        operation: SyncOperation,
        taskEntry: TaskSyncEntry,
    ): Promise<void> {
        try {
            await this.todoistApi.closeTask(taskEntry.todoistId);

            // Update task entry
            await this.journalManager.updateTask(taskEntry.todoistId, {
                todoistCompleted: true,
            });

            console.log(
                `[ENHANCED SYNC] ✅ Synced completion from Obsidian to Todoist: ${taskEntry.todoistId}`,
            );
        } catch (error) {
            console.error(
                `[ENHANCED SYNC] Error syncing to Todoist: ${taskEntry.todoistId}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Sync completion from Todoist to Obsidian
     */
    private async syncCompletionToObsidian(
        operation: SyncOperation,
        taskEntry: TaskSyncEntry,
    ): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(
                taskEntry.obsidianFile,
            ) as TFile;
            if (!file) {
                throw new Error(`File not found: ${taskEntry.obsidianFile}`);
            }

            const fileContent = await this.app.vault.read(file);
            const lines = fileContent.split("\n");

            if (taskEntry.obsidianLine >= lines.length) {
                throw new Error(
                    `Line ${taskEntry.obsidianLine} out of bounds in ${taskEntry.obsidianFile}`,
                );
            }

            // Update the task line to completed status
            let updatedLine = this.markTaskAsCompleted(
                lines[taskEntry.obsidianLine],
            );

            // Add completion timestamp if enabled
            if (this.settings.enableCompletionTimestamp) {
                const todoistCompletedAt = operation.data?.todoistCompletedAt;
                updatedLine = this.addCompletionTimestamp(
                    updatedLine,
                    todoistCompletedAt,
                );
            }

            // Update the file
            lines[taskEntry.obsidianLine] = updatedLine;
            await this.app.vault.modify(file, lines.join("\n"));

            // Update task entry
            await this.journalManager.updateTask(taskEntry.todoistId, {
                obsidianCompleted: true,
                obsidianContentHash:
                    this.journalManager.generateContentHash(updatedLine),
            });

            console.log(
                `[ENHANCED SYNC] ✅ Synced completion from Todoist to Obsidian: ${taskEntry.obsidianFile}:${taskEntry.obsidianLine + 1}`,
            );
        } catch (error) {
            console.error(
                `[ENHANCED SYNC] Error syncing to Obsidian: ${taskEntry.todoistId}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Retry failed operations with exponential backoff
     */
    private async retryFailedOperations(): Promise<void> {
        const failedOps = this.journalManager.getFailedOperations();
        const now = Date.now();

        for (const operation of failedOps) {
            // Exponential backoff: 1min, 5min, 15min, 1hr, 6hr, 24hr
            const backoffDelays = [
                60000, 300000, 900000, 3600000, 21600000, 86400000,
            ];
            const delay =
                backoffDelays[
                    Math.min(operation.retryCount - 1, backoffDelays.length - 1)
                ] || 86400000;

            if (now - operation.timestamp > delay) {
                try {
                    console.log(
                        `[ENHANCED SYNC] Retrying failed operation: ${operation.id} (attempt ${operation.retryCount + 1})`,
                    );

                    await this.executeOperation(operation);
                    await this.journalManager.completeOperation(operation.id);

                    console.log(
                        `[ENHANCED SYNC] ✅ Successfully retried operation: ${operation.id}`,
                    );
                } catch (error) {
                    console.error(
                        `[ENHANCED SYNC] Retry failed for operation ${operation.id}:`,
                        error,
                    );
                    await this.journalManager.failOperation(
                        operation.id,
                        error.message || "Retry failed",
                    );
                }
            }
        }
    }

    /**
     * Update sync progress
     */
    private updateProgress(
        phase: SyncProgress["phase"],
        operation?: string,
    ): void {
        if (this.currentProgress) {
            this.currentProgress.phase = phase;
            if (operation) {
                this.currentProgress.currentOperation = operation;
            }
        }
    }

    /**
     * Mark a task line as completed
     */
    private markTaskAsCompleted(line: string): string {
        return line.replace(/^(\s*[-*+]\s*)\[\s*\](\s*.*)$/, "$1[x]$2");
    }

    /**
     * Add completion timestamp to task line
     */
    private addCompletionTimestamp(
        line: string,
        todoistCompletedAt?: string,
    ): string {
        // Check if timestamp already exists
        if (this.hasCompletionTimestamp(line)) {
            return line;
        }

        // Determine timestamp to use
        let timestamp: string;
        if (
            this.settings.completionTimestampSource === "todoist-completion" &&
            todoistCompletedAt
        ) {
            timestamp = (window as any)
                .moment(todoistCompletedAt)
                .format(this.settings.completionTimestampFormat);
        } else {
            timestamp = (window as any)
                .moment()
                .format(this.settings.completionTimestampFormat);
        }

        // Extract block reference and trailing spaces
        const blockRefMatch = line.match(/(\s*\^[a-zA-Z0-9-]+)?(\s*)$/);
        const blockRef = blockRefMatch?.[1] || "";
        const trailingSpaces = blockRefMatch?.[2] || "";

        // Remove block ref and trailing spaces for processing
        const mainContent = line.replace(/(\s*\^[a-zA-Z0-9-]+)?(\s*)$/, "");

        const updatedLine = `${mainContent.trimEnd()} ${timestamp}${blockRef}${trailingSpaces}`;
        return updatedLine;
    }

    /**
     * Check if task line already has completion timestamp
     */
    private hasCompletionTimestamp(line: string): boolean {
        try {
            const sampleTimestamp = (window as any)
                .moment()
                .format(this.settings.completionTimestampFormat);
            const formatLiterals = this.extractFormatLiterals(
                this.settings.completionTimestampFormat,
            );
            const candidates = this.extractTimestampCandidates(
                line,
                formatLiterals,
            );

            for (const candidate of candidates) {
                const parsed = (window as any).moment(
                    candidate,
                    this.settings.completionTimestampFormat,
                    true,
                );
                if (parsed.isValid()) {
                    return true;
                }
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Extract format literals from moment.js format string
     */
    private extractFormatLiterals(format: string): string[] {
        const literals: string[] = [];
        const regex = /\[([^\]]+)\]/g;
        let match;

        while ((match = regex.exec(format)) !== null) {
            literals.push(match[1]);
        }

        return literals;
    }

    /**
     * Extract timestamp candidates from line
     */
    private extractTimestampCandidates(
        line: string,
        literals: string[],
    ): string[] {
        const candidates: string[] = [];

        if (literals.length > 0) {
            for (const literal of literals) {
                const index = line.indexOf(literal);
                if (index !== -1) {
                    const start = Math.max(0, index - 20);
                    const end = Math.min(
                        line.length,
                        index + literal.length + 20,
                    );
                    candidates.push(line.substring(start, end).trim());
                }
            }
        } else {
            const datePattern = /\b\d{4}-\d{2}-\d{2}\b|\b\d{2}:\d{2}\b/g;
            let match;
            while ((match = datePattern.exec(line)) !== null) {
                const start = Math.max(0, match.index - 10);
                const end = Math.min(
                    line.length,
                    match.index + match[0].length + 10,
                );
                candidates.push(line.substring(start, end).trim());
            }
        }

        return candidates;
    }

    /**
     * Update settings and restart if needed
     */
    updateSettings(newSettings: TodoistContextBridgeSettings): void {
        const wasRunning = this.isRunning;
        const intervalChanged =
            this.settings.syncIntervalMinutes !==
            newSettings.syncIntervalMinutes;

        this.settings = newSettings;
        this.textParsing = new TextParsing(newSettings);
        this.notificationHelper = new NotificationHelper(newSettings);

        // Restart if running and interval changed
        if (
            wasRunning &&
            intervalChanged &&
            this.settings.enableBidirectionalSync
        ) {
            this.stop();
            this.start();
        }
    }

    /**
     * Get current sync progress
     */
    getSyncProgress(): SyncProgress | null {
        return this.currentProgress;
    }

    /**
     * Get sync statistics
     */
    getSyncStats() {
        const stats = this.journalManager.getStats();
        return stats;
    }

    /**
     * Manual sync trigger
     */
    async triggerManualSync(): Promise<void> {
        await this.performSync();
    }

    /**
     * Sync completion status for a single task
     */
    async syncSingleTask(todoistId: string, lineNumber: number): Promise<void> {
        if (!this.journalManager.isJournalLoaded()) {
            console.log(
                "[ENHANCED SYNC] Journal not loaded, skipping single task sync",
            );
            return;
        }

        try {
            console.log(`[ENHANCED SYNC] 🔄 Syncing single task: ${todoistId}`);

            // Find the task in the journal or create a new entry
            const existingTask =
                this.journalManager.getTaskByTodoistId(todoistId);
            if (existingTask) {
                // Detect changes for this specific task
                const changes =
                    await this.changeDetector.detectTaskChanges(existingTask);
                if (changes.length > 0) {
                    // Process the operations for this task
                    await this.processOperations(changes);
                    await this.journalManager.saveJournal();
                    console.log(
                        `[ENHANCED SYNC] ✅ Single task ${todoistId} synced successfully`,
                    );
                } else {
                    console.log(
                        `[ENHANCED SYNC] ℹ️ Task ${todoistId} already in sync`,
                    );
                }
            } else {
                // Task not in journal, try to discover it
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const newTasks =
                        await this.changeDetector.discoverTasksInFile(
                            activeFile,
                        );
                    const targetTask = newTasks.find(
                        (task) => task.todoistId === todoistId,
                    );
                    if (targetTask) {
                        await this.journalManager.addTask(targetTask);
                        await this.journalManager.saveJournal();
                        console.log(
                            `[ENHANCED SYNC] ✅ New task ${todoistId} added to journal and synced`,
                        );
                    } else {
                        throw new Error(
                            `Task ${todoistId} not found in current file`,
                        );
                    }
                }
            }
        } catch (error) {
            console.error(
                `[ENHANCED SYNC] ❌ Error syncing single task ${todoistId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Sync completion status for all tasks in a specific file
     */
    async syncFileTasksCompletion(file: TFile): Promise<void> {
        if (!this.journalManager.isJournalLoaded()) {
            console.log(
                "[ENHANCED SYNC] Journal not loaded, skipping file tasks sync",
            );
            return;
        }

        try {
            console.log(
                `[ENHANCED SYNC] 🔄 Syncing tasks in file: ${file.path}`,
            );

            // Discover all tasks in the file
            const fileTasks =
                await this.changeDetector.discoverTasksInFile(file);
            let syncedCount = 0;
            let newTasksCount = 0;

            for (const task of fileTasks) {
                try {
                    const existingTask = this.journalManager.getTaskByTodoistId(
                        task.todoistId,
                    );
                    if (existingTask) {
                        // Detect and process changes for existing task
                        const changes =
                            await this.changeDetector.detectTaskChanges(
                                existingTask,
                            );
                        if (changes.length > 0) {
                            await this.processOperations(changes);
                            syncedCount++;
                        }
                    } else {
                        // Add new task to journal
                        await this.journalManager.addTask(task);
                        newTasksCount++;
                    }
                } catch (error) {
                    console.error(
                        `[ENHANCED SYNC] Error syncing task ${task.todoistId}:`,
                        error,
                    );
                    // Continue with other tasks
                }
            }

            await this.journalManager.saveJournal();
            console.log(
                `[ENHANCED SYNC] ✅ File sync completed: ${syncedCount} synced, ${newTasksCount} new tasks`,
            );
        } catch (error) {
            console.error(
                `[ENHANCED SYNC] ❌ Error syncing file tasks:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Reset sync journal (for troubleshooting)
     */
    async resetSyncJournal(): Promise<void> {
        await this.journalManager.resetJournal();
        console.log("[ENHANCED SYNC] Sync journal has been reset");
    }

    /**
     * Get journal file path for debugging
     */
    getJournalPath(): string {
        return this.journalManager.getJournalPath();
    }

    /**
     * Validate and correct file paths in journal entries using note ID tracking
     */
    private async validateJournalFilePaths(): Promise<void> {
        await this.journalManager.loadJournal();
        const tasks = this.journalManager.getTasksNeedingSync();
        let correctedCount = 0;
        let removedCount = 0;
        const tasksToRemove: string[] = [];

        for (const taskEntry of tasks) {
            // Try to find the file using current path
            let file = this.app.vault.getAbstractFileByPath(
                taskEntry.obsidianFile,
            );

            if (file instanceof TFile) {
                // Path is still valid, update validation timestamp
                taskEntry.lastPathValidation = Date.now();
                continue;
            }

            // File not found at current path, try note ID-based lookup
            if (taskEntry.obsidianNoteId) {
                file = this.uidProcessing.findFileByUid(
                    taskEntry.obsidianNoteId,
                );
                if (file instanceof TFile) {
                    // Update the path in the journal entry
                    taskEntry.obsidianFile = file.path;
                    taskEntry.lastPathValidation = Date.now();
                    correctedCount++;
                    console.log(
                        `[ENHANCED SYNC] ✅ Corrected file path using note ID: ${taskEntry.obsidianNoteId} -> ${file.path}`,
                    );
                    continue;
                }
            }

            // File cannot be found, mark for removal
            console.warn(
                `[ENHANCED SYNC] ⚠️ Marking orphaned task for removal: ${taskEntry.todoistId} (file not found: ${taskEntry.obsidianFile})`,
            );
            tasksToRemove.push(taskEntry.todoistId);
            removedCount++;
        }

        // Remove orphaned tasks
        for (const todoistId of tasksToRemove) {
            this.journalManager.removeTask(todoistId);
        }

        // Save updated journal if changes were made
        if (correctedCount > 0 || removedCount > 0) {
            await this.journalManager.saveJournal();
            console.log(
                `[ENHANCED SYNC] 📁 File path validation complete: ${correctedCount} corrected, ${removedCount} removed`,
            );
        }
    }

    /**
     * Migrate existing journal entries to include note ID tracking
     */
    private async migrateJournalToNoteIdTracking(): Promise<void> {
        await this.journalManager.loadJournal();
        const tasks = this.journalManager.getTasksNeedingSync();
        let migratedCount = 0;

        for (const taskEntry of tasks) {
            // Skip if already has note ID
            if (taskEntry.obsidianNoteId) {
                continue;
            }

            // Try to find the file and extract its note ID
            const file = this.app.vault.getAbstractFileByPath(
                taskEntry.obsidianFile,
            );
            if (file instanceof TFile) {
                const noteId = this.uidProcessing.getUidFromFile(file);
                if (noteId) {
                    taskEntry.obsidianNoteId = noteId;
                    taskEntry.lastPathValidation = Date.now();
                    migratedCount++;
                }
            }
        }

        // Save updated journal if changes were made
        if (migratedCount > 0) {
            await this.journalManager.saveJournal();
            console.log(
                `[ENHANCED SYNC] 🔄 Migrated ${migratedCount} journal entries to note ID tracking`,
            );
        }
    }
}
