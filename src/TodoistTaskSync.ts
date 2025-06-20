import { App, Editor, EditorPosition, Notice } from "obsidian";
import { TodoistApi, Task } from "@doist/todoist-api-typescript";
import { TodoistContextBridgeSettings } from "./Settings";
import { NonTaskToTodoistModal, TaskToTodoistModal } from "./TodoistModal";
import { URILinkProcessing } from "./URILinkProcessing";
import { UIDProcessing } from "./UIDProcessing"; // Import UIDProcessing
import { TextParsing, TaskDetails } from "./TextParsing";
import { TODOIST_CONSTANTS } from "./constants"; // Import TODOIST_CONSTANTS

export interface TodoistTaskInfo {
    task_id: string;
    is_completed: boolean;
}

export class TodoistTaskSync {
    private TextParsing: TextParsing;

    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi | null,
        private checkAdvancedUriPlugin: () => boolean,
        private URILinkProcessing: URILinkProcessing,
        private UIDProcessing: UIDProcessing, // Add UIDProcessing to constructor parameters
        private plugin: any, // Assuming plugin instance is passed in the constructor
    ) {
        if (!todoistApi) {
            throw new Error(
                "TodoistTaskSync requires an initialized Todoist API",
            );
        }

        if (!settings.todoistAPIToken) {
            throw new Error("Todoist API token is required");
        }

        // Validate other required dependencies
        if (!checkAdvancedUriPlugin()) {
            throw new Error("Advanced URI plugin is required");
        }

        this.TextParsing = new TextParsing(settings);
    }

    // Use TextParsing methods instead of local ones
    private isTaskLine(line: string): boolean {
        return this.TextParsing.isTaskLine(line);
    }

    private getTaskStatus(line: string): "open" | "completed" | "other" {
        return this.TextParsing.getTaskStatus(line);
    }

    private isNonEmptyTextLine(line: string): boolean {
        return this.TextParsing.isNonEmptyTextLine(line);
    }

    private isListItem(line: string): boolean {
        return this.TextParsing.isListItem(line);
    }

    private getLineIndentation(line: string): string {
        return this.TextParsing.getLineIndentation(line);
    }

    private extractTaskDetails(taskText: string): TaskDetails {
        return this.TextParsing.extractTaskDetails(taskText);
    }

    /**
     * Formats a line of text as an Obsidian list item with proper indentation
     * @param line The line to format
     * @param baseIndentation Base indentation for the description
     * @param additionalIndentLevel Additional indentation levels (0 for base level)
     * @returns Formatted line with proper indentation
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
     * Process description lines to maintain hierarchy
     * @param lines Array of description lines
     * @param baseIndentation Base indentation for the description
     * @returns Formatted lines with proper hierarchy
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
     * Gets the number of tab indentations in a line
     * @param line The line to check
     * @returns The number of tab indentations
     */
    private getIndentationLevel(line: string): number {
        const indentation = this.getLineIndentation(line);
        return indentation.split("\t").length - 1;
    }

    private async isSharedProject(projectId: string): Promise<boolean> {
        try {
            const project = await this.todoistApi?.getProject(projectId);
            // In the v1 API, isShared is replaced with is_shared
            return project ? ((project as any).is_shared ?? false) : false;
        } catch (error) {
            console.warn("Failed to check project sharing status:", error);
            return false;
        }
    }

    private async createTodoistTask(
        title: string,
        description: string,
        due_date: string | null,
        priority: string,
        project_id: string,
        taskDetails?: TaskDetails,
    ): Promise<string> {
        if (!this.todoistApi) {
            throw new Error("Todoist API not initialized");
        }

        // Validate required fields
        if (!title || !title.trim()) {
            throw new Error("Task title is required");
        }

        try {
            const taskParams: {
                content: string;
                description: string;
                due_string?: string;
                priority?: number;
                project_id?: string;
                labels?: string[];
            } = {
                content: title.trim(),
                description: description || "",
            };

            // Only add non-empty parameters
            if (due_date) {
                taskParams.due_string = due_date;
            }

            if (priority) {
                taskParams.priority = 5 - parseInt(priority); // Convert UI priority (1=highest) to API priority (4=highest)
            }

            if (project_id || this.settings.todoistDefaultProject) {
                taskParams.project_id =
                    project_id || this.settings.todoistDefaultProject;
            }

            // Add label if enabled and configured
            if (
                this.settings.enableTodoistLabel &&
                this.settings.todoistSyncLabel
            ) {
                const trimmedLabel = this.settings.todoistSyncLabel.trim();
                if (this.TextParsing.isValidTodoistLabel(trimmedLabel)) {
                    try {
                        // Check if the target project is shared
                        const targetProjectId = taskParams.project_id;
                        const isShared = targetProjectId
                            ? await this.isSharedProject(targetProjectId)
                            : false;

                        if (isShared) {
                            // If project is shared, warn user about label visibility
                            new Notice(
                                "Note: Task will be created in a shared project. The label will be visible to all project members.",
                                5000,
                            );
                        }

                        // Create or get the label
                        const labels = await this.todoistApi.getLabels();
                        const existingLabel = labels.find(
                            (l) => l.name === trimmedLabel,
                        );
                        if (!existingLabel) {
                            await this.todoistApi.addLabel({
                                name: trimmedLabel,
                            });
                        }
                        taskParams.labels = [trimmedLabel];
                    } catch (error) {
                        console.warn(
                            "Failed to create or get Todoist label:",
                            error,
                        );
                        new Notice(
                            "Warning: Failed to add label to task. The task will be created without the label.",
                        );
                    }
                } else {
                    console.warn(
                        "Invalid Todoist label format. Label will not be added to the task.",
                    );
                    new Notice(
                        "Warning: Invalid Todoist label format. The task will be created without the label.",
                    );
                }
            }

            const task = await this.todoistApi.addTask(taskParams);

            return task.id;
        } catch (error) {
            console.error("Failed to create Todoist task:", error);
            if (error.response?.status === 400) {
                throw new Error(
                    "Invalid task data. Please check all required fields are filled correctly.",
                );
            }
            throw error;
        }
    }

    // Feature functions
    async syncSelectedTaskToTodoist(editor: Editor) {
        // Check if Advanced URI plugin is installed
        if (!this.checkAdvancedUriPlugin()) {
            return;
        }

        if (!this.todoistApi) {
            new Notice("Please set up your Todoist API token in settings");
            return;
        }

        const currentLine = editor.getCursor().line;
        const lineText = editor.getLine(currentLine);

        // First check if it's a task line at all
        if (!this.isTaskLine(lineText)) {
            new Notice(
                'Please place the cursor on a task line (e.g., "- [ ] Task")',
            );
            return;
        }

        // Then check the task status
        const taskStatus = this.getTaskStatus(lineText);
        switch (taskStatus) {
            case "completed":
                new Notice(
                    "This task is already completed in Obsidian. Only open tasks can be synced.",
                );
                return;
            case "other":
                new Notice(
                    "This task has a special status (e.g., [?], [/], [-]). Only open tasks can be synced.",
                );
                return;
            case "open":
                // Continue with sync process
                break;
        }

        try {
            // Store current cursor position
            const currentCursor = editor.getCursor();

            // Insert the automatic tag if enabled
            if (
                this.settings.enableAutoTagInsertion &&
                this.settings.autoTagName
            ) {
                const tagName = this.settings.autoTagName
                    .trim()
                    .replace(/^#/, "");
                // Validate tag name: only allow letters, numbers, and hyphens/underscores
                if (tagName && /^[A-Za-z0-9_-]+$/.test(tagName)) {
                    // Check if the tag already exists in the line
                    const tagPattern = new RegExp(`#${tagName}\\b`);
                    if (!tagPattern.test(lineText)) {
                        // Find position to insert tag (before block ID if it exists)
                        const blockIdMatch =
                            lineText.match(/\s\^[a-zA-Z0-9-]+$/);
                        let newLineText: string;

                        if (blockIdMatch) {
                            // Insert before block ID
                            const blockIdIndex = lineText.lastIndexOf(
                                blockIdMatch[0],
                            );
                            newLineText =
                                lineText.slice(0, blockIdIndex) +
                                ` #${tagName}` +
                                lineText.slice(blockIdIndex);
                        } else {
                            // Add to end of line
                            const originalIndentation =
                                this.getLineIndentation(lineText);
                            const trimmedContent = lineText
                                .slice(originalIndentation.length)
                                .trim();
                            newLineText = `${originalIndentation}${trimmedContent} #${tagName}`;
                        }

                        // Update the line in the editor
                        editor.setLine(currentLine, newLineText);

                        // Restore cursor position
                        editor.setCursor(currentCursor);
                    }
                } else {
                    new Notice(
                        "Invalid tag name. Tags can only contain letters, numbers, hyphens, and underscores.",
                    );
                    return;
                }
            }

            const blockId = this.URILinkProcessing.getOrCreateBlockId(
                editor,
                currentLine,
            );
            if (!blockId) {
                return; // getBlockId will have shown appropriate notice
            }

            const advancedUri =
                await this.URILinkProcessing.generateAdvancedUriToBlock(
                    blockId,
                    editor,
                );

            // Check for existing task in both Obsidian and Todoist
            const existingTask = await this.findExistingTodoistTask(
                editor,
                blockId,
                advancedUri,
            );

            if (existingTask) {
                if (!this.settings.allowSyncDuplicateTask) {
                    if (
                        existingTask.is_completed &&
                        !this.settings.allowResyncCompletedTask
                    ) {
                        new Notice(
                            "Task already exists in Todoist and is completed. Re-syncing completed tasks is disabled.",
                        );
                        return;
                    }
                    if (!existingTask.is_completed) {
                        new Notice(
                            "Task already exists in Todoist. Enable duplicate tasks in settings to sync again.",
                        );
                        return;
                    }
                }
            }

            // Extract task details including due date
            const taskDetails = this.extractTaskDetails(lineText);
            if (!taskDetails.cleanText) {
                new Notice("Task text is empty");
                return;
            }

            // Show modal with extracted details
            new TaskToTodoistModal(
                this.app,
                this.plugin,
                taskDetails.cleanText,
                "", // Empty default description - we'll combine it with the link in the callback
                taskDetails.dueDate || "",
                taskDetails.priority?.toString() ||
                    this.settings.todoistDefaultPriority.toString(),
                async (title, description, dueDate, priority, projectId) => {
                    try {
                        // Combine user's description with the Obsidian task link
                        const descriptionParts = [];

                        // Add reference link first with timestamp
                        descriptionParts.push(
                            TODOIST_CONSTANTS.FORMAT_STRINGS.ORIGINAL_TASK(
                                advancedUri,
                                window
                                    .moment()
                                    .format(this.settings.timestampFormat),
                            ),
                        );

                        // Add user's description after metadata if provided
                        if (description.trim()) {
                            descriptionParts.push(description.trim());
                        }

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join("\n\n");

                        if (this.todoistApi) {
                            // Create task in Todoist
                            if (!this.todoistApi) {
                                throw new Error(
                                    "Todoist API is not initialized",
                                );
                            }
                            const taskId = await this.createTodoistTask(
                                title,
                                fullDescription,
                                dueDate,
                                priority,
                                projectId,
                                taskDetails,
                            );

                            // Get the Todoist task URL and insert it as a sub-item
                            const taskUrl = `https://todoist.com/app/task/${taskId}`;
                            await this.insertTodoistLink(
                                editor,
                                currentLine,
                                taskUrl,
                                this.isListItem(lineText),
                            );

                            new Notice("Task successfully synced to Todoist!");
                        } else {
                            new Notice(
                                "Todoist API not initialized. Please check your API token in settings.",
                            );
                        }
                    } catch (error) {
                        console.error("Failed to sync task to Todoist:", error);
                        new Notice(
                            "Failed to sync task to Todoist. Please check your settings and try again.",
                        );
                    }
                },
            ).open();
        } catch (error) {
            console.error("Failed to sync task to Todoist:", error);
            new Notice(
                "Failed to sync task to Todoist. Please check your settings and try again.",
            );
        }
    }

    async createTodoistTaskFromSelectedText(editor: Editor) {
        // Store current cursor
        const currentCursor: EditorPosition = editor.getCursor();

        try {
            // Store current cursor at the start
            const currentCursor: EditorPosition = editor.getCursor();

            if (!this.todoistApi) {
                new Notice("Please set up your Todoist API token first.");
                editor.setCursor(currentCursor);
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                editor.setCursor(currentCursor);
                return;
            }

            const currentLine = currentCursor.line;
            const lineContent = editor.getLine(currentLine);

            if (!this.isNonEmptyTextLine(lineContent)) {
                new Notice(
                    "Please select a non-empty line that is not a task.",
                );
                editor.setCursor(currentCursor);
                return;
            }

            // Get or create block ID using the new method
            const blockId = this.URILinkProcessing.getOrCreateBlockId(
                editor,
                currentLine,
            );
            if (!blockId) {
                new Notice("Failed to generate block ID.");
                editor.setCursor(currentCursor);
                return;
            }

            // Generate the advanced URI for the block
            const advancedUri =
                await this.URILinkProcessing.generateAdvancedUriToBlock(
                    blockId,
                    editor,
                );
            if (!advancedUri) {
                new Notice(
                    "Failed to generate reference link. Please check Advanced URI plugin settings.",
                );
                editor.setCursor(currentCursor);
                return;
            }

            // Check if the current line is a list item
            const isListItem = this.isListItem(lineContent);

            // Show modal for task input
            new NonTaskToTodoistModal(
                this.app,
                this.settings.includeSelectedTextInDescription,
                this.plugin,
                async (title, description, dueDate, priority, projectId) => {
                    try {
                        // Prepare description components
                        const descriptionParts = [];

                        // Add reference link first with timestamp
                        descriptionParts.push(
                            TODOIST_CONSTANTS.FORMAT_STRINGS.REFERENCE(
                                advancedUri,
                                window
                                    .moment()
                                    .format(this.settings.timestampFormat),
                            ),
                        );

                        // Add selected text if enabled
                        if (this.settings.includeSelectedTextInDescription) {
                            descriptionParts.push(
                                `Selected text: "${lineContent.trim()}"`,
                            );
                        }

                        // Add user's description after metadata if provided
                        if (description) {
                            descriptionParts.push(description);
                        }

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join("\n\n");

                        // Create task in Todoist
                        if (!this.todoistApi) {
                            throw new Error("Todoist API is not initialized");
                        }
                        const taskId = await this.createTodoistTask(
                            title,
                            fullDescription,
                            dueDate,
                            priority,
                            projectId,
                        );

                        // Get the Todoist task URL and insert it as a sub-item
                        const taskUrl = `https://todoist.com/app/task/${taskId}`;
                        await this.insertTodoistLink(
                            editor,
                            currentLine,
                            taskUrl,
                            isListItem,
                        );

                        new Notice("Task successfully created in Todoist!");
                    } catch (error) {
                        console.error("Failed to create Todoist task:", error);
                        new Notice(
                            "Failed to create Todoist task. Please check your settings and try again.",
                        );
                        editor.setCursor(currentCursor);
                    }
                },
            ).open();
        } catch (error) {
            console.error("Error in createTodoistFromText:", error);
            new Notice("An error occurred. Please try again.");
            editor.setCursor(currentCursor);
        }
    }

    async createTodoistTaskFromSelectedFile() {
        try {
            if (!this.todoistApi) {
                new Notice("Please set up your Todoist API token first.");
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                return;
            }

            const file = this.app.workspace.getActiveFile();
            if (!file) {
                new Notice("No active file found");
                return;
            }

            const fileUri =
                await this.URILinkProcessing.generateAdvancedUriToFile();

            // Show modal for task input
            new NonTaskToTodoistModal(
                this.app,
                false,
                this.plugin,
                async (title, description, dueDate, priority, projectId) => {
                    try {
                        // Prepare description components
                        const descriptionParts = [];

                        // Add reference link first with timestamp
                        descriptionParts.push(
                            TODOIST_CONSTANTS.FORMAT_STRINGS.REFERENCE(
                                fileUri,
                                window
                                    .moment()
                                    .format(this.settings.timestampFormat),
                            ),
                        );

                        // Add user's description after metadata if provided
                        if (description) {
                            descriptionParts.push(description);
                        }

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join("\n\n");

                        // Create task in Todoist
                        if (!this.todoistApi) {
                            throw new Error("Todoist API is not initialized");
                        }
                        const taskId = await this.createTodoistTask(
                            title,
                            fullDescription,
                            dueDate,
                            priority,
                            projectId,
                        );

                        new Notice("Task successfully created in Todoist!");
                    } catch (error) {
                        console.error("Failed to create Todoist task:", error);
                        new Notice(
                            "Failed to create Todoist task. Please check your settings and try again.",
                        );
                    }
                },
            ).open();
        } catch (error) {
            console.error("Error in createTodoistFromFile:", error);
            new Notice("An error occurred. Please try again.");
        }
    }

    getTodoistTaskId(editor: Editor, taskLine: number): string | null {
        // Look for existing Todoist link in sub-items
        let nextLine = taskLine + 1;
        let nextLineText = editor.getLine(nextLine);
        const taskIndentation = this.getLineIndentation(
            editor.getLine(taskLine),
        );

        // Check subsequent lines with deeper indentation
        while (
            nextLineText &&
            this.getLineIndentation(nextLineText).length >
                taskIndentation.length
        ) {
            // Look for Todoist task link
            const taskIdMatch = nextLineText.match(
                TODOIST_CONSTANTS.LINK_PATTERN,
            );
            if (taskIdMatch) {
                return taskIdMatch[1];
            }
            nextLine++;
            nextLineText = editor.getLine(nextLine);
        }
        return null;
    }

    async findExistingTodoistTask(
        editor: Editor,
        blockId: string,
        advancedUri: string,
    ): Promise<TodoistTaskInfo | null> {
        if (!this.todoistApi) return null;

        try {
            // First check local link in Obsidian
            const localTaskId = this.getTodoistTaskId(
                editor,
                editor.getCursor().line,
            );
            if (localTaskId) {
                try {
                    const task = await this.todoistApi.getTask(localTaskId);
                    return {
                        task_id: localTaskId,
                        is_completed:
                            (task as any).checked ?? task.isCompleted ?? false,
                    };
                } catch (error) {
                    // Task might have been deleted in Todoist, continue searching
                    console.log(
                        "Local task not found in Todoist, searching further...",
                    );
                }
            }

            // Search in Todoist for tasks with matching Advanced URI or block ID
            const activeTasks = await this.todoistApi.getTasks();
            const matchingTask = activeTasks.find(
                (task) =>
                    task.description &&
                    (task.description.includes(advancedUri) ||
                        task.description.includes(`Block ID: ${blockId}`)),
            );

            if (matchingTask) {
                return {
                    task_id: matchingTask.id,
                    is_completed:
                        (matchingTask as any).checked ??
                        matchingTask.isCompleted ??
                        false,
                };
            }

            return null;
        } catch (error) {
            console.error("Error checking for existing Todoist task:", error);
            return null;
        }
    }

    async insertTodoistLink(
        editor: Editor,
        line: number,
        taskUrl: string,
        isListItem: boolean,
    ) {
        // Store current cursor position
        const currentCursor = editor.getCursor();

        // Get the current line's text and indentation
        const lineText = editor.getLine(currentCursor.line);
        const taskLevel = this.getIndentationLevel(lineText);
        const isTask = this.isTaskLine(lineText);

        // Format the link text with proper indentation
        const timestamp = window
            .moment()
            .format(this.settings.todoistLinkTimestampFormat);
        const linkIndentation =
            isTask || isListItem ? "\t".repeat(taskLevel + 1) : "";
        const linkText = TODOIST_CONSTANTS.FORMAT_STRINGS.TODOIST_LINK(
            linkIndentation,
            TODOIST_CONSTANTS.LINK_TEXT,
            taskUrl,
            timestamp,
        );

        // Get file and ensure UID
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        try {
            // Use UIDProcessing to handle the UID in frontmatter
            await this.UIDProcessing.getOrCreateUid(file, editor);

            // Insert the link one line below the cursor position
            editor.replaceRange(linkText, {
                line: currentCursor.line,
                ch: editor.getLine(currentCursor.line).length,
            });

            // Restore cursor to its original position
            editor.setCursor(currentCursor);
        } catch (error) {
            console.error("Error inserting Todoist link:", error);
            new Notice("Failed to insert Todoist link. Please try again.");
            editor.setCursor(currentCursor);
        }
    }

    /**
     * Retrieves and syncs the description from a Todoist task to Obsidian
     * @param editor The Obsidian editor instance
     * @param excludeMetadata Whether to exclude metadata from the synced description
     * @returns Promise<void>
     */
    async syncTodoistDescriptionToObsidian(
        editor: Editor,
        excludeMetadata = true,
    ) {
        if (!this.todoistApi) {
            new Notice("Please set up your Todoist API token first.");
            return;
        }

        const currentLine = editor.getCursor().line;
        const lineText = editor.getLine(currentLine);

        // Check if it's a task line
        if (!this.isTaskLine(lineText)) {
            new Notice(
                'Please place the cursor on a task line (e.g., "- [ ] Task")',
            );
            return;
        }

        try {
            // Get the Todoist task ID
            const todoistTaskId = this.getTodoistTaskId(editor, currentLine);
            if (!todoistTaskId) {
                new Notice("No linked Todoist task found for this task.");
                return;
            }

            // Get the task from Todoist
            const task = await this.todoistApi.getTask(todoistTaskId);
            if (!task) {
                new Notice(
                    "Could not find the task in Todoist. It might have been deleted.",
                );
                return;
            }

            // Check if task is completed
            const isTaskCompleted =
                (task as any).checked ?? task.isCompleted ?? false;
            if (isTaskCompleted) {
                new Notice("This task is already completed in Todoist.");
                return;
            }

            // Get the task description
            const description = task.description || "";

            // Early check for completely empty description
            if (!description.trim()) {
                new Notice("The task description is completely empty.");
                return;
            }

            const lines = description.split("\n");

            // Check if description contains only metadata
            const hasOnlyMetadata = lines.every(
                (line) =>
                    !line.trim() ||
                    TODOIST_CONSTANTS.METADATA_PATTERNS.ORIGINAL_TASK_PATTERN.test(
                        line,
                    ) ||
                    TODOIST_CONSTANTS.METADATA_PATTERNS.REFERENCE_PATTERN.test(
                        line,
                    ),
            );

            // Filter out metadata if requested
            let filteredLines = lines;
            if (excludeMetadata) {
                // Filter out the reference link line and empty lines
                filteredLines = lines.filter(
                    (line) =>
                        !TODOIST_CONSTANTS.METADATA_PATTERNS.ORIGINAL_TASK_PATTERN.test(
                            line,
                        ) &&
                        !TODOIST_CONSTANTS.METADATA_PATTERNS.REFERENCE_PATTERN.test(
                            line,
                        ) &&
                        line.trim() !== "",
                );

                if (filteredLines.length === 0) {
                    if (hasOnlyMetadata) {
                        new Notice(
                            "Only metadata found in the task description. Nothing to sync.",
                        );
                    } else {
                        new Notice("The task description is completely empty.");
                    }
                    return;
                }
            } else {
                // For full sync, still check if there's any content
                if (filteredLines.every((line) => !line.trim())) {
                    new Notice("The task description is completely empty.");
                    return;
                }
            }

            // Get the original task's indentation level and add one more level
            const taskIndentation = this.getLineIndentation(lineText);
            const taskLevel = this.getIndentationLevel(lineText);
            const descriptionBaseIndentation = "\t".repeat(taskLevel + 1);

            // Process and format the description lines with the correct base indentation
            const formattedLines = this.processDescriptionLines(
                filteredLines,
                descriptionBaseIndentation,
            );
            const formattedDescription = formattedLines.join("\n");

            // Find the position to insert the description
            let nextLine = currentLine + 1;
            let nextLineText = editor.getLine(nextLine);

            // Skip existing sub-items
            while (
                nextLineText &&
                this.getLineIndentation(nextLineText).length >
                    taskIndentation.length
            ) {
                nextLine++;
                nextLineText = editor.getLine(nextLine);
            }

            // Insert the description
            editor.replaceRange(
                `\n${formattedDescription}`,
                {
                    line: nextLine - 1,
                    ch: editor.getLine(nextLine - 1).length,
                },
                {
                    line: nextLine - 1,
                    ch: editor.getLine(nextLine - 1).length,
                },
            );

            new Notice(
                excludeMetadata
                    ? "Successfully synced task description!"
                    : "Successfully synced full task description (including metadata)!",
            );
        } catch (error) {
            console.error("Error syncing Todoist description:", error);
            new Notice("Failed to sync Todoist description. Please try again.");
        }
    }

    /**
     * Syncs the full description from a Todoist task to Obsidian, including all metadata and reference links
     */
    async syncFullTodoistDescriptionToObsidian(editor: Editor) {
        return this.syncTodoistDescriptionToObsidian(editor, false);
    }
}
