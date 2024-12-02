import { App, Editor, EditorPosition, Notice } from "obsidian";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { TodoistContextBridgeSettings } from "./Settings";
import { NonTaskToTodoistModal, TaskToTodoistModal } from "./TodoistModal";
import { URILinkProcessing } from "./URILinkProcessing";
import { TextParsing, TaskDetails } from "./TextParsing";

export interface TodoistTaskInfo {
    taskId: string;
    isCompleted: boolean;
}

export class TodoistTaskSync {
    private TextParsing: TextParsing;

    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi | null,
        private checkAdvancedUriPlugin: () => boolean,
        private URILinkProcessing: URILinkProcessing,
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
                            newLineText = lineText.trim() + ` #${tagName}`;
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
                        existingTask.isCompleted &&
                        !this.settings.allowResyncCompletedTask
                    ) {
                        new Notice(
                            "Task already exists in Todoist and is completed. Re-syncing completed tasks is disabled.",
                        );
                        return;
                    }
                    if (!existingTask.isCompleted) {
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
                async (title, description, dueDate, priority) => {
                    try {
                        // Combine user's description with the Obsidian task link
                        const descriptionParts = [];

                        // Add user's description if provided
                        if (description.trim()) {
                            descriptionParts.push(description.trim());
                        }

                        // Add reference link
                        descriptionParts.push(
                            `Original task in Obsidian: ${advancedUri}`,
                        );

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join("\n\n");

                        if (this.todoistApi) {
                            // Create task in Todoist
                            if (!this.todoistApi) {
                                throw new Error(
                                    "Todoist API is not initialized",
                                );
                            }
                            const task = await this.todoistApi.addTask({
                                content: title,
                                projectId:
                                    this.settings.todoistDefaultProject ||
                                    undefined,
                                description: fullDescription,
                                dueString: dueDate || undefined,
                                priority: 5 - parseInt(priority), // Convert UI priority (1=highest) to API priority (4=highest)
                            });

                            // Get the Todoist task URL and insert it as a sub-item
                            const taskUrl = `https://todoist.com/app/task/${task.id}`;
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
                async (title, description) => {
                    try {
                        // Prepare description components
                        const descriptionParts = [];

                        // Add user's description if provided
                        if (description) {
                            descriptionParts.push(description);
                        }

                        // Add selected text if enabled
                        if (this.settings.includeSelectedTextInDescription) {
                            descriptionParts.push(
                                `Selected text: "${lineContent.trim()}"`,
                            );
                        }

                        // Add reference link
                        descriptionParts.push(`Reference: ${advancedUri}`);

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join("\n\n");

                        // Create task in Todoist
                        if (!this.todoistApi) {
                            throw new Error("Todoist API is not initialized");
                        }
                        const task = await this.todoistApi.addTask({
                            content: title,
                            projectId:
                                this.settings.todoistDefaultProject ||
                                undefined,
                            description: fullDescription,
                            priority: 5 - parseInt("4"), // Convert UI priority (1=highest) to API priority (4=highest)
                        });

                        // Get the Todoist task URL and insert it as a sub-item
                        const taskUrl = `https://todoist.com/app/task/${task.id}`;
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
                async (title, description) => {
                    try {
                        // Prepare description components
                        const descriptionParts = [];

                        // Add user's description if provided
                        if (description) {
                            descriptionParts.push(description);
                        }

                        // Add reference link
                        descriptionParts.push(`Reference: ${fileUri}`);

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join("\n\n");

                        if (this.todoistApi) {
                            // Create task in Todoist
                            if (!this.todoistApi) {
                                throw new Error(
                                    "Todoist API is not initialized",
                                );
                            }
                            await this.todoistApi.addTask({
                                content: title,
                                projectId:
                                    this.settings.todoistDefaultProject ||
                                    undefined,
                                description: fullDescription,
                                priority: 5 - parseInt("4"), // Convert UI priority (1=highest) to API priority (4=highest)
                            });

                            new Notice("Task successfully created in Todoist!");
                        } else {
                            new Notice(
                                "Todoist API not initialized. Please check your API token in settings.",
                            );
                        }
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
                /\[View in Todoist\]\(https:\/\/todoist\.com\/app\/task\/(\d+)\)/,
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
                        taskId: localTaskId,
                        isCompleted: task.isCompleted,
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
                    taskId: matchingTask.id,
                    isCompleted: matchingTask.isCompleted,
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
        // Store current cursor
        const currentCursor = editor.getCursor();

        const lineText = editor.getLine(line);
        const taskLevel = this.getIndentationLevel(lineText);
        const isTask = this.isTaskLine(lineText);

        let linkText: string;
        let insertPrefix = "\n";
        let insertLine = line;

        if (isTask || isListItem) {
            // For tasks and list items:
            // Add as a sub-item with one more level of indentation
            const linkIndentation = "\t".repeat(taskLevel + 1);
            linkText = `${linkIndentation}- 🔗 [View in Todoist](${taskUrl})`;
        } else {
            // For plain text:
            linkText = `- 🔗 [View in Todoist](${taskUrl})`;

            // Check the next line
            const nextLineNum = line + 1;
            const hasNextLine = nextLineNum < editor.lineCount();
            const nextLine = hasNextLine ? editor.getLine(nextLineNum) : "";
            const nextLineIsEmpty = nextLine.trim() === "";
            const nextLineIsLink = nextLine.trim().startsWith("- 🔗");

            if (!hasNextLine || !nextLineIsEmpty) {
                // No next line or next line is not empty
                // Add two newlines to create empty line
                insertPrefix = "\n\n";
            } else {
                // Next line is empty, check the line after
                const linkLineNum = nextLineNum + 1;
                const hasLinkLine = linkLineNum < editor.lineCount();
                const linkLine = hasLinkLine ? editor.getLine(linkLineNum) : "";

                if (hasLinkLine && linkLine.trim().startsWith("- 🔗")) {
                    // There's an existing link after the empty line
                    // Insert at the empty line
                    insertLine = nextLineNum;
                } else {
                    // No existing link or no line after empty line
                    insertLine = nextLineNum;
                }
            }
        }

        // Get file and metadata
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith("---\n");

        // Handle frontmatter adjustments
        let lineOffset = 0;
        if (!hasExistingFrontmatter) {
            const newUid = this.URILinkProcessing.generateUUID();
            const frontMatterContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n`;
            editor.replaceRange(frontMatterContent, { line: 0, ch: 0 });
            lineOffset = 4;
            insertLine += lineOffset;
        } else {
            const endOfFrontmatter = content.indexOf("---\n", 4);
            if (endOfFrontmatter !== -1) {
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                if (!frontmatter?.[this.settings.uidField]) {
                    const newUid = this.URILinkProcessing.generateUUID();
                    const updatedFrontmatter =
                        frontmatterContent.trim() +
                        `\n${this.settings.uidField}: ${newUid}\n`;
                    editor.replaceRange(
                        updatedFrontmatter,
                        { line: 1, ch: 0 },
                        { line: frontmatterContent.split("\n").length, ch: 0 },
                    );
                    lineOffset = 1;
                    insertLine += lineOffset;
                }
            }
        }

        // Insert the link
        editor.replaceRange(
            `${insertPrefix}${linkText}`,
            {
                line: insertLine,
                ch: editor.getLine(insertLine).length,
            },
            {
                line: insertLine,
                ch: editor.getLine(insertLine).length,
            },
        );

        // Restore cursor position, adjusting for added front matter if necessary
        if (lineOffset > 0 && currentCursor.line >= 0) {
            editor.setCursor({
                line: currentCursor.line + lineOffset,
                ch: currentCursor.ch,
            });
        } else {
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
            if (task.isCompleted) {
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
                    line.includes("Original task in Obsidian: obsidian://") ||
                    line.includes("Reference: obsidian://"),
            );

            // Filter out metadata if requested
            let filteredLines = lines;
            if (excludeMetadata) {
                // Filter out the reference link line and empty lines
                filteredLines = lines.filter(
                    (line) =>
                        !line.includes(
                            "Original task in Obsidian: obsidian://",
                        ) &&
                        !line.includes("Reference: obsidian://") &&
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
