import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings } from '../settings/types';
import { UIService } from './UIService';

export class TodoistApiService {
    private api: TodoistApi | null = null;
    private projects: Project[] = [];

    constructor(
        private settings: TodoistContextBridgeSettings,
        private uiService: UIService
    ) {
        this.initializeApi();
    }

    public getApi(): TodoistApi | null {
        return this.api;
    }

    public getProjects(): Project[] {
        return this.projects;
    }

    public initializeApi() {
        if (this.settings.apiToken) {
            this.api = new TodoistApi(this.settings.apiToken);
            // Load projects after API initialization
            this.loadProjects();
        } else {
            this.api = null;
            this.projects = [];
        }
    }

    public async loadProjects(): Promise<void> {
        try {
            const projects = await this.api?.getProjects();
            if (projects) {
                this.projects = projects;
            }
        } catch (error) {
            console.error('Failed to load Todoist projects:', error);
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
        if (!this.api) {
            throw new Error('Todoist API not initialized');
        }

        return await this.api.addTask({
            content: taskDetails.content,
            description: taskDetails.description,
            projectId: taskDetails.projectId,
            dueString: taskDetails.dueDate,
            priority: taskDetails.priority
        });
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
