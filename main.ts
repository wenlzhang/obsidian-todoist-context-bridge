import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import moment from 'moment';

interface TodoistSyncSettings {
    apiToken: string;
    defaultProjectId: string;
    uidField: string;
    blockIdFormat: string;
}

const DEFAULT_SETTINGS: TodoistSyncSettings = {
    apiToken: '',
    defaultProjectId: '',
    uidField: 'uuid',
    blockIdFormat: 'YYYY-MM-DDTHH-mm-ss'
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

    private generateBlockId(): string {
        return moment().format(this.settings.blockIdFormat);
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

    private async ensureUidInFrontmatter(file: any, editor: Editor): Promise<string | null> {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return null;

        // Store current cursor position
        const currentCursor = editor.getCursor();

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const existingUid = frontmatter?.[this.settings.uidField];

        if (existingUid) {
            return existingUid;
        }

        // Generate new UID using Advanced URI plugin's method
        const newUid = this.generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        let newContent: string;
        let lineOffset = 0; // Track how many lines we're adding

        if (hasExistingFrontmatter) {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                // Add UID field to existing frontmatter
                newContent = content.slice(0, endOfFrontmatter) + 
                           `${this.settings.uidField}: ${newUid}\n` +
                           content.slice(endOfFrontmatter);
                lineOffset = 1; // Adding one line to existing frontmatter
            } else {
                // Malformed frontmatter, create new one
                newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n${content}`;
                lineOffset = 3; // Adding three lines for new frontmatter
            }
        } else {
            // Create new frontmatter
            newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n${content}`;
            lineOffset = 4; // Adding four lines (including empty line after frontmatter)
        }

        await this.app.vault.modify(file, newContent);

        // Restore cursor position, adjusting for added lines
        editor.setCursor({
            line: currentCursor.line + lineOffset,
            ch: currentCursor.ch
        });

        return newUid;
    }

    private getBlockId(editor: Editor): string {
        // Store current cursor position
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        
        // Check for existing block ID
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            return match[1];
        }

        // Generate a new block ID using the configured format
        const newBlockId = this.generateBlockId();
        
        // Calculate the new cursor position
        const newLineText = `${lineText} ^${newBlockId}`;
        editor.setLine(cursor.line, newLineText);
        
        // Restore cursor position
        editor.setCursor({
            line: cursor.line,
            ch: cursor.ch // Keep the same column position
        });

        return newBlockId;
    }

    private async generateAdvancedUri(blockId: string, editor: Editor): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) return '';

        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return '';

        // @ts-ignore
        const useUid = advancedUriPlugin.settings?.useUID || false;
        
        if (useUid) {
            // Ensure UID exists in frontmatter
            const uid = await this.ensureUidInFrontmatter(file, editor);
            if (!uid) {
                new Notice('Failed to generate or retrieve UID for the note.');
                return '';
            }

            return `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&uid=${uid}&block=${blockId}`;
        } else {
            // If not using UID, use file path (with a warning)
            new Notice('Warning: Using file path for links. Links may break if files are moved.', 5000);
            return `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&filepath=${encodeURIComponent(file.path)}&block=${blockId}`;
        }
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
            const advancedUri = await this.generateAdvancedUri(blockId, editor);

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
    private projectDropdown: Setting | null = null;

    constructor(app: App, plugin: TodoistSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Todoist Sync Settings' });

        // Create a section for Todoist integration
        const todoistSection = containerEl.createEl('div', { cls: 'todoist-section' });
        
        // Add description for Todoist integration
        todoistSection.createEl('p', {
            text: 'Connect to Todoist to enable task synchronization. Once you enter a valid API token, you\'ll be able to select a default project for your tasks.'
        });

        // API Token Setting
        new Setting(todoistSection)
            .setName('Todoist API Token')
            .setDesc('Your Todoist API token (found in Todoist Settings > Integrations > API token)')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    await this.plugin.saveSettings();
                    
                    // Update Todoist API instance
                    if (value) {
                        this.plugin.todoistApi = new TodoistApi(value);
                        // Refresh project list when API token changes
                        await this.updateProjectList();
                    } else {
                        this.plugin.todoistApi = null;
                        // Clear and disable project dropdown
                        if (this.projectDropdown) {
                            await this.updateProjectList();
                        }
                    }
                }));

        // Project Selection Setting (always visible but may be disabled)
        this.projectDropdown = new Setting(todoistSection)
            .setName('Default Todoist Project')
            .setDesc('Select the default project for new tasks. This list will populate once you enter a valid API token.')
            .addDropdown(async (dropdown) => {
                dropdown.selectEl.disabled = !this.plugin.todoistApi;
                if (!this.plugin.todoistApi) {
                    dropdown.addOption('', 'Enter API token first');
                } else {
                    try {
                        const projects = await this.plugin.todoistApi.getProjects();
                        dropdown.addOption('', 'Inbox (Default)');
                        projects.forEach(project => {
                            dropdown.addOption(project.id, project.name);
                        });
                        dropdown.setValue(this.plugin.settings.defaultProjectId || '');
                    } catch (error) {
                        console.error('Failed to fetch Todoist projects:', error);
                        dropdown.addOption('', 'Failed to load projects');
                    }
                }
                dropdown.onChange(async (value) => {
                    this.plugin.settings.defaultProjectId = value;
                    await this.plugin.saveSettings();
                });
            });

        // Add a visual separator
        todoistSection.createEl('hr');

        // Advanced Settings Section
        const advancedSection = containerEl.createEl('div', { cls: 'advanced-section' });
        advancedSection.createEl('h3', { text: 'Advanced Settings' });

        new Setting(advancedSection)
            .setName('UID Field Name')
            .setDesc('Name of the field in frontmatter for storing UIDs (default: "uid")')
            .addText(text => text
                .setPlaceholder('uid')
                .setValue(this.plugin.settings.uidField)
                .onChange(async (value) => {
                    this.plugin.settings.uidField = value || 'uid';
                    await this.plugin.saveSettings();
                }));

        new Setting(advancedSection)
            .setName('Block ID Format')
            .setDesc('Format for generated block IDs (using moment.js format strings)')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DDTHH-mm-ss')
                .setValue(this.plugin.settings.blockIdFormat)
                .onChange(async (value) => {
                    if (moment(new Date()).format(value)) {
                        this.plugin.settings.blockIdFormat = value || 'YYYY-MM-DDTHH-mm-ss';
                        await this.plugin.saveSettings();
                    } else {
                        new Notice('Invalid moment.js format string');
                    }
                }));
    }

    private async updateProjectList() {
        if (!this.projectDropdown) return;

        const dropdownComponent = this.projectDropdown.components[0] as any;
        if (!dropdownComponent || !dropdownComponent.selectEl) return;

        const dropdown = dropdownComponent.selectEl;
        dropdown.empty();

        if (!this.plugin.todoistApi) {
            dropdown.disabled = true;
            dropdownComponent.addOption('', 'Enter API token first');
            return;
        }

        try {
            dropdown.disabled = false;
            const projects = await this.plugin.todoistApi.getProjects();
            dropdownComponent.addOption('', 'Inbox (Default)');
            projects.forEach(project => {
                dropdownComponent.addOption(project.id, project.name);
            });
            dropdownComponent.setValue(this.plugin.settings.defaultProjectId || '');
        } catch (error) {
            console.error('Failed to fetch Todoist projects:', error);
            dropdown.disabled = true;
            dropdownComponent.addOption('', 'Failed to load projects');
        }
    }
}
