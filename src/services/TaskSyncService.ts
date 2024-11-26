import { Editor, TFile } from 'obsidian';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { TodoistTask } from '@doist/todoist-api-typescript';
import { UIService } from './UIService';
import { BlockIdService } from './BlockIdService';
import { UrlService } from './UrlService';
import { TodoistTaskService } from './TodoistTaskService';
import { FileService } from './FileService';
import { TodoistContextBridgeSettings } from '../settings/types';

export class TaskSyncService {
    constructor(
        private todoistApi: TodoistApi,
        private settings: TodoistContextBridgeSettings,
        private uiService: UIService,
        private blockIdService: BlockIdService,
        private urlService: UrlService,
        private todoistTaskService: TodoistTaskService,
        private fileService: FileService
    ) {}

    public async syncTaskWithTodoist(editor: Editor): Promise<void> {
        try {
            if (!this.todoistApi) {
                this.uiService.showError('Please set up your Todoist API token first.', editor);
                return;
            }

            const taskText = this.todoistTaskService.getTaskText(editor);
            if (!taskText) {
                this.uiService.showError('No task found at the current line.', editor);
                return;
            }

            const blockId = this.blockIdService.getBlockId(editor);
            if (!blockId) {
                this.uiService.showError('No block ID found at the current line.', editor);
                return;
            }

            const advancedUri = await this.urlService.generateAdvancedUri(blockId, editor);
            if (!advancedUri) {
                this.uiService.showError('Failed to generate Advanced URI.', editor);
                return;
            }

            const task = await this.todoistTaskService.createTask(taskText, advancedUri);
            if (!task) {
                this.uiService.showError('Failed to create task in Todoist.', editor);
                return;
            }

            const taskUrl = `https://todoist.com/app/task/${task.id}`;
            const currentLine = editor.getCursor().line;
            const lineContent = editor.getLine(currentLine);

            await this.urlService.insertTodoistLink(
                editor,
                currentLine,
                taskUrl,
                this.fileService.isListItem(lineContent)
            );

            this.uiService.showSuccess('Task successfully created in Todoist!');
        } catch (error) {
            console.error('Error in syncTaskWithTodoist:', error);
            this.uiService.showError('Failed to sync task with Todoist. Please try again.', editor);
        }
    }

    public async syncFileWithTodoist(file: TFile): Promise<void> {
        try {
            if (!this.todoistApi) {
                this.uiService.showError('Please set up your Todoist API token first.');
                return;
            }

            const fileUri = await this.urlService.generateFileUri();
            if (!fileUri) {
                this.uiService.showError('Failed to generate file URI.');
                return;
            }

            this.uiService.showNonTaskToTodoistModal(
                false,
                fileUri,
                await this.todoistApi.getProjects(),
                undefined,
                undefined,
                async (title: string, description: string) => {
                    try {
                        const descriptionParts = [];
                        
                        if (description) {
                            descriptionParts.push(description);
                        }
                        
                        descriptionParts.push(`Reference: ${fileUri}`);

                        const fullDescription = descriptionParts.join('\n\n');

                        const task = await this.todoistTaskService.createTask(title, fullDescription);
                        if (!task) {
                            this.uiService.showError('Failed to create task in Todoist.');
                            return;
                        }

                        this.uiService.showSuccess('Task successfully created in Todoist!');
                    } catch (error) {
                        console.error('Failed to create Todoist task:', error);
                        this.uiService.showError('Failed to create Todoist task. Please check your settings and try again.');
                    }
                }
            );
        } catch (error) {
            console.error('Error in syncFileWithTodoist:', error);
            this.uiService.showError('An error occurred. Please try again.');
        }
    }
}
