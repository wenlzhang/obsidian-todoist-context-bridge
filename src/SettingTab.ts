import TodoistContextBridgePlugin from "./main";
import {
    PluginSettingTab,
    App,
    Setting,
    DropdownComponent,
    Notice,
} from "obsidian";
import { TextParsing } from "./TextParsing";

export class TodoistContextBridgeSettingTab extends PluginSettingTab {
    plugin: TodoistContextBridgePlugin;
    private projectsDropdown: DropdownComponent | null = null;
    private textParsing: TextParsing;

    constructor(app: App, plugin: TodoistContextBridgePlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.textParsing = new TextParsing(plugin.settings);
    }

    display(): void {
        this.containerEl.empty();

        const apiTokenSetting = new Setting(this.containerEl)
            .setName("Todoist API token")
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
            dropdown.selectEl.style.width = "160px";
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

        // Allow Syncing Duplicate Tasks Setting
        new Setting(this.containerEl)
            .setName("Allow syncing duplicate tasks")
            .setDesc("Allow syncing the same task multiple times to Todoist")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.allowSyncDuplicateTask)
                    .onChange(async (value) => {
                        this.plugin.settings.allowSyncDuplicateTask = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Allow re-syncing completed Todoist tasks Setting
        new Setting(this.containerEl)
            .setName("Allow re-syncing completed Todoist tasks")
            .setDesc(
                "Allow syncing a task from Obsidian to Todoist again after its previous instance was marked as completed in Todoist",
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

        // Due Date Settings
        // this.containerEl.createEl("h3", { text: "Due Date Settings" });

        new Setting(this.containerEl)
            .setName("Enable Tasks plugin due date")
            .setDesc(
                "Enable support for Tasks plugin due date format (📅 YYYY-MM-DD)"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTasksPluginDueDate)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTasksPluginDueDate = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Preferred due date format")
            .setDesc(
                "Choose which format takes priority when both Tasks and Dataview due dates are present in a task"
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("tasks", "Tasks Plugin (📅)")
                    .addOption("dataview", "DataView ([due::...])")
                    .setValue(this.plugin.settings.preferredDueDateFormat)
                    .onChange(async (value: 'tasks' | 'dataview') => {
                        this.plugin.settings.preferredDueDateFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

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
                    }),
            );

        // Set Today as Default Due Date Setting
        new Setting(this.containerEl)
            .setName("Set today as default due date")
            .setDesc(
                "When no due date is specified in the task, automatically set it to today when syncing to Todoist",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.setTodayAsDefaultDueDate)
                    .onChange(async (value) => {
                        this.plugin.settings.setTodayAsDefaultDueDate = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Set Today as Default Due Date Setting for non-task case
        new Setting(this.containerEl)
            .setName("Set today as default due date for non-task case")
            .setDesc(
                "When creating a task from a non-task (e.g., note or textselection), default the due date to today.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.defaultTodayForNonTask)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultTodayForNonTask = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Warn Past Due Date Setting
        new Setting(this.containerEl)
            .setName("Warn about past due dates")
            .setDesc("Show a warning when setting a due date in the past")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.warnPastDueDate)
                    .onChange(async (value) => {
                        this.plugin.settings.warnPastDueDate = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Task Priority Section
        new Setting(this.containerEl).setName("Task priority").setHeading();

        // Priority Key Setting
        new Setting(this.containerEl)
            .setName("Dataview priority key")
            .setDesc(
                "Key used to specify task priority in Dataview format (e.g., 'p' for [p::1] or [p::high])",
            )
            .addText((text) =>
                text
                    .setPlaceholder("p")
                    .setValue(this.plugin.settings.dataviewPriorityKey)
                    .onChange(async (value) => {
                        this.plugin.settings.dataviewPriorityKey = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Default Priority Setting
        new Setting(this.containerEl)
            .setName("Default priority")
            .setDesc(
                "Priority level assigned to tasks when syncing to Todoist if no Dataview priority key is specified",
            )
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("1", "Priority 1 (Highest)")
                    .addOption("2", "Priority 2")
                    .addOption("3", "Priority 3")
                    .addOption("4", "Priority 4 (Lowest)")
                    .setValue(
                        this.plugin.settings.todoistDefaultPriority.toString(),
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.todoistDefaultPriority =
                            parseInt(value);
                        await this.plugin.saveSettings();
                    });
                dropdown.selectEl.style.width = "160px";
                return dropdown;
            });

        // Priority Mapping Settings
        new Setting(this.containerEl).setName("Priority mapping").setDesc(
            createFragment((frag) => {
                frag.appendText(
                    "Define Dataview values that map to Todoist priorities. Separate multiple values with commas.",
                );
            }),
        );

        // Create settings for each priority level (1 = highest to 4 = lowest)
        [1, 2, 3, 4].forEach((uiPriority) => {
            // Get current values for this priority level
            const currentValues = Object.entries(
                this.plugin.settings.priorityMapping,
            )
                .filter(([_, value]) => value === uiPriority)
                .map(([key, _]) => key)
                .join(", ");

            new Setting(this.containerEl)
                .setName(`Priority ${uiPriority} values`)
                .setDesc(
                    uiPriority === 1
                        ? "Highest priority in Todoist"
                        : uiPriority === 4
                          ? "Lowest priority in Todoist"
                          : `Priority ${uiPriority} in Todoist`,
                )
                .addText((text) =>
                    text
                        .setPlaceholder(
                            uiPriority === 1
                                ? "1, high"
                                : uiPriority === 4
                                  ? "4, none"
                                  : `${uiPriority}, medium`,
                        )
                        .setValue(currentValues)
                        .onChange(async (value) => {
                            // Remove old mappings for this priority level
                            Object.keys(
                                this.plugin.settings.priorityMapping,
                            ).forEach((key) => {
                                if (
                                    this.plugin.settings.priorityMapping[
                                        key
                                    ] === uiPriority
                                ) {
                                    delete this.plugin.settings.priorityMapping[
                                        key
                                    ];
                                }
                            });

                            // Add new mappings
                            const values = value
                                .split(",")
                                .map((v) => v.trim())
                                .filter((v) => v);

                            values.forEach((v) => {
                                this.plugin.settings.priorityMapping[v] =
                                    uiPriority;
                            });

                            await this.plugin.saveSettings();
                        }),
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

        // Add timestamp format setting
        new Setting(this.containerEl)
            .setName("Task creation timestamp format")
            .setDesc(
                "Customize how the creation timestamp appears in the task description's metadata section in Todoist. " +
                    "This timestamp is added after the reference link to show when the task was synced. " +
                    "Uses moment.js format (e.g., [📝 ]YYYY-MM-DDTHH:mm)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("[📝 ]YYYY-MM-DDTHH:mm")
                    .setValue(this.plugin.settings.timestampFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.timestampFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Add Todoist link timestamp format setting
        new Setting(this.containerEl)
            .setName("Todoist link timestamp format")
            .setDesc(
                "Customize how the creation timestamp appears after the Todoist link in Obsidian. " +
                    "This timestamp is added after the Todoist task link to show when the task was synced. " +
                    "Uses moment.js format (e.g., [📝 ]YYYY-MM-DDTHH:mm)",
            )
            .addText((text) =>
                text
                    .setPlaceholder("[📝 ]YYYY-MM-DDTHH:mm")
                    .setValue(this.plugin.settings.todoistLinkTimestampFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.todoistLinkTimestampFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Include Line Text Setting
        new Setting(this.containerEl)
            .setName("Include line text")
            .setDesc(
                "Include text of the current line in the Todoist task description when creating a new Todoist task from text",
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

        // Task Tagging Settings
        new Setting(this.containerEl).setName("Task tagging").setHeading();

        // Enable Auto-Tagging Setting
        const autoTagContainer = this.containerEl.createDiv({
            cls: "auto-tag-setting-container",
        });

        new Setting(autoTagContainer)
            .setName("Enable auto-tagging")
            .setDesc(
                "Automatically add a tag to the task in Obsidian when it is synced to Todoist. The tag helps track synced tasks in Obsidian only and won't appear in Todoist",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAutoTagInsertion)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAutoTagInsertion = value;
                        // Show/hide tag input based on toggle
                        tagSetting.settingEl.style.display = value
                            ? "flex"
                            : "none";
                        await this.plugin.saveSettings();
                    }),
            );

        // Custom Tag Setting
        const tagSetting = new Setting(autoTagContainer)
            .setName("Auto-tag name")
            .setDesc(
                "Tag to add to the task in Obsidian for tracking (without the # symbol). Only letters, numbers, hyphens, and underscores are allowed.",
            )
            .addText((text) => {
                const textComponent = text
                    .setPlaceholder("TaskSyncToTodoist")
                    .setValue(this.plugin.settings.autoTagName)
                    .onChange(async (value) => {
                        // Use TextParsing's validation
                        const validation =
                            this.textParsing.validateObsidianTag(value);

                        // Update UI based on validation
                        if (!validation.isValid && validation.errorMessage) {
                            textComponent.inputEl.addClass("is-invalid");
                            tagValidationMsg.style.display = "block";
                            tagValidationMsg.setText(validation.errorMessage);
                        } else {
                            textComponent.inputEl.removeClass("is-invalid");
                            tagValidationMsg.style.display = "none";
                            this.plugin.settings.autoTagName = value;
                            await this.plugin.saveSettings();
                        }
                    });

                // Add validation styling
                textComponent.inputEl.addClass("todoist-tag-input");
                return textComponent;
            });

        // Add validation message container for tag
        const tagValidationMsg = autoTagContainer.createDiv({
            cls: "setting-item-description validation-error",
            text: "",
        });
        tagValidationMsg.style.display = "none";
        tagValidationMsg.style.color = "var(--text-error)";
        tagValidationMsg.style.marginTop = "8px";

        // Add example under the tag setting
        tagSetting.descEl.createEl("div", {
            text: "Note: Do not include spaces or the # symbol in the tag name.",
            cls: "setting-item-description",
        });

        // Initially hide tag input if toggle is off
        tagSetting.settingEl.style.display = this.plugin.settings
            .enableAutoTagInsertion
            ? "flex"
            : "none";

        const labelSettingContainer = this.containerEl.createDiv({
            cls: "todoist-label-setting-container",
        });

        new Setting(labelSettingContainer)
            .setName("Enable Todoist label")
            .setDesc(
                createFragment((fragment) => {
                    fragment.appendText(
                        "Add a label to tasks when they are synced to Todoist. ",
                    );
                    fragment.createEl("br");
                    fragment.appendText(
                        "Note: Labels will be personal by default, but become shared when used in shared projects.",
                    );
                }),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTodoistLabel)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTodoistLabel = value;
                        // Show/hide label input based on toggle
                        labelSetting.settingEl.style.display = value
                            ? "flex"
                            : "none";
                        await this.plugin.saveSettings();
                    }),
            );

        const labelSetting = new Setting(labelSettingContainer)
            .setName("Todoist label name")
            .setDesc(
                createFragment((fragment) => {
                    fragment.appendText("Label rules:");
                    fragment.createEl("ul", {}, (ul) => {
                        ul.createEl("li", {
                            text: "Can contain letters, numbers, spaces, and underscores",
                        });
                        ul.createEl("li", {
                            text: "Cannot contain special characters like @, #, !, etc.",
                        });
                        ul.createEl("li", {
                            text: "Must be between 1 and 60 characters",
                        });
                        ul.createEl("li", {
                            text: "Spaces at the start/end will be trimmed",
                        });
                    });
                }),
            )
            .addText((text) => {
                const textComponent = text
                    .setPlaceholder("ToDoObsidian")
                    .setValue(this.plugin.settings.todoistSyncLabel)
                    .onChange(async (value) => {
                        const trimmedValue = value.trim();
                        const isValid =
                            this.textParsing.isValidTodoistLabel(trimmedValue);

                        if (trimmedValue && !isValid) {
                            textComponent.inputEl.addClass("is-invalid");
                            labelValidationMsg.style.display = "block";
                        } else {
                            textComponent.inputEl.removeClass("is-invalid");
                            labelValidationMsg.style.display = "none";
                            this.plugin.settings.todoistSyncLabel =
                                trimmedValue;
                            await this.plugin.saveSettings();
                        }
                    });

                // Add validation styling
                textComponent.inputEl.addClass("todoist-label-input");
                return textComponent;
            });

        // Add validation message container for label
        const labelValidationMsg = labelSettingContainer.createDiv({
            cls: "setting-item-description validation-error",
            text: "Invalid label name. Labels can only contain letters, numbers, spaces, and underscores, and must be between 1 and 60 characters.",
        });
        labelValidationMsg.style.display = "none";
        labelValidationMsg.style.color = "var(--text-error)";
        labelValidationMsg.style.marginTop = "8px";

        // Initially hide label input if toggle is off
        labelSetting.settingEl.style.display = this.plugin.settings
            .enableTodoistLabel
            ? "flex"
            : "none";

        // Text Cleanup Section
        new Setting(this.containerEl)
            .setName("Text cleanup")
            .setHeading()
            .setDesc(
                createFragment((frag) => {
                    const link = frag.createEl("a", {
                        text: "See documentation for the complete list of patterns",
                        href: "https://ptkm.net/text-cleanup-patterns-todoist-context-bridge",
                    });
                    link.style.color = "var(--text-accent)";
                }),
            );

        // Use Default Cleanup Patterns
        new Setting(this.containerEl)
            .setName("Use default cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Enable built-in patterns to automatically clean up common Markdown elements when syncing to Todoist (checkboxes, timestamps, block IDs, tags, emojis).",
                    );
                }),
            )
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

        // Dataview Cleanup Keys
        new Setting(this.containerEl)
            .setName("Dataview cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Remove Dataview metadata fields from task text. Separate keys with commas.",
                    );
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.appendText(
                        "Example: If you have [category::work] in your tasks, add 'category' to remove it.",
                    );
                }),
            )
            .addTextArea((text) => {
                text.setPlaceholder("Enter Dataview keys, separated by commas")
                    .setValue(this.plugin.settings.dataviewCleanupKeys)
                    .onChange(async (value) => {
                        this.plugin.settings.dataviewCleanupKeys = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 2;
                text.inputEl.cols = 50;
                return text;
            });

        // Moment.js Format Cleanup Patterns
        new Setting(this.containerEl)
            .setName("Moment.js format cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Remove timestamps with optional prefixes from task text. Separate patterns with commas.",
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

        // Custom Cleanup Patterns
        new Setting(this.containerEl)
            .setName("Custom cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Additional regex patterns to remove from task text when syncing to Todoist. One pattern per line.",
                    );
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.appendText(
                        "Example: \\[\\d{4}-\\d{2}-\\d{2}\\] to remove date stamps like [2024-01-01]",
                    );
                }),
            )
            .addTextArea((text) => {
                text.setPlaceholder("Enter patterns, one per line")
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
