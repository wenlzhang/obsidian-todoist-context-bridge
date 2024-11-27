import { Editor, Notice, Plugin } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { DEFAULT_SETTINGS } from 'src/Settings';
import { TodoistContextBridgeSettingTab } from 'src/SettingTab';
import { UIDProcessing } from 'src/UIDProcessing';
import { TodoistTaskSync } from 'src/TodoistTaskSync';
import { URILinkProcessing } from 'src/URILinkProcessing';
import { TextParsing } from 'src/TextParsing';

export interface TodoistContextBridgeSettings {
    todoistAPIToken: string;
    todoistDefaultProject: string;
    uidField: string;
    blockIDFormat: string;
    allowSyncDuplicateTask: boolean;
    allowResyncCompletedTask: boolean;
    includeSelectedTextInDescription: boolean;
    taskTextCleanupPatterns: string[];
    useDefaultTaskTextCleanupPatterns: boolean;
    dataviewDueDateKey: string;
}

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];

    private UIDProcessing: UIDProcessing;
    private TodoistTaskSync: TodoistTaskSync;
    private URILinkProcessing: URILinkProcessing;

    async onload() {
        await this.loadSettings();
        
        // Add settings tab first, so it's always available
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));
        
        // Add commands - these should be available even if Todoist initialization fails
        this.addCommands();
        
        try {
            // Initialize Todoist-specific functionality
            this.initializeTodoistApi();
            if (!this.todoistApi) {
                throw new Error('Failed to initialize Todoist API. Please check your API token in settings.');
            }

            // Initialize services
            this.UIDProcessing = new UIDProcessing(this.settings, this.app);
            const textParsing: TextParsing = new TextParsing(this.settings);
            this.URILinkProcessing = new URILinkProcessing(
                this.app,
                this.UIDProcessing,
                this.settings,
                textParsing
            );
            
            try {
                this.TodoistTaskSync = new TodoistTaskSync(
                    this.app,
                    this.settings,
                    this.todoistApi,
                    this.checkAdvancedUriPlugin.bind(this),
                    this.URILinkProcessing
                );
            } catch (error) {
                throw new Error(`Failed to initialize TodoistTaskSync: ${error.message}`);
            }

            // Load projects after successful initialization
            await this.loadProjects();
        } catch (error) {
            new Notice(`Todoist Context Bridge initialization failed: ${error.message}`);
            console.error('Todoist Context Bridge initialization failed:', error);
            // Don't return here - let the plugin continue running with limited functionality
        }
    }

    private addCommands() {
        // Add command to sync selected task to Todoist
        this.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice('Please configure your Todoist API token in settings first');
                    return;
                }
                await this.TodoistTaskSync.syncSelectedTaskToTodoist(editor);
            }
        });

        // Add new command for creating tasks from non-task text
        this.addCommand({
            id: 'create-todoist-from-text',
            name: 'Create Todoist task from selected text',
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice('Please configure your Todoist API token in settings first');
                    return;
                }
                await this.TodoistTaskSync.createTodoistFromText(editor);
            }
        });

        // Add new command for creating tasks linked to the current file
        this.addCommand({
            id: 'create-todoist-from-file',
            name: 'Create Todoist task linked to current note',
            callback: async () => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice('Please configure your Todoist API token in settings first');
                    return;
                }
                await this.TodoistTaskSync.createTodoistTaskFromSelectedFile();
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async loadProjects() {
        try {
            const projects = await this.todoistApi?.getProjects();
            if (projects) {
                // Store projects or update UI as needed
            }
        } catch (error) {
            console.error('Failed to load Todoist projects:', error);
            new Notice('Failed to load Todoist projects. Please check your API token.');
        }
    }

    public initializeTodoistApi() {
        if (this.settings.todoistAPIToken) {
            this.todoistApi = new TodoistApi(this.settings.todoistAPIToken);
        } else {
            this.todoistApi = null;
        }
    }

    checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            new Notice('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        return true;
    }
}
