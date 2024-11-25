import { App, Editor, Notice, Plugin } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TaskToTodoistModal } from './src/modals/TaskToTodoistModal';
import { NonTaskToTodoistModal } from './src/modals/NonTaskToTodoistModal';
import { TodoistContextBridgeSettingTab } from './src/settings/SettingsTab';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { TodoistTaskInfo, TaskDetails } from './src/utils/types';
import { generateUUID, generateBlockId, generateNonTaskBlockId } from './src/utils/helpers';
import { TodoistTaskService } from './src/services/TodoistTaskService';
import { UrlService } from './src/services/UrlService';

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];
    private todoistTaskService: TodoistTaskService;
    private urlService: UrlService;

    async onload() {
        await this.loadSettings();

        // Initialize services
        this.initializeTodoistApi();
        this.urlService = new UrlService(this.app, this.settings);

        // Initialize TodoistTaskService with the new API instance
        this.todoistTaskService = new TodoistTaskService(this.todoistApi, this.settings);

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
        const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
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
                (taskUrl: string) => this.urlService.insertTodoistLink(editor, editor.getCursor().line, taskUrl, this.todoistTaskService.isListItem(lineText))
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
            },
            this.projects,
            (taskUrl: string) => this.urlService.insertTodoistLink(editor, editor.getCursor().line, taskUrl, this.todoistTaskService.isListItem(lineText))
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

            const fileUri = await this.urlService.generateFileUri();
            if (!fileUri) {
                return; // Error notice already shown in generateFileUri
            }

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
                }
            ).open();

        } catch (error) {
            console.error('Error in createTodoistFromFile:', error);
            new Notice('An error occurred. Please try again.');
        }
    }

    async createTodoistFromText(editor: Editor) {
        try {
            if (!this.todoistApi) {
                new Notice('Please set up your Todoist API token in settings');
                return;
            }

            // Get the selected text
            const selectedText = editor.getSelection();
            if (!selectedText) {
                new Notice('Please select some text first');
                return;
            }

            // Generate a block ID for the text
            const blockId = generateNonTaskBlockId();
            if (!blockId) {
                new Notice('Failed to generate block ID');
                return;
            }

            // Add block ID to the end of the selected text
            const line = editor.getCursor().line;
            const text = editor.getLine(line);
            editor.setLine(line, `${text} ^${blockId}`);

            // Generate Advanced URI
            const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                new Notice('Failed to generate Advanced URI');
                return;
            }

            // Show modal for new task
            new NonTaskToTodoistModal(
                this.app,
                this.todoistApi,
                this.settings,
                advancedUri,
                this.projects,
                selectedText,
                (taskUrl: string) => this.urlService.insertTodoistLink(editor, line, taskUrl, false)
            ).open();

        } catch (error) {
            console.error('Failed to create Todoist task:', error);
            new Notice('Failed to create Todoist task. Please check your settings and try again.');
        }
    }
}
