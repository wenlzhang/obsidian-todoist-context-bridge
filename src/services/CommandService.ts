import { Plugin } from 'obsidian';
import { TodoistContextBridgePlugin } from '../../main';
import { TaskSyncService } from './TaskSyncService';
import { TodoistApiService } from '../todoist';
import { FileService } from './FileService';
import { LoggingService } from './LoggingService';

export class CommandService {
    private loggingService: LoggingService;

    constructor(
        private plugin: TodoistContextBridgePlugin,
        private taskSyncService: TaskSyncService,
        private todoistApiService: TodoistApiService,
        private fileService: FileService
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public registerCommands() {
        this.loggingService.debug('Registering plugin commands');

        // Add command to sync selected task to Todoist
        this.plugin.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: async (editor) => {
                try {
                    this.loggingService.debug('Executing sync-to-todoist command');
                    await this.taskSyncService.syncSelectedTaskToTodoist(editor);
                } catch (error) {
                    this.loggingService.error('Error in sync-to-todoist command', error instanceof Error ? error : new Error(String(error)));
                }
            }
        });

        // Add command to create Todoist task from current file
        this.plugin.addCommand({
            id: 'create-todoist-from-file',
            name: 'Create Todoist task from current file',
            callback: async () => {
                try {
                    this.loggingService.debug('Executing create-todoist-from-file command');
                    const file = this.fileService.getActiveFile();
                    if (file) {
                        await this.taskSyncService.syncFileWithTodoist(file);
                    }
                } catch (error) {
                    this.loggingService.error('Error in create-todoist-from-file command', error instanceof Error ? error : new Error(String(error)));
                }
            }
        });

        // Add command to create Todoist task from selected text
        this.plugin.addCommand({
            id: 'create-todoist-from-text',
            name: 'Create Todoist task from selected text',
            editorCallback: async (editor) => {
                try {
                    this.loggingService.debug('Executing create-todoist-from-text command');
                    await this.taskSyncService.syncTaskWithTodoist(editor);
                } catch (error) {
                    this.loggingService.error('Error in create-todoist-from-text command', error instanceof Error ? error : new Error(String(error)));
                }
            }
        });

        this.loggingService.info('Plugin commands registered successfully');
    }
}
