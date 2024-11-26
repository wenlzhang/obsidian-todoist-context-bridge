import { App, Editor, Plugin, TFile } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from './settings/types';
import { TodoistContextBridgeSettingTab } from './settings/SettingsTab';
import { TodoistTaskService } from './todoist/task/TodoistTaskService';
import { UIService } from './ui/UIService';
import { BlockIdService } from './file/BlockIdService';
import { UrlService } from './file/UrlService';
import { TodoistApiService } from './todoist/api/TodoistApiService';
import { CommandService } from './ui/CommandService';
import { SettingsService } from './core/SettingsService';
import { FileService } from './file/FileService';
import { TaskSyncService } from './todoist/sync/TaskSyncService';
import { PluginService } from './core/PluginService';
import { TaskDetails } from './utils/types';

export default class TodoistContextBridgePlugin extends Plugin {
    private settings: TodoistContextBridgeSettings;
    private todoistApiService: TodoistApiService;
    private todoistTaskService: TodoistTaskService;
    private uiService: UIService;
    private blockIdService: BlockIdService;
    private urlService: UrlService;
    private commandService: CommandService;
    private fileService: FileService;
    private taskSyncService: TaskSyncService;
    private pluginService: PluginService;

    async onload() {
        // Load settings first
        await this.loadSettings();

        // Initialize core services
        this.uiService = new UIService(this.app, null, this.settings);
        this.blockIdService = new BlockIdService(this.settings);
        this.urlService = new UrlService(this.app, this.uiService);
        this.fileService = new FileService(this.app, this.uiService);
        this.pluginService = new PluginService(this.app, this.uiService);

        // Initialize API-dependent services
        this.todoistApiService = new TodoistApiService(this.settings, this.uiService);
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settings);
        
        // Initialize TaskSyncService
        this.taskSyncService = new TaskSyncService(
            this.app,
            this.todoistApiService,
            this.settings,
            this.uiService,
            this.blockIdService,
            this.urlService,
            this.todoistTaskService,
            this.fileService,
            this.pluginService
        );

        // Initialize command service last
        this.commandService = new CommandService(
            this,
            this.taskSyncService,
            this.todoistApiService,
            this.fileService
        );

        // Register commands and settings
        this.commandService.registerCommands();
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));

        // Initialize API if token exists
        if (this.settings.apiToken) {
            this.initializeTodoistApi();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        const previousToken = this.settings.apiToken;
        await this.saveData(this.settings);
        
        // Initialize or clear API based on token changes
        if (previousToken !== this.settings.apiToken) {
            this.initializeTodoistApi();
        }
    }

    public initializeTodoistApi() {
        // Initialize TodoistApiService
        this.todoistApiService.initializeApi();

        // Only reinitialize dependent services if API is available
        if (this.todoistApiService.getApi()) {
            this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settings);
            this.uiService = new UIService(this.app, this.todoistApiService.getApi(), this.settings);
        } else {
            // Reset services with null API when token is removed
            this.todoistTaskService = new TodoistTaskService(null, this.settings);
            this.uiService = new UIService(this.app, null, this.settings);
        }
    }

    async onunload() {
        // Cleanup if needed
    }

    private getBlockId(editor: Editor): string | null {
        return this.blockIdService.getBlockId(editor);
    }

    private getOrCreateBlockId(editor: Editor, line: number): string | null {
        return this.blockIdService.getOrCreateBlockId(editor, line);
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

    // Task synchronization methods
    public async syncSelectedTaskToTodoist(editor: Editor) {
        await this.taskSyncService.syncSelectedTaskToTodoist(editor);
    }

    public async createTodoistFromText(editor: Editor) {
        await this.taskSyncService.syncTaskWithTodoist(editor);
    }

    public async createTodoistFromFile() {
        const file = this.fileService.getActiveFile();
        if (file) {
            await this.taskSyncService.syncFileWithTodoist(file);
        } else {
            this.uiService.showNoActiveFileError();
        }
    }
}
