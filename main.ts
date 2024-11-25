import { App, Editor, Notice, Plugin } from 'obsidian';
import { TodoistApi, Project } from '@doist/todoist-api-typescript';
import { TaskToTodoistModal } from './src/modals/TaskToTodoistModal';
import { NonTaskToTodoistModal } from './src/modals/NonTaskToTodoistModal';
import { TodoistContextBridgeSettingTab } from './src/settings/SettingsTab';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { TodoistTaskInfo, TaskDetails } from './src/utils/types';
import { generateUUID, generateBlockId, generateNonTaskBlockId } from './src/utils/helpers';
import { TaskService } from './src/services/TaskService';

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];
    private taskService: TaskService;

    async onload() {
        await this.loadSettings();

        // Initialize Todoist API if token exists
        this.initializeTodoistApi();

        // Initialize TaskService
        this.taskService = new TaskService(this.app, this.settings, this.todoistApi);

        // Add command to sync selected task to Todoist
        this.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: async (editor: Editor) => {
                await this.taskService.syncTaskToTodoist(editor);
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

        // Add new command for creating tasks linked to the current file
        this.addCommand({
            id: 'create-todoist-from-file',
            name: 'Create Todoist task linked to current note',
            callback: async () => {
                await this.createTodoistFromFile();
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
            this.loadProjects();
            // Update the TaskService with the new API instance
            if (this.taskService) {
                this.taskService = new TaskService(this.app, this.settings, this.todoistApi);
            }
        } else {
            this.todoistApi = null;
            this.projects = [];
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
        
        // Check for UUID field and ensure it has a value
        const existingUid = frontmatter?.[this.settings.uidField];
        if (existingUid && existingUid.trim() !== '') {
            return existingUid;
        }

        // Generate new UID
        const newUid = generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        let newContent: string;
        let lineOffset = 0;

        if (hasExistingFrontmatter) {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                // Get existing frontmatter content
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                let newFrontmatter: string;

                if (frontmatterContent.includes(`${this.settings.uidField}:`)) {
                    // UUID field exists but is empty, replace the empty field
                    newFrontmatter = frontmatterContent.replace(
                        new RegExp(`${this.settings.uidField}:[ ]*(\n|$)`),
                        `${this.settings.uidField}: ${newUid}\n`
                    );
                } else {
                    // No UUID field, add it to existing frontmatter
                    newFrontmatter = frontmatterContent.trim() + `\n${this.settings.uidField}: ${newUid}\n`;
                }

                newContent = '---\n' + newFrontmatter + '---' + content.slice(endOfFrontmatter + 3);
                
                // Calculate line offset
                const oldLines = frontmatterContent.split('\n').length;
                const newLines = newFrontmatter.split('\n').length;
                lineOffset = newLines - oldLines;
            } else {
                // Malformed frontmatter, create new one
                newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n${content.slice(4)}`;
                lineOffset = 3;
            }
        } else {
            // No frontmatter, create new one with an empty line after
            newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n${content}`;
            lineOffset = 4;
        }

        // Calculate if cursor is after frontmatter
        const cursorLine = currentCursor.line;
        const isCursorAfterFrontmatter = hasExistingFrontmatter ? 
            cursorLine > (content.slice(0, content.indexOf('---\n', 4) + 4).split('\n').length - 1) :
            true;

        // Store current scroll position
        const scrollInfo = editor.getScrollInfo();

        await this.app.vault.modify(file, newContent);

        // Restore cursor position
        if (isCursorAfterFrontmatter) {
            editor.setCursor({
                line: currentCursor.line + lineOffset,
                ch: currentCursor.ch
            });
        } else {
            editor.setCursor(currentCursor);
        }

        // Restore scroll position
        editor.scrollTo(scrollInfo.left, scrollInfo.top);

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
        const newBlockId = generateBlockId();
        
        // Calculate the new cursor position
        const newLineText = `${lineText} ^${newBlockId}`;
        editor.setLine(editor.getCursor().line, newLineText);
        
        return newBlockId;
    }

    private getOrCreateBlockId(editor: Editor, line: number): string {
        // Store current cursor
        const currentCursor = editor.getCursor();

        const lineText = editor.getLine(line);
        
        // Check for existing block ID
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            // Restore cursor position before returning
            editor.setCursor(currentCursor);
            return match[1];
        }

        // Generate a new block ID using the configured format from settings
        const newBlockId = generateBlockId();
        
        // Add block ID to the line, ensuring proper block reference format
        // If the line doesn't end with whitespace, add a space before the block ID
        const newLineText = lineText.trimEnd() + (lineText.endsWith(' ') ? '' : ' ') + `^${newBlockId}`;
        editor.setLine(line, newLineText);
        
        // Force Obsidian to recognize the block reference by adding a newline if one doesn't exist
        const nextLine = editor.getLine(line + 1);
        if (nextLine === undefined) {
            editor.replaceRange('\n', { line: line + 1, ch: 0 });
        }
        
        // Restore cursor position
        editor.setCursor(currentCursor);
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
        
        const vaultName = this.app.vault.getName();
        
        if (useUid) {
            // Ensure UID exists in frontmatter
            const uid = await this.ensureUidInFrontmatter(file, editor);
            if (!uid) {
                new Notice('Failed to generate or retrieve UID for the note.');
                return '';
            }

            // Build the URI with proper encoding
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('uid', uid);
            params.set('block', blockId);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        } else {
            // If not using UID, use file path (with a warning)
            console.warn('Advanced URI plugin is configured to use file paths instead of UIDs. This may cause issues if file paths change.');
            
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('filepath', file.path);
            params.set('block', blockId);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
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

    private async insertTodoistLink(editor: Editor, line: number, taskUrl: string, isListItem: boolean) {
        // Store current cursor
        const currentCursor = editor.getCursor();
        
        const lineText = editor.getLine(line);
        const currentIndent = this.getLineIndentation(lineText);
        
        let linkText: string;
        let insertPrefix: string = '';
        
        if (isListItem) {
            // For list items, add as a sub-item with one more level of indentation
            const subItemIndent = currentIndent + '\t';
            linkText = `${subItemIndent}- 🔗 [View in Todoist](${taskUrl})`;
        } else {
            // For plain text, add an empty line before and use the same indentation
            insertPrefix = '\n';
            linkText = `${currentIndent}- 🔗 [View in Todoist](${taskUrl})`;
        }

        // Get file and metadata
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        
        let insertionLine = line;

        if (!hasExistingFrontmatter) {
            // Case 2: No front matter exists
            // Create front matter with UUID and adjust insertion line
            const newUid = generateUUID();
            const frontMatterContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n`;
            
            // Insert front matter at the beginning of the file
            editor.replaceRange(frontMatterContent, { line: 0, ch: 0 });
            
            // Adjust insertion line to account for new front matter (4 lines)
            insertionLine += 4;
        } else {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                
                if (!frontmatter?.[this.settings.uidField]) {
                    // Case 3: Front matter exists but no UUID
                    const newUid = generateUUID();
                    const updatedFrontmatter = frontmatterContent.trim() + `\n${this.settings.uidField}: ${newUid}\n`;
                    
                    // Replace existing frontmatter
                    editor.replaceRange(
                        updatedFrontmatter,
                        { line: 1, ch: 0 },
                        { line: frontmatterContent.split('\n').length, ch: 0 }
                    );
                    
                    // Adjust insertion line by 1 for the new UUID line
                    insertionLine += 1;
                } else {
                    // Case 1: Front matter and UUID exist
                    // Just add 1 line for normal insertion
                    insertionLine += 1;
                }
            }
        }
        
        // Insert the link at the calculated position
        editor.replaceRange(
            `${insertPrefix}${linkText}\n`,
            { line: insertionLine, ch: 0 },
            { line: insertionLine, ch: 0 }
        );
        
        // Restore cursor position, adjusting for added front matter if necessary
        if (!hasExistingFrontmatter && currentCursor.line >= 0) {
            editor.setCursor({
                line: currentCursor.line + 4,
                ch: currentCursor.ch
            });
        } else {
            editor.setCursor(currentCursor);
        }
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

    private isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.isTaskLine(line);
    }

    private isListItem(line: string): boolean {
        return /^[\s]*[-*+]\s/.test(line);
    }

    private getDefaultCleanupPatterns(): string[] {
        return [
            // Checkbox
            '^[\\s-]*\\[[ x?/-]\\]',
            // Timestamp with 📝 emoji
            '📝\\s*\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?',
            // Block ID
            '\\^[a-zA-Z0-9-]+$',
            // Tags
            '#[^\\s]+',
            // Emojis
            '[\\u{1F300}-\\u{1F9FF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}]'
        ];
    }

    private extractTaskDetails(taskText: string): TaskDetails {
        let text = taskText;

        // Extract and remove due date in dataview format [due::YYYY-MM-DD]
        let dueDate: string | null = null;
        const dataviewDueMatch = text.match(new RegExp(`\\[${this.settings.dueDateKey}::(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)\\]`));
        if (dataviewDueMatch) {
            dueDate = dataviewDueMatch[1];
            text = text.replace(dataviewDueMatch[0], '');
        }

        // Apply custom cleanup patterns
        if (this.settings.cleanupPatterns.length > 0) {
            for (const pattern of this.settings.cleanupPatterns) {
                if (pattern.trim()) {  // Only process non-empty patterns
                    try {
                        const regex = new RegExp(pattern.trim(), 'gu');
                        text = text.replace(regex, '');
                    } catch (e) {
                        console.warn(`Invalid regex pattern: ${pattern}`, e);
                    }
                }
            }
        }

        // Apply default cleanup patterns if enabled
        if (this.settings.useDefaultCleanupPatterns) {
            // Remove checkbox
            text = text.replace(/^[\s-]*\[[ x?/-]\]/, '');

            // Remove timestamp with 📝 emoji (but don't use it as due date)
            text = text.replace(/📝\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/, '');

            // Remove block ID
            text = text.replace(/\^[a-zA-Z0-9-]+$/, '');
            
            // Remove tags
            text = text.replace(/#[^\s]+/g, '');
            
            // Remove any remaining emojis
            text = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
        }
        
        // Clean up extra spaces and trim
        text = text.replace(/\s+/g, ' ').trim();

        return {
            cleanText: text,
            dueDate: dueDate
        };
    }

    private formatTodoistDueDate(date: string): string {
        // Convert YYYY-MM-DDTHH:mm to Todoist format
        const parsedDate = moment(date);
        if (!parsedDate.isValid()) return date;

        if (date.includes('T')) {
            // If time is included, use datetime format
            return parsedDate.format('YYYY-MM-DD[T]HH:mm:ss[Z]');
        } else {
            // If only date, use date format
            return parsedDate.format('YYYY-MM-DD');
        }
    }

    async createTodoistFromText(editor: Editor) {
        const selectedText = editor.getSelection();
        new NonTaskToTodoistModal(
            this.app,
            this.settings.includeSelectedText && selectedText.length > 0,
            async (title: string, description: string) => {
                try {
                    if (!this.todoistApi) {
                        throw new Error('Todoist API not initialized');
                    }

                    const currentFile = this.app.workspace.getActiveFile();
                    if (!currentFile) {
                        throw new Error('No active file');
                    }

                    const noteId = await this.taskService.getOrCreateNoteId(currentFile);
                    const noteLink = `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&uid=${encodeURIComponent(noteId)}`;
                    
                    let fullDescription = description ? description + '\n\n' : '';
                    if (this.settings.includeSelectedText && selectedText) {
                        fullDescription += `Selected text:\n${selectedText}\n\n`;
                    }
                    fullDescription += `Source: [${currentFile.basename}](${noteLink})`;

                    await this.taskService.createTodoistTask(
                        title,
                        fullDescription,
                        null,
                        this.settings.defaultProjectId || undefined
                    );

                    new Notice('Task created in Todoist');
                } catch (error) {
                    console.error('Failed to create task:', error);
                    new Notice('Failed to create task in Todoist');
                }
            }
        ).open();
    }

    async createTodoistFromFile() {
        const currentFile = this.app.workspace.getActiveFile();
        if (!currentFile) {
            new Notice('No active file');
            return;
        }

        new TaskToTodoistModal(
            this.app,
            currentFile.basename,
            '',
            '',
            async (title: string, description: string, dueDate: string) => {
                try {
                    if (!this.todoistApi) {
                        throw new Error('Todoist API not initialized');
                    }

                    const noteId = await this.taskService.getOrCreateNoteId(currentFile);
                    const noteLink = `obsidian://advanced-uri?vault=${encodeURIComponent(this.app.vault.getName())}&uid=${encodeURIComponent(noteId)}`;
                    const fullDescription = `${description}\n\nSource: [${currentFile.basename}](${noteLink})`;

                    await this.taskService.createTodoistTask(
                        title,
                        fullDescription,
                        dueDate || null,
                        this.settings.defaultProjectId || undefined
                    );

                    new Notice('Task created in Todoist');
                } catch (error) {
                    console.error('Failed to create task:', error);
                    new Notice('Failed to create task in Todoist');
                }
            }
        ).open();
    }

    onunload() {
        console.log('Unloading Todoist Context Bridge plugin');
    }
}
