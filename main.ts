import { App, Editor, Notice, Plugin, PluginSettingTab, Setting, Modal } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import moment from 'moment';

interface TodoistContextBridgeSettings {
    apiToken: string;
    defaultProjectId: string;
    uidField: string;
    blockIdFormat: string;
    allowDuplicateTasks: boolean;
    allowResyncCompleted: boolean;
    includeSelectedText: boolean;
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
    allowResyncCompleted: true,
    includeSelectedText: true
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

    private generateNonTaskBlockId(): string {
        const timestamp = moment().format('YYYYMMDDHHmmss');
        const random = Math.random().toString(36).substring(2, 6);
        return `${timestamp}-${random}`;
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

        // Add new command for creating tasks from non-task text
        this.addCommand({
            id: 'create-todoist-from-text',
            name: 'Create Todoist task from selected text',
            editorCallback: async (editor: Editor) => {
                await this.createTodoistFromText(editor);
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

    private isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.isTaskLine(line);
    }

    private isListItem(line: string): boolean {
        return /^[\s]*[-*+]\s/.test(line);
    }

    async createTodoistFromText(editor: Editor) {
        try {
            if (!this.todoistApi) {
                new Notice('Please set up your Todoist API token first.');
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                return;
            }

            const currentLine = editor.getCursor().line;
            const lineContent = editor.getLine(currentLine);

            if (!this.isNonEmptyTextLine(lineContent)) {
                new Notice('Please select a non-empty line that is not a task.');
                return;
            }

            // Generate block ID using the same method as task sync
            const blockId = this.generateBlockId();
            
            // Add block ID to the line
            editor.setLine(currentLine, `${lineContent} ^${blockId}`);

            // Generate the advanced URI for the block
            const advancedUri = await this.generateAdvancedUri(blockId, editor);

            // Show modal for task input
            new NonTaskToTodoistModal(this.app, this.settings.includeSelectedText, async (title, description) => {
                try {
                    // Prepare description components
                    const descriptionParts = [];
                    
                    // Add user's description if provided
                    if (description) {
                        descriptionParts.push(description);
                    }
                    
                    // Add selected text if enabled
                    if (this.settings.includeSelectedText) {
                        descriptionParts.push(`Selected text: "${lineContent.trim()}"`);
                    }
                    
                    // Add reference link
                    descriptionParts.push(`Reference: ${advancedUri}`);

                    // Combine all parts of the description
                    const fullDescription = descriptionParts.join('\n\n');

                    // Create task in Todoist
                    const task = await this.todoistApi.addTask({
                        content: title,
                        description: fullDescription,
                        projectId: this.settings.defaultProjectId || undefined
                    });

                    // Get the Todoist task URL
                    const taskUrl = `https://todoist.com/app/task/${task.id}`;

                    // Determine indentation based on whether the line is a list item
                    const currentIndent = this.getLineIndentation(lineContent);
                    const isListItem = this.isListItem(lineContent);
                    let todoistLink: string;
                    
                    if (isListItem) {
                        // For list items, add as a sub-item with one more level of indentation
                        const subItemIndent = currentIndent + '\t';
                        todoistLink = `${subItemIndent}- 🔗 [View in Todoist](${taskUrl})`;
                    } else {
                        // For plain text, add on the next line without indentation
                        todoistLink = `🔗 [View in Todoist](${taskUrl})`;
                    }
                    
                    // Insert the Todoist link on the next line
                    editor.replaceRange(`\n${todoistLink}`, 
                        { line: currentLine + 1, ch: 0 }, 
                        { line: currentLine + 1, ch: 0 }
                    );

                    new Notice('Task successfully created in Todoist!');
                } catch (error) {
                    console.error('Failed to create task in Todoist:', error);
                    new Notice('Failed to create task in Todoist. Please check your settings and try again.');
                }
            }).open();

        } catch (error) {
            console.error('Failed to create task from text:', error);
            new Notice('Failed to create task. Please check your settings and try again.');
        }
    }
}

// Modal for creating Todoist tasks from non-task text
class NonTaskToTodoistModal extends Modal {
    private titleInput: string = '';
    private descriptionInput: string = '';
    private onSubmit: (title: string, description: string) => void;
    private includeSelectedText: boolean;

    constructor(app: App, includeSelectedText: boolean, onSubmit: (title: string, description: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.includeSelectedText = includeSelectedText;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Modal title
        contentEl.createEl("h2", { text: "Create Todoist task from text" });

        // Task title input
        const titleContainer = contentEl.createDiv({ cls: "todoist-input-container" });
        titleContainer.createEl("label", { text: "Task title (required)" });
        const titleInput = titleContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "Enter task title"
        });
        titleInput.style.width = "100%";
        titleInput.style.height = "40px";
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
        });

        // Task description input
        const descContainer = contentEl.createDiv({ cls: "todoist-input-container" });
        descContainer.createEl("label", { text: "Additional description (optional)" });
        const descInput = descContainer.createEl("textarea", {
            cls: "todoist-input-field",
            placeholder: "Enter additional description"
        });
        descInput.style.width = "100%";
        descInput.style.height = "100px";
        descInput.style.marginBottom = "0.5em";
        descInput.addEventListener("input", (e) => {
            this.descriptionInput = (e.target as HTMLTextAreaElement).value;
        });

        // Description info text
        const descInfo = descContainer.createEl("div", { 
            cls: "todoist-description-info",
            text: "Note: The task description will automatically include:" 
        });
        descInfo.style.fontSize = "0.8em";
        descInfo.style.color = "var(--text-muted)";
        descInfo.style.marginBottom = "1em";

        const descList = descContainer.createEl("ul");
        descList.style.fontSize = "0.8em";
        descList.style.color = "var(--text-muted)";
        descList.style.marginLeft = "1em";
        descList.style.marginBottom = "1em";

        if (this.includeSelectedText) {
            descList.createEl("li", { text: "The selected text from your note" });
        }
        descList.createEl("li", { text: "A reference link back to this note" });

        // Buttons container
        const buttonContainer = contentEl.createDiv({ cls: "todoist-input-buttons" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";

        // Create button
        const createButton = buttonContainer.createEl("button", {
            text: "Create task",
            cls: "mod-cta"
        });
        createButton.addEventListener("click", () => {
            if (!this.titleInput.trim()) {
                new Notice("Please enter a task title");
                return;
            }
            this.close();
            this.onSubmit(this.titleInput, this.descriptionInput);
        });

        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            this.close();
        });

        // Focus title input
        titleInput.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
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

        containerEl.createEl('h1', { text: 'Todoist context bridge' });

        // Authentication section
        containerEl.createEl('h2', { text: 'Authentication' });
        new Setting(containerEl)
            .setName('API token')
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

        // Sync section
        containerEl.createEl('h2', { text: 'Sync' });

        // Default Project Setting
        new Setting(containerEl)
            .setName('Default project')
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
            .setName('Allow duplicate tasks')
            .setDesc('Allow syncing the same task multiple times to Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowDuplicateTasks)
                .onChange(async (value) => {
                    this.plugin.settings.allowDuplicateTasks = value;
                    await this.plugin.saveSettings();
                }));

        // Allow Resyncing Completed Tasks Setting
        new Setting(containerEl)
            .setName('Allow resyncing completed tasks')
            .setDesc('Allow syncing tasks that are already completed in Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowResyncCompleted)
                .onChange(async (value) => {
                    this.plugin.settings.allowResyncCompleted = value;
                    await this.plugin.saveSettings();
                }));

        // ID section
        containerEl.createEl('h2', { text: 'ID' });
        
        // UID Field Setting
        new Setting(containerEl)
            .setName('Note ID field')
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
            .setName('Block ID format')
            .setDesc('Format for generating block IDs (uses moment.js formatting)')
            .addText(text => text
                .setPlaceholder('YYYYMMDDHHmmssSSS')
                .setValue(this.plugin.settings.blockIdFormat)
                .onChange(async (value) => {
                    this.plugin.settings.blockIdFormat = value;
                    await this.plugin.saveSettings();
                }));

        // Include Selected Text Setting
        new Setting(containerEl)
            .setName('Include selected text')
            .setDesc('Include the selected text in the task description when creating a new task from text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeSelectedText)
                .onChange(async (value) => {
                    this.plugin.settings.includeSelectedText = value;
                    await this.plugin.saveSettings();
                }));
    }
}
