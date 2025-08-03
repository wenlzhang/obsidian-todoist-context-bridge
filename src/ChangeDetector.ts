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

            // 2. Detect changes in known tasks
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
        const journal = this.journalManager.getAllTasks();
        const lastScan =
            Object.keys(journal).length > 0
                ? Math.max(
                      ...Object.values(journal).map(
                          (task) => task.lastObsidianCheck,
                      ),
                  )
                : 0;

        console.log("[CHANGE DETECTOR] Scanning for new tasks...");

        // Get files to scan (only modified files for efficiency)
        const filesToScan = await this.getFilesToScan(lastScan);
        console.log(
            `[CHANGE DETECTOR] Scanning ${filesToScan.length} files for new tasks`,
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

        return newTasks;
    }

    /**
     * Detect changes in a specific task
     */
    async detectTaskChanges(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation[]> {
        const operations: SyncOperation[] = [];

        try {
            // Check Obsidian side for changes
            const obsidianChange =
                await this.checkObsidianTaskChange(taskEntry);
            if (obsidianChange) {
                operations.push(obsidianChange);
            }

            // Check Todoist side for changes (with smart filtering)
            if (this.shouldCheckTodoistTask(taskEntry)) {
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

                    // Create sync operation
                    if (currentCompleted && !taskEntry.todoistCompleted) {
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
            const task = await this.todoistApi.getTask(taskEntry.todoistId);
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

                // Create sync operation
                if (currentCompleted && !taskEntry.obsidianCompleted) {
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
     * Determine if we should check a Todoist task (smart filtering)
     */
    private shouldCheckTodoistTask(task: TaskSyncEntry): boolean {
        const now = Date.now();

        // Always check if task has future due date
        if (
            task.todoistDueDate &&
            new Date(task.todoistDueDate).getTime() > now
        ) {
            return true;
        }

        // Check if within time window
        if (
            !this.settings.enableSyncTimeWindow ||
            this.settings.syncTimeWindowDays === 0
        ) {
            return true; // No time window filtering
        }

        const timeWindow =
            this.settings.syncTimeWindowDays * 24 * 60 * 60 * 1000;
        const cutoff = now - timeWindow;

        return task.lastTodoistCheck > cutoff;
    }

    /**
     * Get files to scan for new tasks
     */
    private async getFilesToScan(lastScan: number): Promise<TFile[]> {
        let files: TFile[];

        if (this.settings.syncScope === "current-file") {
            const activeFile = this.app.workspace.getActiveFile();
            files = activeFile ? [activeFile] : [];
        } else {
            files = this.app.vault.getMarkdownFiles();
        }

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
     * Create a new TaskSyncEntry with UID-based file tracking
     */
    private async createTaskSyncEntry(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry | null> {
        try {
            // Get initial Todoist task data
            const todoistTask = await this.todoistApi.getTask(todoistId);
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
