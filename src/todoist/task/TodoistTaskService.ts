import { Editor } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistTaskInfo, TaskDetails } from '../../utils/types';
import { generateBlockId } from '../../utils/helpers';
import { LoggingService } from '../../services/LoggingService';
import moment from 'moment';

export class TodoistTaskService {
    private loggingService: LoggingService;

    constructor(
        private todoistApi: TodoistApi | null,
        private settings: any
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public getTaskText(editor: Editor): string {
        const lineText = editor.getLine(editor.getCursor().line);
        this.loggingService.debug('Getting task text', { lineText });
    
        // Extract task text (remove checkbox, block ID, and tags)
        const cleanText = lineText
            .replace(/^[\s-]*\[[ x?/-]\]/, '') // Remove checkbox with any status
            .replace(/\^[a-zA-Z0-9-]+$/, '') // Remove block ID
            .replace(/#[^\s]+/g, '') // Remove tags
            .trim();
            
        this.loggingService.debug('Cleaned task text', { cleanText });
        return cleanText;
    }

    public async isTaskCompleted(editor: Editor): Promise<boolean> {
        const lineText = editor.getLine(editor.getCursor().line);
        this.loggingService.debug('Checking task completion', { lineText });
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
                this.loggingService.debug('Found Todoist task ID', { taskId: taskIdMatch[1] });
                return taskIdMatch[1];
            }
            nextLine++;
            nextLineText = editor.getLine(nextLine);
        }
        this.loggingService.debug('No Todoist task ID found');
        return null;
    }

    public async findExistingTodoistTask(editor: Editor, blockId: string, advancedUri: string): Promise<TodoistTaskInfo | null> {
        if (!this.todoistApi) {
            this.loggingService.debug('No Todoist API instance');
            return null;
        }

        try {
            // First check local link in Obsidian
            const localTaskId = this.getTodoistTaskId(editor, editor.getCursor().line);
            if (localTaskId) {
                try {
                    const task = await this.todoistApi.getTask(localTaskId);
                    this.loggingService.debug('Found existing Todoist task', { taskId: task.id });
                    return {
                        id: task.id,
                        content: task.content,
                        description: task.description || '',
                        url: task.url,
                        isCompleted: task.isCompleted
                    };
                } catch (error) {
                    // Task might have been deleted in Todoist, continue searching
                    this.loggingService.error('Error getting Todoist task', { error });
                    this.loggingService.debug('Local task not found in Todoist, searching further...');
                }
            }

            // Search in Todoist for tasks with matching Advanced URI or block ID
            const tasks = await this.todoistApi.getTasks();
            for (const task of tasks) {
                const description = task.description || '';
                if (description.includes(advancedUri) || description.includes(`Block ID: ${blockId}`)) {
                    this.loggingService.debug('Found existing Todoist task', { taskId: task.id });
                    return {
                        id: task.id,
                        content: task.content,
                        description: description,
                        url: task.url,
                        isCompleted: task.isCompleted
                    };
                }
            }

            this.loggingService.debug('No existing Todoist task found');
            return null;
        } catch (error) {
            this.loggingService.error('Error checking for existing Todoist task', { error });
            return null;
        }
    }

    public isTaskLine(line: string): boolean {
        // Check for Markdown task format: "- [ ]" or "* [ ]"
        this.loggingService.debug('Checking if line is a task', { line });
        return /^[\s]*[-*]\s*\[[ x?/-]\]/.test(line);
    }

    public getTaskStatus(line: string): 'open' | 'completed' | 'other' {
        if (!this.isTaskLine(line)) {
            this.loggingService.debug('Line is not a task', { line });
            return 'other';
        }
        
        // Check for different task statuses
        if (line.match(/^[\s]*[-*]\s*\[x\]/i)) {
            this.loggingService.debug('Task is completed', { line });
            return 'completed';
        } else if (line.match(/^[\s]*[-*]\s*\[ \]/)) {
            this.loggingService.debug('Task is open', { line });
            return 'open';
        } else {
            // Matches tasks with other statuses like [?], [/], [-]
            this.loggingService.debug('Task has other status', { line });
            return 'other';
        }
    }

    public getDefaultCleanupPatterns(): string[] {
        this.loggingService.debug('Getting default cleanup patterns');
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
                        this.loggingService.error('Invalid regex pattern', { pattern, error: e });
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

        this.loggingService.debug('Extracted task details', { cleanText: text, dueDate });
        return {
            cleanText: text,
            dueDate: dueDate
        };
    }

    public formatTodoistDueDate(date: string): string {
        // Convert YYYY-MM-DDTHH:mm to Todoist format
        const parsedDate = moment(date);
        if (!parsedDate.isValid()) {
            this.loggingService.error('Invalid date', { date });
            return date;
        }

        if (date.includes('T')) {
            // If time is included, use datetime format
            this.loggingService.debug('Formatting date with time', { date });
            return parsedDate.format('YYYY-MM-DD[T]HH:mm:ss[Z]');
        } else {
            // If only date, use date format
            this.loggingService.debug('Formatting date', { date });
            return parsedDate.format('YYYY-MM-DD');
        }
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        this.loggingService.debug('Getting line indentation', { line, indentation: match ? match[1] : '' });
        return match ? match[1] : '';
    }
}
