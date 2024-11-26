import { Editor, TFile, App } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistTask } from '@doist/todoist-api-typescript';
import { UIService } from './UIService';
import { BlockIdService } from './BlockIdService';
import { UrlService } from './UrlService';
import { TodoistTaskService } from './TodoistTaskService';
import { FileService } from './FileService';
import { PluginService } from './PluginService';
import { LoggingService } from './LoggingService';
import { TodoistContextBridgeSettings } from '../settings/types';
import { TaskToTodoistModal } from '../modals/TaskToTodoistModal';
import { NonTaskToTodoistModal } from '../modals/NonTaskToTodoistModal';

export class TaskSyncService {
    private loggingService: LoggingService;

    constructor(
        private app: App,
        private todoistApi: TodoistApi,
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

    public async syncSelectedTaskToTodoist(editor: Editor): Promise<void> {
        try {
            if (!this.todoistApi) {
                this.loggingService.error('Todoist API not initialized');
                this.uiService.showError('Please set up your Todoist API token first.', editor);
                return;
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
                await this.todoistApi.getProjects(),
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
            this.uiService.showError('Failed to sync task to Todoist. Check console for details.');
        }
    }

    public async syncTaskWithTodoist(editor: Editor): Promise<void> {
        try {
            if (!this.todoistApi) {
                this.loggingService.error('Todoist API not initialized');
                this.uiService.showError('Please set up your Todoist API token first.', editor);
                return;
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
                advancedUri,
                await this.todoistApi.getProjects(),
                lineContent,
                async (taskUrl: string) => this.urlService.insertTodoistLink(
                    editor,
                    currentCursor.line,
                    taskUrl,
                    this.fileService.isListItem(lineContent)
                ),
                async (title: string, description: string) => {
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
                        const task = await this.todoistTaskService.createTask({
                            content: title,
                            projectId: this.settings.defaultProjectId,
                            description: fullDescription
                        });

                        if (!task) {
                            this.loggingService.error('Failed to create task in Todoist');
                            this.uiService.showError('Failed to create task in Todoist.', editor);
                            return;
                        }

                        // Get the Todoist task URL and insert it as a sub-item
                        const taskUrl = `https://todoist.com/app/task/${task.id}`;
                        await this.urlService.insertTodoistLink(
                            editor,
                            currentCursor.line,
                            taskUrl,
                            this.fileService.isListItem(lineContent)
                        );

                        this.loggingService.info('Task successfully created in Todoist');
                        this.uiService.showSuccess('Task successfully created in Todoist!');
                    } catch (error) {
                        this.loggingService.error('Failed to create Todoist task', error instanceof Error ? error : new Error(String(error)));
                        this.uiService.showError('Failed to create Todoist task. Please check your settings and try again.', editor);
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
            if (!this.todoistApi) {
                this.loggingService.error('Todoist API not initialized');
                this.uiService.showError('Please set up your Todoist API token first.');
                return;
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
                fileUri,
                await this.todoistApi.getProjects(),
                undefined,
                undefined,
                async (title: string, description: string) => {
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
                        const task = await this.todoistTaskService.createTask({
                            content: title,
                            projectId: this.settings.defaultProjectId,
                            description: fullDescription
                        });

                        if (!task) {
                            this.loggingService.error('Failed to create task in Todoist');
                            this.uiService.showError('Failed to create task in Todoist.');
                            return;
                        }

                        this.loggingService.info('Task successfully created in Todoist');
                        this.uiService.showSuccess('Task successfully created in Todoist!');
                    } catch (error) {
                        this.loggingService.error('Failed to create Todoist task', error instanceof Error ? error : new Error(String(error)));
                        this.uiService.showError('Failed to create Todoist task. Please check your settings and try again.');
                    }
                }
            ).open();
        } catch (error) {
            this.loggingService.error('Error in syncFileWithTodoist', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('An error occurred. Please try again.');
        }
    }
}
