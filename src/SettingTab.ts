import TodoistContextBridgePlugin from "main";
import { PluginSettingTab, App, Setting, DropdownComponent, Notice } from "obsidian";

export class TodoistContextBridgeSettingTab extends PluginSettingTab {
    plugin: TodoistContextBridgePlugin;

    constructor(app: App, plugin: TodoistContextBridgePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Todoist context bridge' });

        // Todoist section
        containerEl.createEl('h2', { text: 'Todoist' });

        const apiTokenSetting = new Setting(containerEl)
            .setName('API token')
            .setDesc('Your Todoist API token (Settings > Integrations > Developer in Todoist)')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.todoistAPIToken)
                .onChange(async (value) => {
                    this.plugin.settings.todoistAPIToken = value;
                    await this.plugin.saveSettings();
                }));

        // Default Project Setting
        const projectsSetting = new Setting(containerEl)
            .setName('Default Todoist Project')
            .setDesc('Select the default project for new tasks');

        let projectsDropdown: DropdownComponent;
        projectsSetting.addDropdown(dropdown => {
            projectsDropdown = dropdown;
            dropdown.addOption('', 'Select a project');
            return dropdown;
        });

        apiTokenSetting.addButton(button => button
            .setButtonText('Verify Token')
            .onClick(async () => {
                const result = await this.plugin.verifyTodoistToken(this.plugin.settings.todoistAPIToken);
                if (result.success) {
                    // Update projects dropdown if verification succeeded
                    if (result.projects) {
                        await this.updateProjectsDropdown(projectsDropdown, result.projects);
                    }
                    // Initialize Todoist services
                    await this.plugin.initializeTodoistServices();
                    new Notice('Todoist token verified successfully!');
                } else {
                    new Notice('Invalid Todoist token. Please check and try again.');
                }
            }));

        // Allow Duplicate Tasks Setting
        new Setting(containerEl)
            .setName('Allow duplicate tasks')
            .setDesc('Allow syncing the same task multiple times to Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowSyncDuplicateTask)
                .onChange(async (value) => {
                    this.plugin.settings.allowSyncDuplicateTask = value;
                    await this.plugin.saveSettings();
                }));

        // Allow Resyncing Completed Tasks Setting
        new Setting(containerEl)
            .setName('Allow resyncing completed tasks')
            .setDesc('Allow syncing tasks that are already completed in Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowResyncCompletedTask)
                .onChange(async (value) => {
                    this.plugin.settings.allowResyncCompletedTask = value;
                    await this.plugin.saveSettings();
                }));

        // Text Cleanup section
        containerEl.createEl('h2', { text: 'Text cleanup' });

        // Default Cleanup Patterns
        new Setting(containerEl)
            .setName('Use default cleanup patterns')
            .setDesc('Use built-in patterns to clean up task text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useDefaultTaskTextCleanupPatterns)
                .onChange(async (value) => {
                    this.plugin.settings.useDefaultTaskTextCleanupPatterns = value;
                    await this.plugin.saveSettings();
                }));

        // Show default patterns
        if (this.plugin.settings.useDefaultTaskTextCleanupPatterns) {
            const defaultPatternsContainer = containerEl.createDiv();
            defaultPatternsContainer.createEl('p', {
                text: 'Default patterns will remove:',
                cls: 'setting-item-description'
            });
            const patternsList = defaultPatternsContainer.createEl('ul');
            patternsList.style.marginLeft = '20px';
            patternsList.style.fontSize = '0.9em';
            patternsList.style.color = 'var(--text-muted)';

            const defaultPatterns = [
                ['Checkboxes', '^[\\s-]*\\[[ x?/-]\\]', '- [ ] Task'],
                ['Timestamps', '📝\\s*\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?', '📝 2024-11-23T22:09'],
                ['Block IDs', '\\^[a-zA-Z0-9-]+$', '^abc123'],
                ['Tags', '#[^\\s]+', '#tag'],
                ['Emojis', '[\\u{1F300}-\\u{1F9FF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}]', '😊 🎉']
            ];

            defaultPatterns.forEach(([name, pattern, example]) => {
                const li = patternsList.createEl('li');
                li.createSpan({ text: `${name}: `, cls: 'setting-item-name' });
                li.createEl('code', { text: pattern });
                li.createSpan({ text: ` (e.g., "${example}")` });
            });
        }

        // Custom Cleanup Patterns
        new Setting(containerEl)
            .setName('Custom cleanup patterns')
            .setDesc(createFragment(frag => {
                frag.appendText('Add your own regex patterns to remove from task text. Separate patterns with commas. ');
                frag.createEl('a', {
                    text: 'Learn more about regex',
                    href: 'https://regex101.com'
                }).setAttr('target', '_blank');
                frag.createEl('br');
                frag.createEl('br');
                frag.appendText('Example: To remove timestamps like [2024-01-01], use: ');
                frag.createEl('code', { text: '\\[\\d{4}-\\d{2}-\\d{2}\\]' });
            }))
            .addTextArea(text => {
                text.setPlaceholder('Enter regex patterns, separated by commas')
                    .setValue(this.plugin.settings.taskTextCleanupPatterns.join(','))
                    .onChange(async (value) => {
                        this.plugin.settings.taskTextCleanupPatterns = value.split(',').map(p => p.trim()).filter(p => p);
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
            });

        // ID section
        containerEl.createEl('h2', { text: 'ID' });

        // UID Field Setting
        new Setting(containerEl)
            .setName('Note ID field')
            .setDesc('Field name in frontmatter for storing the note ID (requires Advanced URI plugin)')
            .addText(text => text
                .setPlaceholder('uid')
                .setValue(this.plugin.settings.uidField)
                .onChange(async (value) => {
                    this.plugin.settings.uidField = value;
                    await this.plugin.saveSettings();
                }));

        // Block ID Format Setting
        new Setting(containerEl)
            .setName('Block ID format')
            .setDesc('Format for generating block IDs (uses moment.js formatting)')
            .addText(text => text
                .setPlaceholder('YYYYMMDDHHmmssSSS')
                .setValue(this.plugin.settings.blockIDFormat)
                .onChange(async (value) => {
                    this.plugin.settings.blockIDFormat = value;
                    await this.plugin.saveSettings();
                }));
        
        // Task sync section
        containerEl.createEl('h2', { text: 'Task sync' });

        // Due Date Key Setting
        new Setting(containerEl)
            .setName('Dataview due date key')
            .setDesc('Key for due dates in dataview format (e.g., "due" for [due::YYYY-MM-DD])')
            .addText(text => text
                .setPlaceholder('due')
                .setValue(this.plugin.settings.dataviewDueDateKey)
                .onChange(async (value) => {
                    this.plugin.settings.dataviewDueDateKey = value;
                    await this.plugin.saveSettings();
                }));

        // Include Selected Text Setting
        new Setting(containerEl)
            .setName('Include selected text')
            .setDesc('Include the selected text in the task description when creating a new task from text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeSelectedTextInDescription)
                .onChange(async (value) => {
                    this.plugin.settings.includeSelectedTextInDescription = value;
                    await this.plugin.saveSettings();
                }));
    }

    private async updateProjectsDropdown(dropdown: DropdownComponent, projects?: Array<{id: string, name: string}>) {
        try {
            if (!projects && this.plugin.todoistApi) {
                projects = await this.plugin.todoistApi.getProjects();
            }
            
            if (!projects) {
                dropdown.addOption('', 'Failed to load projects');
                return;
            }

            // Clear existing options
            dropdown.selectEl.empty();
            
            // Add default option
            dropdown.addOption('', 'Inbox (Default)');
            
            // Add all projects
            projects.forEach(project => {
                dropdown.addOption(project.id, project.name);
            });
            
            // Set the current value
            dropdown.setValue(this.plugin.settings.todoistDefaultProject);
            
            // Update the setting when changed
            dropdown.onChange(async (value: string) => {
                this.plugin.settings.todoistDefaultProject = value;
                await this.plugin.saveSettings();
            });
        } catch (error) {
            console.error('Failed to update projects dropdown:', error);
        }
    }
}
