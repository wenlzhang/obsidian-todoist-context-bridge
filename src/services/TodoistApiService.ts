import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings } from '../settings/types';
import { UIService } from './UIService';
import { LoggingService } from './LoggingService';

export class TodoistApiService {
    private api: TodoistApi | null = null;
    private projects: Project[] = [];
    private loggingService: LoggingService;

    constructor(
        private settings: TodoistContextBridgeSettings,
        private uiService: UIService
    ) {
        this.loggingService = LoggingService.getInstance();
        this.initializeApi();
    }

    public getApi(): TodoistApi | null {
        if (!this.api) {
            this.loggingService.debug('Todoist API not initialized');
        }
        return this.api;
    }

    public getProjects(): Project[] {
        return this.projects;
    }

    public initializeApi() {
        if (this.settings.apiToken) {
            try {
                this.api = new TodoistApi(this.settings.apiToken);
                this.loggingService.info('Todoist API initialized successfully');
                // Load projects after API initialization
                this.loadProjects();
            } catch (error) {
                this.loggingService.error('Failed to initialize Todoist API', error instanceof Error ? error : new Error(String(error)));
                this.api = null;
                this.projects = [];
            }
        } else {
            this.loggingService.warning('No API token provided');
            this.api = null;
            this.projects = [];
        }
    }

    public async loadProjects(): Promise<void> {
        try {
            if (!this.api) {
                this.loggingService.error('Cannot load projects: API not initialized');
                return;
            }

            const projects = await this.api.getProjects();
            if (projects) {
                this.projects = projects;
                this.loggingService.info(`Successfully loaded ${projects.length} Todoist projects`);
                this.loggingService.debug('Loaded projects', { projectCount: projects.length });
            }
        } catch (error) {
            this.loggingService.error('Failed to load Todoist projects', error instanceof Error ? error : new Error(String(error)));
            this.uiService.showError('Failed to load Todoist projects. Please check your API token.');
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

            this.loggingService.debug('Adding task to Todoist', { 
                content: taskDetails.content,
                projectId: taskDetails.projectId,
                hasDueDate: !!taskDetails.dueDate
            });

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
