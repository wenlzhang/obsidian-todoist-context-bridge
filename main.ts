import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';

interface TodoistSyncSettings {
    apiToken: string;
    defaultProjectId: string;
}

const DEFAULT_SETTINGS: TodoistSyncSettings = {
    apiToken: '',
    defaultProjectId: ''
}

export default class TodoistSyncPlugin extends Plugin {
    settings: TodoistSyncSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];

    async onload() {
        await this.loadSettings();

        // Initialize Todoist API if token exists
        if (this.settings.apiToken) {
            this.todoistApi = new TodoistApi(this.settings.apiToken);
            await this.loadProjects();
        }

        // Add command to sync selected task to Todoist
        this.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: async (editor: Editor) => {
                await this.syncSelectedTaskToTodoist(editor);
            }
        });

        // Add settings tab
        this.addSettingTab(new TodoistSyncSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async loadProjects() {
        if (!this.todoistApi) return;
        
        try {
            this.projects = await this.todoistApi.getProjects();
        } catch (error) {
            console.error('Failed to load Todoist projects:', error);
            new Notice('Failed to load Todoist projects. Please check your API token.');
        }
    }

    private getBlockId(editor: Editor): string {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        
        // Generate a unique block ID if none exists
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            return match[1];
        }

        // Generate a new block ID
        const newBlockId = `block-${Date.now()}`;
        editor.setLine(cursor.line, `${lineText} ^${newBlockId}`);
        return newBlockId;
    }

    private getTaskText(editor: Editor): string {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        
        // Extract task text (remove checkbox, block ID, and tags)
        return lineText
            .replace(/^[\s-]*\[[ x]\]/, '') // Remove checkbox
            .replace(/\^[a-zA-Z0-9-]+$/, '') // Remove block ID
            .replace(/#[^\s]+/g, '') // Remove tags
            .trim();
    }

    private generateAdvancedUri(blockId: string): string {
        const file = this.app.workspace.getActiveFile();
        if (!file) return '';

        const encodedFilePath = encodeURIComponent(file.path);
        return `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&filepath=${encodedFilePath}&block=${blockId}`;
    }

    async syncSelectedTaskToTodoist(editor: Editor) {
        if (!this.todoistApi) {
            new Notice('Please set up your Todoist API token in settings');
            return;
        }

        try {
            const blockId = this.getBlockId(editor);
            const taskText = this.getTaskText(editor);
            const advancedUri = this.generateAdvancedUri(blockId);

            const task = await this.todoistApi.addTask({
                content: taskText,
                projectId: this.settings.defaultProjectId || undefined,
                description: `Original task in Obsidian: ${advancedUri}`
            });

            new Notice('Task successfully synced to Todoist!');
        } catch (error) {
            console.error('Failed to sync task to Todoist:', error);
            new Notice('Failed to sync task to Todoist. Please check your settings and try again.');
        }
    }
}

class TodoistSyncSettingTab extends PluginSettingTab {
    plugin: TodoistSyncPlugin;

    constructor(app: App, plugin: TodoistSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Todoist API Token')
            .setDesc('Your Todoist API token (from Todoist Settings > Integrations > API token)')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    if (value) {
                        this.plugin.todoistApi = new TodoistApi(value);
                        await this.plugin.loadProjects();
                    } else {
                        this.plugin.todoistApi = null;
                        this.plugin.projects = [];
                    }
                    await this.plugin.saveSettings();
                }));

        if (this.plugin.projects.length > 0) {
            new Setting(containerEl)
                .setName('Default Todoist Project')
                .setDesc('Select the default project for new tasks')
                .addDropdown(dropdown => {
                    dropdown.addOption('', 'Inbox');
                    this.plugin.projects.forEach(project => {
                        dropdown.addOption(project.id, project.name);
                    });
                    dropdown.setValue(this.plugin.settings.defaultProjectId);
                    dropdown.onChange(async (value) => {
                        this.plugin.settings.defaultProjectId = value;
                        await this.plugin.saveSettings();
                    });
                });
        }
    }
}
