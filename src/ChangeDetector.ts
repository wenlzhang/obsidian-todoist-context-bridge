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

export class ChangeDetector {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private textParsing: TextParsing;
    private todoistApi: TodoistApi;
    private journalManager: SyncJournalManager;
    private uidProcessing: UIDProcessing;

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
            const summary = [];
            if (result.newTasks.length > 0)
                summary.push(`${result.newTasks.length} new tasks`);
            if (result.operations.length > 0)
                summary.push(`${result.operations.length} sync operations`);

            if (summary.length > 0) {
                console.log(
                    `[CHANGE DETECTOR] ✅ Found: ${summary.join(", ")} (checked ${checkedTasks} tasks in ${duration}ms)`,
                );
            } else {
                console.log(
                    `[CHANGE DETECTOR] ✅ No changes detected (checked ${checkedTasks} tasks in ${duration}ms)`,
                );
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
            `[CHANGE DETECTOR] Scan completed in ${scanDuration}ms - Found ${newTasks.length} new tasks`,
        );
        if (filesToScan.length > 0) {
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
     * Get Todoist task with smart retry logic and deleted task handling
     */
    private async getTodoistTaskWithRetry(
        todoistId: string,
        maxRetries = 3,
    ): Promise<any | null> {
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
                return task;
            } catch (error: any) {
                const statusCode = error.response?.status || error.status;

                if (statusCode === 404) {
                    // Task deleted or doesn't exist - remove from journal
                    console.log(
                        `[CHANGE DETECTOR] 🗑️ Task ${todoistId} no longer exists (404), removing from journal`,
                    );
                    await this.journalManager.removeTask(todoistId);
                    return null;
                } else if (statusCode === 429) {
                    // Rate limit - retry with backoff
                    if (attempt === maxRetries) {
                        console.warn(
                            `[CHANGE DETECTOR] ⚠️ Rate limit exceeded for task ${todoistId}, will retry later`,
                        );
                        return null;
                    }
                    // Continue to next retry
                } else if (statusCode === 403) {
                    // Permission denied - task may be private
                    console.log(
                        `[CHANGE DETECTOR] 🔒 Task ${todoistId} access denied (403), removing from journal`,
                    );
                    await this.journalManager.removeTask(todoistId);
                    return null;
                } else {
                    // Other error - don't retry but log
                    console.error(
                        `[CHANGE DETECTOR] API error for task ${todoistId}: ${statusCode} - ${error.message}`,
                    );
                    return null;
                }
            }
        }
        return null;
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
     * Auto-heal journal by discovering and adding missing tasks
     */
    async healJournal(): Promise<{ healed: number; failed: number }> {
        console.log("[CHANGE DETECTOR] 🔧 Attempting to heal journal...");

        const validation = await this.validateJournalCompleteness();
        if (validation.missing.length === 0) {
            console.log(
                "[CHANGE DETECTOR] ✅ Journal already complete, no healing needed",
            );
            return { healed: 0, failed: 0 };
        }

        let healed = 0;
        let failed = 0;

        // Temporarily disable auto-save for bulk operations
        this.journalManager.setAutoSave(false);

        try {
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

                            if (
                                todoistId &&
                                validation.missing.includes(todoistId)
                            ) {
                                console.log(
                                    `[CHANGE DETECTOR] 🔧 Healing missing task: ${todoistId}`,
                                );

                                const newTask = await this.createTaskSyncEntry(
                                    todoistId,
                                    file,
                                    i,
                                    line,
                                );

                                if (newTask) {
                                    await this.journalManager.addTask(newTask);
                                    healed++;
                                } else {
                                    failed++;
                                    console.warn(
                                        `[CHANGE DETECTOR] ❌ Failed to heal task: ${todoistId}`,
                                    );
                                }

                                // Small delay to prevent API rate limiting
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 200),
                                );
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        `[CHANGE DETECTOR] Error healing tasks in ${file.path}:`,
                        error,
                    );
                }
            }
        } finally {
            // Re-enable auto-save and force save
            this.journalManager.setAutoSave(true);
            await this.journalManager.forceSaveIfDirty();
        }

        console.log(
            `[CHANGE DETECTOR] 🏥 Journal healing complete: ${healed} tasks healed, ${failed} failed`,
        );

        return { healed, failed };
    }

    /**
     * Validate and correct file path using note ID if file was moved
     * @unused Currently not used but kept for future file tracking improvements
     */
    private validateAndCorrectFilePath(entry: TaskSyncEntry): TFile | null {
        // First, try the current path
        let file = this.app.vault.getAbstractFileByPath(entry.obsidianFile);
        if (file instanceof TFile) {
            return file; // Path is still valid
        }

        // If path is invalid and we have a note ID, try to find file by note ID
        if (entry.obsidianNoteId) {
            file = this.uidProcessing.findFileByUid(entry.obsidianNoteId);
            if (file instanceof TFile) {
                // Update the path in the entry
                entry.obsidianFile = file.path;
                entry.lastPathValidation = Date.now();
                console.log(
                    `[CHANGE DETECTOR] ✅ Corrected file path using note ID: ${entry.obsidianNoteId} -> ${file.path}`,
                );
                return file;
            }
        }

        console.warn(
            `[CHANGE DETECTOR] ⚠️ Could not locate file for task ${entry.todoistId}. Path: ${entry.obsidianFile}, Note ID: ${entry.obsidianNoteId || "none"}`,
        );
        return null;
    }
}
