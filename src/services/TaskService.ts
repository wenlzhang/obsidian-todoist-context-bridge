import { App, Editor, Notice, TFile } from 'obsidian';
import { TodoistApi, Task } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings } from '../settings/types';
import { TodoistTaskInfo, TaskDetails } from '../utils/types';
import { generateUUID, generateBlockId } from '../utils/helpers';

export class TaskService {
    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi | null
    ) {}

    async extractTaskDetails(lineText: string): Promise<TaskDetails> {
        let cleanText = lineText;
        const dueDateRegex = new RegExp(`\\[${this.settings.dueDateKey}::(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)]`);
        const dueDateMatch = cleanText.match(dueDateRegex);
        const dueDate = dueDateMatch ? dueDateMatch[1] : null;

        // Remove the due date from the text if it exists
        if (dueDateMatch) {
            cleanText = cleanText.replace(dueDateMatch[0], '').trim();
        }

        // Apply default cleanup patterns
        if (this.settings.useDefaultCleanupPatterns) {
            const defaultPatterns = [
                /^[\s-]*\[[ x?\/-]\]/,  // Checkboxes
                /📝\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/,  // Timestamps
                /\^[a-zA-Z0-9-]+$/,  // Block IDs
                /#[^\s]+/,  // Tags
                /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u  // Emojis
            ];

            for (const pattern of defaultPatterns) {
                cleanText = cleanText.replace(pattern, '').trim();
            }
        }

        // Apply custom cleanup patterns
        for (const pattern of this.settings.cleanupPatterns) {
            try {
                const regex = new RegExp(pattern, 'g');
                cleanText = cleanText.replace(regex, '').trim();
            } catch (error) {
                console.error('Invalid regex pattern:', pattern, error);
            }
        }

        return { cleanText, dueDate };
    }

    async getOrCreateNoteId(file: TFile): Promise<string> {
        // Try to get existing UID from frontmatter
        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const existingUid = metadata?.[this.settings.uidField];
        
        if (existingUid && existingUid.trim() !== '') {
            return existingUid;
        }

        // Generate new UID
        const newUid = generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\\n');
        let newContent: string;

        if (hasExistingFrontmatter) {
            const endOfFrontmatter = content.indexOf('---\\n', 4);
            if (endOfFrontmatter !== -1) {
                const frontmatter = content.slice(4, endOfFrontmatter);
                newContent = \`---\\n\${frontmatter.trim()}\\n\${this.settings.uidField}: \${newUid}\\n---\${content.slice(endOfFrontmatter + 3)}\`;
            } else {
                newContent = \`---\\n\${this.settings.uidField}: \${newUid}\\n---\\n\\n\${content}\`;
            }
        } else {
            newContent = \`---\\n\${this.settings.uidField}: \${newUid}\\n---\\n\\n\${content}\`;
        }

        await this.app.vault.modify(file, newContent);
        return newUid;
    }

    async getOrCreateBlockId(editor: Editor): Promise<string> {
        const currentLine = editor.getCursor().line;
        const lineText = editor.getLine(currentLine);

        // Check if line already has a block ID
        const match = lineText.match(/\^([a-zA-Z0-9-]+)$/);
        if (match) {
            return match[1];
        }

        // Generate a new block ID using the configured format
        const newBlockId = generateBlockId(this.settings.blockIdFormat);
        
        // Calculate the new cursor position
        const newLineText = \`\${lineText} ^\${newBlockId}\`;
        editor.setLine(editor.getCursor().line, newLineText);
        
        return newBlockId;
    }

    async createTodoistTask(title: string, description: string, dueDate: string | null = null, projectId: string | null = null): Promise<Task> {
        if (!this.todoistApi) {
            throw new Error('Todoist API not initialized');
        }

        try {
            const taskData: any = {
                content: title,
                description: description
            };

            if (dueDate) {
                taskData.due_date = dueDate;
            }

            if (projectId) {
                taskData.project_id = projectId;
            }

            return await this.todoistApi.addTask(taskData);
        } catch (error) {
            console.error('Failed to create Todoist task:', error);
            throw error;
        }
    }

    async getTaskInfo(blockId: string): Promise<TodoistTaskInfo | null> {
        if (!this.todoistApi) {
            return null;
        }

        try {
            const tasks = await this.todoistApi.getTasks();
            const task = tasks.find(t => t.description.includes(\`obsidian://block/\${blockId}\`));
            
            if (task) {
                return {
                    taskId: task.id,
                    isCompleted: task.isCompleted || false
                };
            }
        } catch (error) {
            console.error('Failed to get task info:', error);
        }

        return null;
    }

    async syncTaskToTodoist(editor: Editor): Promise<void> {
        if (!this.todoistApi) {
            new Notice('Please set up your Todoist API token in settings');
            return;
        }

        const currentCursor = editor.getCursor();
        const lineText = editor.getLine(currentCursor.line);

        try {
            // Get or create block ID
            const blockId = await this.getOrCreateBlockId(editor);

            // Check if task already exists
            const existingTask = await this.getTaskInfo(blockId);
            if (existingTask) {
                if (existingTask.isCompleted && !this.settings.allowResyncCompleted) {
                    new Notice('Task is already completed in Todoist');
                    return;
                }
                if (!this.settings.allowDuplicateTasks) {
                    new Notice('Task already exists in Todoist');
                    return;
                }
            }

            // Extract task details
            const { cleanText, dueDate } = await this.extractTaskDetails(lineText);

            // Get the current file for creating the back-link
            const currentFile = this.app.workspace.getActiveFile();
            if (!currentFile) {
                throw new Error('No active file');
            }

            // Get or create note ID
            const noteId = await this.getOrCreateNoteId(currentFile);

            // Create the back-link
            const blockLink = \`obsidian://block/\${blockId}\`;
            const noteLink = \`obsidian://advanced-uri?vault=\${encodeURIComponent(this.app.vault.getName())}&uid=\${encodeURIComponent(noteId)}\`;

            // Create task in Todoist
            const description = \`Source: [\${currentFile.basename}](\${noteLink})\\nBlock: [\${blockId}](\${blockLink})\`;
            await this.createTodoistTask(cleanText, description, dueDate, this.settings.defaultProjectId || undefined);

            new Notice('Task synced to Todoist');
        } catch (error) {
            console.error('Failed to sync task:', error);
            new Notice('Failed to sync task to Todoist');
            editor.setCursor(currentCursor);
        }
    }
}
