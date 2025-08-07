/**
 * Enhanced Bidirectional Sync Service with Log-Based Journal
 * Replaces the scanning approach with intelligent state tracking
 */

import { App, Notice, TFile, MarkdownView } from "obsidian";
import { TODOIST_CONSTANTS } from "./constants";
import { TodoistContextBridgeSettings } from "./Settings";
import { TaskLocationUtils } from "./TaskLocationUtils";
import { TextParsing } from "./TextParsing";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { TodoistV2IDs } from "./TodoistV2IDs";
import { TodoistIdManager } from "./TodoistIdManager";
import { UIDProcessing } from "./UIDProcessing";
import { NotificationHelper } from "./NotificationHelper";
import { SyncJournalManager } from "./SyncJournalManager";
import { ChangeDetector } from "./ChangeDetector";
import { SyncOperation, SyncProgress, TaskSyncEntry } from "./SyncJournal";

export class EnhancedBidirectionalSyncService {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private taskLocationUtils: TaskLocationUtils;
    private textParsing: TextParsing;
    private todoistApi: TodoistApi;
    private uidProcessing: UIDProcessing;
    private notificationHelper: NotificationHelper;
    public journalManager: SyncJournalManager;
    public changeDetector: ChangeDetector;

    private syncInterval: number | null = null;
    private isRunning = false;
    private currentProgress: SyncProgress | null = null;

    constructor(
        app: App,
        settings: TodoistContextBridgeSettings,
        textParsing: TextParsing,
        todoistApi: TodoistApi,
        _todoistV2IDs: TodoistV2IDs,
        notificationHelper: NotificationHelper,
    ) {
        this.app = app;
        this.settings = settings;
        this.textParsing = textParsing;
        this.todoistApi = todoistApi;
        this.uidProcessing = new UIDProcessing(settings, app);
        // Create TodoistIdManager for enhanced ID handling
        const idManager = new TodoistIdManager(settings);
        this.taskLocationUtils = new TaskLocationUtils(textParsing, idManager);
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
     * Start the enhanced sync service (NON-BLOCKING STARTUP)
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            // Service already running - reduced logging
            return;
        }

