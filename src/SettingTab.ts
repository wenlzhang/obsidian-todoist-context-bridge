import TodoistContextBridgePlugin from "main";
import { PluginSettingTab, App, Setting } from "obsidian";

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

        // Authentication section
        containerEl.createEl('h2', { text: 'Authentication' });
        new Setting(containerEl)
            .setName('API token')
            .setDesc('Your Todoist API token (Settings > Integrations > Developer in Todoist)')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    await this.plugin.saveSettings();
                    // Reinitialize the API client with the new token
                    this.plugin.initializeTodoistApi();
                }));

        // Sync section
        containerEl.createEl('h2', { text: 'Sync' });

        // Default Project Setting
        new Setting(containerEl)
            .setName('Default project')
            .setDesc('Select the default Todoist project for new tasks')
            .addDropdown(async (dropdown) => {
                if (this.plugin.todoistApi) {
                    try {
                        const projects = await this.plugin.todoistApi.getProjects();
                        dropdown.addOption('', 'Inbox (Default)');
                        projects.forEach(project => {
                            dropdown.addOption(project.id, project.name);
                        });
                        dropdown.setValue(this.plugin.settings.defaultProjectId);
                        dropdown.onChange(async (value) => {
                            this.plugin.settings.defaultProjectId = value;
                            await this.plugin.saveSettings();
                        });
                    } catch (error) {
                        console.error('Failed to load Todoist projects:', error);
                        dropdown.addOption('', 'Failed to load projects');
                    }
                } else {
                    dropdown.addOption('', 'Please set API token first');
                }
            });

        // Allow Duplicate Tasks Setting
        new Setting(containerEl)
            .setName('Allow duplicate tasks')
            .setDesc('Allow syncing the same task multiple times to Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowDuplicateTasks)
                .onChange(async (value) => {
                    this.plugin.settings.allowDuplicateTasks = value;
                    await this.plugin.saveSettings();
                }));

        // Allow Resyncing Completed Tasks Setting
        new Setting(containerEl)
            .setName('Allow resyncing completed tasks')
            .setDesc('Allow syncing tasks that are already completed in Todoist')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowResyncCompleted)
                .onChange(async (value) => {
                    this.plugin.settings.allowResyncCompleted = value;
                    await this.plugin.saveSettings();
                }));

        // Text Cleanup section
        containerEl.createEl('h2', { text: 'Text Cleanup' });

        // Default Cleanup Patterns
        new Setting(containerEl)
            .setName('Use default cleanup patterns')
            .setDesc('Use built-in patterns to clean up task text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useDefaultCleanupPatterns)
                .onChange(async (value) => {
                    this.plugin.settings.useDefaultCleanupPatterns = value;
                    await this.plugin.saveSettings();
                }));

        // Show default patterns
        if (this.plugin.settings.useDefaultCleanupPatterns) {
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
                    .setValue(this.plugin.settings.cleanupPatterns.join(','))
                    .onChange(async (value) => {
                        this.plugin.settings.cleanupPatterns = value.split(',').map(p => p.trim()).filter(p => p);
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
                .setValue(this.plugin.settings.blockIdFormat)
                .onChange(async (value) => {
                    this.plugin.settings.blockIdFormat = value;
                    await this.plugin.saveSettings();
                }));

        // Due Date Key Setting
        new Setting(containerEl)
            .setName('Due date key')
            .setDesc('Key for due dates in dataview format (e.g., "due" for [due::YYYY-MM-DD])')
            .addText(text => text
                .setPlaceholder('due')
                .setValue(this.plugin.settings.dueDateKey)
                .onChange(async (value) => {
                    this.plugin.settings.dueDateKey = value;
                    await this.plugin.saveSettings();
                }));

        // Include Selected Text Setting
        new Setting(containerEl)
            .setName('Include selected text')
            .setDesc('Include the selected text in the task description when creating a new task from text')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeSelectedText)
                .onChange(async (value) => {
                    this.plugin.settings.includeSelectedText = value;
                    await this.plugin.saveSettings();
                }));
    }
}
