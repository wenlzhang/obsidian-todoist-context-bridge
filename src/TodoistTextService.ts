import { App, Editor, EditorPosition, Notice } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistContextBridgeSettings } from '../main';
import { NonTaskToTodoistModal } from './NonTaskToTodoistModal';

export class TodoistTextService {
    constructor(
        private app: App,
        private settings: TodoistContextBridgeSettings,
        private todoistApi: TodoistApi,
        private checkAdvancedUriPlugin: () => boolean,
        private getOrCreateBlockId: (editor: Editor, line: number) => string,
        private generateAdvancedUri: (blockId: string, editor: Editor) => Promise<string>,
        private isListItem: (lineContent: string) => boolean,
        private isNonEmptyTextLine: (lineContent: string) => boolean,
        private insertTodoistLink: (editor: Editor, line: number, taskUrl: string, isListItem: boolean) => Promise<void>
    ) {}

    async createTodoistFromText(editor: Editor) {
        // Store current cursor
        const currentCursor: EditorPosition = editor.getCursor();

        try {
            // Store current cursor at the start
            const currentCursor: EditorPosition = editor.getCursor();

            if (!this.todoistApi) {
                new Notice('Please set up your Todoist API token first.');
                editor.setCursor(currentCursor);
                return;
            }

            if (!this.checkAdvancedUriPlugin()) {
                editor.setCursor(currentCursor);
                return;
            }

            const currentLine = currentCursor.line;
            const lineContent = editor.getLine(currentLine);

            if (!this.isNonEmptyTextLine(lineContent)) {
                new Notice('Please select a non-empty line that is not a task.');
                editor.setCursor(currentCursor);
                return;
            }

            // Get or create block ID using the new method
            const blockId = this.getOrCreateBlockId(editor, currentLine);
            if (!blockId) {
                new Notice('Failed to generate block ID.');
                editor.setCursor(currentCursor);
                return;
            }
            
            // Generate the advanced URI for the block
            const advancedUri = await this.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                new Notice('Failed to generate reference link. Please check Advanced URI plugin settings.');
                editor.setCursor(currentCursor);
                return;
            }

            // Check if the current line is a list item
            const isListItem = this.isListItem(lineContent);

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
                        projectId: this.settings.defaultProjectId || undefined,
                        description: fullDescription
                    });

                    // Get the Todoist task URL and insert it as a sub-item
                    const taskUrl = `https://todoist.com/app/task/${task.id}`;
                    await this.insertTodoistLink(editor, currentLine, taskUrl, isListItem);

                    new Notice('Task successfully created in Todoist!');
                } catch (error) {
                    console.error('Failed to create Todoist task:', error);
                    new Notice('Failed to create Todoist task. Please check your settings and try again.');
                    editor.setCursor(currentCursor);
                }
            }).open();

        } catch (error) {
            console.error('Error in createTodoistFromText:', error);
            new Notice('An error occurred. Please try again.');
            editor.setCursor(currentCursor);
        }
    }
}
