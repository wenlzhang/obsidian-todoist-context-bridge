import { Editor, Notice, Plugin } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import moment from 'moment';
import { DEFAULT_SETTINGS } from 'src/Settings';
import { TodoistContextBridgeSettingTab } from 'src/SettingTab';
import { TaskToTodoistModal } from 'src/TaskToTodoistModal';
import { NonTaskToTodoistModal } from 'src/NonTaskToTodoistModal';
import { FrontmatterService } from 'src/FrontmatterService';
import { TodoistTextService } from 'src/TodoistTextService';

export interface TodoistContextBridgeSettings {
    apiToken: string;
    defaultProjectId: string;
    uidField: string;
    blockIdFormat: string;
    allowDuplicateTasks: boolean;
    allowResyncCompleted: boolean;
    includeSelectedText: boolean;
    cleanupPatterns: string[];
    useDefaultCleanupPatterns: boolean;
    dueDateKey: string;
}

interface TodoistTaskInfo {
    taskId: string;
    isCompleted: boolean;
}

interface TaskDetails {
    cleanText: string;
    dueDate: string | null;
}

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];

    private frontmatterService: FrontmatterService;
    private todoistTextService: TodoistTextService;

    private generateBlockId(): string {
        return moment().format(this.settings.blockIdFormat);
    }

    private generateNonTaskBlockId(): string {
        const timestamp = moment().format('YYYYMMDDHHmmss');
        const random = Math.random().toString(36).substring(2, 6);
        return `${timestamp}-${random}`;
    }

    async onload() {
        await this.loadSettings();
        this.frontmatterService = new FrontmatterService(this.settings, this.app);

        // Initialize Todoist API if token exists
        this.initializeTodoistApi();

        if (this.todoistApi) {
            this.todoistTextService = new TodoistTextService(
                this.app,
                this.settings,
                this.todoistApi,
                this.checkAdvancedUriPlugin.bind(this),
                this.getOrCreateBlockId.bind(this),
                this.generateAdvancedUri.bind(this),
                this.isListItem.bind(this),
                this.isNonEmptyTextLine.bind(this),
                this.insertTodoistLink.bind(this)
            );
        } else {
            new Notice('Todoist API not initialized. Please check your API token in settings.');
        }

        // Add command to sync selected task to Todoist
        this.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: async (editor: Editor) => {
                await this.syncSelectedTaskToTodoist(editor);
            }
        });

        // Add new command for creating tasks from non-task text
        this.addCommand({
            id: 'create-todoist-from-text',
            name: 'Create Todoist task from selected text',
            editorCallback: async (editor: Editor) => {
                await this.todoistTextService.createTodoistFromText(editor);
            }
        });

        // Add new command for creating tasks linked to the current file
        this.addCommand({
            id: 'create-todoist-from-file',
            name: 'Create Todoist task linked to current note',
            callback: async () => {
                await this.createTodoistFromFile();
            }
        });

        // Add settings tab
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async loadProjects() {
        try {
            const projects = await this.todoistApi?.getProjects();
            if (projects) {
                // Store projects or update UI as needed
            }
        } catch (error) {
            console.error('Failed to load Todoist projects:', error);
            new Notice('Failed to load Todoist projects. Please check your API token.');
        }
    }

    public initializeTodoistApi() {
        if (this.settings.apiToken) {
            this.todoistApi = new TodoistApi(this.settings.apiToken);
        } else {
            this.todoistApi = null;
        }
    }

    checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            new Notice('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        return true;
    }

    private getBlockId(editor: Editor): string {
        const lineText = editor.getLine(editor.getCursor().line);
        
        // Only proceed if this is a task line
        if (!this.isTaskLine(lineText)) {
            return '';
        }
        
        // Check for existing block ID
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            return match[1];
        }

        // Generate a new block ID using the configured format
        const newBlockId = this.generateBlockId();
        
        // Calculate the new cursor position
        const newLineText = `${lineText} ^${newBlockId}`;
        editor.setLine(editor.getCursor().line, newLineText);
        
        return newBlockId;
    }

    private getOrCreateBlockId(editor: Editor, line: number): string {
        // Store current cursor
        const currentCursor = editor.getCursor();

        const lineText = editor.getLine(line);
        
        // Check for existing block ID
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            // Restore cursor position before returning
            editor.setCursor(currentCursor);
            return match[1];
        }

        // Generate a new block ID using the configured format from settings
        const newBlockId = this.generateBlockId();
        
        // Add block ID to the line, ensuring proper block reference format
        // If the line doesn't end with whitespace, add a space before the block ID
        const newLineText = lineText.trimEnd() + (lineText.endsWith(' ') ? '' : ' ') + `^${newBlockId}`;
        editor.setLine(line, newLineText);
        
        // Force Obsidian to recognize the block reference by adding a newline if one doesn't exist
        const nextLine = editor.getLine(line + 1);
        if (nextLine === undefined) {
            editor.replaceRange('\n', { line: line + 1, ch: 0 });
        }
        
        // Restore cursor position
        editor.setCursor(currentCursor);
        return newBlockId;
    }

    private async generateAdvancedUri(blockId: string, editor: Editor): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) return '';

        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return '';

        // @ts-ignore
        const useUid = advancedUriPlugin.settings?.useUID || false;
        
        const vaultName = this.app.vault.getName();
        
        if (useUid) {
            // Ensure UID exists in frontmatter
            const uid = await this.frontmatterService.getOrCreateUid(file, editor);
            if (!uid) {
                new Notice('Failed to generate or retrieve UID for the note.');
                return '';
            }

            // Build the URI with proper encoding
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('uid', uid);
            params.set('block', blockId);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        } else {
            // If not using UID, use file path (with a warning)
            console.warn('Advanced URI plugin is configured to use file paths instead of UIDs. This may cause issues if file paths change.');
            
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('filepath', file.path);
            params.set('block', blockId);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        }
    }

    private getTaskText(editor: Editor): string {
        const lineText = editor.getLine(editor.getCursor().line);
        
        // Extract task text (remove checkbox, block ID, and tags)
        return lineText
            .replace(/^[\s-]*\[[ x?/-]\]/, '') // Remove checkbox with any status
            .replace(/\^[a-zA-Z0-9-]+$/, '') // Remove block ID
            .replace(/#[^\s]+/g, '') // Remove tags
            .trim();
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    private async isTaskCompleted(editor: Editor): Promise<boolean> {
        const lineText = editor.getLine(editor.getCursor().line);
        return lineText.match(/^[\s-]*\[x\]/) !== null;
    }

    private async insertTodoistLink(editor: Editor, line: number, taskUrl: string, isListItem: boolean) {
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
            const newUid = this.generateUUID();
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
                    const newUid = this.generateUUID();
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

    private getTodoistTaskId(editor: Editor, taskLine: number): string | null {
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

    private async findExistingTodoistTask(editor: Editor, blockId: string, advancedUri: string): Promise<TodoistTaskInfo | null> {
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

    private getDefaultCleanupPatterns(): string[] {
        return [
            // Checkbox
            '^[\\s-]*\\[[ x?/-]\\]',
            // Timestamp with 📝 emoji
            '📝\\s*\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?',
            // Block ID
            '\\^[a-zA-Z0-9-]+$',
            // Tags
            '#[^\\s]+',
            // Emojis
            '[\\u{1F300}-\\u{1F9FF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}]'
        ];
    }

    private extractTaskDetails(taskText: string): TaskDetails {
        let text = taskText;

        // Extract and remove due date in dataview format [due::YYYY-MM-DD]
        let dueDate: string | null = null;
        const dataviewDueMatch = text.match(new RegExp(`\\[${this.settings.dueDateKey}::(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)\\]`));
        if (dataviewDueMatch) {
            dueDate = dataviewDueMatch[1];
            text = text.replace(dataviewDueMatch[0], '');
        }

        // Apply custom cleanup patterns
        if (this.settings.cleanupPatterns.length > 0) {
            for (const pattern of this.settings.cleanupPatterns) {
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
        if (this.settings.useDefaultCleanupPatterns) {
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

    private formatTodoistDueDate(date: string): string {
        // Convert YYYY-MM-DDTHH:mm to Todoist format
        const parsedDate = moment(date);
        if (!parsedDate.isValid()) return date;

        if (date.includes('T')) {
            // If time is included, use datetime format
            return parsedDate.format('YYYY-MM-DD[T]HH:mm:ss[Z]');
        } else {
            // If only date, use date format
            return parsedDate.format('YYYY-MM-DD');
        }
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
            const blockId = this.getOrCreateBlockId(editor, currentLine);
            if (!blockId) {
                return; // getBlockId will have shown appropriate notice
            }

            const advancedUri = await this.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                return; // Error notice already shown in generateAdvancedUri
            }

            // Check for existing task in both Obsidian and Todoist
            const existingTask = await this.findExistingTodoistTask(editor, blockId, advancedUri);
            
            if (existingTask) {
                if (!this.settings.allowDuplicateTasks) {
                    if (existingTask.isCompleted && !this.settings.allowResyncCompleted) {
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

                        const task = await this.todoistApi.addTask({
                            content: title,
                            projectId: this.settings.defaultProjectId || undefined,
                            description: fullDescription,
                            dueString: dueDate || undefined
                        });

                        // Get the Todoist task URL and insert it as a sub-item
                        const taskUrl = `https://todoist.com/app/task/${task.id}`;
                        await this.insertTodoistLink(editor, currentLine, taskUrl, this.isListItem(lineText));

                        new Notice('Task successfully synced to Todoist!');
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

            const fileUri = await this.generateFileUri();
            if (!fileUri) {
                return; // Error notice already shown in generateFileUri
            }

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

                    // Create task in Todoist
                    await this.todoistApi.addTask({
                        content: title,
                        projectId: this.settings.defaultProjectId || undefined,
                        description: fullDescription
                    });

                    new Notice('Task successfully created in Todoist!');
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

    private async generateFileUri(): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file found');
            return '';
        }

        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return '';

        // @ts-ignore
        const useUid = advancedUriPlugin.settings?.useUID || false;
        
        const vaultName = this.app.vault.getName();
        
        if (useUid) {
            // Get or create UID in frontmatter
            const uid = await this.frontmatterService.getOrCreateUid(file, editor);
            if (!uid) {
                new Notice('Failed to generate or retrieve UID for the note.');
                return '';
            }

            // Build the URI with proper encoding
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('uid', uid);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        } else {
            // If not using UID, use file path (with a warning)
            console.warn('Advanced URI plugin is configured to use file paths instead of UIDs. This may cause issues if file paths change.');
            
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('filepath', file.path);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        }
    }
}
