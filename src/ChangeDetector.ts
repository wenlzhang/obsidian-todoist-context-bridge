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

    // API call tracking for monitoring
    private apiCallCount = 0;
    private lastApiCallReset = Date.now();

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

            // 1a. Add newly discovered tasks to journal (critical for journal integrity)
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
                                // Log failed discoveries for debugging
                                console.warn(
                                    `[CHANGE DETECTOR] ⚠️ Failed to create task entry for ${todoistId} in ${file.path}:${i + 1} - API error or rate limiting`,
                                );
                                // TODO: Add to retry queue for future attempts
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
                return taskIdMatch[1];
            }

            // Also check for alternative link formats that might be missed
            const alternativeMatch = line.match(/todoist\.com.*?task.*?(\d+)/i);
            if (alternativeMatch) {
                return alternativeMatch[1];
            }
        }

        return null;
    }

    /**
     * Get Todoist task with permanent deleted task tracking - NEVER retry deleted tasks
     */
    private async getTodoistTaskWithRetry(
        todoistId: string,
        maxRetries = 3,
    ): Promise<any | null> {
        // NEVER call API for permanently deleted tasks
        if (this.journalManager.isTaskDeleted(todoistId)) {
            const deletedEntry = this.journalManager.getDeletedTask(todoistId);
            console.log(
                `[CHANGE DETECTOR] ⏭️ Skipping permanently deleted task ${todoistId} (${deletedEntry?.reason})`,
            );
            return null;
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

                const task = await this.todoistApi.getTask(todoistId);
                this.apiCallCount++; // Track successful API calls
                return task; // Success!
            } catch (error: any) {
                const statusCode = error.response?.status || error.status;

                if (statusCode === 404) {
                    // Task deleted - permanently mark and NEVER try again
                    console.log(
                        `[CHANGE DETECTOR] 🗑️ Task ${todoistId} deleted (404), marking permanently`,
                    );
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
                    console.log(
                        `[CHANGE DETECTOR] 🔒 Task ${todoistId} inaccessible (403), marking permanently`,
                    );
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
     * Validate journal completeness against actual vault content
     */
    async validateJournalCompleteness(): Promise<{
        missing: string[];
        total: number;
        journalCount: number;
        completeness: number;
    }> {
        console.log("[CHANGE DETECTOR] 🔍 Validating journal completeness...");

        const vaultTaskIds = await this.scanAllFilesForTaskIds();
        const journalTaskIds = Object.keys(this.journalManager.getAllTasks());

        const missing = vaultTaskIds.filter(
            (id) => !journalTaskIds.includes(id),
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
            journalCount: journalTaskIds.length,
            completeness: Math.round(completeness * 100) / 100,
        };

        if (missing.length > 0) {
            console.warn(
                `[CHANGE DETECTOR] ⚠️ Journal incomplete: ${missing.length} tasks missing (${result.completeness}% complete)`,
            );
            console.log(`[CHANGE DETECTOR] Missing task IDs:`, missing);
        } else {
            console.log(
                `[CHANGE DETECTOR] ✅ Journal complete: All ${vaultTaskIds.length} linked tasks tracked`,
            );
        }

        return result;
    }

    /**
     * Scan all files to find all Todoist task IDs (for validation)
     */
    private async scanAllFilesForTaskIds(): Promise<string[]> {
        const allTaskIds: string[] = [];
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
                        if (todoistId && !allTaskIds.includes(todoistId)) {
                            allTaskIds.push(todoistId);
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

        return allTaskIds;
    }

    /**
     * Auto-heal journal using BULK optimization and incremental saving
     * ✨ 117x more efficient: 1 API call instead of 117 individual calls!
     */
    async healJournal(): Promise<{ healed: number; failed: number }> {
        console.log("[CHANGE DETECTOR] 🚀 Starting optimized journal healing...");

        const validation = await this.validateJournalCompleteness();
        if (validation.missing.length === 0) {
            console.log(
                `[CHANGE DETECTOR] ✅ Journal already complete - all ${validation.total} linked tasks are tracked`,
            );
            return { healed: 0, failed: 0 };
        }

        let healed = 0;
        let failed = 0;
        let bulkTaskMap: Record<string, any> = {};
        
        console.log(
            `[CHANGE DETECTOR] Found ${validation.missing.length} missing tasks out of ${validation.total} total. Starting BULK healing...`,
        );
        
        // Show minimal user notification
        const userNotice = new Notice(
            `🚀 Optimized healing: Processing ${validation.missing.length} tasks via bulk API...`,
            8000
        );

        // 📦 Create timestamped backup before risky healing operation
        await this.journalManager.createBackupForOperation("healing");

        // Temporarily disable auto-save during bulk operations
        this.journalManager.setAutoSave(false);

        try {
            // STEP 1: Bulk fetch ALL active tasks in a single API call (MASSIVE optimization!)
            try {
                bulkTaskMap = await this.bulkFetchTodoistTasks();
                console.log(`[CHANGE DETECTOR] 🎯 Bulk fetch successful: ${Object.keys(bulkTaskMap).length} active tasks retrieved`);
            } catch (error) {
                const statusCode = (error as any).response?.status || (error as any).status;
                if (statusCode === 429) {
                    userNotice.hide();
                    new Notice("⚠️ API rate limit reached. Please try again in a few minutes.", 8000);
                    return { healed: 0, failed: validation.missing.length };
                }
                throw error; // Re-throw other errors
            }

            // STEP 2: Create a task location map for efficient lookup
            const taskLocationMap = new Map<string, { file: TFile; lineIndex: number; lineContent: string }>();
            
            const files = this.app.vault.getMarkdownFiles();
            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    const lines = content.split("\n");

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (this.textParsing.isTaskLine(line)) {
                            const todoistId = this.findTodoistIdInSubItems(lines, i);
                            if (todoistId && validation.missing.includes(todoistId)) {
                                taskLocationMap.set(todoistId, {
                                    file,
                                    lineIndex: i,
                                    lineContent: line
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`[CHANGE DETECTOR] Error scanning ${file.path}:`, error);
                }
            }

            // STEP 3: Process tasks efficiently using bulk data
            const tasksToProcess = Array.from(taskLocationMap.entries());
            let processedCount = 0;
            
            for (const [todoistId, location] of tasksToProcess) {
                try {
                    processedCount++;
                    
                    // Check if task exists in bulk data (active task)
                    const todoistTask = bulkTaskMap[todoistId];
                    
                    if (todoistTask) {
                        // Task found in bulk data - create entry WITHOUT API call
                        console.log(`[CHANGE DETECTOR] 🎯 Healing task ${processedCount}/${tasksToProcess.length}: ${todoistId} (from bulk data)`);
                        
                        const taskEntry = await this.createTaskSyncEntryFromBulkData(
                            todoistId,
                            location.file,
                            location.lineIndex,
                            location.lineContent,
                            todoistTask
                        );
                        
                        if (taskEntry) {
                            await this.journalManager.addTask(taskEntry);
                            // 🔥 INCREMENTAL SAVE: Save immediately to prevent data loss
                            await this.journalManager.forceSaveIfDirty();
                            healed++;
                            console.log(`[CHANGE DETECTOR] ✅ Bulk healed & saved: ${todoistId}`);
                        } else {
                            failed++;
                            console.warn(`[CHANGE DETECTOR] ❌ Failed to create entry from bulk data: ${todoistId}`);
                        }
                    } else {
                        // Task NOT in bulk data - likely deleted or inaccessible
                        // Mark as deleted to avoid future API calls
                        console.log(`[CHANGE DETECTOR] 🗑️ Task ${todoistId} not in active tasks - marking as deleted`);
                        await this.journalManager.markAsDeleted(
                            todoistId,
                            "deleted",
                            undefined,
                            location.file.path,
                            "Not found in bulk getTasks() response - likely deleted"
                        );
                        // Save the deletion immediately
                        await this.journalManager.forceSaveIfDirty();
                        failed++;
                    }
                    
                    // Progress logging every 20 tasks
                    if (processedCount % 20 === 0) {
                        console.log(`[CHANGE DETECTOR] 📊 Progress: ${healed} healed, ${failed} failed, ${tasksToProcess.length - processedCount} remaining`);
                    }
                    
                } catch (error) {
                    failed++;
                    console.error(`[CHANGE DETECTOR] ❌ Error processing task ${todoistId}:`, error);
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

        const message = `✅ Optimized healing complete! ${healed} tasks healed${failed > 0 ? `, ${failed} failed/deleted` : ""} (Used ${Object.keys(bulkTaskMap).length > 0 ? '1 bulk API call' : '0 API calls'})`;
        new Notice(message, 8000);
        console.log(`[CHANGE DETECTOR] 🏥 BULK HEALING COMPLETE - ${healed} healed, ${failed} failed using bulk optimization!`);

        return { healed, failed };
    }

    /**
     * Bulk fetch all active tasks from Todoist in a single API request
     * This is MUCH more efficient than individual getTask() calls
     */
    private async bulkFetchTodoistTasks(): Promise<Record<string, any>> {
        try {
            console.log("[CHANGE DETECTOR] 🚀 Bulk fetching all active tasks from Todoist...");
            const allTasks = await this.todoistApi.getTasks();
            this.apiCallCount++; // Track successful API call
            
            // Convert to lookup map by ID for efficient access
            const taskMap: Record<string, any> = {};
            for (const task of allTasks) {
                taskMap[task.id] = task;
            }
            
            console.log(`[CHANGE DETECTOR] ✅ Bulk fetch complete: ${allTasks.length} active tasks retrieved`);
            return taskMap;
        } catch (error: any) {
            const statusCode = error.response?.status || error.status;
            console.error(`[CHANGE DETECTOR] ❌ Bulk fetch failed (${statusCode}):`, error.message);
            
            if (statusCode === 429) {
                console.warn("[CHANGE DETECTOR] 🚦 Rate limit encountered in bulk fetch");
            }
            
            throw error; // Re-throw to be handled by caller
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
        todoistTask: any
    ): Promise<TaskSyncEntry | null> {
        try {
            const now = Date.now();
            const obsidianCompleted = this.textParsing.getTaskStatus(lineContent) === "completed";
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
                todoistContentHash: this.generateContentHash(todoistTask.content),
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

    /**
     * Safely create task sync entry with proper error handling and rate limit detection
     */
    private async safeCreateTaskSyncEntry(
        todoistId: string,
        file: any,
        lineIndex: number,
        lineContent: string,
    ): Promise<{
        success: boolean;
        task?: TaskSyncEntry;
        rateLimited?: boolean;
        deleted?: boolean;
        error?: string;
    }> {
        try {
            const task = await this.createTaskSyncEntry(
                todoistId,
                file,
                lineIndex,
                lineContent,
            );

            if (task) {
                return { success: true, task };
            } else {
                // Check if task was deleted/removed from journal during createTaskSyncEntry
                const existsInJournal =
                    this.journalManager.getTaskByTodoistId(todoistId);
                if (!existsInJournal) {
                    return { success: false, deleted: true };
                }
                return { success: false, error: "Unknown API error" };
            }
        } catch (error: any) {
            const statusCode = error.response?.status || error.status;

            if (statusCode === 429) {
                return { success: false, rateLimited: true };
            } else if (statusCode === 404 || statusCode === 403) {
                return { success: false, deleted: true };
            } else {
                return {
                    success: false,
                    error: error.message || "Unknown error",
                };
            }
        }
    }
}
