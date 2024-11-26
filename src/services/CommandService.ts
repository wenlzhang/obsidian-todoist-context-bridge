import { Editor, Plugin } from 'obsidian';
import { TodoistContextBridgePlugin } from '../../main';

export class CommandService {
    constructor(private plugin: TodoistContextBridgePlugin) {}

    public registerCommands() {
        // Add command to sync selected task to Todoist
        this.plugin.addCommand({
            id: 'sync-to-todoist',
            name: 'Sync selected task to Todoist',
            editorCallback: (editor: Editor) => this.plugin.syncSelectedTaskToTodoist(editor)
        });

        // Add command to create Todoist task from current file
        this.plugin.addCommand({
            id: 'create-todoist-from-file',
            name: 'Create Todoist task from current file',
            callback: () => this.plugin.createTodoistFromFile()
        });

        // Add command to create Todoist task from selected text
        this.plugin.addCommand({
            id: 'create-todoist-from-text',
            name: 'Create Todoist task from selected text',
            editorCallback: (editor: Editor) => this.plugin.createTodoistFromText(editor)
        });
    }
}
