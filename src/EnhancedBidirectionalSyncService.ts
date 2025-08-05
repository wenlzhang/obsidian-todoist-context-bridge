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
    public journalManager: SyncJournalManager;
    public changeDetector: ChangeDetector;

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
     * Manual sync trigger for entire vault (DIRECT APPROACH)
     * Uses journal for efficient task discovery, performs direct bidirectional sync,
     * and updates journal after sync - consistent with file sync pattern
     */
    async triggerManualSync(): Promise<void> {
        await this.syncVaultTasksCompletion();
    }

    /**
     * Manual sync command for all tasks in the entire vault using direct/journal-driven approach
     * Leverages the sync journal for efficient task discovery and performs bidirectional sync
     */
    async syncVaultTasksCompletion(): Promise<void> {
        console.log("[MANUAL SYNC] 🚀 Starting manual vault sync...");

        try {
            // 1. JOURNAL READ: Get all tracked tasks from journal
            const allTasks = this.journalManager.getAllTasks();
            const vaultTasks = Object.values(allTasks);

            if (vaultTasks.length === 0) {
                console.log(
                    "[MANUAL SYNC] ℹ️ No linked tasks found in journal",
                );
                this.notificationHelper.showInfo(
                    "ℹ️ No linked tasks found in vault",
                );
                return;
            }

            console.log(
                `[MANUAL SYNC] Found ${vaultTasks.length} linked tasks in journal`,
            );

            // Apply time window filtering if enabled
            let tasksToProcess = vaultTasks;
            if (
                this.settings.enableSyncTimeWindow &&
                this.settings.syncTimeWindowDays > 0
            ) {
                const timeWindowCutoff =
                    Date.now() -
                    this.settings.syncTimeWindowDays * 24 * 60 * 60 * 1000;
                const originalCount = tasksToProcess.length;
                tasksToProcess = vaultTasks.filter((task) => {
                    // Always include tasks with future due dates or recently modified
                    return (
                        !task.lastSyncOperation ||
                        task.lastSyncOperation > timeWindowCutoff
                    );
                });
                console.log(
                    `[MANUAL SYNC] Time window filtering: ${originalCount} → ${tasksToProcess.length} tasks`,
                );
            }

            // Group tasks by file for efficient processing
            const tasksByFile = new Map<string, typeof tasksToProcess>();
            for (const task of tasksToProcess) {
                const filePath = task.obsidianFile;
                if (!tasksByFile.has(filePath)) {
                    tasksByFile.set(filePath, []);
                }
                tasksByFile.get(filePath)!.push(task);
            }

            console.log(
                `[MANUAL SYNC] Processing ${tasksByFile.size} files with linked tasks`,
            );

            // 2. DIRECT SYNC: Process each file's tasks
            let totalSyncedCount = 0;
            let totalProcessedFiles = 0;
            const failedFiles: string[] = [];

            for (const [filePath, fileTasks] of tasksByFile) {
                try {
                    console.log(
                        `[MANUAL SYNC] Processing file: ${filePath} (${fileTasks.length} tasks)`,
                    );

                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (!file || file.path !== filePath) {
                        console.warn(
                            `[MANUAL SYNC] File not found: ${filePath}, skipping`,
                        );
                        failedFiles.push(filePath);
                        continue;
                    }

                    const content = await this.app.vault.read(file as any);
                    const lines = content.split("\n");
                    const modifiedLines = [...lines];
                    let hasChanges = false;
                    let fileSyncedCount = 0;

                    // Process each task in the file
                    for (const task of fileTasks) {
                        try {
                            const taskLine = lines[task.obsidianLine];
                            if (!taskLine) {
                                console.warn(
                                    `[MANUAL SYNC] Line ${task.obsidianLine + 1} not found in file, skipping task ${task.todoistId}`,
                                );
                                continue;
                            }

                            // Validate this is actually a task line using existing module
                            if (!this.textParsing.isTaskLine(taskLine)) {
                                console.warn(
                                    `[MANUAL SYNC] Line ${task.obsidianLine + 1} is not a task line, skipping task ${task.todoistId}`,
                                );
                                continue;
                            }

                            // Get current completion status from Obsidian using existing module
                            const obsidianCompleted =
                                this.textParsing.getTaskStatus(taskLine) ===
                                "completed";
                            console.log(
                                `[MANUAL SYNC] Task ${task.todoistId} - Obsidian status: ${obsidianCompleted ? "completed" : "open"}`,
                            );

                            // Get current completion status from Todoist
                            const todoistTask = await this.todoistApi.getTask(
                                task.todoistId,
                            );
                            if (!todoistTask) {
                                console.warn(
                                    `[MANUAL SYNC] Todoist task ${task.todoistId} not found, skipping`,
                                );
                                continue;
                            }
                            const todoistCompleted =
                                todoistTask.isCompleted ?? false;
                            console.log(
                                `[MANUAL SYNC] Task ${task.todoistId} - Todoist status: ${todoistCompleted ? "completed" : "open"}`,
                            );

                            let taskHasChanges = false;

                            // Perform bidirectional sync
                            if (obsidianCompleted && !todoistCompleted) {
                                // Mark Todoist task as completed
                                console.log(
                                    `[MANUAL SYNC] ✅ Marking Todoist task ${task.todoistId} as completed`,
                                );
                                await this.todoistApi.closeTask(task.todoistId);
                                taskHasChanges = true;
                            } else if (!obsidianCompleted && todoistCompleted) {
                                // Mark Obsidian task as completed and add timestamp
                                console.log(
                                    `[MANUAL SYNC] ✅ Marking Obsidian task as completed and adding timestamp`,
                                );

                                const updatedLine = taskLine.replace(
                                    /^(\s*-\s*)\[ \]/,
                                    "$1[x]",
                                );
                                const finalLine = this.addCompletionTimestamp(
                                    updatedLine,
                                    (todoistTask as any).completed_at,
                                );

                                modifiedLines[task.obsidianLine] = finalLine;
                                hasChanges = true;
                                taskHasChanges = true;
                            } else {
                                console.log(
                                    `[MANUAL SYNC] Task ${task.todoistId} already in sync`,
                                );
                            }

                            if (taskHasChanges) {
                                fileSyncedCount++;
                                totalSyncedCount++;

                                // Update task in journal
                                task.obsidianCompleted =
                                    obsidianCompleted || todoistCompleted;
                                task.todoistCompleted =
                                    todoistCompleted || obsidianCompleted;
                                task.lastSyncOperation = Date.now();
                                task.lastObsidianCheck = Date.now();
                                task.lastTodoistCheck = Date.now();
                            }
                        } catch (error) {
                            console.error(
                                `[MANUAL SYNC] Error syncing task ${task.todoistId}:`,
                                error,
                            );
                        }
                    }

                    // Write file changes if any
                    if (hasChanges) {
                        const updatedContent = modifiedLines.join("\n");
                        await this.app.vault.modify(
                            file as any,
                            updatedContent,
                        );
                        console.log(
                            `[MANUAL SYNC] ✅ Updated file ${filePath} with ${fileSyncedCount} task changes`,
                        );
                    }

                    totalProcessedFiles++;
                    console.log(
                        `[MANUAL SYNC] Completed file ${filePath}: ${fileSyncedCount}/${fileTasks.length} tasks synced`,
                    );
                } catch (error) {
                    console.error(
                        `[MANUAL SYNC] Error processing file ${filePath}:`,
                        error,
                    );
                    failedFiles.push(filePath);
                }
            }

            // 3. SINGLE JOURNAL WRITE: Update journal after all sync operations
            if (totalSyncedCount > 0) {
                console.log(
                    `[MANUAL SYNC] 📝 Updating journal with sync results...`,
                );
                await this.journalManager.saveJournal();
                console.log(`[MANUAL SYNC] ✅ Journal updated successfully`);
            }

            // Final summary
            console.log(
                `[MANUAL SYNC] 🎉 Vault sync completed: ${totalSyncedCount} tasks synced across ${totalProcessedFiles} files`,
            );

            if (failedFiles.length > 0) {
                console.warn(
                    `[MANUAL SYNC] ⚠️ Failed to process ${failedFiles.length} files: ${failedFiles.join(", ")}`,
                );
            }

            // Show user notification
            if (totalSyncedCount > 0) {
                this.notificationHelper.showSuccess(
                    `✅ Vault sync completed: ${totalSyncedCount} tasks synced across ${totalProcessedFiles} files`,
                );
            } else {
                this.notificationHelper.showInfo(
                    `ℹ️ Vault sync completed: All ${vaultTasks.length} tasks already in sync`,
                );
            }
        } catch (error) {
            console.error("[MANUAL SYNC] ❌ Error during vault sync:", error);
            this.notificationHelper.showError(
                `❌ Vault sync failed: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Sync completion status for a single task (MANUAL SYNC - Direct bidirectional sync)
     */
    async syncSingleTask(todoistId: string, lineNumber: number): Promise<void> {
        try {
            console.log(
                `[MANUAL SYNC] 🔄 Direct sync for single task: ${todoistId}`,
            );

            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                throw new Error("No active file found");
            }

            // Get current file content and task line
            const content = await this.app.vault.read(activeFile);
            const lines = content.split("\n");
            if (lineNumber >= lines.length) {
                throw new Error(`Line ${lineNumber} not found in file`);
            }

            const taskLine = lines[lineNumber];

            // Validate this is actually a task line using existing module
            if (!this.textParsing.isTaskLine(taskLine)) {
                throw new Error(`Line ${lineNumber + 1} is not a task line`);
            }

            // Get current completion status from Obsidian using existing module
            const obsidianCompleted =
                this.textParsing.getTaskStatus(taskLine) === "completed";
            console.log(
                `[MANUAL SYNC] Obsidian task status: ${obsidianCompleted ? "completed" : "open"}`,
            );

            // Get current completion status from Todoist
            const todoistTask = await this.todoistApi.getTask(todoistId);
            if (!todoistTask) {
                throw new Error(`Todoist task ${todoistId} not found`);
            }
            const todoistCompleted = todoistTask.isCompleted ?? false;
            console.log(
                `[MANUAL SYNC] Todoist task status: ${todoistCompleted ? "completed" : "open"}`,
            );

            let hasChanges = false;

            // Perform bidirectional sync
            if (obsidianCompleted && !todoistCompleted) {
                // Mark Todoist task as completed
                console.log(
                    `[MANUAL SYNC] Marking Todoist task ${todoistId} as completed`,
                );
                await this.todoistApi.closeTask(todoistId);
                hasChanges = true;
            } else if (!obsidianCompleted && todoistCompleted) {
                // Mark Obsidian task as completed and add timestamp
                console.log(
                    `[MANUAL SYNC] Marking Obsidian task as completed with timestamp`,
                );
                const updatedLine = this.markTaskAsCompleted(taskLine);
                let finalLine = updatedLine;

                // Add completion timestamp if enabled
                if (this.settings.enableCompletionTimestamp) {
                    finalLine = this.addCompletionTimestamp(
                        updatedLine,
                        (todoistTask as any).completed_at,
                    );
                }

                lines[lineNumber] = finalLine;
                const newContent = lines.join("\n");
                await this.app.vault.modify(activeFile, newContent);
                hasChanges = true;
            }

            // Update journal if task exists and changes were made
            if (hasChanges && this.journalManager.isJournalLoaded()) {
                const existingTask =
                    this.journalManager.getTaskByTodoistId(todoistId);
                if (existingTask) {
                    // Update the task entry in the journal
                    existingTask.obsidianCompleted =
                        obsidianCompleted || todoistCompleted;
                    existingTask.todoistCompleted =
                        todoistCompleted || obsidianCompleted;
                    existingTask.lastSyncOperation = Date.now();
                    existingTask.lastObsidianCheck = Date.now();
                    existingTask.lastTodoistCheck = Date.now();

                    await this.journalManager.saveJournal();
                    console.log(
                        `[MANUAL SYNC] Updated journal entry for task ${todoistId}`,
                    );
                } else {
                    // Task not in journal, discover and add it
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
                            `[MANUAL SYNC] Added new task ${todoistId} to journal`,
                        );
                    }
                }
            }

            if (hasChanges) {
                console.log(
                    `[MANUAL SYNC] ✅ Task ${todoistId} synced successfully`,
                );
            } else {
                console.log(
                    `[MANUAL SYNC] ℹ️ Task ${todoistId} already in sync`,
                );
            }
        } catch (error) {
            console.error(
                `[MANUAL SYNC] ❌ Error syncing single task ${todoistId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Sync completion status for all tasks in a specific file (MANUAL SYNC - Direct bidirectional sync)
     * Uses journal/log for efficiency - only processes already tracked linked tasks
     */
    async syncFileTasksCompletion(file: TFile): Promise<void> {
        try {
            console.log(
                `[MANUAL SYNC] 🔄 Direct sync for all linked tasks in file: ${file.path}`,
            );

            if (!this.journalManager.isJournalLoaded()) {
                console.warn(
                    `[MANUAL SYNC] Journal not loaded, cannot identify linked tasks`,
                );
                throw new Error(
                    "Journal not loaded - enhanced sync is required for file sync",
                );
            }

            // SMART FALLBACK APPROACH: Try journal first, fall back to discovery if needed
            const allTasks = this.journalManager.getAllTasks();
            let fileTasks = Object.values(allTasks).filter(
                (task) => task.obsidianFile === file.path,
            );

            console.log(
                `[MANUAL SYNC] Found ${fileTasks.length} linked tasks in journal for file`,
            );

            // Smart fallback: If no tasks in journal, discover them directly
            if (fileTasks.length === 0) {
                console.log(
                    `[MANUAL SYNC] 🔍 Journal empty for this file, discovering tasks directly...`,
                );

                // Discover tasks in the file using existing logic
                const discoveredTasks =
                    await this.changeDetector.discoverTasksInFile(file);
                console.log(
                    `[MANUAL SYNC] Discovered ${discoveredTasks.length} linked tasks in file`,
                );

                if (discoveredTasks.length === 0) {
                    console.log(
                        `[MANUAL SYNC] ℹ️ No Todoist-linked tasks found in file ${file.path}`,
                    );
                    return;
                }

                // Update journal immediately with discovered tasks (self-healing)
                console.log(
                    `[MANUAL SYNC] 📝 Updating journal with ${discoveredTasks.length} newly discovered tasks...`,
                );
                for (const task of discoveredTasks) {
                    await this.journalManager.addTask(task);
                }
                await this.journalManager.saveJournal();
                console.log(
                    `[MANUAL SYNC] ✅ Journal updated with newly discovered tasks`,
                );

                // Use discovered tasks for sync
                fileTasks = discoveredTasks;
            }

            // Get current file content
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            let modifiedLines = [...lines];
            let hasChanges = false;
            let syncedCount = 0;

            for (const task of fileTasks) {
                try {
                    console.log(
                        `[MANUAL SYNC] Processing task ${task.todoistId} on line ${task.obsidianLine + 1}`,
                    );

                    // Validate line number
                    if (task.obsidianLine >= lines.length) {
                        console.warn(
                            `[MANUAL SYNC] Line ${task.obsidianLine} not found in file, skipping task ${task.todoistId}`,
                        );
                        continue;
                    }

                    const taskLine = lines[task.obsidianLine];

                    // Validate this is actually a task line using existing module
                    if (!this.textParsing.isTaskLine(taskLine)) {
                        console.warn(
                            `[MANUAL SYNC] Line ${task.obsidianLine + 1} is not a task line, skipping task ${task.todoistId}`,
                        );
                        continue;
                    }

                    // Get current completion status from Obsidian using existing module
                    const obsidianCompleted =
                        this.textParsing.getTaskStatus(taskLine) ===
                        "completed";
                    console.log(
                        `[MANUAL SYNC] Task ${task.todoistId} - Obsidian status: ${obsidianCompleted ? "completed" : "open"}`,
                    );

                    // Get current completion status from Todoist
                    const todoistTask = await this.todoistApi.getTask(
                        task.todoistId,
                    );
                    if (!todoistTask) {
                        console.warn(
                            `[MANUAL SYNC] Todoist task ${task.todoistId} not found, skipping`,
                        );
                        continue;
                    }
                    const todoistCompleted = todoistTask.isCompleted ?? false;
                    console.log(
                        `[MANUAL SYNC] Task ${task.todoistId} - Todoist status: ${todoistCompleted ? "completed" : "open"}`,
                    );

                    let taskHasChanges = false;

                    // Perform bidirectional sync
                    if (obsidianCompleted && !todoistCompleted) {
                        // Mark Todoist task as completed
                        console.log(
                            `[MANUAL SYNC] Marking Todoist task ${task.todoistId} as completed`,
                        );
                        await this.todoistApi.closeTask(task.todoistId);
                        taskHasChanges = true;
                    } else if (!obsidianCompleted && todoistCompleted) {
                        // Mark Obsidian task as completed and add timestamp
                        console.log(
                            `[MANUAL SYNC] Marking Obsidian task ${task.todoistId} as completed with timestamp`,
                        );
                        const updatedLine = taskLine.replace(
                            /^(\s*-\s*)\[ \]/,
                            "$1[x]",
                        );
                        let finalLine = updatedLine;

                        // Add completion timestamp if enabled
                        if (this.settings.enableCompletionTimestamp) {
                            finalLine = this.addCompletionTimestamp(
                                updatedLine,
                                (todoistTask as any).completed_at,
                            );
                        }

                        modifiedLines[task.obsidianLine] = finalLine;
                        hasChanges = true;
                        taskHasChanges = true;
                    }

                    // Update journal entry after sync (like single task case)
                    if (taskHasChanges) {
                        syncedCount++;

                        // Update the task entry in the journal with new completion status
                        task.obsidianCompleted =
                            obsidianCompleted || todoistCompleted;
                        task.todoistCompleted =
                            todoistCompleted || obsidianCompleted;
                        task.lastSyncOperation = Date.now();
                        task.lastObsidianCheck = Date.now();
                        task.lastTodoistCheck = Date.now();

                        console.log(
                            `[MANUAL SYNC] Updated journal entry for task ${task.todoistId}`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `[MANUAL SYNC] Error syncing task ${task.todoistId}:`,
                        error,
                    );
                    // Continue with other tasks
                }
            }

            // Save file changes if any
            if (hasChanges) {
                const newContent = modifiedLines.join("\n");
                await this.app.vault.modify(file, newContent);
                console.log(
                    `[MANUAL SYNC] File ${file.path} updated with completion changes`,
                );
            }

            // Save journal changes (like single task case)
            if (syncedCount > 0) {
                await this.journalManager.saveJournal();
                console.log(`[MANUAL SYNC] Journal updated with sync results`);
            }

            console.log(
                `[MANUAL SYNC] ✅ File sync completed: ${syncedCount} tasks synced`,
            );

            if (syncedCount === 0 && fileTasks.length > 0) {
                console.log(
                    `[MANUAL SYNC] ℹ️ All ${fileTasks.length} linked tasks in file are already in sync`,
                );
            }
        } catch (error) {
            console.error(`[MANUAL SYNC] ❌ Error syncing file tasks:`, error);
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
