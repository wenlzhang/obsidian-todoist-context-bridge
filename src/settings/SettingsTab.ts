import { App, PluginSettingTab, Setting } from 'obsidian';
import type TodoistContextBridgePlugin from '../../main';
import type { Project } from '@doist/todoist-api-typescript';

export class TodoistContextBridgeSettingTab extends PluginSettingTab {
    plugin: TodoistContextBridgePlugin;

    constructor(app: App, plugin: TodoistContextBridgePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Todoist Context Bridge Settings' });

        new Setting(containerEl)
            .setName('Todoist API Token')
            .setDesc('Your Todoist API token (required)')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    await this.plugin.saveSettings();
                    // Try to initialize the API with the new token
                    this.plugin.initializeTodoistApi();
                }));

        new Setting(containerEl)
            .setName('Default Project')
            .setDesc('Choose a default project for new tasks')
            .addDropdown(async (dropdown) => {
                // Add a "None" option
                dropdown.addOption('', 'None');
                
                // Add all projects from Todoist
                if (this.plugin.projects) {
                    this.plugin.projects.forEach((project: Project) => {
                        dropdown.addOption(project.id, project.name);
                    });
                }

                // Set the current value
                dropdown.setValue(this.plugin.settings.defaultProjectId);

                // Handle changes
                dropdown.onChange(async (value) => {
                    this.plugin.settings.defaultProjectId = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Block ID Format')
            .setDesc('Format for block IDs (used for linking). Default: YYYY-MM-DDTHH-mm-ss')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DDTHH-mm-ss')
                .setValue(this.plugin.settings.blockIdFormat)
                .onChange(async (value) => {
                    this.plugin.settings.blockIdFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('UID Field')
            .setDesc('Field name for unique identifiers. Default: uuid')
            .addText(text => text
                .setPlaceholder('uuid')
                .setValue(this.plugin.settings.uidField)
                .onChange(async (value) => {
                    this.plugin.settings.uidField = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Due Date Key')
            .setDesc('Key for due dates in task text. Default: due')
            .addText(text => text
                .setPlaceholder('due')
                .setValue(this.plugin.settings.dueDateKey)
                .onChange(async (value) => {
                    this.plugin.settings.dueDateKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allow Duplicate Tasks')
            .setDesc('Allow creating duplicate tasks from the same block')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowDuplicateTasks)
                .onChange(async (value) => {
                    this.plugin.settings.allowDuplicateTasks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allow Resync of Completed Tasks')
            .setDesc('Allow re-syncing tasks that have been marked as complete in Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowResyncCompleted)
                .onChange(async (value) => {
                    this.plugin.settings.allowResyncCompleted = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include Selected Text')
            .setDesc('Include selected text when creating tasks from non-task text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeSelectedText)
                .onChange(async (value) => {
                    this.plugin.settings.includeSelectedText = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use Default Cleanup Patterns')
            .setDesc('Use default patterns for cleaning up task text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useDefaultCleanupPatterns)
                .onChange(async (value) => {
                    this.plugin.settings.useDefaultCleanupPatterns = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Custom Cleanup Patterns')
            .setDesc('Custom patterns for cleaning up task text (one per line)')
            .addTextArea(text => text
                .setPlaceholder('Enter patterns (one per line)')
                .setValue(this.plugin.settings.cleanupPatterns.join('\\n'))
                .onChange(async (value) => {
                    this.plugin.settings.cleanupPatterns = value.split('\\n').filter(p => p.length > 0);
                    await this.plugin.saveSettings();
                }));
    }
}
