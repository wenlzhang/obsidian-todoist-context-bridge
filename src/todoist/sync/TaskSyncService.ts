import { Editor, TFile, App } from 'obsidian';
import { TodoistApi, TodoistTask } from '@doist/todoist-api-typescript';
import { UIService } from '../../ui/UIService';
import { BlockIdService } from '../../file/BlockIdService';
import { UrlService } from '../../file/UrlService';
import { TodoistTaskService } from '..';
import { FileService } from '../../file/FileService';
import { PluginService } from '../../core/PluginService';
import { LoggingService } from '../../core/LoggingService';
import { TodoistContextBridgeSettings } from '../../settings/types';
import { TaskToTodoistModal } from '../../modals/TaskToTodoistModal';
import { NonTaskToTodoistModal } from '../../modals/NonTaskToTodoistModal';
import { TodoistApiService } from '../../core/TodoistApiService';

export interface TaskCreationOptions {
    title: string;
    description?: string;
    selectedText?: string;
    referenceUri: string;
}

export class TaskSyncService {
    private loggingService: LoggingService;

    constructor(
        private app: App,
        private todoistApiService: TodoistApiService,
        private settings: TodoistContextBridgeSettings,
        private uiService: UIService,
        private blockIdService: BlockIdService,
        private urlService: UrlService,
        private todoistTaskService: TodoistTaskService,
        private fileService: FileService,
        private pluginService: PluginService
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    private async createTodoistTask(options: TaskCreationOptions, editor?: Editor): Promise<TodoistTask | null> {
        try {
            // Prepare description components
            const descriptionParts = [];
            
            // Add user's description if provided
            if (options.description) {
                descriptionParts.push(options.description);
            }

            // Add selected text if enabled and provided
            if (this.settings.includeSelectedText && options.selectedText) {
                descriptionParts.push(`Selected text: "${options.selectedText.trim()}"`);
            }
            
            // Add reference link
            descriptionParts.push(`Reference: ${options.referenceUri}`);

            // Combine all parts of the description
            const fullDescription = descriptionParts.join('\n\n');

            // Create task in Todoist
            const task = await this.todoistTaskService.createTask({
                content: options.title,
                projectId: this.settings.defaultProjectId,
                description: fullDescription
            });

            if (!task) {
                this.loggingService.error('Failed to create task in Todoist');
                this.uiService.showError('Failed to create task in Todoist.', editor);
                return null;
            }

            this.loggingService.info('Task successfully created in Todoist');
            this.uiService.showSuccess('Task successfully created in Todoist!');
            return task;
        } catch (error) {
            this.loggingService.error('Failed to create Todoist task', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('Failed to create Todoist task. Please check your settings and try again.', editor);
            return null;
        }
    }

    public async syncSelectedTaskToTodoist(editor: Editor): Promise<void> {
        try {
            if (!this.settings.apiToken) {
                this.loggingService.error('No API token configured');
                this.uiService.showError('Please set up your Todoist API token in the plugin settings.', editor);
                return;
            }

            const todoistApi = this.todoistApiService.getApi();
            if (!todoistApi) {
                // Try to initialize API if token exists but API is not initialized
                const success = await this.todoistApiService.initializeApi();
                if (!success) {
                    this.loggingService.error('Todoist API initialization failed');
                    this.uiService.showError('Failed to initialize Todoist API. Please verify your API token in settings.', editor);
                    return;
                }
            }

            if (!this.pluginService.checkAdvancedUriPlugin()) {
                return;
            }

            // Check if the selected line is a task
            const lineText = editor.getLine(editor.getCursor().line);
            if (!this.todoistTaskService.isTaskLine(lineText)) {
                this.loggingService.warning('Selected line is not a task');
                this.uiService.showError('Please select a task line (with checkbox)', editor);
                return;
            }

            // Get or create block ID for the task
            const blockId = this.blockIdService.getBlockId(editor);
            if (!blockId) {
                this.loggingService.error('Failed to get or create block ID');
                this.uiService.showBlockIdError(editor);
                return;
            }

            // Generate Advanced URI
            const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                this.loggingService.error('Failed to generate Advanced URI');
                this.uiService.showAdvancedUriGenerationError(editor);
                return;
            }

            // Check if task is already synced with Todoist
            const existingTask = await this.todoistTaskService.findExistingTodoistTask(editor, blockId, advancedUri);
            
            if (existingTask) {
                this.loggingService.debug('Found existing Todoist task', { taskId: existingTask.id });
            }

            // Extract task details for new task
            const taskText = this.todoistTaskService.getTaskText(editor);
            const taskDetails = this.todoistTaskService.extractTaskDetails(taskText);

            this.loggingService.debug('Opening TaskToTodoistModal', { 
                existingTask: !!existingTask,
                taskDetails 
            });

            // Show modal for task creation/update
            this.uiService.showTaskToTodoistModal(
                editor,
                existingTask,
                await this.todoistApiService.getApi().getProjects(),
                {
                    content: taskDetails.cleanText,
                    description: `Source: ${advancedUri}`,
                    dueDate: taskDetails.dueDate ? this.todoistTaskService.formatTodoistDueDate(taskDetails.dueDate) : undefined,
                },
                (taskUrl: string) => this.urlService.insertTodoistLink(
                    editor,
                    editor.getCursor().line,
                    taskUrl,
                    this.todoistTaskService.isListItem(lineText)
                )
            );
        } catch (error) {
            this.loggingService.error('Failed to sync task to Todoist', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('Failed to sync task to Todoist. Check console for details.', editor);
        }
    }

    public async syncTaskWithTodoist(editor: Editor): Promise<void> {
        try {
            if (!this.settings.apiToken) {
                this.loggingService.error('No API token configured');
                this.uiService.showError('Please set up your Todoist API token in the plugin settings.', editor);
                return;
            }

            const todoistApi = this.todoistApiService.getApi();
            if (!todoistApi) {
                // Try to initialize API if token exists but API is not initialized
                const success = await this.todoistApiService.initializeApi();
                if (!success) {
                    this.loggingService.error('Todoist API initialization failed');
                    this.uiService.showError('Failed to initialize Todoist API. Please verify your API token in settings.', editor);
                    return;
                }
            }

            if (!this.pluginService.checkAdvancedUriPlugin()) {
                return;
            }

            const currentCursor = editor.getCursor();
            const lineContent = editor.getLine(currentCursor.line);

            if (!this.fileService.isNonEmptyTextLine(lineContent)) {
                this.loggingService.warning('Selected line is empty');
                this.uiService.showNonEmptyLineError(editor);
                return;
            }

            // Get or create block ID
            const blockId = this.blockIdService.getOrCreateBlockId(editor, currentCursor.line);
            if (!blockId) {
                this.loggingService.error('Failed to get or create block ID');
                this.uiService.showBlockIdError(editor);
                return;
            }
            
            // Generate the advanced URI for the block
            const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                this.loggingService.error('Failed to generate Advanced URI');
                this.uiService.showAdvancedUriGenerationError(editor);
                return;
            }

            // Show modal for task input using original modal class
            new NonTaskToTodoistModal(
                this.app,
                this.settings.includeSelectedText,
                async (title: string, description: string) => {
                    const task = await this.createTodoistTask({
                        title,
                        description,
                        selectedText: lineContent,
                        referenceUri: advancedUri
                    }, editor);

                    if (task) {
                        const taskUrl = `https://todoist.com/app/task/${task.id}`;
                        await this.urlService.insertTodoistLink(
                            editor,
                            currentCursor.line,
                            taskUrl,
                            this.fileService.isListItem(lineContent)
                        );
                    }
                }
            ).open();
        } catch (error) {
            this.loggingService.error('Error in syncTaskWithTodoist', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('An error occurred. Please try again.', editor);
        }
    }

    public async syncFileWithTodoist(file: TFile): Promise<void> {
        try {
            if (!this.settings.apiToken) {
                this.loggingService.error('No API token configured');
                this.uiService.showError('Please set up your Todoist API token in the plugin settings.');
                return;
            }

            const todoistApi = this.todoistApiService.getApi();
            if (!todoistApi) {
                // Try to initialize API if token exists but API is not initialized
                const success = await this.todoistApiService.initializeApi();
                if (!success) {
                    this.loggingService.error('Todoist API initialization failed');
                    this.uiService.showError('Failed to initialize Todoist API. Please verify your API token in settings.');
                    return;
                }
            }

            if (!this.pluginService.checkAdvancedUriPlugin()) {
                return;
            }

            if (!file) {
                this.loggingService.warning('No active file');
                this.uiService.showNoActiveFileError();
                return;
            }

            const fileUri = await this.urlService.generateFileUri();
            if (!fileUri) {
                return;
            }

            // Show modal for task input using original modal class
            new NonTaskToTodoistModal(
                this.app,
                false,
                async (title: string, description: string) => {
                    await this.createTodoistTask({
                        title,
                        description,
                        referenceUri: fileUri
                    });
                }
            ).open();
        } catch (error) {
            this.loggingService.error('Error in syncFileWithTodoist', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('An error occurred. Please try again.');
        }
    }
}
