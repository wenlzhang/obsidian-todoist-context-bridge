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

export default class TodoistContextBridgePlugin extends Plugin {
    private settingsService: SettingsService;
    private todoistApiService: TodoistApiService;
    private todoistTaskService: TodoistTaskService;
    private uiService: UIService;
    private blockIdService: BlockIdService;
    private urlService: UrlService;
    private commandService: CommandService;
    private fileService: FileService;
    private taskSyncService: TaskSyncService;

    async onload() {
        await this.initializeServices();
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));
        this.commandService.registerCommands();
    }

    private async initializeServices() {
        // Initialize settings first
        this.settingsService = new SettingsService(this);
        await this.settingsService.loadSettings();

        // Initialize services in dependency order
        this.blockIdService = new BlockIdService();
        this.uiService = new UIService(this.app, null, this.settingsService.getSettings());
        this.urlService = new UrlService(this.app, this.uiService);
        this.fileService = new FileService(this.app, this.uiService);

        // Initialize API-dependent services
        this.todoistApiService = new TodoistApiService(this.settingsService.getSettings(), this.uiService);
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settingsService.getSettings());
        
        // Initialize TaskSyncService last as it depends on many other services
        this.taskSyncService = new TaskSyncService(
            this.todoistApiService.getApi(),
            this.settingsService.getSettings(),
            this.uiService,
            this.blockIdService,
            this.urlService,
            this.todoistTaskService,
            this.fileService
        );

        // Initialize command service last as it needs access to all other services
        this.commandService = new CommandService(
            this,
            this.taskSyncService,
            this.todoistApiService,
            this.fileService
        );

        // Initialize API if token exists
        this.initializeTodoistApi();
    }

    public initializeTodoistApi() {
        // Initialize TodoistApiService first
        this.todoistApiService.initializeApi();

        // Reinitialize services that depend on the API
        this.todoistTaskService = new TodoistTaskService(this.todoistApiService.getApi(), this.settingsService.getSettings());
        this.uiService = new UIService(this.app, this.todoistApiService.getApi(), this.settingsService.getSettings());
        
        // Reinitialize TaskSyncService with new API instance
        this.taskSyncService = new TaskSyncService(
            this.todoistApiService.getApi(),
            this.settingsService.getSettings(),
            this.uiService,
            this.blockIdService,
            this.urlService,
            this.todoistTaskService,
            this.fileService
        );
    }

    async onunload() {
        // Cleanup if needed
    }

    getSettings(): TodoistContextBridgeSettings {
        return this.settingsService.getSettings();
    }

    async saveSettings(): Promise<void> {
        await this.settingsService.saveSettings();
        this.initializeTodoistApi();
    }

    private checkAdvancedUriPlugin(): boolean {
        if (!this.app.plugins.getPlugin('obsidian-advanced-uri')) {
            this.uiService.showError('Advanced URI plugin is required for this feature.');
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

    // Public methods for external access
    public async createTodoistFromText(editor: Editor) {
        await this.taskSyncService.syncTaskWithTodoist(editor);
    }

    public async createTodoistFromFile() {
        const file = this.fileService.getActiveFile();
        if (file) {
            await this.taskSyncService.syncFileWithTodoist(file);
        }
    }
}
