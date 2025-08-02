import { App, TFile, moment, Notice } from "obsidian";
import { TodoistApi, Task } from "@doist/todoist-api-typescript";
import { TodoistContextBridgeSettings } from "./Settings";
import { TodoistTaskSync, TodoistTaskInfo } from "./TodoistTaskSync";
import { TextParsing } from "./TextParsing";
import { NotificationHelper } from "./NotificationHelper";
import { TodoistV2IDs } from "./TodoistV2IDs";
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
    private todoistV2IDs: TodoistV2IDs;

    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi,
        private todoistTaskSync: TodoistTaskSync,
    ) {
        this.textParsing = new TextParsing(settings);
        this.notificationHelper = new NotificationHelper(settings);
        this.todoistV2IDs = new TodoistV2IDs(settings);
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
            console.log("[BIDIRECTIONAL SYNC] 🔄 Starting sync operation...");

            // Get files to sync based on scope
            const filesToSync = await this.getFilesToSync();
            console.log(
                `[BIDIRECTIONAL SYNC] 📁 Found ${filesToSync.length} files to sync`,
            );

            // OPTIMIZATION: Collect only linked tasks from Obsidian (filter out tasks without Todoist links)
            const obsidianTasks = await this.collectObsidianTasks(filesToSync);
            console.log(
                `[BIDIRECTIONAL SYNC] 📝 Collected ${obsidianTasks.length} Obsidian tasks with Todoist links`,
            );

            // OPTIMIZATION: Get only Todoist tasks that are linked to Obsidian (both completed and incomplete)
            const todoistTasks = await this.getTodoistTasks(obsidianTasks);
            console.log(
                `[BIDIRECTIONAL SYNC] ✅ Retrieved ${todoistTasks.size} Todoist tasks`,
            );

            // Sync completion status in both directions
            await this.syncCompletionStatus(obsidianTasks, todoistTasks);

            this.lastFullSyncTimestamp = Date.now();
            console.log(
                "[BIDIRECTIONAL SYNC] ✅ Sync operation completed successfully",
            );
        } catch (error) {
            console.error("[BIDIRECTIONAL SYNC] ❌ Error during sync:", error);
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
     * Collect tasks with Todoist links from Obsidian files (OPTIMIZED: only linked tasks)
     */
    private async collectObsidianTasks(files: TFile[]): Promise<
        Array<{
            file: TFile;
            line: number;
            content: string;
            todoistId: string;
            isCompleted: boolean;
        }>
    > {
        const tasks: Array<{
            file: TFile;
            line: number;
            content: string;
            todoistId: string;
            isCompleted: boolean;
        }> = [];

        console.log(
            `[OBSIDIAN TASKS] Scanning ${files.length} files for tasks with Todoist links...`,
        );
        let totalTasksFound = 0;
        let linkedTasksFound = 0;

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Check if this is a task line
                    if (this.textParsing.isTaskLine(line)) {
                        totalTasksFound++;

                        // Look for Todoist link in subsequent lines
                        const todoistId = this.findTodoistIdInSubItems(
                            lines,
                            i,
                        );

                        // OPTIMIZATION: Only include tasks that have valid Todoist links
                        if (todoistId) {
                            const isCompleted =
                                this.textParsing.getTaskStatus(line) ===
                                "completed";

                            tasks.push({
                                file,
                                line: i,
                                content: line,
                                todoistId,
                                isCompleted,
                            });
                            linkedTasksFound++;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error reading file ${file.path}:`, error);
            }
        }

        console.log(
            `[OBSIDIAN TASKS] Found ${totalTasksFound} total tasks, ${linkedTasksFound} with Todoist links`,
        );
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
     * Get Todoist tasks that are linked to Obsidian (OPTIMIZED: fetch only linked tasks, both completed and incomplete)
     */
    private async getTodoistTasks(
        obsidianTasks: Array<{
            todoistId: string;
        }>,
    ): Promise<Map<string, Task>> {
        const todoistTasks = new Map<string, Task>();

        // Extract unique Todoist IDs (obsidianTasks already filtered to only include tasks with valid todoistId)
        const uniqueTodoistIds = [
            ...new Set(obsidianTasks.map((task) => task.todoistId)),
        ];

        console.log(
            `[TODOIST API] Fetching ${uniqueTodoistIds.length} unique Todoist tasks (optimized)`,
        );

        if (uniqueTodoistIds.length === 0) {
            console.log(`[TODOIST API] No Todoist IDs to fetch`);
            return todoistTasks;
        }

        // OPTIMIZATION: Fetch each task individually by ID (gets both completed and incomplete tasks)
        // The REST API getTasks() only returns active tasks, but getTask(id) returns any task
        let fetchedCount = 0;
        let errorCount = 0;

        try {
            for (const todoistId of uniqueTodoistIds) {
                try {
                    let task: Task | null = null;

                    // Try to fetch the task by its current ID (could be v1 or v2)
                    try {
                        task = await this.todoistApi.getTask(todoistId);
                        console.log(
                            `[TODOIST API] ✅ ${todoistId} - "${task.content}" (completed: ${task.isCompleted})`,
                        );
                    } catch (taskError: any) {
                        // If direct fetch fails, try ID conversion
                        if (taskError?.httpStatusCode === 404) {
                            // Check if this is a v2 ID that needs conversion to v1
                            if (/[a-zA-Z]/.test(todoistId)) {
                                // This looks like a v2 ID, but we need to find the corresponding v1 ID
                                // Unfortunately, we can't reverse-lookup v2->v1, so we'll skip this for now
                                console.log(
                                    `[TODOIST API] ⚠️ Cannot reverse-lookup v2 ID ${todoistId}`,
                                );
                                continue;
                            } else {
                                // This is a v1 ID, try getting its v2 equivalent
                                const v2Id =
                                    await this.todoistV2IDs.getV2Id(todoistId);
                                if (v2Id !== todoistId) {
                                    try {
                                        task =
                                            await this.todoistApi.getTask(v2Id);
                                        console.log(
                                            `[TODOIST API] ✅ ${todoistId}->${v2Id} - "${task.content}" (completed: ${task.isCompleted})`,
                                        );
                                    } catch (v2Error) {
                                        console.log(
                                            `[TODOIST API] ❌ Failed to fetch ${todoistId} with both IDs`,
                                        );
                                        continue;
                                    }
                                }
                            }
                        } else {
                            throw taskError;
                        }
                    }

                    if (task) {
                        // Store the task using both its original ID and any converted IDs
                        todoistTasks.set(todoistId, task);
                        todoistTasks.set(task.id, task); // Store with the actual API ID too

                        // Also try to get the v2 ID and store with that
                        const v2Id = await this.todoistV2IDs.getV2Id(task.id);
                        if (v2Id !== task.id) {
                            todoistTasks.set(v2Id, task);
                        }

                        fetchedCount++;
                    }
                } catch (error: any) {
                    errorCount++;
                    if (error?.httpStatusCode === 404) {
                        console.log(
                            `[TODOIST API] ⚠️ Task ${todoistId} not found (may be deleted)`,
                        );
                    } else {
                        console.error(
                            `[TODOIST API] ❌ Error fetching task ${todoistId}:`,
                            error.message || error,
                        );
                    }
                }
            }

            console.log(
                `[TODOIST API] ✅ Successfully fetched ${fetchedCount}/${uniqueTodoistIds.length} tasks (${errorCount} errors)`,
            );
        } catch (error) {
            console.error("[TODOIST API] ❌ Error in getTodoistTasks:", error);
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
            todoistId: string;
            isCompleted: boolean;
        }>,
        todoistTasks: Map<string, Task>,
    ): Promise<void> {
        for (const obsidianTask of obsidianTasks) {
            const todoistTask = todoistTasks.get(obsidianTask.todoistId);
            if (!todoistTask) continue;

            const todoistCompleted = todoistTask.isCompleted ?? false;
            const obsidianCompleted = obsidianTask.isCompleted;

            // Skip if both are in sync
            if (todoistCompleted === obsidianCompleted) {
                continue;
            }

            // Determine which direction to sync
            try {
                if (todoistCompleted && !obsidianCompleted) {
                    // Sync completion from Todoist to Obsidian
                    await this.syncCompletionToObsidian(
                        obsidianTask.file,
                        obsidianTask.line,
                        obsidianTask.content,
                        todoistTask,
                    );
                } else if (!todoistCompleted && obsidianCompleted) {
                    // Sync completion from Obsidian to Todoist
                    // ALSO pass Obsidian file info for timestamp handling
                    await this.syncCompletionToTodoist(
                        obsidianTask.todoistId,
                        obsidianTask.file,
                        obsidianTask.line,
                        obsidianTask.content,
                    );
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
     * Note: When a task is marked as completed in Todoist, we sync the completion status
     * to Obsidian AND add a completion timestamp (if enabled), since Todoist doesn't
     * show completion timestamps visibly to users.
     */
    private async syncCompletionToObsidian(
        file: TFile,
        lineIndex: number,
        currentContent: string,
        todoistTask: Task,
    ): Promise<void> {
        try {
            const fileContent = await this.app.vault.read(file);
            const lines = fileContent.split("\n");

            // Update the task line to completed status
            let updatedLine = this.markTaskAsCompleted(currentContent);

            // Add completion timestamp if enabled (since Todoist doesn't show completion times)
            if (this.settings.enableCompletionTimestamp) {
                // Try to get completion timestamp from Todoist task
                // Note: The current REST API may not provide completed_at, but we'll check for it
                const todoistCompletedAt =
                    (todoistTask as any).completed_at ||
                    (todoistTask as any).completedAt;
                updatedLine = this.addCompletionTimestamp(
                    updatedLine,
                    todoistCompletedAt,
                );
            }

            // Update the file
            lines[lineIndex] = updatedLine;
            await this.app.vault.modify(file, lines.join("\n"));

            console.log(
                `✅ Synced completion from Todoist to Obsidian: ${file.path}:${lineIndex + 1}`,
            );
            console.log(
                `[SYNC DIRECTION] Todoist → Obsidian: ${this.settings.enableCompletionTimestamp ? "Timestamp added" : "No timestamp (disabled in settings)"}`,
            );
        } catch (error) {
            console.error("Error syncing completion to Obsidian:", error);
            throw error;
        }
    }

    /**
     * Sync completion status from Obsidian to Todoist
     * Note: When a user marks a task as completed in Obsidian, we only sync the completion
     * status to Todoist. We do NOT add a timestamp to the Obsidian task, as the user
     * is expected to handle timestamping themselves (e.g., using the Task Marker plugin).
     */
    private async syncCompletionToTodoist(
        todoistId: string,
        obsidianFile?: TFile,
        obsidianLineIndex?: number,
        obsidianContent?: string,
    ): Promise<void> {
        try {
            // Mark task as completed in Todoist
            await this.todoistApi.closeTask(todoistId);
            console.log(
                `✅ Synced completion from Obsidian to Todoist: ${todoistId}`,
            );
            console.log(
                `[SYNC DIRECTION] Obsidian → Todoist: No timestamp added to Obsidian (user responsibility)`,
            );

            // NOTE: We intentionally do NOT add a completion timestamp to the Obsidian task
            // when the user marks it as completed in Obsidian. This is the user's responsibility
            // and can be handled by plugins like Task Marker if desired.
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
     * Check if a task line already has a completion timestamp in the user's configured format
     * Uses moment.js parsing instead of regex for reliable detection
     */
    private hasCompletionTimestamp(line: string): boolean {
        try {
            console.log(`[TIMESTAMP] Checking line: "${line}"`);
            console.log(
                `[TIMESTAMP] User format: "${this.settings.completionTimestampFormat}"`,
            );

            // Generate a sample timestamp to understand the expected structure
            const sampleTimestamp = (window as any)
                .moment()
                .format(this.settings.completionTimestampFormat);
            console.log(`[TIMESTAMP] Sample timestamp: "${sampleTimestamp}"`);

            // Extract literal parts from the format to help identify candidates
            const formatLiterals = this.extractFormatLiterals(
                this.settings.completionTimestampFormat,
            );
            console.log(
                `[TIMESTAMP] Format literals: ${JSON.stringify(formatLiterals)}`,
            );

            // Find candidates based on literal markers or date patterns
            const candidates = this.extractTimestampCandidates(
                line,
                formatLiterals,
            );
            console.log(
                `[TIMESTAMP] Found ${candidates.length} candidates: ${JSON.stringify(candidates)}`,
            );

            // Test each candidate with moment.js strict parsing
            for (const candidate of candidates) {
                const parsed = (window as any).moment(
                    candidate,
                    this.settings.completionTimestampFormat,
                    true,
                );
                if (parsed.isValid()) {
                    console.log(
                        `[TIMESTAMP] ✅ Valid timestamp found: "${candidate}"`,
                    );
                    return true;
                }
            }

            console.log(
                `[TIMESTAMP] ❌ No valid timestamp found using format: "${this.settings.completionTimestampFormat}"`,
            );
            return false;
        } catch (error) {
            console.error(
                "[TIMESTAMP] Error checking for existing timestamp:",
                error,
            );
            // Fallback: check if line contains the key parts of the configured format
            const formatContainsCompletion =
                this.settings.completionTimestampFormat.includes(
                    "[completion::",
                );
            const formatContainsCheckmark =
                this.settings.completionTimestampFormat.includes("✅");

            console.log(`[TIMESTAMP] Using fallback detection`);
            const fallbackResult =
                (formatContainsCompletion && line.includes("[completion::")) ||
                (formatContainsCheckmark && line.includes("✅"));
            console.log(`[TIMESTAMP] Fallback result: ${fallbackResult}`);

            return fallbackResult;
        }
    }

    /**
     * Extract literal text parts from a moment.js format string
     * These literals can be used as markers to identify timestamp candidates
     */
    private extractFormatLiterals(format: string): string[] {
        const literals: string[] = [];
        const bracketRegex = /\[([^\]]+)\]/g;
        let match;

        while ((match = bracketRegex.exec(format)) !== null) {
            const literal = match[1];
            if (literal.trim().length > 0) {
                literals.push(literal);
            }
        }

        return literals;
    }

    /**
     * Extract potential timestamp candidates from a task line
     * Uses literal markers and date/time patterns to find relevant substrings
     */
    private extractTimestampCandidates(
        line: string,
        literals: string[],
    ): string[] {
        const candidates: string[] = [];

        // Strategy 1: Look for substrings around literal markers
        for (const literal of literals) {
            const literalIndex = line.indexOf(literal);
            if (literalIndex !== -1) {
                // Extract context around the literal (up to 50 chars before and after)
                const start = Math.max(0, literalIndex - 50);
                const end = Math.min(
                    line.length,
                    literalIndex + literal.length + 50,
                );
                const context = line.substring(start, end);
                candidates.push(context.trim());

                // Also try just the part from the literal to the end of the line
                const fromLiteral = line.substring(literalIndex).trim();
                if (fromLiteral !== context.trim()) {
                    candidates.push(fromLiteral);
                }
            }
        }

        // Strategy 2: Look for date/time patterns in the line
        const dateTimePatterns = [
            /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?/g, // ISO-like dates
            /\d{2}[/-]\d{2}[/-]\d{4}\s+\d{2}:\d{2}/g, // MM/DD/YYYY HH:mm
            /\d{4}[/-]\d{2}[/-]\d{2}\s+\d{2}:\d{2}/g, // YYYY/MM/DD HH:mm
            /\d{2}:\d{2}(?::\d{2})?/g, // Time patterns
        ];

        for (const pattern of dateTimePatterns) {
            let match;
            while ((match = pattern.exec(line)) !== null) {
                const matchIndex = match.index;
                // Extract context around the match (up to 30 chars before and after)
                const start = Math.max(0, matchIndex - 30);
                const end = Math.min(
                    line.length,
                    matchIndex + match[0].length + 30,
                );
                const context = line.substring(start, end).trim();
                candidates.push(context);
            }
        }

        // Strategy 3: If no specific patterns found, try the entire line
        if (candidates.length === 0) {
            candidates.push(line.trim());
        }

        // Remove duplicates and empty candidates
        return [...new Set(candidates)].filter((c) => c.length > 0);
    }

    /**
     * Add completion timestamp to a task line (similar to Task Marker)
     * @param line The task line to add timestamp to
     * @param todoistCompletedAt Optional Todoist completion timestamp (ISO string)
     */
    private addCompletionTimestamp(
        line: string,
        todoistCompletedAt?: string,
    ): string {
        // Check if timestamp already exists to avoid duplicates
        if (this.hasCompletionTimestamp(line)) {
            console.log(
                `Timestamp already exists in line: ${line.substring(0, 50)}...`,
            );
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

        // Determine timestamp source based on user setting
        let timestamp: string;
        if (
            this.settings.completionTimestampSource === "todoist-completion" &&
            todoistCompletedAt
        ) {
            // Use Todoist completion timestamp
            timestamp = (window as any)
                .moment(todoistCompletedAt)
                .format(this.settings.completionTimestampFormat);
            console.log(
                `[TIMESTAMP] Using Todoist completion time: ${todoistCompletedAt}`,
            );
        } else {
            // Use current sync time (fallback or user preference)
            timestamp = (window as any)
                .moment()
                .format(this.settings.completionTimestampFormat);
            console.log(
                `[TIMESTAMP] Using sync time (${this.settings.completionTimestampSource === "sync-time" ? "user preference" : "fallback"})`,
            );
        }

        const updatedLine = `${mainContent.trimEnd()} ${timestamp}${blockRef}${trailingSpaces}`;
        return updatedLine;
    }

    /**
     * Update settings and restart if needed
     */
    updateSettings(newSettings: TodoistContextBridgeSettings): void {
        const wasRunning = this.syncInterval !== null;
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
}
