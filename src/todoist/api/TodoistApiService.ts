import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings } from '../../settings/types';
import { UIService } from '../../ui/UIService';
import { LoggingService } from '../../core/LoggingService';

export class TodoistApiService {
    private api: TodoistApi | null = null;
    private projects: Project[] = [];
    private loggingService: LoggingService;

    constructor(
        private settings: TodoistContextBridgeSettings,
        private uiService: UIService
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public getApi(): TodoistApi | null {
        return this.api;
    }

    public getProjects(): Project[] {
        return this.projects;
    }

    public async initializeApi(showNotice: boolean = false): Promise<boolean> {
        if (!this.settings.apiToken) {
            this.clearApiState();
            return false;
        }

        try {
            // Initialize API and verify by loading projects
            this.api = new TodoistApi(this.settings.apiToken);
            const projects = await this.api.getProjects();
            
            if (projects) {
                this.projects = projects;
                if (showNotice) {
                    this.loggingService.info('Todoist API initialized successfully');
                }
                return true;
            }
            
            this.clearApiState();
            return false;
        } catch (error) {
            this.loggingService.error('Failed to initialize Todoist API', error instanceof Error ? error : new Error(String(error)));
            this.clearApiState();
            return false;
        }
    }

    private clearApiState() {
        this.api = null;
        this.projects = [];
        this.loggingService.debug('API state cleared');
    }

    public async loadProjects(): Promise<void> {
        try {
            if (!this.api || !this.settings.apiToken) {
                this.clearApiState();
                return;
            }

            const projects = await this.api.getProjects();
            if (projects) {
                this.projects = projects;
                // Silently store projects
            }
        } catch (error) {
            this.loggingService.error('Failed to load Todoist projects', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('There is an error with the API token. Please check if the API token is correct.');
            this.clearApiState();
        }
    }

    public async addTask(taskDetails: {
        content: string;
        description?: string;
        projectId?: string;
        dueDate?: string;
        priority?: number;
    }) {
        try {
            if (!this.api) {
                this.loggingService.error('Cannot add task: API not initialized');
                return null;
            }

            const task = await this.api.addTask({
                content: taskDetails.content,
                description: taskDetails.description,
                projectId: taskDetails.projectId,
                dueString: taskDetails.dueDate,
                priority: taskDetails.priority
            });

            if (task) {
                this.loggingService.info('Task added successfully', { taskId: task.id });
                return task;
            }
            return null;
        } catch (error) {
            this.loggingService.error('Failed to add task to Todoist', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    public async updateTask(taskId: string, taskDetails: {
        content?: string;
        description?: string;
        projectId?: string;
        dueDate?: string;
        priority?: number;
    }) {
        if (!this.api) {
            throw new Error('Todoist API not initialized');
        }

        return await this.api.updateTask(taskId, {
            content: taskDetails.content,
            description: taskDetails.description,
            projectId: taskDetails.projectId,
            dueString: taskDetails.dueDate,
            priority: taskDetails.priority
        });
    }

    public async closeTask(taskId: string) {
        if (!this.api) {
            throw new Error('Todoist API not initialized');
        }

        return await this.api.closeTask(taskId);
    }

    public async reopenTask(taskId: string) {
        if (!this.api) {
            throw new Error('Todoist API not initialized');
        }

        return await this.api.reopenTask(taskId);
    }
}
