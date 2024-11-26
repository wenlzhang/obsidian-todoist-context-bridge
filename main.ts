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
import { UIService } from './src/services/UIService';
import { BlockIdService } from './src/services/BlockIdService';
import { TodoistApiService } from './src/services/TodoistApiService';
import { CommandService } from './src/services/CommandService';

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    private todoistApiService: TodoistApiService;
    private todoistTaskService: TodoistTaskService;
    private urlService: UrlService;
    private uiService: UIService;
    private blockIdService: BlockIdService;
    private commandService: CommandService;

    async onload() {
        await this.loadSettings();

        // Initialize services
        this.uiService = new UIService(this.app, null, this.settings);
        this.todoistApiService = new TodoistApiService(this.settings, this.uiService);
        this.urlService = new UrlService(this.app, this.settings);
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settings);
        this.blockIdService = new BlockIdService();
        this.commandService = new CommandService(this);

        // Register commands
        this.commandService.registerCommands();

        // Add settings tab
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));

        // Load initial projects
        await this.todoistApiService.loadProjects();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async syncSelectedTaskToTodoist(editor: Editor) {
        if (!this.todoistApiService.getApi()) {
            this.uiService.showError('Please set up your Todoist API token first.', editor);
            return;
        }

        // Check if the selected line is a task
        const lineText = editor.getLine(editor.getCursor().line);
        if (!this.todoistTaskService.isTaskLine(lineText)) {
            this.uiService.showError('Please select a task line (with checkbox)', editor);
            return;
        }

        // Get or create block ID for the task
        const blockId = this.blockIdService.getBlockId(editor);
        if (!blockId) {
            this.uiService.showBlockIdError(editor);
            return;
        }

        // Generate Advanced URI
        const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
        if (!advancedUri) {
            this.uiService.showAdvancedUriGenerationError(editor);
            return;
        }

        // Check if task is already synced with Todoist
        const existingTask = await this.todoistTaskService.findExistingTodoistTask(editor, blockId, advancedUri);

        if (existingTask) {
            // Show modal with existing task info
            new TaskToTodoistModal(
                this.app,
                this.todoistApiService.getApi(),
                editor,
                this.settings,
                existingTask,
                this.todoistApiService.getProjects(),
                (taskUrl: string) => this.urlService.insertTodoistLink(editor, editor.getCursor().line, taskUrl, this.todoistTaskService.isListItem(lineText))
            ).open();
            return;
        }

        // Extract task details for new task
        const taskText = this.todoistTaskService.getTaskText(editor);
        const taskDetails = this.todoistTaskService.extractTaskDetails(taskText);

        // Show modal for new task
        new TaskToTodoistModal(
            this.app,
            this.todoistApiService.getApi(),
            editor,
            this.settings,
            {
                content: taskDetails.cleanText,
                description: `Source: ${advancedUri}`,
                dueDate: taskDetails.dueDate ? this.todoistTaskService.formatTodoistDueDate(taskDetails.dueDate) : undefined,
            },
            this.todoistApiService.getProjects(),
            (taskUrl: string) => this.urlService.insertTodoistLink(editor, editor.getCursor().line, taskUrl, this.todoistTaskService.isListItem(lineText))
        ).open();
    }

    async createTodoistFromFile() {
        try {
            if (!this.todoistApiService.getApi()) {
                this.uiService.showError('Please set up your Todoist API token first.');
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                return;
            }

            const file = this.app.workspace.getActiveFile();
            if (!file) {
                this.uiService.showNoActiveFileError();
                return;
            }

            const fileUri = await this.urlService.generateFileUri();
            if (!fileUri) {
                return;
            }

            // Show modal for task input
            new NonTaskToTodoistModal(
                this.app,
                this.settings.includeSelectedText,
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
                        await this.todoistApiService.addTask({
                            content: title,
                            projectId: this.settings.defaultProjectId,
                            description: fullDescription
                        });

                        this.uiService.showSuccess('Task successfully created in Todoist!');
                    } catch (error) {
                        console.error('Failed to create Todoist task:', error);
                        this.uiService.showError('Failed to create Todoist task. Please check your settings and try again.');
                    }
                }
            ).open();

        } catch (error) {
            console.error('Error in createTodoistFromFile:', error);
            this.uiService.showError('An error occurred. Please try again.');
        }
    }

    async createTodoistFromText(editor: Editor) {
        try {
            if (!this.todoistApiService.getApi()) {
                this.uiService.showError('Please set up your Todoist API token first.', editor);
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                return;
            }

            const currentCursor = editor.getCursor();
            const lineContent = editor.getLine(currentCursor.line);

            if (!this.isNonEmptyTextLine(lineContent)) {
                this.uiService.showNonEmptyLineError(editor);
                return;
            }

            // Get or create block ID
            const blockId = this.blockIdService.getOrCreateBlockId(editor, currentCursor.line);
            if (!blockId) {
                this.uiService.showBlockIdError(editor);
                return;
            }
            
            // Generate the advanced URI for the block
            const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                this.uiService.showAdvancedUriGenerationError(editor);
                return;
            }

            // Show modal for task input
            new NonTaskToTodoistModal(
                this.app,
                this.settings.includeSelectedText,
                async (title, description) => {
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
                        const task = await this.todoistApiService.addTask({
                            content: title,
                            projectId: this.settings.defaultProjectId,
                            description: fullDescription
                        });

                        // Get the Todoist task URL and insert it as a sub-item
                        const taskUrl = `https://todoist.com/app/task/${task.id}`;
                        await this.urlService.insertTodoistLink(editor, currentCursor.line, taskUrl, this.isListItem(lineContent));

                        this.uiService.showSuccess('Task successfully created in Todoist!');
                    } catch (error) {
                        console.error('Failed to create Todoist task:', error);
                        this.uiService.showError('Failed to create Todoist task. Please check your settings and try again.', editor);
                    }
                }
            ).open();

        } catch (error) {
            console.error('Error in createTodoistFromText:', error);
            this.uiService.showError('An error occurred. Please try again.', editor);
        }
    }

    public initializeTodoistApi() {
        this.todoistApiService.initializeApi();
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settings);
        this.todoistApiService.loadProjects();
    }

    checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            this.uiService.showError('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        return true;
    }

    // Task-related methods delegating to TodoistTaskService
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

    // Text formatting and line analysis methods
    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    private isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.todoistTaskService.isTaskLine(line);
    }

    private isListItem(line: string): boolean {
        return /^[\s]*[-*]\s/.test(line);
    }
}
