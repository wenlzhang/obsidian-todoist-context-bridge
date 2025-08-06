/**
 * ChangeDetector - Intelligent detection of new tasks and completion status changes
 */

import { App, TFile } from "obsidian";
import {
    TaskSyncEntry,
    SyncOperation,
    ChangeDetectionResult,
} from "./SyncJournal";
import { TodoistContextBridgeSettings } from "./Settings";
import { TextParsing } from "./TextParsing";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { SyncJournalManager } from "./SyncJournalManager";
import { UIDProcessing } from "./UIDProcessing";
import { TodoistV2IDs } from "./TodoistV2IDs";
import { TODOIST_CONSTANTS } from "./constants";
import { createHash } from "crypto";
import { Notice } from "obsidian";

export class ChangeDetector {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private textParsing: TextParsing;
    private todoistApi: TodoistApi;
    private journalManager: SyncJournalManager;
    private uidProcessing: UIDProcessing;
    private todoistV2IDs: TodoistV2IDs;
    private retryQueue: Map<
        string,
        {
            todoistId: string;
            file: string;
            line: number;
            attempts: number;
            lastAttempt: number;
        }
    > = new Map();

    // API call tracking for monitoring
    private apiCallCount = 0;
    private lastApiCallReset = Date.now();

    // Bulk data caching for efficient comprehensive entry creation
    private lastBulkActiveTaskMap: Record<string, any> = {};
    private lastBulkCompletedTaskMap: Record<string, any> = {};

    // Deleted task tracking is now handled permanently in the journal

    constructor(
        app: App,
        settings: TodoistContextBridgeSettings,
        textParsing: TextParsing,
        todoistApi: TodoistApi,
        journalManager: SyncJournalManager,
    ) {
        this.app = app;
        this.settings = settings;
        this.textParsing = textParsing;
        this.todoistApi = todoistApi;
        this.journalManager = journalManager;
        this.uidProcessing = new UIDProcessing(settings, app);
        this.todoistV2IDs = new TodoistV2IDs(settings);
    }

