import { App, Editor, EditorPosition, Notice } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings } from '../main';
import { NonTaskToTodoistModal } from './NonTaskToTodoistModal';
import { LinkService } from './LinkService';
import { TaskToTodoistModal } from './TaskToTodoistModal';

export interface TodoistTaskInfo {
    taskId: string;
    isCompleted: boolean;
}

export interface TaskDetails {
    cleanText: string;
    dueDate: string | null;
}

export class TodoistTextService {
    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi | null,
        private checkAdvancedUriPlugin: () => boolean,
        private linkService: LinkService
    ) {
        if (!todoistApi) {
            throw new Error('TodoistTextService requires an initialized Todoist API');
        }
        
        if (!settings.todoistAPIToken) {
            throw new Error('Todoist API token is required');
        }
        
        // Validate other required dependencies
        if (!checkAdvancedUriPlugin()) {
            throw new Error('Advanced URI plugin is required');
        }
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    private isTaskLine(line: string): boolean {
        // Check for Markdown task format: "- [ ]" or "* [ ]"
        return /^[\s]*[-*]\s*\[[ x?/-]\]/.test(line);
    }

    private getTaskStatus(line: string): 'open' | 'completed' | 'other' {
        if (!this.isTaskLine(line)) {
            return 'other';
        }
        
        // Check for different task statuses
        if (line.match(/^[\s]*[-*]\s*\[x\]/i)) {
            return 'completed';
        } else if (line.match(/^[\s]*[-*]\s*\[ \]/)) {
            return 'open';
        } else {
            // Matches tasks with other statuses like [?], [/], [-]
            return 'other';
        }
    }

    private isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.isTaskLine(line);
    }

    private isListItem(line: string): boolean {
        return /^[\s]*[-*+]\s/.test(line);
    }

    private extractTaskDetails(taskText: string): TaskDetails {
        let text = taskText;

        // Extract and remove due date in dataview format [due::YYYY-MM-DD]
        let dueDate: string | null = null;
        const dataviewDueMatch = text.match(new RegExp(`\\[${this.settings.dataviewDueDateKey}::(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)\\]`));
        if (dataviewDueMatch) {
            dueDate = dataviewDueMatch[1];
            text = text.replace(dataviewDueMatch[0], '');
        }

        // Apply custom cleanup patterns
        if (this.settings.taskTextCleanupPatterns.length > 0) {
            for (const pattern of this.settings.taskTextCleanupPatterns) {
                if (pattern.trim()) {  // Only process non-empty patterns
                    try {
                        const regex = new RegExp(pattern.trim(), 'gu');
                        text = text.replace(regex, '');
                    } catch (e) {
                        console.warn(`Invalid regex pattern: ${pattern}`, e);
                    }
                }
            }
        }

        // Apply default cleanup patterns if enabled
        if (this.settings.useDefaultTaskTextCleanupPatterns) {
            // Remove checkbox
            text = text.replace(/^[\s-]*\[[ x?/-]\]/, '');

            // Remove timestamp with 📝 emoji (but don't use it as due date)
            text = text.replace(/📝\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/, '');

            // Remove block ID
            text = text.replace(/\^[a-zA-Z0-9-]+$/, '');
            
            // Remove tags
            text = text.replace(/#[^\s]+/g, '');
            
            // Remove any remaining emojis
            text = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
        }
        
        // Clean up extra spaces and trim
        text = text.replace(/\s+/g, ' ').trim();

        return {
            cleanText: text,
            dueDate: dueDate
        };
    }

    async syncSelectedTaskToTodoist(editor: Editor) {
        // Check if Advanced URI plugin is installed
        if (!this.checkAdvancedUriPlugin()) {
            return;
        }

        if (!this.todoistApi) {
            new Notice('Please set up your Todoist API token in settings');
            return;
        }

        const currentLine = editor.getCursor().line;
        const lineText = editor.getLine(currentLine);

        // First check if it's a task line at all
        if (!this.isTaskLine(lineText)) {
            new Notice('Please place the cursor on a task line (e.g., "- [ ] Task")');
            return;
        }

        // Then check the task status
        const taskStatus = this.getTaskStatus(lineText);
        switch (taskStatus) {
            case 'completed':
                new Notice('This task is already completed in Obsidian. Only open tasks can be synced.');
                return;
            case 'other':
                new Notice('This task has a special status (e.g., [?], [/], [-]). Only open tasks can be synced.');
                return;
            case 'open':
                // Continue with sync process
                break;
        }

        try {
            const blockId = this.linkService.getOrCreateBlockId(editor, currentLine);
            if (!blockId) {
                return; // getBlockId will have shown appropriate notice
            }

            const advancedUri = await this.linkService.generateAdvancedUriToBlock(blockId, editor);

            // Check for existing task in both Obsidian and Todoist
            const existingTask = await this.findExistingTodoistTask(editor, blockId, advancedUri);
            
            if (existingTask) {
                if (!this.settings.allowSyncDuplicateTask) {
                    if (existingTask.isCompleted && !this.settings.allowResyncCompletedTask) {
                        new Notice('Task already exists in Todoist and is completed. Re-syncing completed tasks is disabled.');
                        return;
                    }
                    if (!existingTask.isCompleted) {
                        new Notice('Task already exists in Todoist. Enable duplicate tasks in settings to sync again.');
                        return;
                    }
                }
            }

            // Extract task details including due date
            const taskDetails = this.extractTaskDetails(lineText);
            if (!taskDetails.cleanText) {
                new Notice('Task text is empty');
                return;
            }

            // Show modal with extracted details
            new TaskToTodoistModal(
                this.app,
                taskDetails.cleanText,
                '', // Empty default description - we'll combine it with the link in the callback
                taskDetails.dueDate || '',
                async (title, description, dueDate) => {
                    try {
                        // Combine user's description with the Obsidian task link
                        const descriptionParts = [];
                        
                        // Add user's description if provided
                        if (description.trim()) {
                            descriptionParts.push(description.trim());
                        }
                        
                        // Add reference link
                        descriptionParts.push(`Original task in Obsidian: ${advancedUri}`);

                        // Combine all parts of the description
                        const fullDescription = descriptionParts.join('\n\n');

                        if (this.todoistApi) {
                            // Create task in Todoist
                            if (!this.todoistApi) {
                                throw new Error('Todoist API is not initialized');
                            }
                            const task = await this.todoistApi.addTask({
                                content: title,
                                projectId: this.settings.todoistDefaultProject || undefined,
                                description: fullDescription,
                                dueString: dueDate || undefined
                            });

                            // Get the Todoist task URL and insert it as a sub-item
                            const taskUrl = `https://todoist.com/app/task/${task.id}`;
                            await this.insertTodoistLink(editor, currentLine, taskUrl, this.isListItem(lineText));

                            new Notice('Task successfully synced to Todoist!');
                        } else {
                            new Notice('Todoist API not initialized. Please check your API token in settings.');
                        }
                    } catch (error) {
                        console.error('Failed to sync task to Todoist:', error);
                        new Notice('Failed to sync task to Todoist. Please check your settings and try again.');
                    }
                }
            ).open();
        } catch (error) {
            console.error('Failed to sync task to Todoist:', error);
            new Notice('Failed to sync task to Todoist. Please check your settings and try again.');
        }
    }

    async createTodoistFromText(editor: Editor) {
        // Store current cursor
        const currentCursor: EditorPosition = editor.getCursor();

        try {
            // Store current cursor at the start
            const currentCursor: EditorPosition = editor.getCursor();

            if (!this.todoistApi) {
                new Notice('Please set up your Todoist API token first.');
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
                new Notice('Please select a non-empty line that is not a task.');
                editor.setCursor(currentCursor);
                return;
            }

            // Get or create block ID using the new method
            const blockId = this.linkService.getOrCreateBlockId(editor, currentLine);
            if (!blockId) {
                new Notice('Failed to generate block ID.');
                editor.setCursor(currentCursor);
                return;
            }
            
            // Generate the advanced URI for the block
            const advancedUri = await this.linkService.generateAdvancedUriToBlock(blockId, editor);
            if (!advancedUri) {
                new Notice('Failed to generate reference link. Please check Advanced URI plugin settings.');
                editor.setCursor(currentCursor);
                return;
            }

            // Check if the current line is a list item
            const isListItem = this.isListItem(lineContent);

            // Show modal for task input
            new NonTaskToTodoistModal(this.app, this.settings.includeSelectedTextInDescription, async (title, description) => {
                try {
                    // Prepare description components
                    const descriptionParts = [];
                    
                    // Add user's description if provided
                    if (description) {
                        descriptionParts.push(description);
                    }

                    // Add selected text if enabled
                    if (this.settings.includeSelectedTextInDescription) {
                        descriptionParts.push(`Selected text: "${lineContent.trim()}"`);
                    }
                    
                    // Add reference link
                    descriptionParts.push(`Reference: ${advancedUri}`);

                    // Combine all parts of the description
                    const fullDescription = descriptionParts.join('\n\n');

                    // Create task in Todoist
                    if (!this.todoistApi) {
                        throw new Error('Todoist API is not initialized');
                    }
                    const task = await this.todoistApi.addTask({
                        content: title,
                        projectId: this.settings.todoistDefaultProject || undefined,
                        description: fullDescription
                    });

                    // Get the Todoist task URL and insert it as a sub-item
                    const taskUrl = `https://todoist.com/app/task/${task.id}`;
                    await this.insertTodoistLink(editor, currentLine, taskUrl, isListItem);

                    new Notice('Task successfully created in Todoist!');
                } catch (error) {
                    console.error('Failed to create Todoist task:', error);
                    new Notice('Failed to create Todoist task. Please check your settings and try again.');
                    editor.setCursor(currentCursor);
                }
            }).open();

        } catch (error) {
            console.error('Error in createTodoistFromText:', error);
            new Notice('An error occurred. Please try again.');
            editor.setCursor(currentCursor);
        }
    }

    async createTodoistFromFile() {
        try {
            if (!this.todoistApi) {
                new Notice('Please set up your Todoist API token first.');
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                return;
            }

            const file = this.app.workspace.getActiveFile();
            if (!file) {
                new Notice('No active file found');
                return;
            }

            const fileUri = await this.linkService.generateAdvancedUriToFile();

            // Show modal for task input
            new NonTaskToTodoistModal(this.app, false, async (title, description) => {
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
                    const fullDescription = descriptionParts.join('\n\n');

                    if (this.todoistApi) {
                        // Create task in Todoist
                        if (!this.todoistApi) {
                            throw new Error('Todoist API is not initialized');
                        }
                        await this.todoistApi.addTask({
                            content: title,
                            projectId: this.settings.todoistDefaultProject || undefined,
                            description: fullDescription
                        });

                        new Notice('Task successfully created in Todoist!');
                    } else {
                        new Notice('Todoist API not initialized. Please check your API token in settings.');
                    }
                } catch (error) {
                    console.error('Failed to create Todoist task:', error);
                    new Notice('Failed to create Todoist task. Please check your settings and try again.');
                }
            }).open();

        } catch (error) {
            console.error('Error in createTodoistFromFile:', error);
            new Notice('An error occurred. Please try again.');
        }
    }

    getTodoistTaskId(editor: Editor, taskLine: number): string | null {
        // Look for existing Todoist link in sub-items
        let nextLine = taskLine + 1;
        let nextLineText = editor.getLine(nextLine);
        const taskIndentation = this.getLineIndentation(editor.getLine(taskLine));
        
        // Check subsequent lines with deeper indentation
        while (nextLineText && this.getLineIndentation(nextLineText).length > taskIndentation.length) {
            // Look for Todoist task link
            const taskIdMatch = nextLineText.match(/\[View in Todoist\]\(https:\/\/todoist\.com\/app\/task\/(\d+)\)/);
            if (taskIdMatch) {
                return taskIdMatch[1];
            }
            nextLine++;
            nextLineText = editor.getLine(nextLine);
        }
        return null;
    }

    async findExistingTodoistTask(editor: Editor, blockId: string, advancedUri: string): Promise<TodoistTaskInfo | null> {
        if (!this.todoistApi) return null;

        try {
            // First check local link in Obsidian
            const localTaskId = this.getTodoistTaskId(editor, editor.getCursor().line);
            if (localTaskId) {
                try {
                    const task = await this.todoistApi.getTask(localTaskId);
                    return {
                        taskId: localTaskId,
                        isCompleted: task.isCompleted
                    };
                } catch (error) {
                    // Task might have been deleted in Todoist, continue searching
                    console.log('Local task not found in Todoist, searching further...');
                }
            }

            // Search in Todoist for tasks with matching Advanced URI or block ID
            const activeTasks = await this.todoistApi.getTasks();
            const matchingTask = activeTasks.find(task => 
                task.description && (
                    task.description.includes(advancedUri) || 
                    task.description.includes(`Block ID: ${blockId}`)
                )
            );

            if (matchingTask) {
                return {
                    taskId: matchingTask.id,
                    isCompleted: matchingTask.isCompleted
                };
            }

            return null;
        } catch (error) {
            console.error('Error checking for existing Todoist task:', error);
            return null;
        }
    }

    async insertTodoistLink(editor: Editor, line: number, taskUrl: string, isListItem: boolean) {
        // Store current cursor
        const currentCursor = editor.getCursor();
        
        const lineText = editor.getLine(line);
        const currentIndent = this.getLineIndentation(lineText);
        
        let linkText: string;
        let insertPrefix: string = '';
        
        if (isListItem) {
            // For list items, add as a sub-item with one more level of indentation
            const subItemIndent = currentIndent + '\t';
            linkText = `${subItemIndent}- 🔗 [View in Todoist](${taskUrl})`;
        } else {
            // For plain text, add an empty line before and use the same indentation
            insertPrefix = '\n';
            linkText = `${currentIndent}- 🔗 [View in Todoist](${taskUrl})`;
        }

        // Get file and metadata
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        
        let insertionLine = line;

        if (!hasExistingFrontmatter) {
            // Case 2: No front matter exists
            // Create front matter with UUID and adjust insertion line
            const newUid = this.linkService.generateUUID();
            const frontMatterContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n`;
            
            // Insert front matter at the beginning of the file
            editor.replaceRange(frontMatterContent, { line: 0, ch: 0 });
            
            // Adjust insertion line to account for new frontmatter (4 lines)
            insertionLine += 4;
        } else {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                
                if (!frontmatter?.[this.settings.uidField]) {
                    // Case 3: Front matter exists but no UUID
                    const newUid = this.linkService.generateUUID();
                    const updatedFrontmatter = frontmatterContent.trim() + `\n${this.settings.uidField}: ${newUid}\n`;
                    
                    // Replace existing frontmatter
                    editor.replaceRange(
                        updatedFrontmatter,
                        { line: 1, ch: 0 },
                        { line: frontmatterContent.split('\n').length, ch: 0 }
                    );
                    
                    // Adjust insertion line by 1 for the new UUID line
                    insertionLine += 1;
                } else {
                    // Case 1: Front matter and UUID exist
                    // Just add 1 line for normal insertion
                    insertionLine += 1;
                }
            }
        }
        
        // Insert the link at the calculated position
        editor.replaceRange(
            `${insertPrefix}${linkText}\n`,
            { line: insertionLine, ch: 0 },
            { line: insertionLine, ch: 0 }
        );
        
        // Restore cursor position, adjusting for added front matter if necessary
        if (!hasExistingFrontmatter && currentCursor.line >= 0) {
            editor.setCursor({
                line: currentCursor.line + 4,
                ch: currentCursor.ch
            });
        } else {
            editor.setCursor(currentCursor);
        }
    }
}
