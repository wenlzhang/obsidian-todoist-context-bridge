import TodoistContextBridgePlugin from "./main";
import {
    PluginSettingTab,
    App,
    Setting,
    DropdownComponent,
    Notice,
} from "obsidian";

export class TodoistContextBridgeSettingTab extends PluginSettingTab {
    plugin: TodoistContextBridgePlugin;
    private projectsDropdown: DropdownComponent | null = null;

    constructor(app: App, plugin: TodoistContextBridgePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        const apiTokenSetting = new Setting(this.containerEl)
            .setName("API token")
            .setDesc(
                "Your Todoist API token (Settings > Integrations > Developer in Todoist)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("Enter your API token")
                    .setValue(this.plugin.settings.todoistAPIToken)
                    .onChange(async (value) => {
                        this.plugin.settings.todoistAPIToken = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Todoist Task Sync Section
        new Setting(this.containerEl).setName("Todoist task sync").setHeading();

        // Default Project Setting
        const projectsSetting = new Setting(this.containerEl)
            .setName("Default Todoist project")
            .setDesc("Select the default project for new tasks");

        // Initialize dropdown with current projects if API is available
        const initializeDropdown = async () => {
            if (!this.plugin.todoistApi || !this.projectsDropdown) return;

            try {
                const projects = await this.plugin.todoistApi.getProjects();
                if (projects && this.projectsDropdown) {
                    this.projectsDropdown.selectEl.empty();
                    // this.projectsDropdown.addOption('', 'Inbox (Default)');
                    projects.forEach((project) => {
                        if (this.projectsDropdown) {
                            this.projectsDropdown.addOption(
                                project.id,
                                project.name,
                            );
                        }
                    });
                    this.projectsDropdown.setValue(
                        this.plugin.settings.todoistDefaultProject,
                    );
                    this.projectsDropdown.onChange(async (value: string) => {
                        this.plugin.settings.todoistDefaultProject = value;
                        await this.plugin.saveSettings();
                    });
                }
            } catch (error) {
                console.error("Failed to initialize projects dropdown:", error);
                if (this.projectsDropdown) {
                    this.projectsDropdown.selectEl.empty();
                    this.projectsDropdown.addOption(
                        "",
                        "Failed to load projects",
                    );
                }
            }
        };

        projectsSetting.addDropdown((dropdown) => {
            this.projectsDropdown = dropdown;
            // Set a consistent width for all states
            dropdown.selectEl.style.width = "200px";
            // Start with a loading state
            dropdown.addOption("", "Loading projects...");
            initializeDropdown();
            return dropdown;
        });

        // Load projects immediately if we have a valid API token
        if (this.plugin.todoistApi && this.projectsDropdown) {
            this.updateProjectsDropdown(this.projectsDropdown);
        }

        apiTokenSetting.addButton((button) =>
            button.setButtonText("Verify token").onClick(async () => {
                const result = await this.plugin.verifyTodoistToken(
                    this.plugin.settings.todoistAPIToken,
                );
                if (result.success) {
                    // Update projects dropdown if verification succeeded
                    if (result.projects && this.projectsDropdown) {
                        await this.updateProjectsDropdown(
                            this.projectsDropdown,
                            result.projects,
                        );
                    }
                    // Initialize Todoist services
                    await this.plugin.initializeTodoistServices();
                    new Notice("Todoist token verified successfully!");
                } else {
                    new Notice(
                        "Invalid Todoist token. Please check and try again.",
                    );
                }
            }),
        );

        // Allow Duplicate Tasks Setting
        new Setting(this.containerEl)
            .setName("Allow duplicate tasks")
            .setDesc("Allow syncing the same task multiple times to Todoist")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.allowSyncDuplicateTask)
                    .onChange(async (value) => {
                        this.plugin.settings.allowSyncDuplicateTask = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Allow Resyncing Completed Tasks Setting
        new Setting(this.containerEl)
            .setName("Allow resyncing completed tasks")
            .setDesc(
                "Allow syncing tasks that are already completed in Todoist",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.allowResyncCompletedTask)
                    .onChange(async (value) => {
                        this.plugin.settings.allowResyncCompletedTask = value;
                        await this.plugin.saveSettings();
                    }),
            );
        
        // Task Due Date Section
        new Setting(this.containerEl).setName("Task due date").setHeading();

        // Due Date Key Setting
        new Setting(this.containerEl)
            .setName("Dataview due date key")
            .setDesc(
                'Key for due dates in Dataview format (e.g., "due" for [due::YYYY-MM-DD])',
            )
            .addText((text) =>
                text
                    .setPlaceholder("due")
                    .setValue(this.plugin.settings.dataviewDueDateKey)
                    .onChange(async (value) => {
                        this.plugin.settings.dataviewDueDateKey = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Task Priority Section
        new Setting(this.containerEl).setName("Task priority").setHeading();
        
        // Priority Key Setting
        new Setting(this.containerEl)
            .setName("Dataview priority key")
            .setDesc(
                "Key for priorities in Dataview format (e.g., 'p' for [p::1])",
            )
            .addText((text) =>
                text
                    .setPlaceholder("p")
                    .setValue(this.plugin.settings.dataviewPriorityKey)
                    .onChange(async (value) => {
                        this.plugin.settings.dataviewPriorityKey = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        // Default Priority Setting
        new Setting(this.containerEl)
            .setName("Default priority")
            .setDesc(
                "Default priority level for tasks without a specified Dataview priority key",
            )
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("1", "Priority 1 (Highest)")
                    .addOption("2", "Priority 2")
                    .addOption("3", "Priority 3")
                    .addOption("4", "Priority 4 (Lowest)")
                    .setValue(this.plugin.settings.todoistDefaultPriority.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.todoistDefaultPriority = parseInt(value);
                        await this.plugin.saveSettings();
                    });
            });
        
        // Priority Mapping Settings
        new Setting(this.containerEl)
            .setName("Priority mapping")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Define Dataview values that map to Todoist priorities. Separate multiple values with commas.",
                    );
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.appendText("Example: For Priority 1 (highest), you might use: 1, high, p1");
                })
            );

        // Create settings for each priority level (1 = highest to 4 = lowest)
        [1, 2, 3, 4].forEach((uiPriority) => {
            // Get current values for this priority level
            const currentValues = Object.entries(this.plugin.settings.priorityMapping)
                .filter(([_, value]) => value === uiPriority)
                .map(([key, _]) => key)
                .join(", ");

            new Setting(this.containerEl)
                .setName(`Priority ${uiPriority} values`)
                .setDesc(uiPriority === 1 ? "Highest priority" : uiPriority === 4 ? "Lowest priority" : `Priority ${uiPriority}`)
                .addText((text) =>
                    text
                        .setPlaceholder(uiPriority === 1 ? "1, high" : uiPriority === 4 ? "4, none" : `${uiPriority}, medium`)
                        .setValue(currentValues)
                        .onChange(async (value) => {
                            // Remove old mappings for this priority level
                            Object.keys(this.plugin.settings.priorityMapping).forEach(key => {
                                if (this.plugin.settings.priorityMapping[key] === uiPriority) {
                                    delete this.plugin.settings.priorityMapping[key];
                                }
                            });

                            // Add new mappings
                            const values = value
                                .split(",")
                                .map(v => v.trim())
                                .filter(v => v);
                            
                            values.forEach(v => {
                                this.plugin.settings.priorityMapping[v] = uiPriority;
                            });

                            await this.plugin.saveSettings();
                        })
                );
        });
        
        // Task Linking Section
        new Setting(this.containerEl).setName("Task linking").setHeading();

        // UID Key Setting
        new Setting(this.containerEl)
            .setName("Note ID key")
            .setDesc(
                "Key name in frontmatter for storing the note ID (requires Advanced URI plugin)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("uid")
                    .setValue(this.plugin.settings.uidField)
                    .onChange(async (value) => {
                        this.plugin.settings.uidField = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Block ID Format Setting
        new Setting(this.containerEl)
            .setName("Block ID format")
            .setDesc(
                "Format for generating block IDs (uses moment.js formatting)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("YYYYMMDDHHmmssSSS")
                    .setValue(this.plugin.settings.blockIDFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.blockIDFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );
        
        // Include Selected Text Setting
        new Setting(this.containerEl)
            .setName("Include selected text")
            .setDesc(
                "Include the selected text in the task description when creating a new task from text",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(
                        this.plugin.settings.includeSelectedTextInDescription,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.includeSelectedTextInDescription =
                            value;
                        await this.plugin.saveSettings();
                    }),
            );
        
        // Text Cleanup Section
        new Setting(this.containerEl).setName("Text cleanup").setHeading();

        // Dataview Cleanup Keys
        new Setting(this.containerEl)
            .setName("Dataview cleanup keys")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Remove Dataview metadata fields from task text. Separate keys with commas. ",
                    );
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.appendText(
                        "Example: To remove fields like [created::2024-01-01] and [c::#tag], use: ",
                    );
                    frag.createEl("code", {
                        text: "created, c",
                    });
                }),
            )
            .addTextArea((text) => {
                text.setPlaceholder("Enter Dataview keys, separated by commas")
                    .setValue(this.plugin.settings.dataviewCleanupKeys)
                    .onChange(async (value) => {
                        this.plugin.settings.dataviewCleanupKeys = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
                return text;
            });

        // Moment.js Format Cleanup Patterns
        new Setting(this.containerEl)
            .setName("Moment.js format cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Remove timestamps with optional prefixes from task text. Separate patterns with commas. ",
                    );
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.appendText(
                        "Example: To remove timestamps like '📝 2024-01-01T10:30' and '❎ 2024-01-01T10:30', use: ",
                    );
                    frag.createEl("code", {
                        text: "[📝 ]YYYY-MM-DDTHH:mm, [❎ ]YYYY-MM-DDTHH:mm",
                    });
                }),
            )
            .addTextArea((text) => {
                text.setPlaceholder(
                    "Enter Moment.js patterns, separated by commas",
                )
                    .setValue(this.plugin.settings.momentFormatCleanupPatterns)
                    .onChange(async (value) => {
                        this.plugin.settings.momentFormatCleanupPatterns =
                            value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
                return text;
            });

        // Default Cleanup Patterns
        new Setting(this.containerEl)
            .setName("Use default cleanup patterns")
            .setDesc("Use built-in patterns to clean up task text")
            .addToggle((toggle) =>
                toggle
                    .setValue(
                        this.plugin.settings.useDefaultTaskTextCleanupPatterns,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.useDefaultTaskTextCleanupPatterns =
                            value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Show default patterns
        if (this.plugin.settings.useDefaultTaskTextCleanupPatterns) {
            const defaultPatternsContainer = this.containerEl.createDiv();
            defaultPatternsContainer.createEl("p", {
                text: "Default patterns will remove:",
                cls: "setting-item-description",
            });
            const patternsList = defaultPatternsContainer.createEl("ul");
            patternsList.style.marginLeft = "20px";
            patternsList.style.fontSize = "0.9em";
            patternsList.style.color = "var(--text-muted)";

            const defaultPatterns = [
                ["Checkboxes", "^[\\s-]*\\[[ x?/-]\\]", "- [ ] Task"],
                [
                    "Timestamps",
                    "📝\\s*\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?",
                    "📝 2024-11-23T22:09",
                ],
                ["Block IDs", "\\^[a-zA-Z0-9-]+$", "^abc123"],
                ["Tags", "#[^\\s]+", "#tag"],
                [
                    "Emojis",
                    "[\\u{1F300}-\\u{1F9FF}]|[\\u{1F600}-\\u{1F64F}]|[\\u{1F680}-\\u{1F6FF}]|[\\u{2600}-\\u{26FF}]|[\\u{2700}-\\u{27BF}]",
                    "😊 🎉",
                ],
            ];

            defaultPatterns.forEach(([name, pattern, example]) => {
                const li = patternsList.createEl("li");
                li.createSpan({ text: `${name}: `, cls: "setting-item-name" });
                li.createEl("code", { text: pattern });
                li.createSpan({ text: ` (e.g., "${example}")` });
            });
        }

        // Custom Cleanup Patterns
        new Setting(this.containerEl)
            .setName("Custom cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Add your own regex patterns to remove from task text. Separate patterns with commas. ",
                    );
                    frag.createEl("a", {
                        text: "Learn more about regex",
                        href: "https://regex101.com",
                    }).setAttr("target", "_blank");
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.appendText(
                        "Example: To remove timestamps like [2024-01-01], use: ",
                    );
                    frag.createEl("code", {
                        text: "\\[\\d{4}-\\d{2}-\\d{2}\\]",
                    });
                }),
            )
            .addTextArea((text) => {
                text.setPlaceholder("Enter regex patterns, separated by commas")
                    .setValue(
                        this.plugin.settings.taskTextCleanupPatterns.join(","),
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.taskTextCleanupPatterns = value
                            .split(",")
                            .map((p) => p.trim())
                            .filter((p) => p);
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
                return text;
            });
    }

    private async updateProjectsDropdown(
        dropdown: DropdownComponent,
        projects?: Array<{ id: string; name: string }>,
    ) {
        try {
            if (!projects && this.plugin.todoistApi) {
                projects = await this.plugin.todoistApi.getProjects();
            }

            if (!projects) {
                dropdown.addOption("", "Failed to load projects");
                return;
            }

            // Clear existing options
            dropdown.selectEl.empty();

            // Add default option
            // dropdown.addOption('', 'Inbox (Default)');

            // Add all projects
            projects.forEach((project) => {
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
            console.error("Failed to update projects dropdown:", error);
        }
    }
}