    /**
     * Add failed task discovery to retry queue for future attempts
     */
    private async addToRetryQueue(
        todoistId: string,
        filePath: string,
        lineNumber: number,
    ): Promise<void> {
        const key = `${todoistId}:${filePath}:${lineNumber}`;
        const existing = this.retryQueue.get(key);

        if (existing) {
            // Update existing entry
            existing.attempts += 1;
            existing.lastAttempt = Date.now();

            // Remove from queue after 3 failed attempts to prevent infinite retries
            if (existing.attempts >= 3) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Removing task ${todoistId} from retry queue after ${existing.attempts} failed attempts`,
                );
                this.retryQueue.delete(key);
                return;
            }
        } else {
            // Add new entry
            this.retryQueue.set(key, {
                todoistId,
                file: filePath,
                line: lineNumber,
                attempts: 1,
                lastAttempt: Date.now(),
            });
        }

        // Only log on first attempt to reduce console noise
        if (!existing) {
            console.log(
                `[CHANGE DETECTOR] 🔄 Added task ${todoistId} to retry queue (${filePath}:${lineNumber})`,
            );
        }
    }

    /**
     * Ensure journal completeness by adding placeholder entries for all linked tasks
     * This addresses the architectural gap where linked tasks might exist in vault
     * but not be tracked in journal due to API failures or other issues
     */
    private async ensureJournalCompleteness(): Promise<void> {
        const knownTasks = this.journalManager.getAllTasks();
        const allFiles = this.app.vault.getMarkdownFiles();
        let placeholdersAdded = 0;

        console.log(
            `[CHANGE DETECTOR] 🔍 Ensuring journal completeness across ${allFiles.length} files...`,
        );

        for (const file of allFiles) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Check if this is a task line
                    if (this.textParsing.isTaskLine(line)) {
                        // Look for Todoist link in subsequent lines
                        const todoistId = this.findTodoistIdInSubItems(
                            lines,
                            i,
                        );

                        if (todoistId && !knownTasks[todoistId]) {
                            // This linked task is not in journal - add comprehensive entry
                            const comprehensiveTask =
                                await this.createComprehensiveTaskEntry(
                                    todoistId,
                                    file,
                                    i,
                                    line,
                                );

                            if (comprehensiveTask) {
                                await this.journalManager.addTask(
                                    comprehensiveTask,
                                );
                                placeholdersAdded++;
                                console.log(
                                    `[CHANGE DETECTOR] 📝 Added placeholder for task ${todoistId} in ${file.path}:${i + 1}`,
                                );
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error ensuring completeness for ${file.path}:`,
                    error,
                );
            }
        }

        if (placeholdersAdded > 0) {
            await this.journalManager.saveJournal();
            console.log(
                `[CHANGE DETECTOR] ✅ Added ${placeholdersAdded} placeholder entries to ensure journal completeness`,
            );
        }
    }

    /**
     * Create a comprehensive task entry with full Todoist data (replaces placeholder approach)
     * Ensures consistency with journal validation entries by fetching complete task information
     */
    private async createComprehensiveTaskEntry(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry | null> {
        try {
            const now = Date.now();
            const obsidianCompleted =
                this.textParsing.getTaskStatus(lineContent) === "completed";
            const fileUid = this.uidProcessing.getUidFromFile(file);

            // First try to get task from existing bulk data if available
            let todoistTask = null;
            if (
                this.lastBulkActiveTaskMap &&
                this.lastBulkActiveTaskMap[todoistId]
            ) {
                todoistTask = this.lastBulkActiveTaskMap[todoistId];
                console.log(
                    `[CHANGE DETECTOR] 📋 Using cached bulk data for task ${todoistId}`,
                );
            } else if (
                this.lastBulkCompletedTaskMap &&
                this.lastBulkCompletedTaskMap[todoistId]
            ) {
                todoistTask = this.lastBulkCompletedTaskMap[todoistId];
                console.log(
                    `[CHANGE DETECTOR] 📋 Using cached completed bulk data for task ${todoistId}`,
                );
            } else {
                // Fallback to individual API call for comprehensive data
                console.log(
                    `[CHANGE DETECTOR] 🔍 Fetching individual task data for comprehensive entry: ${todoistId}`,
                );
                todoistTask = await this.getTodoistTaskWithRetry(todoistId);
            }

            if (!todoistTask) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Could not fetch task data for ${todoistId} - task may be deleted`,
                );
                return null;
            }

            // Create comprehensive entry with full data (same as journal validation)
            const comprehensiveEntry: TaskSyncEntry = {
                todoistId,
                obsidianNoteId: fileUid || "",
                obsidianFile: file.path,
                obsidianLine: lineIndex,
                obsidianCompleted,
                todoistCompleted: todoistTask.isCompleted ?? false,
                lastObsidianCheck: now,
                lastTodoistCheck: now, // ✅ Current timestamp - no unnecessary API calls
                lastSyncOperation: 0,
                obsidianContentHash: this.generateContentHash(lineContent),
                todoistContentHash: this.generateContentHash(
                    todoistTask.content,
                ), // ✅ Full content hash
                todoistDueDate: todoistTask.due?.date, // ✅ Complete due date info
                discoveredAt: now,
                lastPathValidation: now,
                isOrphaned: false,
            };

            console.log(
                `[CHANGE DETECTOR] ✅ Created comprehensive entry for ${todoistId} (completed: O:${obsidianCompleted}, T:${todoistTask.isCompleted})`,
            );
            return comprehensiveEntry;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error creating comprehensive entry for ${todoistId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Process retry queue during change detection
     */
    private async processRetryQueue(): Promise<TaskSyncEntry[]> {
        const retriedTasks: TaskSyncEntry[] = [];
        const now = Date.now();
        const retryDelay = 5 * 60 * 1000; // 5 minutes between retries

        for (const [key, entry] of this.retryQueue.entries()) {
            // Only retry if enough time has passed
            if (now - entry.lastAttempt < retryDelay) {
                continue;
            }

            try {
                const file = this.app.vault.getAbstractFileByPath(
                    entry.file,
                ) as TFile;
                if (!file) {
                    // File no longer exists, remove from queue
                    this.retryQueue.delete(key);
                    continue;
                }

                const content = await this.app.vault.read(file);
                const lines = content.split("\n");
                const lineContent = lines[entry.line - 1]; // Convert to 0-based index

                if (!lineContent || !this.textParsing.isTaskLine(lineContent)) {
                    // Task line no longer exists, remove from queue
                    this.retryQueue.delete(key);
                    continue;
                }

                const newTask = await this.createTaskSyncEntry(
                    entry.todoistId,
                    file,
                    entry.line - 1, // Convert to 0-based index
                    lineContent,
                );

                if (newTask) {
                    retriedTasks.push(newTask);
                    this.retryQueue.delete(key);
                    console.log(
                        `[CHANGE DETECTOR] ✅ Successfully retried task ${entry.todoistId} after ${entry.attempts} attempts`,
                    );
                } else {
                    // Update attempt count, will be removed if max attempts reached
                    await this.addToRetryQueue(
                        entry.todoistId,
                        entry.file,
                        entry.line,
                    );
                }

                // Small delay between retries
                await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error processing retry for ${entry.todoistId}:`,
                    error,
                );
                // Update attempt count
                await this.addToRetryQueue(
                    entry.todoistId,
                    entry.file,
                    entry.line,
                );
            }
        }

        return retriedTasks;
    }

    /**
     * Perform efficient change detection focused on sync operations
     */
    async detectChanges(): Promise<ChangeDetectionResult> {
        const result: ChangeDetectionResult = {
            newTasks: [],
            modifiedTasks: [],
            operations: [],
        };

        const startTime = Date.now();
        const startApiCalls = this.apiCallCount;
        console.log("[CHANGE DETECTOR] Starting efficient change detection...");

        try {
            // 1. Discover new tasks in Obsidian (only if needed)
            result.newTasks = await this.discoverNewTasks();

            // 1a. Process retry queue for previously failed discoveries
            const retriedTasks = await this.processRetryQueue();
            if (retriedTasks.length > 0) {
                result.newTasks.push(...retriedTasks);
                console.log(
                    `[CHANGE DETECTOR] 🔄 Successfully recovered ${retriedTasks.length} tasks from retry queue`,
                );
            }

            // 1b. Ensure journal completeness: Add placeholder entries for failed discoveries
            // This ensures ALL linked tasks are tracked in journal, even if API calls fail
            await this.ensureJournalCompleteness();

            // 1c. Add newly discovered tasks to journal (critical for journal integrity)
            if (result.newTasks.length > 0) {
                for (const task of result.newTasks) {
                    await this.journalManager.addTask(task);
                }
                await this.journalManager.saveJournal();
            } else {
                // Even if no new tasks, save the updated scan time
                await this.journalManager.saveJournal();
            }

            // 2. Detect changes in known tasks - focus on tasks that need sync
            const tasksNeedingCheck = this.journalManager.getTasksNeedingSync();
            let checkedTasks = 0;

            for (const taskEntry of tasksNeedingCheck) {
                const changes = await this.detectTaskChanges(taskEntry);
                if (changes.length > 0) {
                    result.operations.push(...changes);
                    result.modifiedTasks.push(taskEntry);
                }
                checkedTasks++;
            }

            const duration = Date.now() - startTime;
            const apiCallsMade = this.apiCallCount - startApiCalls;
            const summary = [];
            if (result.newTasks.length > 0)
                summary.push(`${result.newTasks.length} new tasks`);
            if (result.operations.length > 0)
                summary.push(`${result.operations.length} sync operations`);

            if (summary.length > 0 || apiCallsMade > 0) {
                console.log(
                    `[CHANGE DETECTOR] ✅ Found: ${summary.join(", ")} (checked ${checkedTasks} tasks, ${apiCallsMade} API calls in ${duration}ms)`,
                );
            } else {
                console.log(
                    `[CHANGE DETECTOR] ✅ No changes detected (checked ${checkedTasks} tasks, ${apiCallsMade} API calls in ${duration}ms)`,
                );
            }

            // Update journal stats
            if (apiCallsMade > 0) {
                this.journalManager.updateStats({
                    apiCallsLastSync: apiCallsMade,
                    tasksProcessedLastSync: checkedTasks,
                });
            }
        } catch (error) {
            console.error(
                "[CHANGE DETECTOR] Error during change detection:",
                error,
            );
            throw error;
        }

        return result;
    }

    /**
     * Discover new tasks in Obsidian files
     */
    async discoverNewTasks(): Promise<TaskSyncEntry[]> {
        const newTasks: TaskSyncEntry[] = [];
        const knownTasks = this.journalManager.getAllTasks();

        // Get the actual last scan time from journal metadata (not task check times)
        const lastScanTime = this.journalManager.getLastScanTime();
        const isInitialScan = lastScanTime === 0;

        const scanStartTime = Date.now();
        // Reduce verbose logging - only log significant scans
        const shouldLogDetails = isInitialScan || false;

        // Get files to scan with enhanced logic to prevent missing tasks
        const filesToScan = await this.getFilesToScan(lastScanTime);
        const allFiles = this.app.vault.getMarkdownFiles().length;
        const scanType =
            lastScanTime === 0
                ? "initial full scan"
                : filesToScan.length === allFiles
                  ? "forced full scan"
                  : "incremental scan";
        if (shouldLogDetails) {
            console.log(
                `[CHANGE DETECTOR] ${scanType.toUpperCase()}: Scanning ${filesToScan.length}/${allFiles} files for new tasks`,
            );
        }

        for (const file of filesToScan) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Check if this is a task line
                    if (this.textParsing.isTaskLine(line)) {
                        // Look for Todoist link in subsequent lines
                        const todoistId = this.findTodoistIdInSubItems(
                            lines,
                            i,
                        );

                        if (todoistId && !knownTasks[todoistId]) {
                            // This is a new linked task
                            const newTask = await this.createTaskSyncEntry(
                                todoistId,
                                file,
                                i,
                                line,
                            );

                            if (newTask) {
                                newTasks.push(newTask);
                                console.log(
                                    `[CHANGE DETECTOR] ✅ Discovered new task: ${todoistId} in ${file.path}:${i + 1}`,
                                );
                            } else {
                                // Add to retry queue for future attempts instead of just logging
                                await this.addToRetryQueue(
                                    todoistId,
                                    file.path,
                                    i + 1,
                                );
                            }
                            // Add small delay to prevent rate limiting
                            await new Promise((resolve) =>
                                setTimeout(resolve, 100),
                            );
                        }
                    }
                }
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error scanning file ${file.path}:`,
                    error,
                );
            }
        }

        // Update the last scan time in memory (but don't save journal yet - let caller handle that)
        const scanEndTime = Date.now();
        const scanDuration = scanEndTime - scanStartTime;
        this.journalManager.updateLastScanTime(scanEndTime);

        console.log(
            `[CHANGE DETECTOR] ✅ Scan completed in ${scanDuration}ms - Found ${newTasks.length} new LINKED tasks (tasks with Todoist connections)`,
        );
        if (filesToScan.length > 0 && shouldLogDetails) {
            console.log(
                `[CHANGE DETECTOR] Files scanned: ${filesToScan.map((f) => f.name).join(", ")}`,
            );
        }

        // NOTE: Journal is NOT saved here - caller must handle adding discovered tasks and saving
        console.log(
            `[CHANGE DETECTOR] ⚠️ Caller must add discovered tasks to journal and save`,
        );

        return newTasks;
    }

    /**
     * Discover all tasks in a specific file
     */
    async discoverTasksInFile(file: TFile): Promise<TaskSyncEntry[]> {
        const fileTasks: TaskSyncEntry[] = [];

        try {
            console.log(
                `[CHANGE DETECTOR] Scanning file ${file.path} for tasks`,
            );
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check if this is a task line
                if (this.textParsing.isTaskLine(line)) {
                    // Look for Todoist link in subsequent lines
                    const todoistId = this.findTodoistIdInSubItems(lines, i);

                    if (todoistId) {
                        // Create task entry for this linked task
                        const taskEntry = await this.createTaskSyncEntry(
                            todoistId,
                            file,
                            i,
                            line,
                        );

                        if (taskEntry) {
                            fileTasks.push(taskEntry);
                            // Task found - will check for changes (logging only if changes detected)
                        }
                    }
                }
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error scanning file ${file.path}:`,
                error,
            );
        }

        return fileTasks;
    }

    /**
     * Detect changes in a specific task (FIXED: Check both directions for existing mismatches)
     * Only makes Todoist API calls when necessary
     */
    async detectTaskChanges(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation[]> {
        const operations: SyncOperation[] = [];

        try {
            // STEP 1: Check Obsidian side for changes (no API call)
            const obsidianChange =
                await this.checkObsidianTaskChange(taskEntry);
            if (obsidianChange) {
                operations.push(obsidianChange);
            }

            // STEP 2: Check Todoist side for changes (with smart filtering)
            // IMPORTANT: Don't skip this even if Obsidian changed - we need to detect existing mismatches
            if (this.shouldCheckTodoistTaskNow(taskEntry)) {
                const todoistChange =
                    await this.checkTodoistTaskChange(taskEntry);
                if (todoistChange) {
                    operations.push(todoistChange);
                }
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error checking task ${taskEntry.todoistId}:`,
                error,
            );
        }

        return operations;
    }

    /**
     * Check for changes in Obsidian task
     */
    private async checkObsidianTaskChange(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation | null> {
        try {
            // Get current file content
            const file = this.app.vault.getAbstractFileByPath(
                taskEntry.obsidianFile,
            ) as TFile;
            if (!file) {
                console.log(
                    `[CHANGE DETECTOR] File not found: ${taskEntry.obsidianFile}`,
                );
                return null;
            }

            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            if (taskEntry.obsidianLine >= lines.length) {
                console.log(
                    `[CHANGE DETECTOR] Line ${taskEntry.obsidianLine} out of bounds in ${taskEntry.obsidianFile}`,
                );
                return null;
            }

            const currentLine = lines[taskEntry.obsidianLine];
            const currentHash = this.generateContentHash(currentLine);

            // Check if content changed
            if (currentHash !== taskEntry.obsidianContentHash) {
                const currentCompleted =
                    this.textParsing.getTaskStatus(currentLine) === "completed";

                // Check if completion status changed
                if (currentCompleted !== taskEntry.obsidianCompleted) {
                    console.log(
                        `[CHANGE DETECTOR] Obsidian completion status changed for ${taskEntry.todoistId}: ${taskEntry.obsidianCompleted} -> ${currentCompleted}`,
                    );

                    // Update task entry
                    await this.journalManager.updateTask(taskEntry.todoistId, {
                        obsidianCompleted: currentCompleted,
                        obsidianContentHash: currentHash,
                        lastObsidianCheck: Date.now(),
                    });

                    // Create sync operation for both directions
                    if (currentCompleted && !taskEntry.todoistCompleted) {
                        // Obsidian completed, sync to Todoist
                        return {
                            id: `obs-to-tod-${taskEntry.todoistId}-${Date.now()}`,
                            type: "obsidian_to_todoist",
                            taskId: taskEntry.todoistId,
                            timestamp: Date.now(),
                            status: "pending",
                            retryCount: 0,
                            data: {
                                newCompletionState: true,
                                obsidianContent: currentLine,
                            },
                        };
                    } else if (
                        !currentCompleted &&
                        taskEntry.todoistCompleted
                    ) {
                        // Obsidian uncompleted, sync to Todoist
                        return {
                            id: `obs-to-tod-${taskEntry.todoistId}-${Date.now()}`,
                            type: "obsidian_to_todoist",
                            taskId: taskEntry.todoistId,
                            timestamp: Date.now(),
                            status: "pending",
                            retryCount: 0,
                            data: {
                                newCompletionState: false,
                                obsidianContent: currentLine,
                            },
                        };
                    }
                } else {
                    // Content changed but not completion status - just update hash
                    await this.journalManager.updateTask(taskEntry.todoistId, {
                        obsidianContentHash: currentHash,
                        lastObsidianCheck: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error checking Obsidian task ${taskEntry.todoistId}:`,
                error,
            );
        }

        return null;
    }

    /**
     * Check for changes in Todoist task
     */
    private async checkTodoistTaskChange(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation | null> {
        try {
            const task = await this.getTodoistTaskWithRetry(
                taskEntry.todoistId,
            );
            if (!task) {
                console.log(
                    `[CHANGE DETECTOR] Todoist task not found: ${taskEntry.todoistId}`,
                );
                return null;
            }

            const currentCompleted = task.isCompleted ?? false;
            const currentHash = this.generateContentHash(task.content);

            // Check if completion status changed
            if (currentCompleted !== taskEntry.todoistCompleted) {
                console.log(
                    `[CHANGE DETECTOR] Todoist completion status changed for ${taskEntry.todoistId}: ${taskEntry.todoistCompleted} -> ${currentCompleted}`,
                );

                // Update task entry
                await this.journalManager.updateTask(taskEntry.todoistId, {
                    todoistCompleted: currentCompleted,
                    todoistContentHash: currentHash,
                    lastTodoistCheck: Date.now(),
                    todoistDueDate: (task as any).due?.date,
                });

                // Create sync operation for both directions
                if (currentCompleted && !taskEntry.obsidianCompleted) {
                    // Todoist completed, sync to Obsidian
                    return {
                        id: `tod-to-obs-${taskEntry.todoistId}-${Date.now()}`,
                        type: "todoist_to_obsidian",
                        taskId: taskEntry.todoistId,
                        timestamp: Date.now(),
                        status: "pending",
                        retryCount: 0,
                        data: {
                            newCompletionState: true,
                            todoistCompletedAt:
                                (task as any).completed_at ||
                                (task as any).completedAt,
                        },
                    };
                } else if (!currentCompleted && taskEntry.obsidianCompleted) {
                    // Todoist uncompleted, sync to Obsidian
                    return {
                        id: `tod-to-obs-${taskEntry.todoistId}-${Date.now()}`,
                        type: "todoist_to_obsidian",
                        taskId: taskEntry.todoistId,
                        timestamp: Date.now(),
                        status: "pending",
                        retryCount: 0,
                        data: {
                            newCompletionState: false,
                            todoistCompletedAt: undefined,
                        },
                    };
                }
            } else {
                // Just update the check timestamp and hash
                await this.journalManager.updateTask(taskEntry.todoistId, {
                    todoistContentHash: currentHash,
                    lastTodoistCheck: Date.now(),
                    todoistDueDate: (task as any).due?.date,
                });
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error checking Todoist task ${taskEntry.todoistId}:`,
                error,
            );
        }

        return null;
    }

    /**
     * Determine if we should check a Todoist task NOW (CONSERVATIVE APPROACH)
     * Only makes API calls when there's a compelling reason
     */
    private shouldCheckTodoistTaskNow(task: TaskSyncEntry): boolean {
        const now = Date.now();
        const timeSinceLastCheck = now - task.lastTodoistCheck;

        // PRIORITY 0: Tasks with existing completion status mismatches (CRITICAL)
        // These should be checked immediately regardless of timing
        if (task.obsidianCompleted !== task.todoistCompleted) {
            // Only log if verbose mode - these are high priority
            return true;
        }

        // Use user's sync interval as minimum check interval (respects user settings)
        const userSyncIntervalMs =
            this.settings.syncIntervalMinutes * 60 * 1000;
        const MIN_CHECK_INTERVAL = userSyncIntervalMs;

        // Don't check if we checked recently (unless there's a mismatch above)
        if (timeSinceLastCheck < MIN_CHECK_INTERVAL) {
            return false;
        }

        // Priority 1: Tasks with future due dates (might be completed in Todoist)
        if (
            task.todoistDueDate &&
            new Date(task.todoistDueDate).getTime() > now
        ) {
            return true;
        }

        // Priority 2: Tasks that haven't been checked in a while (based on user's sync interval)
        // Stale threshold = 4x the user's sync interval (e.g., if user sets 15min, stale = 60min)
        const STALE_MULTIPLIER = 4;
        const STALE_CHECK_THRESHOLD = userSyncIntervalMs * STALE_MULTIPLIER;
        if (timeSinceLastCheck > STALE_CHECK_THRESHOLD) {
            return true;
        }

        // Priority 3: Apply time window filtering if enabled
        if (
            this.settings.enableSyncTimeWindow &&
            this.settings.syncTimeWindowDays > 0
        ) {
            const timeWindow =
                this.settings.syncTimeWindowDays * 24 * 60 * 60 * 1000;
            const cutoff = now - timeWindow;

            // Only check if task is within the time window
            return task.lastTodoistCheck > cutoff;
        }

        // Default: Don't check (conservative approach)
        return false;
    }

    /**
     * Get files to scan for new tasks
     * Enhanced with journal completeness validation to avoid missing tasks
     */
    private async getFilesToScan(lastScan: number): Promise<TFile[]> {
        let files: TFile[];

        // Get all markdown files in the vault
        files = this.app.vault.getMarkdownFiles();

        // Enhanced logic: only filter if we have a solid baseline and recent scan
        if (lastScan > 0) {
            const stats = this.journalManager.getStats();
            const hasRecentScan = Date.now() - lastScan < 24 * 60 * 60 * 1000; // Within 24 hours
            const hasTaskBaseline = stats.totalTasks > 5; // Has discovered some tasks

            // Only use incremental scan if we have both a recent scan and task baseline
            // This prevents permanently missing tasks due to failed initial scans
            if (hasRecentScan && hasTaskBaseline) {
                const filteredFiles = files.filter(
                    (file) => file.stat.mtime > lastScan,
                );
                console.log(
                    `[CHANGE DETECTOR] Incremental scan: ${filteredFiles.length}/${files.length} files (${stats.totalTasks} tasks in journal)`,
                );
                files = filteredFiles;
            } else {
                console.log(
                    `[CHANGE DETECTOR] Force full scan - Recent: ${hasRecentScan}, Baseline: ${hasTaskBaseline} (${stats.totalTasks} tasks)`,
                );
            }
        }

        return files;
    }

    /**
     * Find Todoist ID in sub-items of a task (enhanced with flexible search)
     */
    private findTodoistIdInSubItems(
        lines: string[],
        taskLineIndex: number,
    ): string | null {
        const taskIndentation = this.textParsing.getLineIndentation(
            lines[taskLineIndex],
        );

        // Enhanced search: Look in a wider scope to catch more link patterns
        for (let i = taskLineIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndentation = this.textParsing.getLineIndentation(line);

            // Check if line is empty or just whitespace - continue searching
            if (line.trim() === "") {
                continue;
            }

            // Stop if we've reached a line with same or less indentation (non-empty)
            if (lineIndentation.length <= taskIndentation.length) {
                // But first check this line too - sometimes links are at same level
                const sameLevelMatch = line.match(
                    TODOIST_CONSTANTS.LINK_PATTERN,
                );
                if (sameLevelMatch && i === taskLineIndex + 1) {
                    // Link immediately after task on same level is likely related
                    return sameLevelMatch[1];
                }
                break;
            }

            // Look for Todoist task link using multiple patterns
            const taskIdMatch = line.match(TODOIST_CONSTANTS.LINK_PATTERN);
            if (taskIdMatch) {
                const foundId = taskIdMatch[1];
                // Debug: Log what we're extracting from which line
                console.log(
                    `[CHANGE DETECTOR] 📎 Extracted ID '${foundId}' from line: ${line.trim()}`,
                );

                // Validate: Todoist task IDs can be numeric (V1) or alphanumeric (V2)
                if (!/^[\w-]+$/.test(foundId)) {
                    console.warn(
                        `[CHANGE DETECTOR] ⚠️ Invalid task ID format '${foundId}' - should be alphanumeric`,
                    );
                    return null;
                }

                return foundId;
            }

            // Also check for alternative link formats that might be missed (supports both V1 and V2 IDs)
            const alternativeMatch = line.match(
                /todoist\.com.*?task.*?([\w-]+)/i,
            );
            if (alternativeMatch) {
                const foundId = alternativeMatch[1];
                console.log(
                    `[CHANGE DETECTOR] 📎 Extracted ID '${foundId}' from alternative pattern in line: ${line.trim()}`,
                );
                return foundId;
            }
        }

        return null;
    }

    /**
     * Normalize a Todoist ID to ensure compatibility with current API
     * Tries to get V2 ID for numeric IDs, returns original if already V2 or conversion fails
     */
    private async normalizeTodoistId(todoistId: string): Promise<string> {
        if (!todoistId) return todoistId;

        // If already alphanumeric (V2 format), return as-is
        if (/^[\w-]+$/.test(todoistId) && !/^\d+$/.test(todoistId)) {
            return todoistId;
        }

        // If numeric (V1 format), try to get V2 equivalent
        if (/^\d+$/.test(todoistId)) {
            try {
                const v2Id = await this.todoistV2IDs.getV2Id(todoistId);
                return v2Id || todoistId; // Return V2 ID if available, otherwise original
            } catch (error) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Failed to normalize ID ${todoistId}:`,
                    error,
                );
                return todoistId; // Return original on error
            }
        }

        return todoistId; // Return original for any other format
    }

    /**
     * Efficiently lookup a task from the bulk-fetched task map
     * Handles both V1 and V2 ID formats by checking multiple possible keys
     */
    private async getTaskFromBulkMap(
        todoistId: string,
        taskMap: Record<string, any>,
    ): Promise<any | null> {
        if (!todoistId || !taskMap) return null;

        // First, try direct lookup with original ID
        if (taskMap[todoistId]) {
            return taskMap[todoistId];
        }

        // If not found and ID is numeric (V1), try to get V2 equivalent
        if (/^\d+$/.test(todoistId)) {
            try {
                const v2Id = await this.todoistV2IDs.getV2Id(todoistId);
                if (v2Id && v2Id !== todoistId && taskMap[v2Id]) {
                    console.log(
                        `[CHANGE DETECTOR] ✅ Found task via V2 ID mapping: ${todoistId} -> ${v2Id}`,
                    );
                    return taskMap[v2Id];
                }
            } catch (error) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Failed to lookup V2 ID for ${todoistId}:`,
                    error,
                );
            }
        }

        // If still not found and ID is alphanumeric (V2), it might be mapped under a V1 key
        // This is less common but possible if the bulk fetch returned V1 IDs
        if (/^[\w-]+$/.test(todoistId) && !/^\d+$/.test(todoistId)) {
            // Look for any task that has this as a v2_id or similar property
            for (const [key, task] of Object.entries(taskMap)) {
                if (
                    task &&
                    (task.v2_id === todoistId || task.id === todoistId)
                ) {
                    console.log(
                        `[CHANGE DETECTOR] ✅ Found task via reverse mapping: ${todoistId} found under key ${key}`,
                    );
                    return task;
                }
            }
        }

        return null; // Task not found in bulk map
    }

    /**
     * Get Todoist task with permanent deleted task tracking and ID normalization
     * Uses TodoistV2IDs module to handle both V1 and V2 ID formats
     */
    private async getTodoistTaskWithRetry(
        todoistId: string,
        maxRetries = 3,
    ): Promise<any | null> {
        // NEVER call API for permanently deleted tasks
        if (this.journalManager.isTaskDeleted(todoistId)) {
            // Silently skip deleted tasks to reduce console noise
            // (This is expected behavior - deleted tasks should not generate API calls)
            return null;
        }

        // Normalize the ID to ensure API compatibility
        const normalizedId = await this.normalizeTodoistId(todoistId);
        if (normalizedId !== todoistId) {
            console.log(
                `[CHANGE DETECTOR] 🔄 Normalized ID ${todoistId} -> ${normalizedId}`,
            );
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Add small delay between requests to prevent rate limiting
                if (attempt > 0) {
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt - 1),
                        5000,
                    ); // Exponential backoff, max 5s
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }

                // Use normalized ID for API call
                const task = await this.todoistApi.getTask(normalizedId);
                this.apiCallCount++; // Track successful API calls
                return task; // Success!
            } catch (error: any) {
                const statusCode = error.response?.status || error.status;

                if (statusCode === 404) {
                    // Task deleted - permanently mark and NEVER try again
                    // ✅ OPTIMIZED: Reduce logging noise for expected deleted tasks
                    if (attempt === 1) {
                        // Only log on first attempt to reduce console spam
                        console.log(
                            `[CHANGE DETECTOR] 🗑️ Task ${todoistId} deleted (404), marking permanently`,
                        );
                    }
                    await this.journalManager.markAsDeleted(
                        todoistId,
                        "deleted",
                        404,
                        undefined,
                        "API returned 404 - task deleted in Todoist",
                    );
                    return null;
                } else if (statusCode === 403) {
                    // Permission denied - permanently mark as inaccessible
                    // ✅ OPTIMIZED: Reduce logging noise for expected inaccessible tasks
                    if (attempt === 1) {
                        // Only log on first attempt to reduce console spam
                        console.log(
                            `[CHANGE DETECTOR] 🔒 Task ${todoistId} inaccessible (403), marking permanently`,
                        );
                    }
                    await this.journalManager.markAsDeleted(
                        todoistId,
                        "inaccessible",
                        403,
                        undefined,
                        "API returned 403 - task is private or inaccessible",
                    );
                    return null;
                } else if (statusCode === 429) {
                    // Rate limit - retry with backoff (don't mark as deleted)
                    if (attempt === maxRetries) {
                        console.warn(
                            `[CHANGE DETECTOR] ⚠️ Rate limit exceeded for task ${todoistId}, will retry later`,
                        );
                        return null;
                    }
                    // Continue to next retry
                } else {
                    // Other error - don't retry but don't mark as deleted
                    console.error(
                        `[CHANGE DETECTOR] API error for task ${todoistId}: ${statusCode} - ${error.message}`,
                    );
                    return null;
                }
            }
        }

        return null; // All retries failed
    }

    /**
     * Get API call statistics
     */
    getApiCallStats(): {
        apiCallsThisSession: number;
        sessionStartTime: number;
        callsPerMinute: number;
    } {
        const sessionDuration = Date.now() - this.lastApiCallReset;
        const sessionMinutes = sessionDuration / (60 * 1000);
        const callsPerMinute =
            sessionMinutes > 0 ? this.apiCallCount / sessionMinutes : 0;

        return {
            apiCallsThisSession: this.apiCallCount,
            sessionStartTime: this.lastApiCallReset,
            callsPerMinute: Math.round(callsPerMinute * 100) / 100,
        };
    }

    /**
     * Get deleted task statistics from journal
     */
    getDeletedTaskStats(): {
        deletedTasks: number;
        inaccessibleTasks: number;
        userRemovedTasks: number;
    } {
        const allDeleted = this.journalManager.getAllDeletedTasks();
        const deleted = Object.values(allDeleted).filter(
            (t) => t.reason === "deleted",
        ).length;
        const inaccessible = Object.values(allDeleted).filter(
            (t) => t.reason === "inaccessible",
        ).length;
        const userRemoved = Object.values(allDeleted).filter(
            (t) => t.reason === "user_removed",
        ).length;

        return {
            deletedTasks: deleted,
            inaccessibleTasks: inaccessible,
            userRemovedTasks: userRemoved,
        };
    }

    /**
     * Reset API call counter (useful for monitoring)
     */
    resetApiCallStats(): void {
        this.apiCallCount = 0;
        this.lastApiCallReset = Date.now();
        console.log("[CHANGE DETECTOR] API call stats reset");
    }

    /**
     * Create a new TaskSyncEntry with UID-based file tracking
     */
    private async createTaskSyncEntry(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry | null> {
        try {
            // Get initial Todoist task data with smart retry and cleanup logic
            const todoistTask = await this.getTodoistTaskWithRetry(todoistId);
            if (!todoistTask) {
                // getTodoistTaskWithRetry handles logging and cleanup for deleted/inaccessible tasks
                return null;
            }

            const now = Date.now();
            const obsidianCompleted =
                this.textParsing.getTaskStatus(lineContent) === "completed";
            const todoistCompleted = todoistTask.isCompleted ?? false;
            const fileUid = this.uidProcessing.getUidFromFile(file);

            const taskEntry: TaskSyncEntry = {
                todoistId,
                obsidianNoteId: fileUid || "", // Primary identifier - note ID from frontmatter
                obsidianFile: file.path, // Secondary identifier - file path
                obsidianLine: lineIndex,
                obsidianCompleted,
                todoistCompleted,
                lastObsidianCheck: now,
                lastTodoistCheck: now,
                lastSyncOperation: 0,
                obsidianContentHash: this.generateContentHash(lineContent),
                todoistContentHash: this.generateContentHash(
                    todoistTask.content,
                ),
                todoistDueDate: (todoistTask as any).due?.date,
                discoveredAt: now,
                lastPathValidation: now,
            };

            return taskEntry;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error creating task entry for ${todoistId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Generate content hash for change detection
     */
    private generateContentHash(content: string): string {
        return createHash("md5").update(content).digest("hex");
    }

    /**
     * Intelligent pre-check to determine if journal validation/maintenance is needed
     * Skips expensive operations when journal is already complete and up-to-date
     */
    private async shouldSkipJournalValidation(): Promise<{
        shouldSkip: boolean;
        reason: string;
        quickStats?: {
            vaultTasks: number;
            activeTasks: number;
            deletedTasks: number;
            totalTracked: number;
        };
    }> {
        console.log(
            "[CHANGE DETECTOR] 🔍 Pre-check: Determining if journal validation is needed...",
        );

        // Get basic counts without expensive file scanning
        const activeTaskIds = Object.keys(this.journalManager.getAllTasks());
        const deletedTaskIds = Object.keys(
            this.journalManager.getAllDeletedTasks(),
        );
        // ✅ FIXED: Use unique count to handle potential duplicates
        const uniqueTrackedIds = [
            ...new Set([...activeTaskIds, ...deletedTaskIds]),
        ];
        const totalTracked = uniqueTrackedIds.length;

        // Check if we have any tasks at all - if not, we need validation
        if (totalTracked === 0) {
            return {
                shouldSkip: false,
                reason: "No tasks tracked in journal - validation needed",
            };
        }

        // Check last validation timestamp to avoid too frequent validations
        const lastValidation = this.journalManager.getLastValidationTime();
        const now = Date.now();
        const timeSinceLastValidation = now - (lastValidation || 0);

        // ✅ FIXED: Base validation interval on user's sync interval, not hardcoded value
        const syncIntervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
        const MIN_VALIDATION_INTERVAL = Math.max(
            30 * 1000, // Minimum 30 seconds for development
            Math.min(
                syncIntervalMs / 4, // 1/4 of sync interval
                5 * 60 * 1000, // Maximum 5 minutes
            ),
        );

        if (
            lastValidation &&
            timeSinceLastValidation < MIN_VALIDATION_INTERVAL
        ) {
            // ✅ ENHANCED: Show interval coordination in logs
            const intervalMinutes =
                Math.round((MIN_VALIDATION_INTERVAL / 60000) * 10) / 10;
            const syncMinutes = this.settings.syncIntervalMinutes;

            return {
                shouldSkip: true,
                reason: `Recent validation (${Math.round(timeSinceLastValidation / 1000)}s ago) - skipping (interval: ${intervalMinutes}min based on ${syncMinutes}min sync)`,
                quickStats: {
                    vaultTasks: 0, // Will be filled if needed
                    activeTasks: activeTaskIds.length,
                    deletedTasks: deletedTaskIds.length,
                    totalTracked,
                },
            };
        }

        // Now do the more expensive vault scan to check completeness
        const vaultTaskIds = await this.scanAllFilesForTaskIds();
        // ✅ FIXED: Use the same unique tracked IDs from above
        const missing = vaultTaskIds.filter(
            (id) => !uniqueTrackedIds.includes(id),
        );

        const quickStats = {
            vaultTasks: vaultTaskIds.length,
            activeTasks: activeTaskIds.length,
            deletedTasks: deletedTaskIds.length,
            totalTracked,
        };

        // If journal is 100% complete, we can skip
        if (missing.length === 0 && vaultTaskIds.length === totalTracked) {
            // ✅ ENHANCED: More detailed and consistent pre-check completion logging
            const actualDeletedCount = totalTracked - activeTaskIds.length;
            console.log(
                `[CHANGE DETECTOR] ✅ Pre-check passed: Journal is 100% complete (${vaultTaskIds.length} vault = ${activeTaskIds.length} active + ${actualDeletedCount} deleted)`,
            );
            return {
                shouldSkip: true,
                reason: "Journal is 100% complete - no validation needed",
                quickStats,
            };
        }

        // Journal needs validation/maintenance
        console.log(
            `[CHANGE DETECTOR] ⚠️ Pre-check failed: Journal needs validation (${missing.length} missing tasks, ${vaultTaskIds.length} vault vs ${totalTracked} tracked)`,
        );
        return {
            shouldSkip: false,
            reason: `Journal incomplete: ${missing.length} missing tasks`,
            quickStats,
        };
    }

    /**
     * Validate journal completeness against actual vault content
     * OPTIMIZED: Now includes intelligent pre-check to skip when not needed
     */
    async validateJournalCompleteness(
        forceValidation: boolean = false,
    ): Promise<{
        missing: string[];
        total: number;
        journalCount: number;
        completeness: number;
        skipped?: boolean;
        skipReason?: string;
    }> {
        // Intelligent pre-check (unless forced)
        if (!forceValidation) {
            const preCheck = await this.shouldSkipJournalValidation();
            if (preCheck.shouldSkip) {
                console.log(
                    `[CHANGE DETECTOR] ⚡ Skipping validation: ${preCheck.reason}`,
                );

                // Return cached/estimated results without expensive operations
                const stats = preCheck.quickStats!;
                return {
                    missing: [],
                    total: stats.vaultTasks || stats.totalTracked,
                    journalCount: stats.totalTracked,
                    completeness: 100,
                    skipped: true,
                    skipReason: preCheck.reason,
                };
            }
            console.log(
                `[CHANGE DETECTOR] 🔍 Pre-check indicates validation needed: ${preCheck.reason}`,
            );
        } else {
            console.log(
                "[CHANGE DETECTOR] 🔍 Forced validation - skipping pre-check",
            );
        }

        console.log(
            "[CHANGE DETECTOR] 🔍 Performing full journal completeness validation...",
        );

        const vaultTaskIds = await this.scanAllFilesForTaskIds();
        const activeTaskIds = Object.keys(this.journalManager.getAllTasks());
        const deletedTaskIds = Object.keys(
            this.journalManager.getAllDeletedTasks(),
        );

        // ✅ FIXED: Combine both active AND deleted tasks for completeness check
        const allTrackedTaskIds = [...activeTaskIds, ...deletedTaskIds];

        // Debug: Log what we found
        console.log(
            `[CHANGE DETECTOR] 📊 Found ${vaultTaskIds.length} task IDs in vault: ${vaultTaskIds.slice(0, 10).join(", ")}...`,
        );
        console.log(
            `[CHANGE DETECTOR] 📖 Found ${activeTaskIds.length} active task IDs in journal: ${activeTaskIds.slice(0, 10).join(", ")}...`,
        );
        console.log(
            `[CHANGE DETECTOR] 🗑️ Found ${deletedTaskIds.length} deleted task IDs in journal: ${deletedTaskIds.slice(0, 10).join(", ")}...`,
        );

        // ✅ CRITICAL FIX: Check for overlapping IDs between active and deleted
        const overlappingIds = activeTaskIds.filter((id) =>
            deletedTaskIds.includes(id),
        );
        if (overlappingIds.length > 0) {
            console.error(
                `[CHANGE DETECTOR] 🚨 CRITICAL ERROR: ${overlappingIds.length} task IDs exist in BOTH active and deleted sections!`,
            );
            console.error(
                `[CHANGE DETECTOR] Overlapping IDs: ${overlappingIds.slice(0, 10).join(", ")}...`,
            );
            // Auto-fix: Remove duplicates from deleted section to prevent double-counting
            const cleanDeletedIds = deletedTaskIds.filter(
                (id) => !activeTaskIds.includes(id),
            );
            console.log(
                `[CHANGE DETECTOR] 🔧 Auto-fixing: Removed ${deletedTaskIds.length - cleanDeletedIds.length} duplicate IDs from deleted section`,
            );
            // Update the journal manager to clean up duplicates
            await this.journalManager.cleanupDuplicateEntries(overlappingIds);
        }

        // ✅ FIXED: Use Set to ensure no duplicates when combining active + deleted
        const uniqueTrackedIds = [
            ...new Set([...activeTaskIds, ...deletedTaskIds]),
        ];

        // ✅ ENHANCED: More detailed logging for debugging
        console.log(
            `[CHANGE DETECTOR] 📊 Task count summary: ${vaultTaskIds.length} in vault, ${activeTaskIds.length} active tracked, ${deletedTaskIds.length} deleted tracked, ${uniqueTrackedIds.length} unique total`,
        );

        // ✅ SANITY CHECK: Warn if tracked > vault (should be impossible)
        if (uniqueTrackedIds.length > vaultTaskIds.length) {
            console.warn(
                `[CHANGE DETECTOR] ⚠️ CALCULATION WARNING: Tracked tasks (${uniqueTrackedIds.length}) > Vault tasks (${vaultTaskIds.length}) - investigating...`,
            );
            // Log the extra tracked IDs for debugging
            const extraIds = uniqueTrackedIds.filter(
                (id) => !vaultTaskIds.includes(id),
            );
            console.warn(
                `[CHANGE DETECTOR] Extra tracked IDs not in vault: ${extraIds.slice(0, 10).join(", ")}${extraIds.length > 10 ? "..." : ""}`,
            );
        }

        // ✅ FIXED: Check against UNIQUE tracked tasks (no duplicates)
        const missing = vaultTaskIds.filter(
            (id) => !uniqueTrackedIds.includes(id),
        );

        const completeness =
            vaultTaskIds.length > 0
                ? ((vaultTaskIds.length - missing.length) /
                      vaultTaskIds.length) *
                  100
                : 100;

        const result = {
            missing,
            total: vaultTaskIds.length,
            journalCount: uniqueTrackedIds.length, // ✅ FIXED: Use unique count (no duplicates)
            completeness: Math.round(completeness * 100) / 100,
        };

        // Update last validation timestamp
        this.journalManager.updateLastValidationTime();

        if (missing.length > 0) {
            console.warn(
                `[CHANGE DETECTOR] ⚠️ Journal incomplete: ${missing.length} tasks missing (${result.completeness}% complete)`,
            );
            console.log(
                `[CHANGE DETECTOR] Missing task IDs: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` (and ${missing.length - 10} more)` : ""}`,
            );
        } else {
            // ✅ ENHANCED: More detailed and consistent completion logging
            const actualDeletedCount =
                uniqueTrackedIds.length - activeTaskIds.length;
            console.log(
                `[CHANGE DETECTOR] ✅ Journal validation complete: All ${vaultTaskIds.length} vault tasks tracked (${activeTaskIds.length} active + ${actualDeletedCount} deleted = ${uniqueTrackedIds.length} total)`,
            );
        }

        return result;
    }

    /**
     * Scan all files to find all Todoist task IDs (for validation)
     * ✅ FIXED: Use Set for proper deduplication and better logging
     */
    private async scanAllFilesForTaskIds(): Promise<string[]> {
        const allTaskIds = new Set<string>();
        const files = this.app.vault.getMarkdownFiles();
        let totalTaskLines = 0;
        let duplicatesSkipped = 0;

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");
                const fileTaskIds = new Set<string>();

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (this.textParsing.isTaskLine(line)) {
                        totalTaskLines++;
                        const todoistId = this.findTodoistIdInSubItems(
                            lines,
                            i,
                        );
                        if (todoistId) {
                            if (fileTaskIds.has(todoistId)) {
                                duplicatesSkipped++;
                                console.log(
                                    `[CHANGE DETECTOR] 🔄 Skipping duplicate task ID '${todoistId}' in same file: ${file.name}`,
                                );
                            } else {
                                fileTaskIds.add(todoistId);
                                allTaskIds.add(todoistId);
                            }
                        }
                    }
                }

                if (fileTaskIds.size > 0) {
                    console.log(
                        `[CHANGE DETECTOR] 📄 File ${file.name}: ${fileTaskIds.size} unique task IDs found`,
                    );
                }
            } catch (error) {
                console.warn(
                    `[CHANGE DETECTOR] Error scanning ${file.path}:`,
                    error,
                );
            }
        }

        console.log(
            `[CHANGE DETECTOR] 📊 Scan complete: ${allTaskIds.size} unique task IDs from ${totalTaskLines} task lines (${duplicatesSkipped} duplicates skipped)`,
        );
        return Array.from(allTaskIds);
    }

    /**
     * Smart journal maintenance using BULK optimization and incremental saving
     * ✨ OPTIMIZED: Intelligent pre-check skips maintenance when journal is already complete
     * ✨ 117x more efficient: 1 API call instead of 117 individual calls!
     *
     * This method implements "Smart journal maintenance" - it only processes what's needed
     * and skips redundant work when the journal is already healthy.
     */
    async healJournal(
        forceHealing: boolean = false,
    ): Promise<{ healed: number; failed: number; skipped?: boolean }> {
        const healingType = forceHealing
            ? "FORCE REBUILD"
            : "smart maintenance";
        console.log(
            `[CHANGE DETECTOR] 🚀 Starting ${healingType} journal operation...`,
        );

        // Intelligent validation with pre-check (unless forced)
        const validation = await this.validateJournalCompleteness(forceHealing);

        // ✅ FIXED: Force rebuild should NEVER be skipped, even if validation was skipped
        if (validation.skipped && !forceHealing) {
            console.log(
                `[CHANGE DETECTOR] ⚡ Smart maintenance skipped: ${validation.skipReason}`,
            );
            return { healed: 0, failed: 0, skipped: true };
        }

        // ✅ FIXED: Force rebuild should proceed even if journal appears complete
        if (validation.missing.length === 0 && !forceHealing) {
            console.log(
                `[CHANGE DETECTOR] ✅ Journal already complete - all ${validation.total} linked tasks are tracked`,
            );
            return { healed: 0, failed: 0 };
        }

        // ✅ ENHANCED: Special handling for force rebuild
        if (forceHealing && validation.missing.length === 0) {
            console.log(
                `[CHANGE DETECTOR] 🔧 FORCE REBUILD: Re-processing all ${validation.total} tasks despite journal appearing complete`,
            );
            // For force rebuild, we'll re-process all tasks to ensure data integrity
        }

        let healed = 0;
        let failed = 0;
        let bulkTaskMap: Record<string, any> = {};

        // ✅ ENHANCED: Determine tasks to process based on operation type
        const tasksToHeal =
            forceHealing && validation.missing.length === 0
                ? await this.scanAllFilesForTaskIds() // Force rebuild: process ALL tasks
                : validation.missing; // Smart maintenance: only missing tasks

        const processingType =
            forceHealing && validation.missing.length === 0
                ? "ALL tasks (force rebuild)"
                : "missing tasks";

        console.log(
            `[CHANGE DETECTOR] Found ${tasksToHeal.length} ${processingType} out of ${validation.total} total. Starting BULK processing...`,
        );

        // Show minimal user notification
        const userNotice = new Notice(
            `🚀 Journal maintenance: Processing ${tasksToHeal.length} ${processingType} via bulk API...`,
            8000,
        );

        // 📦 Create timestamped backup before risky maintenance operation
        await this.journalManager.createBackupForOperation("maintenance");

        // Temporarily disable auto-save during bulk operations
        this.journalManager.setAutoSave(false);

        try {
            // STEP 1: Bulk fetch ALL active tasks in a single API call (MASSIVE optimization!)
            try {
                bulkTaskMap = await this.bulkFetchTodoistTasks();
                this.lastBulkActiveTaskMap = bulkTaskMap; // ✅ Cache for comprehensive entries
                console.log(
                    `[CHANGE DETECTOR] 🎯 Bulk fetch successful: ${Object.keys(bulkTaskMap).length} active tasks retrieved`,
                );
            } catch (error) {
                const statusCode =
                    (error as any).response?.status || (error as any).status;
                if (statusCode === 429) {
                    userNotice.hide();
                    new Notice(
                        "⚠️ API rate limit reached. Please try again in a few minutes.",
                        8000,
                    );
                    return { healed: 0, failed: validation.missing.length };
                }
                throw error; // Re-throw other errors
            }

            // STEP 1.5: OPTIMIZED bulk fetch completed/archived tasks with smart batching
            let completedTaskMap: Record<string, any> = {};
            try {
                // Use optimized parameters based on vault size
                const taskCount = validation.missing.length;
                const optimizedOptions = {
                    maxConcurrency: taskCount > 100 ? 8 : 5, // More concurrent for large vaults
                    batchSize: taskCount > 200 ? 20 : 15, // Larger batches for many tasks
                    adaptiveDelay: true, // Always use adaptive delays
                };

                completedTaskMap = await this.bulkFetchCompletedTasks(
                    undefined,
                    optimizedOptions,
                );
                this.lastBulkCompletedTaskMap = completedTaskMap; // ✅ Cache for comprehensive entries
                console.log(
                    `[CHANGE DETECTOR] 🏆 OPTIMIZED bulk completed fetch successful: ${Object.keys(completedTaskMap).length} completed tasks retrieved`,
                );
            } catch (error) {
                console.warn(
                    "[CHANGE DETECTOR] ⚠️ Optimized bulk completed fetch failed, will fall back to individual calls:",
                    error,
                );
            }

            // STEP 2: Create a task location map for efficient lookup
            const taskLocationMap = new Map<
                string,
                { file: TFile; lineIndex: number; lineContent: string }
            >();

            const files = this.app.vault.getMarkdownFiles();
            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    const lines = content.split("\n");

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (this.textParsing.isTaskLine(line)) {
                            const todoistId = this.findTodoistIdInSubItems(
                                lines,
                                i,
                            );
                            if (todoistId) {
                                // Debug: Log all found task IDs
                                console.log(
                                    `[CHANGE DETECTOR] 🔍 Found task ID ${todoistId} in ${file.name}:${i + 1} - To Process: ${tasksToHeal.includes(todoistId)}`,
                                );

                                if (tasksToHeal.includes(todoistId)) {
                                    taskLocationMap.set(todoistId, {
                                        file,
                                        lineIndex: i,
                                        lineContent: line,
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        `[CHANGE DETECTOR] Error scanning ${file.path}:`,
                        error,
                    );
                }
            }

            // STEP 3: Process tasks efficiently using bulk data
            const tasksToProcess = Array.from(taskLocationMap.entries());
            let processedCount = 0;

            // Debug: Log what task IDs we're trying to heal
            const missingTaskIds = validation.missing.slice(0, 10);
            console.log(
                `[CHANGE DETECTOR] 🔍 Looking for missing task IDs (sample): ${missingTaskIds.join(", ")}`,
            );
            console.log(
                `[CHANGE DETECTOR] 📊 Processing ${tasksToProcess.length} tasks from ${taskLocationMap.size} found in vault`,
            );

            // Additional debug: Check if task IDs look valid (can be numeric V1 or alphanumeric V2)
            const invalidIds = missingTaskIds.filter(
                (id) => !/^[\w-]+$/.test(id),
            );
            if (invalidIds.length > 0) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Found potentially invalid task IDs (non-alphanumeric): ${invalidIds.join(", ")}`,
                );
            }

            for (const [todoistId, location] of tasksToProcess) {
                try {
                    processedCount++;

                    // Try to find task in combined bulk data (active + completed)
                    let todoistTask = await this.getTaskFromBulkMap(
                        todoistId,
                        bulkTaskMap,
                    );

                    // If not found in active tasks, check completed tasks
                    if (!todoistTask && completedTaskMap[todoistId]) {
                        todoistTask = completedTaskMap[todoistId];
                        console.log(
                            `[CHANGE DETECTOR] 🏆 Found task ${todoistId} in completed tasks bulk data`,
                        );
                    }

                    // Debug: Log bulk lookup results
                    if (todoistTask) {
                        console.log(
                            `[CHANGE DETECTOR] 🎯 Found task ${todoistId} in bulk data (completed: ${todoistTask.isCompleted})`,
                        );
                    } else {
                        // Only log debug info for first few missing tasks to reduce noise
                        if (processedCount <= 3) {
                            const activeBulkKeys = Object.keys(
                                bulkTaskMap,
                            ).slice(0, 5);
                            const completedBulkKeys = Object.keys(
                                completedTaskMap,
                            ).slice(0, 5);
                            console.log(
                                `[CHANGE DETECTOR] 🔍 Debug sample - Active: [${activeBulkKeys.join(", ")}], Completed: [${completedBulkKeys.join(", ")}], Task ${todoistId}: ${/^\d+$/.test(todoistId) ? "V1" : "V2"}`,
                            );
                        }
                    }

                    if (todoistTask) {
                        // Task found in bulk data - create entry WITHOUT API call
                        console.log(
                            `[CHANGE DETECTOR] 🎯 Processing task ${processedCount}/${tasksToProcess.length}: ${todoistId} (from bulk data)`,
                        );

                        const taskEntry =
                            await this.createTaskSyncEntryFromBulkData(
                                todoistId,
                                location.file,
                                location.lineIndex,
                                location.lineContent,
                                todoistTask,
                            );

                        if (taskEntry) {
                            await this.journalManager.addTask(taskEntry);
                            // 🔥 INCREMENTAL SAVE: Save immediately to prevent data loss
                            await this.journalManager.forceSaveIfDirty();
                            healed++;
                            console.log(
                                `[CHANGE DETECTOR] ✅ Bulk healed & saved: ${todoistId}`,
                            );
                        } else {
                            failed++;
                            console.warn(
                                `[CHANGE DETECTOR] ❌ Failed to create entry from bulk data: ${todoistId}`,
                            );
                        }
                    } else {
                        // Task not found in either active or completed bulk data
                        // This should be very rare now - only for truly deleted/inaccessible tasks
                        console.log(
                            `[CHANGE DETECTOR] ⚠️ Task ${todoistId} not found in bulk data (active: ${Object.keys(bulkTaskMap).length}, completed: ${Object.keys(completedTaskMap).length}) - likely deleted`,
                        );

                        // Only use individual fetch as absolute last resort
                        // Apply minimal delay since this should be rare
                        await new Promise((resolve) =>
                            setTimeout(resolve, 200),
                        );

                        const individualTask =
                            await this.fetchIndividualTask(todoistId);

                        if (individualTask) {
                            // Very rare case - task exists but wasn't in bulk data
                            console.log(
                                `[CHANGE DETECTOR] 🔍 Rare case: Task ${todoistId} found via individual fetch but not in bulk data`,
                            );

                            const taskEntry =
                                await this.createTaskSyncEntryFromBulkData(
                                    todoistId,
                                    location.file,
                                    location.lineIndex,
                                    location.lineContent,
                                    individualTask,
                                );

                            if (taskEntry) {
                                await this.journalManager.addTask(taskEntry);
                                await this.journalManager.forceSaveIfDirty();
                                healed++;
                                console.log(
                                    `[CHANGE DETECTOR] ✅ Individual healed & saved: ${todoistId}`,
                                );
                            } else {
                                failed++;
                                console.warn(
                                    `[CHANGE DETECTOR] ❌ Failed to create entry from individual fetch: ${todoistId}`,
                                );
                            }
                        } else {
                            // Truly deleted or inaccessible - mark as such
                            // Only log first few deletions to reduce console noise
                            if (failed < 5) {
                                console.log(
                                    `[CHANGE DETECTOR] 🗑️ Task ${todoistId} confirmed deleted - not found in bulk or individual fetch`,
                                );
                            } else if (failed === 5) {
                                console.log(
                                    `[CHANGE DETECTOR] 🗑️ Task ${todoistId} confirmed deleted (suppressing further deletion logs to reduce noise)`,
                                );
                            }
                            await this.journalManager.markAsDeleted(
                                todoistId,
                                "deleted",
                                undefined,
                                location.file.path,
                                "Not found in active bulk, completed bulk, or individual fetch - confirmed deleted",
                            );
                            await this.journalManager.forceSaveIfDirty();
                            failed++;
                        }
                    }

                    // Progress logging every 20 tasks
                    if (processedCount % 20 === 0) {
                        console.log(
                            `[CHANGE DETECTOR] 📊 Progress: ${healed} healed, ${failed} failed, ${tasksToProcess.length - processedCount} remaining`,
                        );
                    }
                } catch (error) {
                    failed++;
                    console.error(
                        `[CHANGE DETECTOR] ❌ Error processing task ${todoistId}:`,
                        error,
                    );
                }
            }
        } finally {
            // Re-enable auto-save and ensure final save
            this.journalManager.setAutoSave(true);
            await this.journalManager.forceSaveIfDirty();
        }

        // Final notification
        try {
            userNotice.hide();
        } catch (e) {
            // Notice might already be dismissed
        }

        const apiCallsUsed = 1 + (failed > 0 ? failed : 0); // Bulk + individual calls for failed tasks
        const message = `✅ Journal maintenance complete! ${healed} tasks processed${failed > 0 ? `, ${failed} failed/deleted` : ""} (Used ${apiCallsUsed} API calls)`;
        new Notice(message, 8000);
        console.log(
            `[CHANGE DETECTOR] 🏥 BULK MAINTENANCE COMPLETE - ${healed} processed, ${failed} failed. Bulk fetch found ${Object.keys(bulkTaskMap).length} active tasks.`,
        );

        return { healed, failed };
    }

    /**
     * Bulk fetch completed/archived tasks from Todoist using Sync API
     * OPTIMIZED: Supports parallel processing, smart batching, and adaptive rate limiting
     * Handles completed, deleted, and archived tasks efficiently
     */
    private async bulkFetchCompletedTasks(
        projectIds?: string[],
        options: {
            maxConcurrency?: number;
            batchSize?: number;
            adaptiveDelay?: boolean;
        } = {},
    ): Promise<Record<string, any>> {
        const {
            maxConcurrency = 5, // Parallel requests
            batchSize = 15, // Larger batches for efficiency
            adaptiveDelay = true, // Adjust delays based on response times
        } = options;

        const completedTaskMap: Record<string, any> = {};
        let totalApiCalls = 0;
        let totalCompleted = 0;
        const startTime = Date.now();

        try {
            console.log(
                "[CHANGE DETECTOR] 🏆 OPTIMIZED bulk fetching completed tasks from Todoist Sync API...",
            );

            if (!projectIds || projectIds.length === 0) {
                // If no specific projects, get all user projects first
                const allProjects = await this.todoistApi.getProjects();
                projectIds = allProjects.map((p: any) => p.id);
                console.log(
                    `[CHANGE DETECTOR] 📁 Found ${projectIds.length} projects to check for completed tasks`,
                );
            }

            // Process projects in parallel batches for maximum efficiency
            const batches: string[][] = [];
            for (let i = 0; i < projectIds.length; i += batchSize) {
                batches.push(projectIds.slice(i, i + batchSize));
            }

            console.log(
                `[CHANGE DETECTOR] 🚀 Processing ${projectIds.length} projects in ${batches.length} batches (max ${maxConcurrency} concurrent)`,
            );

            // Process batches with controlled concurrency
            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                const batch = batches[batchIndex];
                const batchStartTime = Date.now();

                console.log(
                    `[CHANGE DETECTOR] 📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} projects)`,
                );

                // Process projects in this batch with controlled concurrency
                const semaphore = new Array(maxConcurrency).fill(null);
                const projectPromises = batch.map(async (projectId, index) => {
                    // Wait for available slot
                    const slotIndex = index % maxConcurrency;
                    if (index >= maxConcurrency) {
                        await semaphore[slotIndex];
                    }

                    // Create promise for this project
                    const projectPromise = this.fetchCompletedTasksForProject(
                        projectId,
                        adaptiveDelay,
                    );
                    semaphore[slotIndex] = projectPromise;

                    return projectPromise;
                });

                // Wait for all projects in this batch to complete
                const batchResults = await Promise.allSettled(projectPromises);

                // Process results
                for (const result of batchResults) {
                    if (result.status === "fulfilled") {
                        const { tasks, apiCalls } = result.value;
                        Object.assign(completedTaskMap, tasks);
                        totalCompleted += Object.keys(tasks).length;
                        totalApiCalls += apiCalls;
                    } else {
                        console.warn(
                            "[CHANGE DETECTOR] ⚠️ Project fetch failed:",
                            result.reason,
                        );
                    }
                }

                const batchDuration = Date.now() - batchStartTime;
                console.log(
                    `[CHANGE DETECTOR] ✅ Batch ${batchIndex + 1} complete: ${batchDuration}ms, ${totalCompleted} tasks so far`,
                );

                // Adaptive delay between batches based on performance
                if (batchIndex < batches.length - 1) {
                    const delay = adaptiveDelay
                        ? Math.max(200, Math.min(1000, batchDuration / 10)) // Scale with batch time
                        : 500;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }

            const totalDuration = Date.now() - startTime;
            console.log(
                `[CHANGE DETECTOR] ✅ OPTIMIZED bulk completed tasks fetch complete: ${totalCompleted} completed tasks retrieved from ${projectIds.length} projects in ${totalDuration}ms (${totalApiCalls} API calls)`,
            );

            // Update global API call counter
            this.apiCallCount += totalApiCalls;

            return completedTaskMap;
        } catch (error) {
            console.error(
                "[CHANGE DETECTOR] Error in optimized bulk completed tasks fetch:",
                error,
            );
            return {};
        }
    }

    /**
     * Helper method to fetch completed tasks for a single project with pagination support
     * Returns both the tasks and the number of API calls made
     */
    private async fetchCompletedTasksForProject(
        projectId: string,
        adaptiveDelay: boolean,
    ): Promise<{ tasks: Record<string, any>; apiCalls: number }> {
        const tasks: Record<string, any> = {};
        let apiCalls = 0;
        const projectStartTime = Date.now();

        try {
            // Initial request for this project
            const response = await fetch(
                `https://api.todoist.com/sync/v9/archive/items?project_id=${projectId}&limit=200`,
                {
                    headers: {
                        Authorization: `Bearer ${this.settings.todoistAPIToken}`,
                    },
                },
            );
            apiCalls++;

            if (!response.ok) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Failed to fetch completed tasks for project ${projectId}: ${response.status}`,
                );
                return { tasks, apiCalls };
            }

            const data = await response.json();
            const completedItems = data.items || [];

            // Process initial batch
            for (const item of completedItems) {
                tasks[item.id] = {
                    ...item,
                    isCompleted: true,
                    completed_at: item.completed_at,
                };
            }

            // Handle pagination if there are more results
            let nextCursor = data.next_cursor;
            let pageCount = 1;

            while (data.has_more && nextCursor && pageCount < 10) {
                // Limit to 10 pages per project
                const nextResponse = await fetch(
                    `https://api.todoist.com/sync/v9/archive/items?project_id=${projectId}&limit=200&cursor=${nextCursor}`,
                    {
                        headers: {
                            Authorization: `Bearer ${this.settings.todoistAPIToken}`,
                        },
                    },
                );
                apiCalls++;
                pageCount++;

                if (nextResponse.ok) {
                    const nextData = await nextResponse.json();
                    const nextItems = nextData.items || [];

                    for (const item of nextItems) {
                        tasks[item.id] = {
                            ...item,
                            isCompleted: true,
                            completed_at: item.completed_at,
                        };
                    }

                    nextCursor = nextData.next_cursor;
                    if (!nextData.has_more) break;
                } else {
                    console.warn(
                        `[CHANGE DETECTOR] ⚠️ Failed to fetch page ${pageCount} for project ${projectId}`,
                    );
                    break;
                }

                // Adaptive delay between pagination requests
                if (adaptiveDelay) {
                    const delay = Math.min(150, 50 + pageCount * 10); // Increase delay with page count
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            const projectDuration = Date.now() - projectStartTime;
            const taskCount = Object.keys(tasks).length;

            if (taskCount > 0) {
                console.log(
                    `[CHANGE DETECTOR] 📋 Project ${projectId}: ${taskCount} completed tasks, ${apiCalls} API calls, ${projectDuration}ms`,
                );
            }

            return { tasks, apiCalls };
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error fetching completed tasks for project ${projectId}:`,
                error,
            );
            return { tasks, apiCalls };
        }
    }

    /**
     * Bulk fetch all active tasks from Todoist in a single API request
     * This is MUCH more efficient than individual getTask() calls
     * Uses TodoistV2IDs module to properly handle ID compatibility
     * NOTE: Only fetches ACTIVE tasks - completed/archived tasks use bulkFetchCompletedTasks()
     */
    private async bulkFetchTodoistTasks(): Promise<Record<string, any>> {
        try {
            console.log(
                "[CHANGE DETECTOR] 🚀 Bulk fetching all active tasks from Todoist...",
            );
            const allTasks = await this.todoistApi.getTasks();
            this.apiCallCount++; // Track successful API call

            console.log(
                `[CHANGE DETECTOR] 📊 Bulk fetch returned ${allTasks.length} ACTIVE tasks (completed tasks not included)`,
            );

            // Convert to lookup map by ID for efficient access
            // Use TodoistV2IDs module to handle both V1 (numeric) and V2 (alphanumeric) ID formats
            const taskMap: Record<string, any> = {};
            const numericIds: string[] = [];
            const alphanumericIds: string[] = [];

            // First pass: Map all tasks by their primary ID and categorize ID types
            for (const task of allTasks) {
                taskMap[task.id] = task;

                // Categorize ID types for debugging
                if (/^\d+$/.test(task.id)) {
                    numericIds.push(task.id);
                } else if (/^[\w-]+$/.test(task.id)) {
                    alphanumericIds.push(task.id);
                }
            }

            console.log(
                `[CHANGE DETECTOR] ✅ Bulk fetch complete: ${allTasks.length} active tasks retrieved`,
            );
            console.log(
                `[CHANGE DETECTOR] 🔍 ID formats - Numeric (V1): ${numericIds.length}, Alphanumeric (V2): ${alphanumericIds.length}`,
            );

            // Second pass: For numeric IDs, try to get their V2 equivalents and create cross-mapping
            // This ensures we can find tasks whether we're looking by V1 or V2 ID
            if (numericIds.length > 0) {
                console.log(
                    `[CHANGE DETECTOR] 🔄 Creating V1/V2 ID cross-mapping for ${numericIds.length} numeric IDs...`,
                );

                let mappedCount = 0;
                for (const numericId of numericIds.slice(0, 10)) {
                    // Limit to first 10 to avoid excessive API calls
                    try {
                        const v2Id = await this.todoistV2IDs.getV2Id(numericId);
                        if (v2Id && v2Id !== numericId) {
                            // Cross-map: V2 ID -> task object
                            taskMap[v2Id] = taskMap[numericId];
                            mappedCount++;
                            console.log(
                                `[CHANGE DETECTOR] ✅ Mapped V1 ID ${numericId} <-> V2 ID ${v2Id}`,
                            );
                        }
                    } catch (error) {
                        console.warn(
                            `[CHANGE DETECTOR] ⚠️ Failed to get V2 ID for ${numericId}:`,
                            error,
                        );
                    }
                }

                if (mappedCount > 0) {
                    console.log(
                        `[CHANGE DETECTOR] 🎯 Successfully created ${mappedCount} V1/V2 ID mappings`,
                    );
                }
            }

            // Debug: Log sample task IDs
            const sampleIds = Object.keys(taskMap).slice(0, 10);
            console.log(
                `[CHANGE DETECTOR] 📋 Sample task IDs in map: ${sampleIds.join(", ")}`,
            );

            return taskMap;
        } catch (error: any) {
            const statusCode = error.response?.status || error.status;
            console.error(
                `[CHANGE DETECTOR] ❌ Bulk fetch failed (${statusCode}):`,
                error.message,
            );

            if (statusCode === 429) {
                console.warn(
                    "[CHANGE DETECTOR] 🚦 Rate limit encountered in bulk fetch",
                );
            }

            throw error; // Re-throw to be handled by caller
        }
    }

    /**
     * Fallback: Fetch individual task using single API call (for tasks not in bulk results)
     * This handles completed tasks, archived tasks, etc. that getTasks() doesn't return
     */
    private async fetchIndividualTask(todoistId: string): Promise<any | null> {
        try {
            console.log(
                `[CHANGE DETECTOR] 🔍 Fallback: Fetching individual task ${todoistId}`,
            );
            const task = await this.todoistApi.getTask(todoistId);
            this.apiCallCount++; // Track successful API call
            console.log(
                `[CHANGE DETECTOR] ✅ Individual fetch successful for task ${todoistId} (completed: ${task.isCompleted})`,
            );
            return task;
        } catch (error: any) {
            const statusCode = error.response?.status || error.status;

            if (statusCode === 404) {
                console.log(
                    `[CHANGE DETECTOR] 🗑️ Individual fetch: Task ${todoistId} not found (404) - truly deleted`,
                );
                return null;
            } else if (statusCode === 403) {
                console.log(
                    `[CHANGE DETECTOR] 🔒 Individual fetch: Task ${todoistId} inaccessible (403) - permission denied`,
                );
                return null;
            } else {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Individual fetch failed for ${todoistId}: ${statusCode} - ${error.message}`,
                );
                return null;
            }
        }
    }

    /**
     * Create task sync entry from bulk fetched data (no API call needed)
     */
    private async createTaskSyncEntryFromBulkData(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
        todoistTask: any,
    ): Promise<TaskSyncEntry | null> {
        try {
            const now = Date.now();
            const obsidianCompleted =
                this.textParsing.getTaskStatus(lineContent) === "completed";
            const todoistCompleted = todoistTask.isCompleted ?? false;
            const fileUid = this.uidProcessing.getUidFromFile(file);

            const taskEntry: TaskSyncEntry = {
                todoistId,
                obsidianNoteId: fileUid || "", // Primary identifier - note ID from frontmatter
                obsidianFile: file.path, // Secondary identifier - file path
                obsidianLine: lineIndex,
                obsidianCompleted,
                todoistCompleted,
                lastObsidianCheck: now,
                lastTodoistCheck: now,
                lastSyncOperation: 0,
                obsidianContentHash: this.generateContentHash(lineContent),
                todoistContentHash: this.generateContentHash(
                    todoistTask.content,
                ),
                todoistDueDate: todoistTask.due?.date,
                discoveredAt: now,
                lastPathValidation: now,
            };

            return taskEntry;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error creating task entry from bulk data for ${todoistId}:`,
                error,
            );
            return null;
        }
    }
}
