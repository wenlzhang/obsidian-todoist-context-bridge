import { App, Editor, Notice, Plugin } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TaskToTodoistModal } from './src/modals/TaskToTodoistModal';
import { NonTaskToTodoistModal } from './src/modals/NonTaskToTodoistModal';
import { TodoistContextBridgeSettingTab } from './src/settings/SettingsTab';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { TodoistTaskInfo, TaskDetails } from './src/utils/types';
import { generateUUID, generateBlockId, generateNonTaskBlockId } from './src/utils/helpers';
import { TodoistTaskService } from './src/services/TodoistTaskService';

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];
    private todoistTaskService: TodoistTaskService;

    async onload() {
        await this.loadSettings();

        // Initialize Todoist API if token exists
        this.initializeTodoistApi();

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
                await this.createTodoistFromText(editor);
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
            // Initialize TodoistTaskService with the new API instance
            this.todoistTaskService = new TodoistTaskService(this.todoistApi, this.settings);
        } else {
            this.todoistApi = null;
            this.todoistTaskService = new TodoistTaskService(null, this.settings);
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

    private async ensureUidInFrontmatter(file: any, editor: Editor): Promise<string | null> {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return null;

        // Store current cursor position
        const currentCursor = editor.getCursor();

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        
        // Check for UUID field and ensure it has a value
        const existingUid = frontmatter?.[this.settings.uidField];
        if (existingUid && existingUid.trim() !== '') {
            return existingUid;
        }

        // Generate new UID
        const newUid = generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        let newContent: string;
        let lineOffset = 0;

        if (hasExistingFrontmatter) {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                // Get existing frontmatter content
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                let newFrontmatter: string;

                if (frontmatterContent.includes(`${this.settings.uidField}:`)) {
                    // UUID field exists but is empty, replace the empty field
                    newFrontmatter = frontmatterContent.replace(
                        new RegExp(`${this.settings.uidField}:[ ]*(\n|$)`),
                        `${this.settings.uidField}: ${newUid}\n`
                    );
                } else {
                    // No UUID field, add it to existing frontmatter
                    newFrontmatter = frontmatterContent.trim() + `\n${this.settings.uidField}: ${newUid}\n`;
                }

                newContent = '---\n' + newFrontmatter + '---' + content.slice(endOfFrontmatter + 3);
                
                // Calculate line offset
                const oldLines = frontmatterContent.split('\n').length;
                const newLines = newFrontmatter.split('\n').length;
                lineOffset = newLines - oldLines;
            } else {
                // Malformed frontmatter, create new one
                newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n${content.slice(4)}`;
                lineOffset = 3;
            }
        } else {
            // No frontmatter, create new one with an empty line after
            newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n${content}`;
            lineOffset = 4;
        }

        // Calculate if cursor is after frontmatter
        const cursorLine = currentCursor.line;
        const isCursorAfterFrontmatter = hasExistingFrontmatter ? 
            cursorLine > (content.slice(0, content.indexOf('---\n', 4) + 4).split('\n').length - 1) :
            true;

        // Store current scroll position
        const scrollInfo = editor.getScrollInfo();

        await this.app.vault.modify(file, newContent);

        // Restore cursor position
        if (isCursorAfterFrontmatter) {
            editor.setCursor({
                line: currentCursor.line + lineOffset,
                ch: currentCursor.ch
            });
        } else {
            editor.setCursor(currentCursor);
        }

        // Restore scroll position
        editor.scrollTo(scrollInfo.left, scrollInfo.top);

        return newUid;
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
        const newBlockId = generateBlockId();
        
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
        const newBlockId = generateBlockId();
        
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
            const uid = await this.ensureUidInFrontmatter(file, editor);
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
        return this.todoistTaskService.getTaskText(editor);
    }

    private async isTaskCompleted(editor: Editor): Promise<boolean> {
        return this.todoistTaskService.isTaskCompleted(editor);
    }

    private getTodoistTaskId(editor: Editor, taskLine: number): string | null {
        return this.todoistTaskService.getTodoistTaskId(editor, taskLine);
    }

    private isTaskLine(line: string): boolean {
        return this.todoistTaskService.isTaskLine(line);
    }

    private getTaskStatus(line: string): 'open' | 'completed' | 'other' {
        return this.todoistTaskService.getTaskStatus(line);
    }

    private getDefaultCleanupPatterns(): string[] {
        return this.todoistTaskService.getDefaultCleanupPatterns();
    }

    private extractTaskDetails(taskText: string): TaskDetails {
        return this.todoistTaskService.extractTaskDetails(taskText);
    }

    private formatTodoistDueDate(date: string): string {
        return this.todoistTaskService.formatTodoistDueDate(date);
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
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
            const newUid = generateUUID();
            const frontMatterContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n`;
            
            // Insert front matter at the beginning of the file
            editor.replaceRange(frontMatterContent, { line: 0, ch: 0 });
            
            // Adjust insertion line to account for new front matter (4 lines)
            insertionLine += 4;
        } else {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                
                if (!frontmatter?.[this.settings.uidField]) {
                    // Case 3: Front matter exists but no UUID
                    const newUid = generateUUID();
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

    private isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.isTaskLine(line);
    }

    private isListItem(line: string): boolean {
        return /^[\s]*[-*+]\s/.test(line);
    }

    async syncSelectedTaskToTodoist(editor: Editor) {
        if (!this.todoistApi) {
            new Notice('Please set up your Todoist API token in the settings');
            return;
        }

        // Check if the selected line is a task
        const lineText = editor.getLine(editor.getCursor().line);
        if (!this.todoistTaskService.isTaskLine(lineText)) {
            new Notice('Please select a task line (with checkbox)');
            return;
        }

        // Get or create block ID for the task
        const blockId = this.getBlockId(editor);
        if (!blockId) {
            new Notice('Failed to generate block ID');
            return;
        }

        // Generate Advanced URI
        const advancedUri = await this.generateAdvancedUri(blockId, editor);
        if (!advancedUri) {
            new Notice('Failed to generate Advanced URI');
            return;
        }

        // Check if task is already synced with Todoist
        const existingTask = await this.todoistTaskService.findExistingTodoistTask(editor, blockId, advancedUri);
        if (existingTask) {
            // Show modal with existing task info
            new TaskToTodoistModal(
                this.app,
                this.todoistApi,
                editor,
                this.settings,
                existingTask,
                this.projects,
                (taskUrl: string) => this.insertTodoistLink(editor, editor.getCursor().line, taskUrl, false)
            ).open();
            return;
        }

        // Extract task details
        const taskText = this.todoistTaskService.getTaskText(editor);
        const taskDetails = this.todoistTaskService.extractTaskDetails(taskText);

        // Show modal for new task
        new TaskToTodoistModal(
            this.app,
            this.todoistApi,
            editor,
            this.settings,
            {
                content: taskDetails.cleanText,
                description: `Source: ${advancedUri}`,
                dueDate: taskDetails.dueDate ? this.todoistTaskService.formatTodoistDueDate(taskDetails.dueDate) : undefined,
                priority: taskDetails.priority
            },
            this.projects,
            (taskUrl: string) => this.insertTodoistLink(editor, editor.getCursor().line, taskUrl, false)
        ).open();
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
            const fileCache = this.app.metadataCache.getFileCache(file);
            const frontmatter = fileCache?.frontmatter;
            const existingUid = frontmatter?.[this.settings.uidField];

            let uid: string;
            if (existingUid) {
                uid = existingUid;
            } else {
                // If no UID exists, create one and add it to frontmatter
                uid = generateUUID();
                const content = await this.app.vault.read(file);
                const hasExistingFrontmatter = content.startsWith('---\n');
                let newContent: string;

                if (hasExistingFrontmatter) {
                    const endOfFrontmatter = content.indexOf('---\n', 4);
                    if (endOfFrontmatter !== -1) {
                        newContent = content.slice(0, endOfFrontmatter) + 
                                   `${this.settings.uidField}: ${uid}\n` +
                                   content.slice(endOfFrontmatter);
                    } else {
                        newContent = `---\n${this.settings.uidField}: ${uid}\n---\n${content}`;
                        lineOffset = 3; // Adding three lines for new frontmatter
                    }
                } else {
                    newContent = `---\n${this.settings.uidField}: ${uid}\n---\n\n${content}`;
                }

                await this.app.vault.modify(file, newContent);
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

    async createTodoistFromText(editor: Editor) {
        try {
            // Store current cursor at the start
            const currentCursor = editor.getCursor();

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
            const blockId = this.getOrCreateBlockId(editor, currentLine);
            if (!blockId) {
                new Notice('Failed to generate block ID.');
                editor.setCursor(currentCursor);
                return;
            }
            
            // Generate the advanced URI for the block
            const advancedUri = await this.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                new Notice('Failed to generate reference link. Please check Advanced URI plugin settings.');
                editor.setCursor(currentCursor);
                return;
            }

            // Check if the current line is a list item
            const isListItem = this.isListItem(lineContent);

            // Show modal for task input
            new NonTaskToTodoistModal(this.app, this.settings.includeSelectedText, async (title, description) => {
                try {
                    // Prepare description components
                    const descriptionParts = [];
                    
                    // Add user's description if provided
                    if (description) {
                        descriptionParts.push(description);
                    }

                    // Add selected text if enabled
                    if (this.settings.includeSelectedText) {
                        descriptionParts.push(`Selected text: "${lineContent.trim()}"`);
                    }
                    
                    // Add reference link
                    descriptionParts.push(`Reference: ${advancedUri}`);

                    // Combine all parts of the description
                    const fullDescription = descriptionParts.join('\n\n');

                    // Create task in Todoist
                    const task = await this.todoistApi.addTask({
                        content: title,
                        projectId: this.settings.defaultProjectId || undefined,
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
}
