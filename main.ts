import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import moment from 'moment';

interface TodoistContextBridgeSettings {
    apiToken: string;
    defaultProjectId: string;
    uidField: string;
    blockIdFormat: string;
    allowDuplicateTasks: boolean;
    allowResyncCompleted: boolean;
}

interface TodoistTaskInfo {
    taskId: string;
    isCompleted: boolean;
}

const DEFAULT_SETTINGS: TodoistContextBridgeSettings = {
    apiToken: '',
    defaultProjectId: '',
    uidField: 'uuid',
    blockIdFormat: 'YYYY-MM-DDTHH-mm-ss',
    allowDuplicateTasks: false,
    allowResyncCompleted: true
}

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
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
        this.initializeTodoistApi();

        // Add command to sync selected task to Todoist
        this.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: async (editor: Editor) => {
                await this.syncSelectedTaskToTodoist(editor);
            }
        });

        // Add settings tab
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));
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
        if (this.settings.apiToken) {
            this.todoistApi = new TodoistApi(this.settings.apiToken);
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
        const lineText = editor.getLine(editor.getCursor().line);
        
        // Only proceed if this is a task line
        if (!this.isTaskLine(lineText)) {
            return '';
        }
        
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
        editor.setLine(editor.getCursor().line, newLineText);
        
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
        const lineText = editor.getLine(editor.getCursor().line);
        
        // Extract task text (remove checkbox, block ID, and tags)
        return lineText
            .replace(/^[\s-]*\[[ x?/-]\]/, '') // Remove checkbox with any status
            .replace(/\^[a-zA-Z0-9-]+$/, '') // Remove block ID
            .replace(/#[^\s]+/g, '') // Remove tags
            .trim();
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    private async isTaskCompleted(editor: Editor): Promise<boolean> {
        const lineText = editor.getLine(editor.getCursor().line);
        return lineText.match(/^[\s-]*\[x\]/) !== null;
    }

    private async insertTodoistLink(editor: Editor, taskLine: number, taskUrl: string) {
        // Store current cursor
        const currentCursor = editor.getCursor();
        
        const taskText = editor.getLine(taskLine);
        const taskIndentation = this.getLineIndentation(taskText);
        const subItemIndentation = taskIndentation + '\t'; // Add one level of indentation
        
        // Create the Todoist link line with proper indentation and list marker
        const todoistLinkLine = `${subItemIndentation}- 🔗 [View in Todoist](${taskUrl})`;
        
        // Always insert right after the task
        editor.replaceRange(
            todoistLinkLine + '\n',
            { line: taskLine + 1, ch: 0 },
            { line: taskLine + 1, ch: 0 }
        );
        
        // Restore cursor position
        editor.setCursor(currentCursor);
    }

    private getTodoistTaskId(editor: Editor, taskLine: number): string | null {
        // Look for existing Todoist link in sub-items
        let nextLine = taskLine + 1;
        let nextLineText = editor.getLine(nextLine);
        const taskIndentation = this.getLineIndentation(editor.getLine(taskLine));
        
        // Check subsequent lines with deeper indentation
        while (nextLineText && this.getLineIndentation(nextLineText).length > taskIndentation.length) {
            // Look for Todoist task link
            const taskIdMatch = nextLineText.match(/\[View in Todoist\]\(https:\/\/todoist\.com\/app\/task\/(\d+)\)/);
            if (taskIdMatch) {
                return taskIdMatch[1];
            }
            nextLine++;
            nextLineText = editor.getLine(nextLine);
        }
        return null;
    }

    private async findExistingTodoistTask(editor: Editor, blockId: string, advancedUri: string): Promise<TodoistTaskInfo | null> {
        if (!this.todoistApi) return null;

        try {
            // First check local link in Obsidian
            const localTaskId = this.getTodoistTaskId(editor, editor.getCursor().line);
            if (localTaskId) {
                try {
                    const task = await this.todoistApi.getTask(localTaskId);
                    return {
                        taskId: localTaskId,
                        isCompleted: task.isCompleted
                    };
                } catch (error) {
                    // Task might have been deleted in Todoist, continue searching
                    console.log('Local task not found in Todoist, searching further...');
                }
            }

            // Search in Todoist for tasks with matching Advanced URI or block ID
            const activeTasks = await this.todoistApi.getTasks();
            const matchingTask = activeTasks.find(task => 
                task.description && (
                    task.description.includes(advancedUri) || 
                    task.description.includes(`Block ID: ${blockId}`)
                )
            );

            if (matchingTask) {
                return {
                    taskId: matchingTask.id,
                    isCompleted: matchingTask.isCompleted
                };
            }

            return null;
        } catch (error) {
            console.error('Error checking for existing Todoist task:', error);
            return null;
        }
    }

    private isTaskLine(line: string): boolean {
        // Check for Markdown task format: "- [ ]" or "* [ ]"
        return /^[\s]*[-*]\s*\[[ x?/-]\]/.test(line);
    }

    private getTaskStatus(line: string): 'open' | 'completed' | 'other' {
        if (!this.isTaskLine(line)) {
            return 'other';
        }
        
        // Check for different task statuses
        if (line.match(/^[\s]*[-*]\s*\[x\]/i)) {
            return 'completed';
        } else if (line.match(/^[\s]*[-*]\s*\[ \]/)) {
            return 'open';
        } else {
            // Matches tasks with other statuses like [?], [/], [-]
            return 'other';
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

        const currentLine = editor.getCursor().line;
        const lineText = editor.getLine(currentLine);

        // First check if it's a task line at all
        if (!this.isTaskLine(lineText)) {
            new Notice('Please place the cursor on a task line (e.g., "- [ ] Task")');
            return;
        }

        // Then check the task status
        const taskStatus = this.getTaskStatus(lineText);
        switch (taskStatus) {
            case 'completed':
                new Notice('This task is already completed in Obsidian. Only open tasks can be synced.');
                return;
            case 'other':
                new Notice('This task has a special status (e.g., [?], [/], [-]). Only open tasks can be synced.');
                return;
            case 'open':
                // Continue with sync process
                break;
        }

        try {
            const blockId = this.getBlockId(editor);
            if (!blockId) {
                return; // getBlockId will have shown appropriate notice
            }

            const advancedUri = await this.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                return; // Error notice already shown in generateAdvancedUri
            }

            // Check for existing task in both Obsidian and Todoist
            const existingTask = await this.findExistingTodoistTask(editor, blockId, advancedUri);
            
            if (existingTask) {
                if (!this.settings.allowDuplicateTasks) {
                    if (existingTask.isCompleted && !this.settings.allowResyncCompleted) {
                        new Notice('Task already exists in Todoist and is completed. Re-syncing completed tasks is disabled.');
                        return;
                    }
                    if (!existingTask.isCompleted) {
                        new Notice('Task already exists in Todoist. Enable duplicate tasks in settings to sync again.');
                        return;
                    }
                }
            }

            const taskText = this.getTaskText(editor);
            if (!taskText) {
                new Notice('Task text is empty');
                return;
            }

            const task = await this.todoistApi.addTask({
                content: taskText,
                projectId: this.settings.defaultProjectId || undefined,
                description: `Original task in Obsidian: ${advancedUri}\nBlock ID: ${blockId}`
            });

            // Get the Todoist task URL and insert it as a sub-item
            const taskUrl = `https://todoist.com/app/task/${task.id}`;
            await this.insertTodoistLink(editor, currentLine, taskUrl);

            new Notice('Task successfully synced to Todoist!');
        } catch (error) {
            console.error('Failed to sync task to Todoist:', error);
            new Notice('Failed to sync task to Todoist. Please check your settings and try again.');
        }
    }
}

class TodoistContextBridgeSettingTab extends PluginSettingTab {
    plugin: TodoistContextBridgePlugin;

    constructor(app: App, plugin: TodoistContextBridgePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Todoist Context Bridge' });

        // Todoist Authentication Section
        containerEl.createEl('h2', { text: 'Todoist Authentication' });
        new Setting(containerEl)
            .setName('API Token')
            .setDesc('Your Todoist API token (Settings > Integrations > Developer in Todoist)')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    await this.plugin.saveSettings();
                    // Reinitialize the API client with the new token
                    this.plugin.initializeTodoistApi();
                }));

        // Todoist Sync Section
        containerEl.createEl('h2', { text: 'Todoist Sync' });

        // Default Project Setting
        new Setting(containerEl)
            .setName('Default Project')
            .setDesc('Select the default Todoist project for new tasks')
            .addDropdown(async dropdown => {
                if (this.plugin.todoistApi) {
                    try {
                        const projects = await this.plugin.todoistApi.getProjects();
                        dropdown.addOption('', 'Inbox (Default)');
                        projects.forEach(project => {
                            dropdown.addOption(project.id, project.name);
                        });
                        dropdown.setValue(this.plugin.settings.defaultProjectId);
                        dropdown.onChange(async (value) => {
                            this.plugin.settings.defaultProjectId = value;
                            await this.plugin.saveSettings();
                        });
                    } catch (error) {
                        console.error('Failed to load Todoist projects:', error);
                        dropdown.addOption('', 'Failed to load projects');
                    }
                } else {
                    dropdown.addOption('', 'Please set API token first');
                }
            });

        // Allow Duplicate Tasks Setting
        new Setting(containerEl)
            .setName('Allow Duplicate Tasks')
            .setDesc('Allow syncing the same task multiple times to Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowDuplicateTasks)
                .onChange(async (value) => {
                    this.plugin.settings.allowDuplicateTasks = value;
                    await this.plugin.saveSettings();
                }));

        // Allow Resyncing Completed Tasks Setting
        new Setting(containerEl)
            .setName('Allow Resyncing Completed Tasks')
            .setDesc('Allow syncing tasks that are already completed in Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowResyncCompleted)
                .onChange(async (value) => {
                    this.plugin.settings.allowResyncCompleted = value;
                    await this.plugin.saveSettings();
                }));

        // ID Settings Section
        containerEl.createEl('h2', { text: 'ID Settings' });
        
        // UID Field Setting
        new Setting(containerEl)
            .setName('Note ID Field')
            .setDesc('Field name in frontmatter for storing the note ID (requires Advanced URI plugin)')
            .addText(text => text
                .setPlaceholder('uid')
                .setValue(this.plugin.settings.uidField)
                .onChange(async (value) => {
                    this.plugin.settings.uidField = value;
                    await this.plugin.saveSettings();
                }));

        // Block ID Format Setting
        new Setting(containerEl)
            .setName('Block ID Format')
            .setDesc('Format for generating block IDs (uses moment.js formatting)')
            .addText(text => text
                .setPlaceholder('YYYYMMDDHHmmssSSS')
                .setValue(this.plugin.settings.blockIdFormat)
                .onChange(async (value) => {
                    this.plugin.settings.blockIdFormat = value;
                    await this.plugin.saveSettings();
                }));
    }
}
