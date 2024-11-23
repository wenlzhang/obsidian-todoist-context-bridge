import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';

interface TodoistSyncSettings {
    apiToken: string;
    defaultProjectId: string;
    uidField: string;
}

const DEFAULT_SETTINGS: TodoistSyncSettings = {
    apiToken: '',
    defaultProjectId: '',
    uidField: 'uuid'
}

export default class TodoistSyncPlugin extends Plugin {
    settings: TodoistSyncSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];

    private generateUUID(): string {
        // Using the exact same UUID generation method as Advanced URI plugin
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

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

    checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            new Notice('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        return true;
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

    private async ensureUidInFrontmatter(file: any): Promise<string | null> {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return null;

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const existingUid = frontmatter?.[this.settings.uidField];

        if (existingUid) {
            return existingUid;
        }

        // Generate new UUID
        const newUid = this.generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        let newContent: string;

        if (hasExistingFrontmatter) {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                // Add UID field to existing frontmatter
                newContent = content.slice(0, endOfFrontmatter) + 
                           `${this.settings.uidField}: ${newUid}\n` +
                           content.slice(endOfFrontmatter);
            } else {
                // Malformed frontmatter, create new one
                newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n${content}`;
            }
        } else {
            // Create new frontmatter
            newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n${content}`;
        }

        await this.app.vault.modify(file, newContent);
        return newUid;
    }

    private async generateAdvancedUri(blockId: string): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) return '';

        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return '';

        // @ts-ignore
        const useUid = advancedUriPlugin.settings?.useUID || false;
        
        if (useUid) {
            // Ensure UID exists in frontmatter
            const uid = await this.ensureUidInFrontmatter(file);
            if (!uid) {
                new Notice('Failed to generate or retrieve UID for the note.');
                return '';
            }

            return `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&uid=${uid}&block=${blockId}`;
        } else {
            // If not using UID, use file path (with a warning)
            new Notice('Warning: Using file path for links. Links will break if files are moved.', 5000);
            return `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&filepath=${encodeURIComponent(file.path)}&block=${blockId}`;
        }
    }

    async syncSelectedTaskToTodoist(editor: Editor) {
        // Check if Advanced URI plugin is installed
        if (!this.checkAdvancedUriPlugin()) {
            return;
        }

        if (!this.todoistApi) {
            new Notice('Please set up your Todoist API token in settings');
            return;
        }

        try {
            const blockId = this.getBlockId(editor);
            const taskText = this.getTaskText(editor);
            const advancedUri = await this.generateAdvancedUri(blockId);

            if (!advancedUri) {
                return; // Error notice already shown in generateAdvancedUri
            }

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

        // Check for Advanced URI plugin
        if (!this.plugin.checkAdvancedUriPlugin()) {
            new Setting(containerEl)
                .setName('Advanced URI Plugin Required')
                .setDesc('This plugin requires the Advanced URI plugin to be installed and enabled. Please install it from the Community Plugins store.')
                .addButton(button => button
                    .setButtonText('Open Community Plugins')
                    .onClick(() => {
                        // @ts-ignore
                        this.app.setting?.openTabById('community-plugins');
                    }));
            
            containerEl.createEl('hr');
        } else {
            // @ts-ignore
            const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
            // @ts-ignore
            const useUid = advancedUriPlugin?.settings?.useUID || false;

            // Add Advanced URI configuration notice
            const notice = containerEl.createEl('div', { cls: 'setting-item-description' });
            notice.createEl('p').setText('Advanced URI Configuration:');
            const ul = notice.createEl('ul');
            ul.createEl('li').setText(`Current link type: ${useUid ? 'Using UUID' : 'Using file path'}`);
            if (useUid) {
                ul.createEl('li').setText(`Make sure to add the '${this.plugin.settings.uidField}' field in your notes' frontmatter to ensure stable links.`);
            } else {
                ul.createEl('li').setText('Warning: Using file paths for links. Links will break if files are moved. Consider enabling UUID in Advanced URI settings.');
            }
            containerEl.createEl('hr');
        }

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

        new Setting(containerEl)
            .setName('UID Field in Frontmatter')
            .setDesc('The frontmatter field name that contains the UUID for your notes (must match Advanced URI settings)')
            .addText(text => text
                .setPlaceholder('uuid')
                .setValue(this.plugin.settings.uidField)
                .onChange(async (value) => {
                    this.plugin.settings.uidField = value;
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
