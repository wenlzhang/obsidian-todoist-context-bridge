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
import { TodoistApi, Task } from "@doist/todoist-api-typescript";
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
     * Perform comprehensive change detection
     */
    async detectChanges(): Promise<ChangeDetectionResult> {
        const result: ChangeDetectionResult = {
            newTasks: [],
            modifiedTasks: [],
            operations: [],
        };

        console.log("[CHANGE DETECTOR] Starting change detection...");

        try {
            // 1. Discover new tasks in Obsidian
            result.newTasks = await this.discoverNewTasks();

            // 1a. Add newly discovered tasks to journal (critical for journal integrity)
            if (result.newTasks.length > 0) {
                console.log(
                    `[CHANGE DETECTOR] Adding ${result.newTasks.length} new tasks to journal...`,
                );
                for (const task of result.newTasks) {
                    await this.journalManager.addTask(task);
                }
                // Save journal with new tasks and updated scan time
                await this.journalManager.saveJournal();
                console.log(
                    `[CHANGE DETECTOR] Journal updated with new tasks and scan time`,
                );
            } else {
                // Even if no new tasks, save the updated scan time
                await this.journalManager.saveJournal();
                console.log(
                    `[CHANGE DETECTOR] Journal updated with scan time (no new tasks)`,
                );
            }

            // 2. Detect changes in known tasks (including newly added ones)
            const knownTasks = this.journalManager.getAllTasks();
            for (const [taskId, taskEntry] of Object.entries(knownTasks)) {
                const changes = await this.detectTaskChanges(taskEntry);
                if (changes.length > 0) {
                    result.operations.push(...changes);
                    result.modifiedTasks.push(taskEntry);
                }
            }

            console.log(
                `[CHANGE DETECTOR] Found ${result.newTasks.length} new tasks, ${result.modifiedTasks.length} modified tasks, ${result.operations.length} operations`,
            );
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
        console.log(
            `[CHANGE DETECTOR] ${isInitialScan ? "Initial" : "Incremental"} scan starting...`,
        );
        if (!isInitialScan) {
            console.log(
                `[CHANGE DETECTOR] Last scan: ${new Date(lastScanTime).toISOString()}`,
            );
        }

        // Get files to scan (only modified files for efficiency)
        const filesToScan = await this.getFilesToScan(lastScanTime);
        console.log(
            `[CHANGE DETECTOR] Scanning ${filesToScan.length} files for new tasks (${isInitialScan ? "all files" : "modified since last scan"})`,
        );

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
                                    `[CHANGE DETECTOR] Discovered new task: ${todoistId} in ${file.path}:${i + 1}`,
                                );
                                // Add small delay to prevent rate limiting
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 100),
                                );
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
            console.log(
                `[CHANGE DETECTOR] 🔄 Priority check for mismatched task ${task.todoistId}: Obsidian=${task.obsidianCompleted}, Todoist=${task.todoistCompleted}`,
            );
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
     */
    private async getFilesToScan(lastScan: number): Promise<TFile[]> {
        let files: TFile[];

        // Get all markdown files in the vault
        files = this.app.vault.getMarkdownFiles();

        // Filter by modification time for efficiency
        if (lastScan > 0) {
            files = files.filter((file) => file.stat.mtime > lastScan);
        }

        return files;
    }

    /**
     * Find Todoist ID in sub-items of a task
     */
    private findTodoistIdInSubItems(
        lines: string[],
        taskLineIndex: number,
    ): string | null {
        const taskIndentation = this.textParsing.getLineIndentation(
            lines[taskLineIndex],
        );

        // Check subsequent lines with deeper indentation
        for (let i = taskLineIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndentation = this.textParsing.getLineIndentation(line);

            // Stop if we've reached a line with same or less indentation
            if (lineIndentation.length <= taskIndentation.length) {
                break;
            }

            // Look for Todoist task link
            const taskIdMatch = line.match(TODOIST_CONSTANTS.LINK_PATTERN);
            if (taskIdMatch) {
                return taskIdMatch[1];
            }
        }

        return null;
    }

    /**
     * Get Todoist task with retry logic and rate limiting
     */
    private async getTodoistTaskWithRetry(
        todoistId: string,
        maxRetries: number = 3,
    ): Promise<any | null> {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Add small delay between requests to prevent rate limiting
                if (attempt > 0) {
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt - 1),
                        5000,
                    ); // Exponential backoff, max 5s
                    console.log(
                        `[CHANGE DETECTOR] Rate limit retry ${attempt}/${maxRetries} for task ${todoistId}, waiting ${delay}ms...`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }

                const task = await this.todoistApi.getTask(todoistId);
                return task;
            } catch (error: any) {
                if (error.message?.includes("429") || error.status === 429) {
                    console.warn(
                        `[CHANGE DETECTOR] Rate limit hit for task ${todoistId} (attempt ${attempt + 1}/${maxRetries + 1})`,
                    );

                    if (attempt === maxRetries) {
                        console.error(
                            `[CHANGE DETECTOR] Max retries exceeded for task ${todoistId}, skipping...`,
                        );
                        return null;
                    }
                    // Continue to next retry
                } else {
                    // Non-rate-limit error, don't retry
                    console.error(
                        `[CHANGE DETECTOR] API error for task ${todoistId}:`,
                        error,
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
            // Get initial Todoist task data with rate limiting and retry logic
            const todoistTask = await this.getTodoistTaskWithRetry(todoistId);
            if (!todoistTask) {
                console.log(
                    `[CHANGE DETECTOR] Could not fetch Todoist task: ${todoistId}`,
                );
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
     * Validate and correct file path using note ID if file was moved
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
