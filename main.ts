import { App, Editor, Plugin, TFile } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from './settings/types';
import { TodoistContextBridgeSettingTab } from './settings/SettingTab';
import { TodoistTaskService } from './services/TodoistTaskService';
import { UIService } from './services/UIService';
import { BlockIdService } from './services/BlockIdService';
import { UrlService } from './services/UrlService';
import { TodoistApiService } from './services/TodoistApiService';
import { CommandService } from './services/CommandService';
import { SettingsService } from './services/SettingsService';
import { FileService } from './services/FileService';
import { TaskSyncService } from './services/TaskSyncService';
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

    async onload() {
        // Load settings first
        await this.loadSettings();

        // Initialize core services
        this.uiService = new UIService(this.app, null, this.settings);
        this.blockIdService = new BlockIdService();
        this.urlService = new UrlService(this.app, this.uiService);
        this.fileService = new FileService(this.app, this.uiService);

        // Initialize API-dependent services
        this.todoistApiService = new TodoistApiService(this.settings, this.uiService);
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settings);
        
        // Initialize TaskSyncService
        this.taskSyncService = new TaskSyncService(
            this.todoistApiService.getApi(),
            this.settings,
            this.uiService,
            this.blockIdService,
            this.urlService,
            this.todoistTaskService,
            this.fileService
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
        await this.saveData(this.settings);
        this.initializeTodoistApi();
    }

    public initializeTodoistApi() {
        // Initialize TodoistApiService first
        this.todoistApiService.initializeApi();

        // Reinitialize services that depend on the API
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settings);
        this.uiService = new UIService(this.app, this.todoistApiService.getApi(), this.settings);
        
        // Load projects after API initialization
        this.todoistApiService.loadProjects();
    }

    async onunload() {
        // Cleanup if needed
    }

    private checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            this.uiService.showError('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        return true;
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
