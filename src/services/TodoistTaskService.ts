import { Editor } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistTaskInfo, TaskDetails } from '../utils/types';
import { generateBlockId } from '../utils/helpers';

export class TodoistTaskService {
    constructor(
        private todoistApi: TodoistApi | null,
        private settings: any
    ) {}

    public getTaskText(editor: Editor): string {
        const lineText = editor.getLine(editor.getCursor().line);
    
        // Extract task text (remove checkbox, block ID, and tags)
        return lineText
            .replace(/^[\s-]*\[[ x?/-]\]/, '') // Remove checkbox with any status
            .replace(/\^[a-zA-Z0-9-]+$/, '') // Remove block ID
            .replace(/#[^\s]+/g, '') // Remove tags
            .trim();
    }

    public async isTaskCompleted(editor: Editor): Promise<boolean> {
        const lineText = editor.getLine(editor.getCursor().line);
        return lineText.match(/^[\s-]*\[x\]/) !== null;
    }

    public getTodoistTaskId(editor: Editor, taskLine: number): string | null {
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

    public async findExistingTodoistTask(editor: Editor, blockId: string, advancedUri: string): Promise<TodoistTaskInfo | null> {
        if (!this.todoistApi) return null;

        try {
            const tasks = await this.todoistApi.getTasks();
            for (const task of tasks) {
                const description = task.description || '';
                if (description.includes(blockId) || description.includes(advancedUri)) {
                    return {
                        id: task.id,
                        content: task.content,
                        description: description,
                        url: task.url,
                        isCompleted: task.isCompleted
                    };
                }
            }
        } catch (error) {
            console.error('Failed to fetch Todoist tasks:', error);
        }

        return null;
    }

    public isTaskLine(line: string): boolean {
        // Check for Markdown task format: "- [ ]" or "* [ ]"
        return /^[\s]*[-*]\s*\[[ x?/-]\]/.test(line);
    }

    public getTaskStatus(line: string): 'open' | 'completed' | 'other' {
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

    public getDefaultCleanupPatterns(): string[] {
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

    public extractTaskDetails(taskText: string): TaskDetails {
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

    public formatTodoistDueDate(date: string): string {
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

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }
}
