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
        return line.match(/^[\s-]*\[[ x?/-]\]/) !== null;
    }

    public getTaskStatus(line: string): 'open' | 'completed' | 'other' {
        if (line.match(/^[\s-]*\[x\]/)) return 'completed';
        if (line.match(/^[\s-]*\[ \]/)) return 'open';
        return 'other';
    }

    public getDefaultCleanupPatterns(): string[] {
        return [
            /\[\[([^\]]+)\]\]/g, // Remove wiki links but keep text
            /\[([^\]]+)\]\([^\)]+\)/g, // Remove markdown links but keep text
            /\^[a-zA-Z0-9-]+$/g, // Remove block IDs
            /#[^\s]+/g, // Remove tags
        ].map(pattern => pattern.source);
    }

    public extractTaskDetails(taskText: string): TaskDetails {
        // Extract due date if present (e.g., 📅 2023-12-31)
        const dueDateMatch = taskText.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
        const dueDate = dueDateMatch ? dueDateMatch[1] : '';

        // Extract priority if present (e.g., 🔺)
        const priorityMap: { [key: string]: number } = {
            '🔺': 1,
            '⏫': 1,
            '🔼': 2,
            '📌': 3,
            '': 4
        };
        const priorityMatch = taskText.match(/[🔺⏫🔼📌]/);
        const priority = priorityMatch ? priorityMap[priorityMatch[0]] : 4;

        // Clean up task text by removing emojis and dates
        let cleanText = taskText
            .replace(/[🔺⏫🔼📌📅]/, '')
            .replace(/\d{4}-\d{2}-\d{2}/, '')
            .trim();

        // Apply cleanup patterns from settings
        const cleanupPatterns = this.getDefaultCleanupPatterns();
        for (const pattern of cleanupPatterns) {
            const regex = new RegExp(pattern, 'g');
            cleanText = cleanText.replace(regex, '$1').trim();
        }

        return {
            text: cleanText,
            dueDate,
            priority
        };
    }

    public formatTodoistDueDate(date: string): string {
        return date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3');
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }
}
