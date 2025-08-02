import { App, TFile, moment, Notice } from "obsidian";
import { TodoistApi, Task } from "@doist/todoist-api-typescript";
import { TodoistContextBridgeSettings } from "./Settings";
import { TodoistTaskSync, TodoistTaskInfo } from "./TodoistTaskSync";
import { TextParsing } from "./TextParsing";
import { NotificationHelper } from "./NotificationHelper";
import { TODOIST_CONSTANTS } from "./constants";

/**
 * Interface for tracking task sync state
 */
interface TaskSyncState {
    todoistId: string;
    obsidianFile: string;
    obsidianLine: number;
    lastSyncTimestamp: number;
    todoistCompleted: boolean;
    obsidianCompleted: boolean;
}

/**
 * Service for bidirectional task completion sync between Obsidian and Todoist
 */
export class BidirectionalSyncService {
    private syncInterval: number | null = null;
    private taskSyncStates: Map<string, TaskSyncState> = new Map();
    private lastFullSyncTimestamp: number = 0;
    private textParsing: TextParsing;
    private notificationHelper: NotificationHelper;

    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi,
        private todoistTaskSync: TodoistTaskSync,
    ) {
        this.textParsing = new TextParsing(settings);
        this.notificationHelper = new NotificationHelper(settings);
    }

    /**
     * Start the bidirectional sync service
     */
    start(): void {
        if (this.syncInterval) {
            this.stop();
        }

        if (!this.settings.enableBidirectionalSync) {
            return;
        }

        console.log(
            `Starting bidirectional sync with ${this.settings.syncIntervalMinutes} minute interval`,
        );

        // Perform initial sync
        this.performSync();

        // Set up periodic sync
        this.syncInterval = window.setInterval(
            () => this.performSync(),
            this.settings.syncIntervalMinutes * 60 * 1000,
        );
    }

    /**
     * Stop the bidirectional sync service
     */
    stop(): void {
        if (this.syncInterval) {
            window.clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log("Stopped bidirectional sync service");
        }
    }

    /**
     * Perform a sync operation
     */
    private async performSync(): Promise<void> {
        try {
            console.log("Performing bidirectional sync...");

            // Get files to sync based on scope
            const filesToSync = await this.getFilesToSync();

            // Collect all linked tasks from Obsidian
            const obsidianTasks = await this.collectObsidianTasks(filesToSync);

            // Get Todoist tasks that are linked to Obsidian
            const todoistTasks = await this.getTodoistTasks(obsidianTasks);

            // Sync completion status in both directions
            await this.syncCompletionStatus(obsidianTasks, todoistTasks);

            this.lastFullSyncTimestamp = Date.now();
            console.log("Bidirectional sync completed successfully");
        } catch (error) {
            console.error("Error during bidirectional sync:", error);
            this.notificationHelper.showError(
                "Bidirectional sync failed. Check console for details.",
            );
        }
    }

    /**
     * Get files to sync based on settings
     */
    private async getFilesToSync(): Promise<TFile[]> {
        if (this.settings.syncScope === "current-file") {
            const activeFile = this.app.workspace.getActiveFile();
            return activeFile ? [activeFile] : [];
        } else {
            // Get all markdown files
            return this.app.vault.getMarkdownFiles();
        }
    }

    /**
     * Collect all tasks with Todoist links from Obsidian files
     */
    private async collectObsidianTasks(
        files: TFile[],
    ): Promise<
        Array<{
            file: TFile;
            line: number;
            content: string;
            todoistId: string | null;
            isCompleted: boolean;
        }>
    > {
        const tasks: Array<{
            file: TFile;
            line: number;
            content: string;
            todoistId: string | null;
            isCompleted: boolean;
        }> = [];

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Check if this is a task line
                    if (this.textParsing.isTaskLine(line)) {
                        const isCompleted =
                            this.textParsing.getTaskStatus(line) === "completed";

                        // Look for Todoist link in subsequent lines
                        const todoistId = this.findTodoistIdInSubItems(
                            lines,
                            i,
                        );

                        tasks.push({
                            file,
                            line: i,
                            content: line,
                            todoistId,
                            isCompleted,
                        });
                    }
                }
            } catch (error) {
                console.error(`Error reading file ${file.path}:`, error);
            }
        }

        return tasks;
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
     * Get Todoist tasks that are linked to Obsidian
     */
    private async getTodoistTasks(
        obsidianTasks: Array<{
            todoistId: string | null;
        }>,
    ): Promise<Map<string, Task>> {
        const todoistTasks = new Map<string, Task>();
        const todoistIds = obsidianTasks
            .map((task) => task.todoistId)
            .filter((id): id is string => id !== null);

        // Get all Todoist tasks (we'll filter for linked ones)
        try {
            const allTasks = await this.todoistApi.getTasks();

            // Filter for tasks that are linked to Obsidian
            for (const task of allTasks) {
                if (todoistIds.includes(task.id)) {
                    todoistTasks.set(task.id, task);
                }
            }
        } catch (error) {
            console.error("Error fetching Todoist tasks:", error);
            throw error;
        }

        return todoistTasks;
    }

    /**
     * Sync completion status between Obsidian and Todoist
     */
    private async syncCompletionStatus(
        obsidianTasks: Array<{
            file: TFile;
            line: number;
            content: string;
            todoistId: string | null;
            isCompleted: boolean;
        }>,
        todoistTasks: Map<string, Task>,
    ): Promise<void> {
        for (const obsidianTask of obsidianTasks) {
            if (!obsidianTask.todoistId) continue;

            const todoistTask = todoistTasks.get(obsidianTask.todoistId);
            if (!todoistTask) continue;

            const todoistCompleted = todoistTask.isCompleted ?? false;
            const obsidianCompleted = obsidianTask.isCompleted;

            // Skip if both are in sync
            if (todoistCompleted === obsidianCompleted) {
                continue;
            }

            // Determine which direction to sync based on last modification
            // For now, we'll use a simple heuristic: if one is completed and the other isn't,
            // sync the completed status to the incomplete one
            try {
                if (todoistCompleted && !obsidianCompleted) {
                    // Sync completion from Todoist to Obsidian
                    await this.syncCompletionToObsidian(
                        obsidianTask.file,
                        obsidianTask.line,
                        obsidianTask.content,
                    );
                } else if (!todoistCompleted && obsidianCompleted) {
                    // Sync completion from Obsidian to Todoist
                    await this.syncCompletionToTodoist(obsidianTask.todoistId);
                }
            } catch (error) {
                console.error(
                    `Error syncing task ${obsidianTask.todoistId}:`,
                    error,
                );
                // Continue with other tasks
            }
        }
    }

    /**
     * Sync completion status from Todoist to Obsidian
     */
    private async syncCompletionToObsidian(
        file: TFile,
        lineIndex: number,
        currentContent: string,
    ): Promise<void> {
        try {
            const fileContent = await this.app.vault.read(file);
            const lines = fileContent.split("\n");

            // Update the task line to completed status
            let updatedLine = this.markTaskAsCompleted(currentContent);

            // Add completion timestamp if enabled
            if (this.settings.enableCompletionTimestamp) {
                updatedLine = this.addCompletionTimestamp(updatedLine);
            }

            // Update the file
            lines[lineIndex] = updatedLine;
            await this.app.vault.modify(file, lines.join("\n"));

            console.log(
                `Synced completion from Todoist to Obsidian: ${file.path}:${lineIndex + 1}`,
            );
        } catch (error) {
            console.error("Error syncing completion to Obsidian:", error);
            throw error;
        }
    }

    /**
     * Sync completion status from Obsidian to Todoist
     */
    private async syncCompletionToTodoist(todoistId: string): Promise<void> {
        try {
            await this.todoistApi.closeTask(todoistId);
            console.log(`Synced completion from Obsidian to Todoist: ${todoistId}`);
        } catch (error) {
            console.error("Error syncing completion to Todoist:", error);
            throw error;
        }
    }

    /**
     * Mark a task line as completed
     */
    private markTaskAsCompleted(line: string): string {
        // Replace [ ] with [x] or [X]
        return line.replace(/^(\s*[-*+]\s*)\[\s*\](\s*.*)$/, "$1[x]$2");
    }

    /**
     * Add completion timestamp to a task line (similar to Task Marker)
     */
    private addCompletionTimestamp(line: string): string {
        // Check if timestamp already exists to avoid duplicates
        if (line.includes("✅") || line.includes("Completed:")) {
            return line;
        }

        // Handle block references
        const blockRefMatch = line.match(/^(.*?)(\s*\^[A-Za-z0-9-]+)?(\s*)$/);
        let mainContent = line;
        let blockRef = "";
        let trailingSpaces = "";

        if (blockRefMatch) {
            mainContent = blockRefMatch[1];
            blockRef = blockRefMatch[2] || "";
            trailingSpaces = blockRefMatch[3] || "";
        }

        // Add timestamp before block reference
        const timestamp = (window as any).moment().format(this.settings.completionTimestampFormat);
        const updatedLine = `${mainContent.trimEnd()} ${timestamp}${blockRef}${trailingSpaces}`;

        return updatedLine;
    }

    /**
     * Update settings and restart if needed
     */
    updateSettings(newSettings: TodoistContextBridgeSettings): void {
        const wasRunning = this.syncInterval !== null;
        const intervalChanged =
            this.settings.syncIntervalMinutes !== newSettings.syncIntervalMinutes;

        this.settings = newSettings;
        this.textParsing = new TextParsing(newSettings);
        this.notificationHelper = new NotificationHelper(newSettings);

        // Restart if running and interval changed
        if (wasRunning && intervalChanged && this.settings.enableBidirectionalSync) {
            this.stop();
            this.start();
        }
    }
}
