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

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];
    private todoistTaskService: TodoistTaskService;
    private urlService: UrlService;
    private uiService: UIService;

    async onload() {
        await this.loadSettings();

        // Initialize services
        this.initializeTodoistApi();
        this.urlService = new UrlService(this.app, this.settings);
        this.todoistTaskService = new TodoistTaskService(this.todoistApi, this.settings);
        this.uiService = new UIService(this.app, this.todoistApi, this.settings);

        // Add settings tab
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));

        // Add command to sync selected task to Todoist
        this.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: (editor: Editor) => this.syncSelectedTaskToTodoist(editor)
        });

        // Add command to create Todoist task from current file
        this.addCommand({
            id: 'create-todoist-from-file',
            name: 'Create Todoist task from current file',
            callback: () => this.createTodoistFromFile()
        });

        // Add command to create Todoist task from selected text
        this.addCommand({
            id: 'create-todoist-from-text',
            name: 'Create Todoist task from selected text',
            editorCallback: (editor: Editor) => this.createTodoistFromText(editor)
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async syncSelectedTaskToTodoist(editor: Editor) {
        if (!this.uiService.showApiTokenError(editor)) {
            return;
        }

        // Check if the selected line is a task
        const lineText = editor.getLine(editor.getCursor().line);
        if (!this.todoistTaskService.isTaskLine(lineText)) {
            this.uiService.showError('Please select a task line (with checkbox)', editor);
            return;
        }

        // Get or create block ID for the task
        const blockId = this.getBlockId(editor);
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

        // Extract task details
        const taskText = this.todoistTaskService.getTaskText(editor);
        const taskDetails = this.todoistTaskService.extractTaskDetails(taskText);

        // Show modal for task creation/update
        this.uiService.showTaskToTodoistModal(
            editor,
            existingTask,
            this.projects,
            {
                content: taskDetails.cleanText,
                description: `Source: ${advancedUri}`,
                dueDate: taskDetails.dueDate ? this.todoistTaskService.formatTodoistDueDate(taskDetails.dueDate) : undefined,
            },
            async (taskUrl: string) => this.urlService.insertTodoistLink(editor, editor.getCursor().line, taskUrl, this.todoistTaskService.isListItem(lineText))
        );
    }

    async createTodoistFromFile() {
        try {
            if (!this.uiService.showApiTokenError()) {
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
                return; // Error notice already shown in generateFileUri
            }

            // Show modal for task input
            this.uiService.showNonTaskToTodoistModal(
                false,
                fileUri,
                this.projects,
                undefined,
                undefined,
                async (title: string, description: string) => {
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
                }
            );

        } catch (error) {
            console.error('Error in createTodoistFromFile:', error);
            this.uiService.showError('An error occurred. Please try again.');
        }
    }

    async createTodoistFromText(editor: Editor) {
        try {
            if (!this.uiService.showApiTokenError(editor)) {
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

            // Get or create block ID using the new method
            const blockId = this.getOrCreateBlockId(editor, currentCursor.line);
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
            this.uiService.showNonTaskToTodoistModal(
                this.settings.includeSelectedText,
                advancedUri,
                this.projects,
                lineContent,
                async (taskUrl: string) => this.urlService.insertTodoistLink(editor, currentCursor.line, taskUrl, this.isListItem(lineContent))
            );

        } catch (error) {
            console.error('Error in createTodoistFromText:', error);
            this.uiService.showError('An error occurred. Please try again.', editor);
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
        return this.uiService.showAdvancedUriError();
    }

    private getBlockId(editor: Editor): string | null {
        const currentLine = editor.getCursor().line;
        const lineText = editor.getLine(currentLine);

        // Look for existing block ID
        const blockIdMatch = lineText.match(/\^([a-zA-Z0-9-]+)$/);
        if (blockIdMatch) {
            return blockIdMatch[1];
        }

        // Generate new block ID
        const newBlockId = generateBlockId();

        // Store current cursor
        const currentCursor = editor.getCursor();

        // Add block ID to the line
        editor.setLine(currentLine, `${lineText} ^${newBlockId}`);

        // Restore cursor position
        editor.setCursor(currentCursor);
        return newBlockId;
    }

    private getOrCreateBlockId(editor: Editor, line: number): string | null {
        const lineText = editor.getLine(line);

        // Look for existing block ID
        const blockIdMatch = lineText.match(/\^([a-zA-Z0-9-]+)$/);
        if (blockIdMatch) {
            return blockIdMatch[1];
        }

        // Generate new block ID
        const newBlockId = generateBlockId();

        // Store current cursor
        const currentCursor = editor.getCursor();

        // Add block ID to the line
        editor.setLine(line, `${lineText} ^${newBlockId}`);

        // Restore cursor position
        editor.setCursor(currentCursor);
        return newBlockId;
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    private isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.todoistTaskService.isTaskLine(line);
    }

    private isListItem(line: string): boolean {
        return /^[\s]*[-*]/.test(line);
    }
}