        try {
            // Starting enhanced sync service...

            // CRITICAL FIX: Only do essential, fast operations during startup
            // Load sync journal (only if not already loaded) - this is fast
            if (!this.journalManager.isJournalLoaded()) {
                // Loading journal for startup - reduced logging
                await this.journalManager.loadJournal();
            } else {
                // Journal already loaded - reduced logging
            }

            // Set up periodic sync immediately (don't wait for initial sync)
            if (this.settings.syncIntervalMinutes > 0) {
                this.syncInterval = window.setInterval(
                    () => this.performSync(),
                    this.settings.syncIntervalMinutes * 60 * 1000,
                );
                // Scheduled sync interval
            }

            this.isRunning = true;
            // Enhanced sync service started

            // DEFERRED: Heavy operations run in background after startup
            // Scheduling deferred initialization

            // Run heavy operations after a short delay to not block startup
            setTimeout(() => {
                this.performDeferredInitialization();
            }, 2000); // 2 second delay to ensure Obsidian UI is loaded
        } catch (error) {
            console.error(
                "[ENHANCED SYNC] Error starting sync service:",
                error,
            );
            this.notificationHelper.showError(
                "Failed to start enhanced bidirectional sync. Check console for details.",
            );
        }
    }

    /**
     * Perform deferred initialization (heavy operations after startup)
     * This runs in the background to avoid blocking Obsidian startup
     */
    private async performDeferredInitialization(): Promise<void> {
        if (!this.isRunning) {
            console.log(
                "[ENHANCED SYNC] Service stopped, skipping deferred initialization",
            );
            return;
        }

        try {
            // Starting deferred initialization...

            // Migrate existing entries to note ID tracking (can be slow)
            await this.migrateJournalToNoteIdTracking();

            // Validate and correct file paths using note ID tracking (can be slow)
            await this.validateJournalFilePaths("startup");

            // Perform initial sync (can be very slow with API calls)
            // Performing initial background sync
            await this.performSync();

            // Deferred initialization completed
        } catch (error) {
            console.error(
                "[ENHANCED SYNC] Error during deferred initialization (non-critical):",
                error,
            );
            // Don't show user notification for background errors
            // The sync service is still running and will retry on next cycle
        }
    }

    /**
     * Stop the sync service
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        // Stopping enhanced sync service - reduced logging

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
        // Enhanced sync service stopped - reduced logging
    }

    /**
     * Perform a complete sync operation
     */
    async performSync(): Promise<void> {
        if (!this.journalManager.isJournalLoaded()) {
            // Journal not loaded, skipping sync - reduced logging
            return;
        }

        const startTime = Date.now();

        try {
            // Starting sync operation

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

            // Mark sync as complete
            this.updateProgress("complete", "Sync completed");

            // Show completion notification if enabled
            if (this.settings.showSyncProgress) {
                const completedOps =
                    this.currentProgress?.completedOperations || 0;
                const totalOps = this.currentProgress?.totalOperations || 0;
                const errors = this.currentProgress?.errors.length || 0;

                let message = `Sync completed in ${Math.round(duration / 1000)}s`;
                if (totalOps > 0) {
                    message += ` • ${completedOps}/${totalOps} operations`;
                }
                if (errors > 0) {
                    message += ` • ${errors} errors`;
                }

                new Notice(message, 5000); // Show for 5 seconds
            }

            // Sync completed successfully (logging removed to reduce console noise)
        } catch (error) {
            console.error("[ENHANCED SYNC] Error during sync:", error);
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

        // Update task entry with sync timestamp and completion state
        const updatedTaskEntry =
            this.journalManager.getAllTasks()[operation.taskId];
        if (updatedTaskEntry) {
            await this.journalManager.updateTask(operation.taskId, {
                lastSyncOperation: Date.now(),
                completionState:
                    this.changeDetector.getTaskCompletionState(
                        updatedTaskEntry,
                    ),
            });
        }
    }

    /**
     * Sync completion from Obsidian to Todoist
     */
    private async syncCompletionToTodoist(
        _operation: SyncOperation,
        taskEntry: TaskSyncEntry,
    ): Promise<void> {
        try {
            await this.todoistApi.closeTask(taskEntry.todoistId);

            // Update task entry
            await this.journalManager.updateTask(taskEntry.todoistId, {
                todoistCompleted: true,
            });

            // Only log completion sync if sync progress is enabled
            if (this.settings.showSyncProgress) {
                console.log(
                    `[ENHANCED SYNC] Synced completion from Obsidian to Todoist: ${taskEntry.todoistId}`,
                );
            }
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

            // STEP 1: Sync description from Todoist to Obsidian BEFORE marking completion
            // This ensures descriptions are updated before completion status changes during auto-sync
            if (this.settings.descriptionSyncMode !== "disabled") {
                if (operation.data?.todoistTask) {
                    // Use pre-fetched Todoist task data from operation to avoid individual API calls
                    // This prevents CORS errors and API rate limiting during auto-sync
                    const todoistTask = operation.data.todoistTask;
                    console.log(
                        `[DEBUG] Auto-sync description sync: task ${todoistTask.id}, line ${taskEntry.obsidianLine}`,
                    );
                    await this.syncTaskDescriptionDirect(
                        todoistTask,
                        file,
                        taskEntry.obsidianLine,
                    );
                    // Re-read content after description sync as it may have modified the file
                    const updatedContent = await this.app.vault.read(file);
                    const updatedLines = updatedContent.split("\n");
                    lines.splice(0, lines.length, ...updatedLines); // Update lines array
                } else {
                    console.warn(
                        `[DEBUG] Auto-sync description sync skipped: no todoistTask data for ${taskEntry.todoistId}`,
                    );
                }
            }

            // STEP 2: Update the task line to completed status
            const currentTaskLine = lines[taskEntry.obsidianLine]; // Use updated line after description sync
            let updatedLine = this.markTaskAsCompleted(currentTaskLine);

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

            // Only log completion sync if sync progress is enabled
            if (this.settings.showSyncProgress) {
                console.log(
                    `[ENHANCED SYNC] Synced completion from Todoist to Obsidian: ${taskEntry.obsidianFile}:${taskEntry.obsidianLine + 1}`,
                );
            }
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
                    await this.executeOperation(operation);
                    await this.journalManager.completeOperation(operation.id);
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
     * Update sync progress and show notifications if enabled
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

            // Show progress notifications if enabled
            if (this.settings.showSyncProgress && operation) {
                const phaseEmoji = {
                    discovery: "🔍",
                    change_detection: "🔄",
                    operations: "⚙️",
                    complete: "✅",
                };

                new Notice(
                    `${phaseEmoji[phase]} ${operation}`,
                    3000, // Show for 3 seconds
                );
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
            (window as any)
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
            !this.settings.enableTaskCompletionAutoSync
        ) {
            this.stop();
            this.start();
        }
    }

    // ... (rest of the code remains the same)
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
     * Manual sync command for all tasks in the entire vault
     * Combines journal-based efficiency with fallback task discovery for comprehensive coverage
     */
    async syncVaultTasksCompletion(): Promise<void> {
        // Starting manual vault sync - reduced logging

        try {
            // 1. JOURNAL READ: Get all tracked tasks from journal
            const allTasks = this.journalManager.getAllTasks();
            let vaultTasks = Object.values(allTasks);

            // Found tasks in journal - reduced logging

            // 2. FALLBACK DISCOVERY: If journal is empty or user requests comprehensive scan,
            // discover new linked tasks that might not be in journal yet
            if (vaultTasks.length === 0) {
                console.log(
                    "[MANUAL SYNC] Journal empty, discovering tasks...",
                );

                // Use change detector to discover all linked tasks in vault
                const discoveredTasks =
                    await this.changeDetector.discoverNewTasks();
                if (discoveredTasks.length > 0) {
                    console.log(
                        `[MANUAL SYNC] Discovered ${discoveredTasks.length} linked tasks`,
                    );
                }

                if (discoveredTasks.length === 0) {
                    console.log("[MANUAL SYNC] No linked tasks found");
                    this.notificationHelper.showInfo(
                        "No linked tasks found in vault",
                    );
                    return;
                }

                // Add discovered tasks to our processing list
                vaultTasks = discoveredTasks;
                console.log(
                    `[MANUAL SYNC] Using ${vaultTasks.length} discovered tasks for sync`,
                );
            } else {
                // Even if journal has tasks, check for any new ones not yet tracked
                console.log(
                    "[MANUAL SYNC] Checking for new tasks not yet in journal...",
                );
                const discoveredTasks =
                    await this.changeDetector.discoverNewTasks();

                if (discoveredTasks.length > 0) {
                    console.log(
                        `[MANUAL SYNC] Found ${discoveredTasks.length} new tasks not in journal`,
                    );
                    // Merge discovered tasks with journal tasks (avoid duplicates)
                    const existingIds = new Set(
                        vaultTasks.map((t) => t.todoistId),
                    );
                    const newTasks = discoveredTasks.filter(
                        (t) => !existingIds.has(t.todoistId),
                    );
                    vaultTasks = [...vaultTasks, ...newTasks];
                    console.log(
                        `[MANUAL SYNC] Total tasks to process: ${vaultTasks.length} (${newTasks.length} newly discovered)`,
                    );
                }
            }

            console.log(
                `[MANUAL SYNC] Found ${vaultTasks.length} linked tasks in journal`,
            );

            // Process all vault tasks - journal-based optimization handles efficiency
            const tasksToProcess = vaultTasks;

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

                    // OPTIMIZATION: Use journal-first approach to minimize API calls
                    // Step 1: Filter out deleted tasks and identify tasks that need syncing
                    const tasksNeedingSync: Array<
                        (typeof fileTasks)[0] & {
                            currentLine: string;
                            currentObsidianCompleted: boolean;
                        }
                    > = [];
                    const tasksAlreadyInSync: typeof fileTasks = [];
                    const deletedTasks: typeof fileTasks = [];

                    for (const task of fileTasks) {
                        // OPTIMIZATION: Skip deleted tasks completely (fifth category)
                        if (task.isOrphaned) {
                            deletedTasks.push(task);
                            continue; // Skip all processing for deleted tasks
                        }
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

                            // Get current completion status from Obsidian
                            const obsidianCompleted =
                                this.textParsing.getTaskStatus(taskLine) ===
                                "completed";

                            // Use journal data for Todoist status (avoid API call)
                            const todoistCompleted = task.todoistCompleted;

                            // Check if sync is needed based on completion status mismatch
                            if (obsidianCompleted !== todoistCompleted) {
                                tasksNeedingSync.push({
                                    ...task,
                                    currentLine: taskLine,
                                    currentObsidianCompleted: obsidianCompleted,
                                });
                                console.log(
                                    `[MANUAL SYNC] Task ${task.todoistId} needs sync: Obsidian=${obsidianCompleted ? "completed" : "open"}, Todoist=${todoistCompleted ? "completed" : "open"}`,
                                );
                            } else {
                                tasksAlreadyInSync.push(task);
                            }
                        } catch (error) {
                            console.error(
                                `[MANUAL SYNC] Error analyzing task ${task.todoistId}:`,
                                error,
                            );
                        }
                    }

                    console.log(
                        `[MANUAL SYNC] Optimization: ${tasksNeedingSync.length} tasks need sync, ${tasksAlreadyInSync.length} already in sync, ${deletedTasks.length} deleted (skipped) - ${deletedTasks.length + tasksAlreadyInSync.length} tasks require no API calls`,
                    );

                    // Step 2: Process only tasks that need syncing (minimize API calls)
                    const tasksToCloseInTodoist: string[] = [];

                    for (const task of tasksNeedingSync) {
                        try {
                            // Sync description before completion status if enabled
                            if (
                                this.settings.descriptionSyncMode !== "disabled"
                            ) {
                                const todoistTask =
                                    await this.todoistApi.getTask(
                                        task.todoistId,
                                    );
                                if (todoistTask) {
                                    await this.syncTaskDescriptionDirect(
                                        todoistTask,
                                        file as TFile,
                                        task.obsidianLine,
                                    );
                                    // Re-read content after description sync as it may have modified the file
                                    const updatedContent =
                                        await this.app.vault.read(
                                            file as TFile,
                                        );
                                    const updatedLines =
                                        updatedContent.split("\n");
                                    modifiedLines.splice(
                                        0,
                                        modifiedLines.length,
                                        ...updatedLines,
                                    );
                                }
                            }

                            const obsidianCompleted =
                                task.currentObsidianCompleted;
                            const todoistCompleted = task.todoistCompleted;

                            let taskHasChanges = false;

                            // Perform bidirectional sync
                            if (obsidianCompleted && !todoistCompleted) {
                                // Queue Todoist task for completion (batch later to minimize API calls)
                                tasksToCloseInTodoist.push(task.todoistId);
                                taskHasChanges = true;
                            } else if (!obsidianCompleted && todoistCompleted) {
                                // Mark Obsidian task as completed and add timestamp
                                const updatedLine = task.currentLine.replace(
                                    /^(\s*-\s*)\[ \]/,
                                    "$1[x]",
                                );

                                // Use current time for completion timestamp since manual sync
                                const completedAt = new Date().toISOString();
                                const finalLine = this.addCompletionTimestamp(
                                    updatedLine,
                                    completedAt,
                                );

                                modifiedLines[task.obsidianLine] = finalLine;
                                hasChanges = true;
                                taskHasChanges = true;
                            }

                            if (taskHasChanges) {
                                fileSyncedCount++;
                                totalSyncedCount++;

                                // Update task in journal with new sync state
                                await this.journalManager.updateTask(
                                    task.todoistId,
                                    {
                                        obsidianCompleted:
                                            obsidianCompleted ||
                                            todoistCompleted,
                                        todoistCompleted:
                                            todoistCompleted ||
                                            obsidianCompleted,
                                        lastSyncOperation: Date.now(),
                                        lastObsidianCheck: Date.now(),
                                        lastTodoistCheck: Date.now(),
                                        completionState:
                                            obsidianCompleted &&
                                            todoistCompleted
                                                ? "both-completed"
                                                : obsidianCompleted
                                                  ? "obsidian-completed-todoist-open"
                                                  : todoistCompleted
                                                    ? "obsidian-open-todoist-completed"
                                                    : "both-open",
                                    },
                                );
                            }
                        } catch (error) {
                            console.error(
                                `[MANUAL SYNC] Error syncing task ${task.todoistId}:`,
                                error,
                            );
                        }
                    }

                    // Step 3: Batch process Todoist completions (minimize API calls)
                    if (tasksToCloseInTodoist.length > 0) {
                        console.log(
                            `[MANUAL SYNC] Batch processing ${tasksToCloseInTodoist.length} Todoist task completions`,
                        );

                        for (const todoistId of tasksToCloseInTodoist) {
                            try {
                                await this.todoistApi.closeTask(todoistId);
                                console.log(
                                    `[MANUAL SYNC] Completed Todoist task ${todoistId}`,
                                );

                                // Update journal to reflect the completion
                                await this.journalManager.updateTask(
                                    todoistId,
                                    {
                                        todoistCompleted: true,
                                        lastTodoistCheck: Date.now(),
                                        completionState: "both-completed",
                                    },
                                );
                            } catch (error) {
                                console.error(
                                    `[MANUAL SYNC] Failed to complete Todoist task ${todoistId}:`,
                                    error,
                                );
                            }
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
                            `[MANUAL SYNC] Updated file ${filePath} with ${fileSyncedCount} task changes`,
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

            // 3. ADD NEW TASKS TO JOURNAL: Ensure all discovered tasks are tracked
            const journalTasks = this.journalManager.getAllTasks();
            let newTasksAdded = 0;

            for (const task of vaultTasks) {
                if (!journalTasks[task.todoistId]) {
                    console.log(
                        `[MANUAL SYNC] Adding newly discovered task ${task.todoistId} to journal`,
                    );
                    this.journalManager.addTask(task);
                    newTasksAdded++;
                }
            }

            if (newTasksAdded > 0) {
                console.log(
                    `[MANUAL SYNC] Added ${newTasksAdded} new tasks to journal`,
                );
            }

            // 4. INCREMENTAL JOURNAL UPDATE: Save journal with all changes
            if (totalSyncedCount > 0 || newTasksAdded > 0) {
                console.log(
                    `[MANUAL SYNC] Updating journal with sync results and new tasks...`,
                );
                await this.journalManager.saveJournal();
                console.log(`[MANUAL SYNC] Journal updated successfully`);
            }

            // Final summary
            console.log(
                `[MANUAL SYNC] Vault sync completed: ${totalSyncedCount} tasks synced across ${totalProcessedFiles} files`,
            );

            if (failedFiles.length > 0) {
                console.warn(
                    `[MANUAL SYNC] Failed to process ${failedFiles.length} files: ${failedFiles.join(", ")}`,
                );
            }

            // Show user notification
            if (totalSyncedCount > 0) {
                this.notificationHelper.showSuccess(
                    `Vault sync completed: ${totalSyncedCount} tasks synced across ${totalProcessedFiles} files`,
                );
            } else {
                this.notificationHelper.showInfo(
                    `All ${vaultTasks.length} tasks already in sync`,
                );
            }
        } catch (error) {
            console.error("[MANUAL SYNC] Error during vault sync:", error);
            this.notificationHelper.showError(
                `Vault sync failed: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Sync task description from Todoist to Obsidian programmatically
     * Works with any file regardless of whether it's active or not
     */
    private async syncTaskDescriptionDirect(
        todoistTask: any,
        file: TFile,
        lineNumber: number,
    ): Promise<void> {
        // Check if description syncing is enabled
        if (this.settings.descriptionSyncMode === "disabled") {
            return;
        }

        try {
            // Reduced logging for auto-sync operations
            if (this.settings.showSyncProgress) {
                console.log(
                    `[DESCRIPTION SYNC] Syncing description for task ${todoistTask.id} with mode: ${this.settings.descriptionSyncMode}`,
                );
            }

            // Get the task description
            const description = todoistTask.description || "";

            // Early check for completely empty description
            if (!description.trim()) {
                console.log(
                    `[DESCRIPTION SYNC] Task ${todoistTask.id} has empty description, skipping`,
                );
                return;
            }

            const lines = description.split("\n");

            // Allow description sync for completed tasks (user requested)
            const isTaskCompleted =
                (todoistTask as any).checked ??
                todoistTask.isCompleted ??
                false;
            // Only log completion status if sync progress is enabled
            if (this.settings.showSyncProgress) {
                console.log(
                    `[DESCRIPTION SYNC] Task ${todoistTask.id} completion status: ${isTaskCompleted ? "completed" : "active"}`,
                );
            }

            // Check if description contains only metadata (using correct constants)
            const hasOnlyMetadata = lines.every(
                (line: string) =>
                    !line.trim() ||
                    TODOIST_CONSTANTS.METADATA_PATTERNS.ORIGINAL_TASK.test(
                        line,
                    ) ||
                    TODOIST_CONSTANTS.METADATA_PATTERNS.REFERENCE.test(line),
            );

            // Filter out metadata if requested (using correct constants)
            let filteredLines = lines;
            const excludeMetadata =
                this.settings.descriptionSyncMode ===
                "sync-text-except-metadata";

            if (excludeMetadata) {
                // Filter out the reference link line and empty lines (exact same logic as original)
                filteredLines = lines.filter(
                    (line: string) =>
                        !TODOIST_CONSTANTS.METADATA_PATTERNS.ORIGINAL_TASK.test(
                            line,
                        ) &&
                        !TODOIST_CONSTANTS.METADATA_PATTERNS.REFERENCE.test(
                            line,
                        ) &&
                        line.trim() !== "",
                );

                if (filteredLines.length === 0) {
                    if (hasOnlyMetadata) {
                        console.log(
                            `[DESCRIPTION SYNC] Task ${todoistTask.id} has only metadata, skipping`,
                        );
                    } else {
                        console.log(
                            `[DESCRIPTION SYNC] Task ${todoistTask.id} has empty description after filtering, skipping`,
                        );
                    }
                    return;
                }
            } else {
                // For full sync, still check if there's any content (exact same logic as original)
                if (filteredLines.every((line: string) => !line.trim())) {
                    console.log(
                        `[DESCRIPTION SYNC] Task ${todoistTask.id} has empty description, skipping`,
                    );
                    return;
                }
            }

            // Read current file content
            const content = await this.app.vault.read(file);
            const contentLines = content.split("\n");

            if (lineNumber >= contentLines.length) {
                console.warn(
                    `[DESCRIPTION SYNC] Line number ${lineNumber} out of bounds for file ${file.path}`,
                );
                return;
            }

            // Use robust Todoist ID-first location strategy with V1/V2 ID conversion
            const actualTaskLocation =
                await this.taskLocationUtils.findTaskByTodoistIdAsync(
                    contentLines,
                    todoistTask.id,
                    lineNumber,
                );

            if (!actualTaskLocation) {
                console.warn(
                    `[DESCRIPTION SYNC] Could not locate task for Todoist ID ${todoistTask.id} in file ${file.path}`,
                );
                return;
            }

            const actualTaskLine = actualTaskLocation.taskLineIndex;
            const actualTaskLineContent = actualTaskLocation.taskLineContent;

            // Log line correction if needed (only when sync progress is enabled)
            if (
                this.settings.showSyncProgress &&
                actualTaskLine !== lineNumber
            ) {
                console.log(
                    `[DESCRIPTION SYNC] Located actual task line at ${actualTaskLine} (journal had ${lineNumber})`,
                );
            }

            // Get the original task's indentation level and add one more level
            const taskIndentation = this.textParsing.getLineIndentation(
                actualTaskLineContent,
            );
            const taskLevel = this.getIndentationLevel(actualTaskLineContent);
            const descriptionBaseIndentation = "\t".repeat(taskLevel + 1);

            // Process and format the description lines with the correct base indentation
            const formattedLines = this.processDescriptionLines(
                filteredLines,
                descriptionBaseIndentation,
            );
            const formattedDescription = formattedLines.join("\n");

            // Find the position to insert the description
            let nextLine = actualTaskLine + 1;
            let nextLineText = contentLines[nextLine];

            // Skip existing sub-items
            while (
                nextLineText &&
                this.textParsing.getLineIndentation(nextLineText).length >
                    taskIndentation.length
            ) {
                nextLine++;
                nextLineText = contentLines[nextLine];
            }

            // Insert the description (programmatic equivalent of editor.replaceRange)
            // Original uses: editor.replaceRange(`\n${formattedDescription}`, {line: nextLine-1, ch: lineLength}, {line: nextLine-1, ch: lineLength})
            const insertionPoint = nextLine - 1;
            const lineToModify = contentLines[insertionPoint];
            contentLines[insertionPoint] =
                lineToModify + "\n" + formattedDescription;

            // Write the updated content back to the file
            const updatedContent = contentLines.join("\n");
            await this.app.vault.modify(file, updatedContent);

            // Only log success if sync progress is enabled
            if (this.settings.showSyncProgress) {
                console.log(
                    `[DESCRIPTION SYNC] Description synced successfully for task ${todoistTask.id}`,
                );
            }
        } catch (error) {
            console.error(
                `[DESCRIPTION SYNC] Failed to sync description for task ${todoistTask.id}:`,
                error,
            );
            // Don't throw error - description sync failure shouldn't prevent completion sync
        }
    }

    /**
     * Gets the number of tab indentations in a line
     */
    private getIndentationLevel(line: string): number {
        const indentation = this.textParsing.getLineIndentation(line);
        return indentation.split("\t").length - 1;
    }

    /**
     * Process description lines to maintain hierarchy
     */
    private processDescriptionLines(
        lines: string[],
        baseIndentation: string,
    ): string[] {
        const result: string[] = [];
        let currentIndentLevel = 0;
        let previousLineWasList = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const isListItem = line.startsWith("-") || line.startsWith("*");
            const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : "";
            const nextIsListItem =
                nextLine &&
                (nextLine.startsWith("-") || nextLine.startsWith("*"));

            // Determine indentation level
            if (isListItem) {
                // If this is a list item following regular text, increase indent level
                if (!previousLineWasList && result.length > 0) {
                    currentIndentLevel++;
                }
            } else {
                // Reset indent level for regular text
                currentIndentLevel = 0;
            }

            // Format the line with appropriate indentation
            result.push(
                this.formatDescriptionLine(
                    line,
                    baseIndentation,
                    currentIndentLevel,
                ),
            );

            previousLineWasList = isListItem;
        }

        return result;
    }

    /**
     * Formats a line of text as an Obsidian list item with proper indentation
     */
    private formatDescriptionLine(
        line: string,
        baseIndentation: string,
        additionalIndentLevel = 0,
    ): string {
        const trimmedLine = line.trim();
        if (!trimmedLine) return "";

        // Calculate the full indentation based on the level
        const fullIndentation =
            baseIndentation + "\t".repeat(additionalIndentLevel);

        // If it's already a list item (starts with - or *), maintain the list marker
        const listMatch = trimmedLine.match(/^[-*]\s*(.*)/);
        if (listMatch) {
            return `${fullIndentation}- ${listMatch[1]}`;
        }

        // For regular text, make it a list item
        return `${fullIndentation}- ${trimmedLine}`;
    }

    /**
     * Sync completion status for a single task (MANUAL SYNC - Journal-based mismatch detection)
     */
    async syncSingleTask(todoistId: string, lineNumber: number): Promise<void> {
        try {
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

            // JOURNAL-BASED MISMATCH DETECTION: Check if task exists in journal first
            let todoistCompleted = false;
            let todoistTask: any = null;

            if (this.journalManager.isJournalLoaded()) {
                const existingTask =
                    await this.journalManager.getTaskByTodoistId(todoistId);
                if (existingTask) {
                    // Check completion state for optimization
                    const completionState =
                        this.changeDetector.getTaskCompletionState(
                            existingTask,
                        );

                    // CRITICAL: Skip deleted tasks (Category 5)
                    if (
                        completionState === "deleted" ||
                        this.journalManager.isTaskDeleted(todoistId)
                    ) {
                        return;
                    }

                    // Skip both-completed tasks if user has disabled tracking (Category 4)
                    if (
                        completionState === "both-completed" &&
                        !this.settings.trackBothCompletedTasks
                    ) {
                        // Silently skip both-completed task
                        return;
                    }

                    // Task exists in journal - check for mismatch
                    const hasMismatch =
                        obsidianCompleted !== existingTask.todoistCompleted;

                    if (hasMismatch) {
                        console.log(
                            `[MANUAL SYNC] Journal shows mismatch [${completionState}] - Obsidian: ${obsidianCompleted}, Todoist (journal): ${existingTask.todoistCompleted}. Making API call to verify.`,
                        );
                        // Only make API call if there's a mismatch
                        todoistTask = await this.todoistApi.getTask(todoistId);
                        if (!todoistTask) {
                            throw new Error(
                                `Todoist task ${todoistId} not found`,
                            );
                        }
                        todoistCompleted = todoistTask.isCompleted ?? false;
                    } else {
                        // No mismatch - use journal data (no API call needed)
                        todoistCompleted = existingTask.todoistCompleted;
                        console.log(
                            `[MANUAL SYNC] Journal shows tasks in sync - Obsidian: ${obsidianCompleted}, Todoist: ${todoistCompleted}. No API call needed.`,
                        );
                    }
                } else {
                    // CRITICAL: Check if task is marked as deleted before making API call
                    if (this.journalManager.isTaskDeleted(todoistId)) {
                        return;
                    }
                    // Task not in journal - make API call
                    todoistTask = await this.todoistApi.getTask(todoistId);
                    if (!todoistTask) {
                        throw new Error(`Todoist task ${todoistId} not found`);
                    }
                    todoistCompleted = todoistTask.isCompleted ?? false;
                }
            } else {
                // CRITICAL: Even when journal not loaded, check if task is marked as deleted
                if (this.journalManager.isTaskDeleted(todoistId)) {
                    return;
                }

                // Journal not loaded - fallback to direct API call
                todoistTask = await this.todoistApi.getTask(todoistId);
                if (!todoistTask) {
                    throw new Error(`Todoist task ${todoistId} not found`);
                }
                todoistCompleted = todoistTask.isCompleted ?? false;
            }

            console.log(
                `[MANUAL SYNC] Final status - Todoist: ${todoistCompleted ? "completed" : "open"}`,
            );

            let hasChanges = false;

            // STEP 1: Sync description from Todoist to Obsidian BEFORE marking completion
            // This ensures descriptions are updated before completion status changes
            if (
                todoistTask &&
                this.settings.descriptionSyncMode !== "disabled"
            ) {
                await this.syncTaskDescriptionDirect(
                    todoistTask,
                    activeFile,
                    lineNumber,
                );
                // Re-read content after description sync as it may have modified the file
                const updatedContent = await this.app.vault.read(activeFile);
                const updatedLines = updatedContent.split("\n");
                if (lineNumber < updatedLines.length) {
                    lines.splice(0, lines.length, ...updatedLines); // Update lines array
                }
            }

            // STEP 2: Perform bidirectional completion status sync
            if (obsidianCompleted && !todoistCompleted) {
                // Mark Todoist task as completed
                await this.todoistApi.closeTask(todoistId);
                hasChanges = true;
            } else if (!obsidianCompleted && todoistCompleted) {
                // Mark Obsidian task as completed and add timestamp
                const updatedLine = taskLine.replace(
                    /^(\s*-\s*)\[ \]/,
                    "$1[x]",
                );

                // Use current time for completion timestamp since manual sync
                const completedAt = new Date().toISOString();
                const finalLine = this.addCompletionTimestamp(
                    updatedLine,
                    completedAt,
                );

                lines[lineNumber] = finalLine;
                const newContent = lines.join("\n");
                await this.app.vault.modify(activeFile, newContent);
                hasChanges = true;
            }

            // Update journal if task exists and changes were made
            if (hasChanges && this.journalManager.isJournalLoaded()) {
                const existingTask =
                    await this.journalManager.getTaskByTodoistId(todoistId);
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
                    `[MANUAL SYNC] Task ${todoistId} synced successfully`,
                );
            }
            // Note: Tasks already in sync are handled silently for cleaner output
        } catch (error: any) {
            console.error(
                `[MANUAL SYNC] Error syncing single task ${todoistId}:`,
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
                `[MANUAL SYNC] Direct sync for all linked tasks in file: ${file.path}`,
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
                    `[MANUAL SYNC] Journal empty for this file, discovering tasks directly...`,
                );

                // Discover tasks in the file using existing logic
                const discoveredTasks =
                    await this.changeDetector.discoverTasksInFile(file);
                console.log(
                    `[MANUAL SYNC] Discovered ${discoveredTasks.length} linked tasks in file`,
                );

                if (discoveredTasks.length === 0) {
                    console.log(
                        `[MANUAL SYNC] No Todoist-linked tasks found in file ${file.path}`,
                    );
                    return;
                }

                // Update journal immediately with discovered tasks (self-healing)
                for (const task of discoveredTasks) {
                    await this.journalManager.addTask(task);
                }
                await this.journalManager.saveJournal();

                // Use discovered tasks for sync
                fileTasks = discoveredTasks;
            }

            // Get current file content
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            const modifiedLines = [...lines];
            let hasChanges = false;
            let syncedCount = 0;

            for (const task of fileTasks) {
                try {
                    if (task.obsidianLine >= lines.length) {
                        console.warn(
                            `[MANUAL SYNC] Line ${task.obsidianLine} not found in file, skipping task ${task.todoistId}`,
                        );
                        continue;
                    }

                    // Check if task should be processed based on completion state optimization
                    const completionState =
                        this.changeDetector.getTaskCompletionState(task);

                    // CRITICAL: Skip deleted tasks (Category 5)
                    if (
                        completionState === "deleted" ||
                        this.journalManager.isTaskDeleted(task.todoistId)
                    ) {
                        continue;
                    }

                    // Skip both-completed tasks if user has disabled tracking (Category 4)
                    if (
                        completionState === "both-completed" &&
                        !this.settings.trackBothCompletedTasks
                    ) {
                        // Silently skip both-completed task
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

                    // Only log if sync is needed (completion status mismatch)
                    if (obsidianCompleted !== todoistCompleted) {
                        console.log(
                            `[MANUAL SYNC] Task ${task.todoistId} needs sync [${completionState}] - Obsidian: ${obsidianCompleted ? "completed" : "open"}, Todoist: ${todoistCompleted ? "completed" : "open"}`,
                        );
                    }

                    let taskHasChanges = false;

                    // STEP 1: Sync description from Todoist to Obsidian BEFORE marking completion
                    // This ensures descriptions are updated before completion status changes
                    if (
                        todoistTask &&
                        this.settings.descriptionSyncMode !== "disabled"
                    ) {
                        await this.syncTaskDescriptionDirect(
                            todoistTask,
                            file,
                            task.obsidianLine,
                        );
                        // Re-read content after description sync as it may have modified the file
                        const updatedContent = await this.app.vault.read(file);
                        const updatedLines = updatedContent.split("\n");
                        // Update our working arrays with the new content
                        lines.splice(0, lines.length, ...updatedLines);
                        modifiedLines.splice(
                            0,
                            modifiedLines.length,
                            ...updatedLines,
                        );
                    }

                    // STEP 2: Perform bidirectional completion status sync
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
                        const currentTaskLine = lines[task.obsidianLine]; // Use updated line after description sync
                        const updatedLine = currentTaskLine.replace(
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

                    // Update journal entry after sync with completion state
                    if (taskHasChanges) {
                        syncedCount++;

                        // Update the task entry in the journal with new completion status and state
                        await this.journalManager.updateTask(task.todoistId, {
                            obsidianCompleted:
                                obsidianCompleted || todoistCompleted,
                            todoistCompleted:
                                todoistCompleted || obsidianCompleted,
                            lastSyncOperation: Date.now(),
                            lastObsidianCheck: Date.now(),
                            lastTodoistCheck: Date.now(),
                            completionState:
                                this.changeDetector.getTaskCompletionState({
                                    ...task,
                                    obsidianCompleted:
                                        obsidianCompleted || todoistCompleted,
                                    todoistCompleted:
                                        todoistCompleted || obsidianCompleted,
                                }),
                        });
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
            }

            if (syncedCount > 0) {
                await this.journalManager.saveJournal();
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
        console.log("[ENHANCED SYNC] Sync journal reset");
    }

    /**
     * Get journal file path for debugging
     */
    getJournalPath(): string {
        return this.journalManager.getJournalPath();
    }

    /**
     * Prioritize tasks based on completion state for optimization
     * HIGH PRIORITY: Mismatched completion status (always sync immediately)
     * MEDIUM PRIORITY: Open in both sources (normal sync intervals)
     * LOW PRIORITY: Completed in both sources (user-configurable, rare checking)
     */
    private prioritizeTasksByCompletionState(
        tasks: TaskSyncEntry[],
    ): TaskSyncEntry[] {
        const highPriority: TaskSyncEntry[] = [];
        const mediumPriority: TaskSyncEntry[] = [];
        const lowPriority: TaskSyncEntry[] = [];

        for (const task of tasks) {
            const completionState =
                this.changeDetector.getTaskCompletionState(task);

            switch (completionState) {
                case "obsidian-completed-todoist-open":
                case "obsidian-open-todoist-completed":
                    // HIGH PRIORITY: Mismatched status - always sync immediately
                    highPriority.push(task);
                    break;
                case "both-open":
                    // MEDIUM PRIORITY: Open in both sources - normal intervals
                    mediumPriority.push(task);
                    break;
                case "both-completed":
                    // LOW PRIORITY: Completed in both sources - user configurable
                    lowPriority.push(task);
                    break;
            }
        }

        // Return prioritized list: high priority first, then medium, then low
        return [...highPriority, ...mediumPriority, ...lowPriority];
    }

    /**
     * Validate and correct file paths in journal entries using note ID tracking
     * PROPER ARCHITECTURE: Node ID first, no startup modifications, never delete tasks
     */
    private async validateJournalFilePaths(
        context: "startup" | "autosync" | "manual" | "maintenance" = "startup",
    ): Promise<void> {
        // Journal should already be loaded - don't reload to prevent data loss
        if (!this.journalManager.isJournalLoaded()) {
            console.warn(
                "[ENHANCED SYNC] Journal not loaded in validateJournalFilePaths - this should not happen",
            );
            await this.journalManager.loadJournal();
        }
        const tasks = this.journalManager.getTasksNeedingSync();
        let correctedCount = 0;
        let orphanedCount = 0;
        const tasksToMarkOrphaned: string[] = [];
        const isStartup = context === "startup";

        // Validating file paths - reduced logging to avoid startup noise

        // STARTUP RULE: Never modify journal during initialization
        if (isStartup) {
            // Startup validation - READ ONLY mode - reduced logging
        }

        for (const taskEntry of tasks) {
            let file: TFile | null = null;
            let searchMethod = "unknown";

            // STRATEGY 1 (PRIMARY): Node ID-based lookup - most reliable
            if (taskEntry.obsidianNoteId) {
                const noteIdFile = this.uidProcessing.findFileByUid(
                    taskEntry.obsidianNoteId,
                );
                if (noteIdFile instanceof TFile) {
                    file = noteIdFile;
                    searchMethod = "note-id";
                }
            }

            // STRATEGY 2 (FALLBACK): Try current file path
            if (!file) {
                const currentFile = this.app.vault.getAbstractFileByPath(
                    taskEntry.obsidianFile,
                );
                if (currentFile instanceof TFile) {
                    file = currentFile;
                    searchMethod = "current-path";
                }
            }

            // STRATEGY 3 (FALLBACK): Try fuzzy filename matching
            if (!file) {
                const originalFilename = taskEntry.obsidianFile
                    .split("/")
                    .pop();
                if (originalFilename) {
                    const allFiles = this.app.vault.getMarkdownFiles();
                    const matchingFile = allFiles.find(
                        (f) => f.name === originalFilename,
                    );
                    if (matchingFile) {
                        file = matchingFile;
                        searchMethod = "filename-match";
                    }
                }
            }

            if (file) {
                // File found - update path and note ID if needed (but only if not startup)
                let needsUpdate = false;

                if (file.path !== taskEntry.obsidianFile) {
                    console.log(
                        `[ENHANCED SYNC] ✅ File path correction needed via ${searchMethod}: ${taskEntry.todoistId} -> ${file.path}`,
                    );
                    if (!isStartup) {
                        taskEntry.obsidianFile = file.path;
                        needsUpdate = true;
                        correctedCount++;
                    }
                }

                // Ensure note ID is populated (but only if not startup)
                if (!taskEntry.obsidianNoteId && !isStartup) {
                    const noteId = this.uidProcessing.getUidFromFile(file);
                    if (noteId) {
                        taskEntry.obsidianNoteId = noteId;
                        needsUpdate = true;
                        console.log(
                            `[ENHANCED SYNC] 📝 Added missing note ID: ${taskEntry.todoistId} -> ${noteId}`,
                        );
                    }
                }

                if (!isStartup && needsUpdate) {
                    taskEntry.lastPathValidation = Date.now();
                }
                continue;
            }

            // File not found - handle based on context
            if (isStartup) {
                // STARTUP: Just log, don't modify anything
                console.warn(
                    `[ENHANCED SYNC] ⚠️ File not found during startup: ${taskEntry.todoistId} (${taskEntry.obsidianFile}) - NO ACTION taken`,
                );
                continue;
            }

            // NON-STARTUP: Consider marking as orphaned (but never delete)
            const timeSinceLastValidation =
                Date.now() - (taskEntry.lastPathValidation || 0);
            const GRACE_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days grace period

            if (timeSinceLastValidation < GRACE_PERIOD) {
                console.warn(
                    `[ENHANCED SYNC] ⚠️ File missing but within grace period: ${taskEntry.todoistId} (${taskEntry.obsidianFile})`,
                );
                continue;
            }

            // File has been missing for a long time - mark as orphaned (don't delete)
            console.warn(
                `[ENHANCED SYNC] 🏷️ Marking task as orphaned (file missing >7 days): ${taskEntry.todoistId} (${taskEntry.obsidianFile})`,
            );
            tasksToMarkOrphaned.push(taskEntry.todoistId);
            orphanedCount++;
        }

        // Mark orphaned tasks (move to orphaned section, don't delete)
        for (const todoistId of tasksToMarkOrphaned) {
            // TODO: Implement moveTaskToOrphaned method instead of removeTask
            // For now, just mark with a flag instead of removing
            const task =
                await this.journalManager.getTaskByTodoistId(todoistId);
            if (task) {
                task.isOrphaned = true;
                task.orphanedAt = Date.now();
                console.log(
                    `[ENHANCED SYNC] 🏷️ Marked task as orphaned: ${todoistId}`,
                );
            }
        }

        // Save updated journal ONLY if not startup and changes were made
        if (!isStartup && (correctedCount > 0 || orphanedCount > 0)) {
            await this.journalManager.saveJournal();
            console.log(
                `[ENHANCED SYNC] 📁 File path validation complete: ${correctedCount} corrected, ${orphanedCount} marked orphaned`,
            );
        } else if (isStartup) {
            // Startup validation complete - reduced logging
        } else {
            console.log(
                `[ENHANCED SYNC] 📁 File path validation complete: All ${tasks.length} tasks have valid file paths`,
            );
        }
    }

    /**
     * Migrate existing journal entries to include note ID tracking
     */
    private async migrateJournalToNoteIdTracking(): Promise<void> {
        // Journal should already be loaded - don't reload to prevent data loss
        if (!this.journalManager.isJournalLoaded()) {
            console.warn(
                "[ENHANCED SYNC] Journal not loaded in migrateJournalToNoteIdTracking - this should not happen",
            );
            await this.journalManager.loadJournal();
        }
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
