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
import { TodoistApiService } from '../api/TodoistApiService';

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

            // Initialize API if needed
            if (!this.todoistApiService.isInitialized()) {
                const success = await this.todoistApiService.initializeApi();
                if (!success) {
                    this.loggingService.error('Todoist API initialization failed');
                    this.uiService.showError('Failed to initialize Todoist API. Please verify your API token in settings.', editor);
                    return;
                }
            }

            const todoistApi = this.todoistApiService.getApi();
            if (!todoistApi) {
                this.loggingService.error('Todoist API not available after initialization');
                this.uiService.showError('Failed to access Todoist API. Please try again.', editor);
                return;
            }

            // Fetch projects before showing modal
            let projects;
            try {
                projects = await todoistApi.getProjects();
            } catch (error) {
                this.loggingService.error('Failed to fetch Todoist projects', error instanceof Error ? error : new Error(String(error)));
                this.uiService.showError('Failed to fetch Todoist projects. Please check your connection and try again.', editor);
                return;
            }

            const selectedText = editor.getSelection();
            const file = this.app.workspace.getActiveFile();
            if (!file) {
                this.loggingService.error('No active file found');
                this.uiService.showError('No active file found.', editor);
                return;
            }

            let blockId: string;
            try {
                blockId = await this.blockIdService.getOrCreateBlockId(editor);
                if (!blockId) {
                    throw new Error('Failed to get or create block ID');
                }
            } catch (error) {
                this.loggingService.error('Error getting or creating block ID', error instanceof Error ? error : new Error(String(error)));
                this.uiService.showError('Failed to create block reference. Please try again.', editor);
                return;
            }

            const referenceUri = await this.urlService.createUri(file, blockId);
            if (!referenceUri) {
                this.loggingService.error('Failed to create reference URI');
                this.uiService.showError('Failed to create reference link. Please check if Advanced URI plugin is installed.', editor);
                return;
            }

            const taskDetails = {
                content: selectedText.split('\n')[0] || '',
                description: '',
                dueDate: undefined
            };

            this.loggingService.debug('Opening TaskToTodoistModal', {
                hasApi: !!todoistApi,
                projectCount: projects.length,
                hasBlockId: !!blockId,
                hasReferenceUri: !!referenceUri
            });

            const modal = new TaskToTodoistModal(
                this.app,
                todoistApi,
                editor,
                this.settings,
                taskDetails,
                projects,
                async (taskUrl: string) => {
                    await this.handleTaskCreated(taskUrl, editor, blockId);
                }
            );

            modal.open();
        } catch (error) {
            this.loggingService.error('Error in syncSelectedTaskToTodoist', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('An unexpected error occurred. Please try again.', editor);
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
            let blockId: string;
            try {
                blockId = this.blockIdService.getOrCreateBlockId(editor, currentCursor.line);
                if (!blockId) {
                    throw new Error('Failed to get or create block ID');
                }
            } catch (error) {
                this.loggingService.error('Error getting or creating block ID', error instanceof Error ? error : new Error(String(error)));
                this.uiService.showError('Failed to create block reference. Please try again.', editor);
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

    private async handleTaskCreated(taskUrl: string, editor: Editor, blockId: string): Promise<void> {
        try {
            await this.urlService.insertTodoistLink(editor, editor.getCursor().line, taskUrl, this.fileService.isListItem(editor.getLine(editor.getCursor().line)));
        } catch (error) {
            this.loggingService.error('Failed to insert Todoist link', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('Failed to insert Todoist link. Please try again.', editor);
        }
    }
}
