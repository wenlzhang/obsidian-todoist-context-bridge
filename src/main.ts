import { Editor, Notice, Plugin } from "obsidian";
import { TodoistApi, Project } from "@doist/todoist-api-typescript";
import { DEFAULT_SETTINGS } from "./Settings";
import { TodoistContextBridgeSettingTab } from "./SettingTab";
import { UIDProcessing } from "./UIDProcessing";
import { TodoistTaskSync } from "./TodoistTaskSync";
import { URILinkProcessing } from "./URILinkProcessing";
import { TextParsing } from "./TextParsing";

export interface TodoistContextBridgeSettings {
    todoistAPIToken: string;
    todoistDefaultProject: string;
    todoistDefaultPriority: number;  // Default priority for tasks without a specified priority
    uidField: string;
    blockIDFormat: string;
    allowSyncDuplicateTask: boolean;
    allowResyncCompletedTask: boolean;
    includeSelectedTextInDescription: boolean;
    taskTextCleanupPatterns: string[];
    useDefaultTaskTextCleanupPatterns: boolean;
    dataviewDueDateKey: string;
    dataviewPriorityKey: string;
    dataviewCleanupKeys: string;
    momentFormatCleanupPatterns: string;
    priorityMapping: { [key: string]: number };
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

        // Initialize core services that don't depend on Todoist
        this.UIDProcessing = new UIDProcessing(this.settings, this.app);
        const textParsing: TextParsing = new TextParsing(this.settings);
        this.URILinkProcessing = new URILinkProcessing(
            this.app,
            this.UIDProcessing,
            this.settings,
            textParsing,
        );

        // Try to initialize Todoist if we have a token
        if (this.settings.todoistAPIToken) {
            await this.initializeTodoistServices();
        }
    }

    private addCommands() {
        // Add command to sync selected task to Todoist
        this.addCommand({
            id: "sync-to-todoist",
            name: "Sync selected task to Todoist",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.syncSelectedTaskToTodoist(editor);
            },
        });

        // Add new command for creating tasks from non-task text
        this.addCommand({
            id: "create-todoist-from-text",
            name: "Create Todoist task from selected text",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.createTodoistTaskFromSelectedText(
                    editor,
                );
            },
        });

        // Add new command for creating tasks linked to the current file
        this.addCommand({
            id: "create-todoist-from-file",
            name: "Create Todoist task linked to current note",
            callback: async () => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.createTodoistTaskFromSelectedFile();
            },
        });
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
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
            console.error("Failed to load Todoist projects:", error);
            new Notice(
                "Failed to load Todoist projects. Please check your API token.",
            );
        }
    }

    public initializeTodoistApi() {
        if (this.settings.todoistAPIToken) {
            this.todoistApi = new TodoistApi(this.settings.todoistAPIToken);
        } else {
            this.todoistApi = null;
        }
    }

    async initializeTodoistServices(): Promise<boolean> {
        try {
            this.initializeTodoistApi();
            if (!this.todoistApi) {
                return false;
            }

            this.TodoistTaskSync = new TodoistTaskSync(
                this.app,
                this.settings,
                this.todoistApi,
                this.checkAdvancedUriPlugin.bind(this),
                this.URILinkProcessing,
                this,
            );

            await this.loadProjects();
            return true;
        } catch (error) {
            console.error("Todoist initialization failed:", error);
            return false;
        }
    }

    async verifyTodoistToken(
        token: string,
    ): Promise<{ success: boolean; projects?: Project[] }> {
        try {
            const tempApi = new TodoistApi(token);
            const projects = await tempApi.getProjects();
            return { success: true, projects };
        } catch (error) {
            console.error("Token verification failed:", error);
            return { success: false };
        }
    }

    checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin(
            "obsidian-advanced-uri",
        );
        if (!advancedUriPlugin) {
            new Notice(
                "Advanced URI plugin is required but not installed. Please install and enable it first.",
            );
            return false;
        }
        return true;
    }
}
