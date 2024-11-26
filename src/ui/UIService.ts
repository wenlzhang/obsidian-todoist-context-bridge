import { App, Editor, Notice } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TaskToTodoistModal } from '../modals/TaskToTodoistModal';
import { NonTaskToTodoistModal } from '../modals/NonTaskToTodoistModal';
import { TodoistTaskInfo } from '../todoist';
import { LoggingService } from '../core/LoggingService';

export class UIService {
    private loggingService: LoggingService;

    constructor(
        private app: App,
        private todoistApi: TodoistApi | null,
        private settings: any
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public showError(message: string, editor?: Editor) {
        this.loggingService.error(message);
        new Notice(message);
        if (editor) {
            const currentCursor = editor.getCursor();
            editor.setCursor(currentCursor);
        }
    }

    public showSuccess(message: string) {
        this.loggingService.info(message);
        new Notice(message);
    }

    public showWarning(message: string) {
        this.loggingService.warning(message);
    }

    public showTaskToTodoistModal(
        editor: Editor,
        existingTask: TodoistTaskInfo | null,
        projects: Project[],
        taskDetails: {
            content: string;
            description: string;
            dueDate?: string;
            priority?: number;
        },
        onTaskCreated: (taskUrl: string) => Promise<void>
    ) {
        try {
            new TaskToTodoistModal(
                this.app,
                this.todoistApi,
                editor,
                this.settings,
                existingTask || taskDetails,
                projects,
                onTaskCreated
            ).open();
        } catch (error) {
            this.loggingService.error('Failed to open task modal', error instanceof Error ? error : new Error(String(error)));
        }
    }

    public showNonTaskToTodoistModal(
        includeSelectedText: boolean,
        advancedUri: string,
        projects: Project[],
        selectedText?: string,
        onTaskCreated?: (taskUrl: string) => Promise<void>,
        onSubmit?: (title: string, description: string) => Promise<void>
    ) {
        if (onSubmit) {
            // Legacy mode for file-based tasks
            new NonTaskToTodoistModal(
                this.app,
                includeSelectedText,
                async (title: string, description: string) => {
                    try {
                        await onSubmit(title, description);
                        this.showSuccess('Task successfully created in Todoist!');
                    } catch (error) {
                        console.error('Failed to create Todoist task:', error);
                        this.showError('Failed to create Todoist task. Please check your settings and try again.');
                    }
                }
            ).open();
        } else {
            // New mode for text-based tasks
            new NonTaskToTodoistModal(
                this.app,
                this.todoistApi,
                this.settings,
                advancedUri,
                projects,
                selectedText,
                onTaskCreated
            ).open();
        }
    }

    public showAdvancedUriError() {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            this.showError('Advanced URI plugin is required but not installed. Please install it from the Community Plugins.');
            return false;
        }
        return true;
    }

    public showApiTokenError(editor?: Editor) {
        if (!this.todoistApi) {
            this.showError('Please set up your Todoist API token first.', editor);
            return false;
        }
        return true;
    }

    public showBlockIdError(editor?: Editor) {
        this.showError('Failed to generate block ID.', editor);
    }

    public showAdvancedUriGenerationError(editor?: Editor) {
        this.showError('Failed to generate reference link. Please check Advanced URI plugin settings.', editor);
    }

    public showNonEmptyLineError(editor?: Editor) {
        this.showError('Please select a non-empty line that is not a task.', editor);
    }

    public showNoActiveFileError() {
        this.showError('No active file found');
    }

    public showNoSelectionError() {
        this.showError('Please select some text first');
    }
}
