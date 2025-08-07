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

        // Dataview Due Date Settings
        const dataviewDueDateHeading = new Setting(this.containerEl)
            .setName("Due date for Dataview")
            .setClass("setting-subsection-heading");

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

        // Tasks Plugin Due Date Settings
        const tasksPluginDueDateHeading = new Setting(this.containerEl)
            .setName("Due date for Tasks plugin")
            .setClass("setting-subsection-heading");

        new Setting(this.containerEl)
            .setName("Enable Tasks plugin due date")
            .setDesc(
                "Enable support for Tasks plugin due date format (📅 YYYY-MM-DD)",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTasksPluginDueDate)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTasksPluginDueDate = value;
                        if (!value) {
                            this.plugin.settings.preferredDueDateFormat =
                                "dataview";
                        }
                        formatSetting.settingEl.style.display = value
                            ? "flex"
                            : "none";
                        await this.plugin.saveSettings();
                    }),
            );

        const formatSetting = new Setting(this.containerEl)
            .setName("Preferred due date format")
            .setDesc(
                "Choose which format takes priority when both Tasks and Dataview due dates are present in a task",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("tasks", "Tasks plugin")
                    .addOption("dataview", "Dataview")
                    .setValue(this.plugin.settings.preferredDueDateFormat)
                    .onChange(async (value: "tasks" | "dataview") => {
                        this.plugin.settings.preferredDueDateFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );

        formatSetting.settingEl.style.display = this.plugin.settings
            .enableTasksPluginDueDate
            ? "flex"
            : "none";

        // Task Priority Section
        new Setting(this.containerEl).setName("Task priority").setHeading();

        new Setting(this.containerEl)
            .setName("Default priority")
            .setDesc(
                "Priority level assigned to tasks when syncing to Todoist if no priority is specified",
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

        // Dataview Priority Settings
        const dataviewPriorityHeading = new Setting(this.containerEl)
            .setName("Priority for Dataview")
            .setClass("setting-subsection-heading");

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

        new Setting(this.containerEl)
            .setName("Priority mapping for Dataview")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Define Dataview values that map to Todoist priorities. Separate multiple values with commas.",
                    );
                }),
            );

        [1, 2, 3, 4].forEach((uiPriority) => {
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
                    text.setValue(currentValues).onChange(async (value) => {
                        // Remove old mappings for this priority level
                        const newMapping = {
                            ...this.plugin.settings.priorityMapping,
                        };
                        Object.keys(newMapping).forEach((key) => {
                            if (newMapping[key] === uiPriority) {
                                delete newMapping[key];
                            }
                        });

                        // Add new mappings
                        value
                            .split(",")
                            .map((v) => v.trim())
                            .filter((v) => v)
                            .forEach((v) => {
                                newMapping[v] = uiPriority;
                            });

                        this.plugin.settings.priorityMapping = newMapping;
                        await this.plugin.saveSettings();
                    }),
                );
        });

        // Tasks Plugin Priority Settings
        const tasksPluginPriorityHeading = new Setting(this.containerEl)
            .setName("Priority for Tasks plugin")
            .setClass("setting-subsection-heading");

        new Setting(this.containerEl)
            .setName("Enable Tasks plugin priority")
            .setDesc(
                "Enable support for Tasks plugin priority emojis (⏬ lowest, 🔽 low, 🔼 medium, ⏫ high, 🔺 highest)",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTasksPluginPriority)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTasksPluginPriority = value;
                        if (!value) {
                            this.plugin.settings.preferredPriorityFormat =
                                "dataview";
                        }
                        tasksPluginPriorityContainer.style.display = value
                            ? "block"
                            : "none";
                        preferredPriorityFormat.settingEl.style.display = value
                            ? "flex"
                            : "none";
                        await this.plugin.saveSettings();
                    }),
            );

        const tasksPluginPriorityContainer = this.containerEl.createDiv();
        tasksPluginPriorityContainer.style.display = this.plugin.settings
            .enableTasksPluginPriority
            ? "block"
            : "none";

        new Setting(tasksPluginPriorityContainer)
            .setName("Priority mapping for Tasks plugin")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Define Tasks plugin values that map to Todoist priorities. Separate multiple values with commas.",
                    );
                }),
            );

        // Tasks Plugin Priority Mappings
        [1, 2, 3, 4].forEach((priority) => {
            new Setting(tasksPluginPriorityContainer)
                .setName(`Priority ${priority} values`)
                .setDesc(
                    priority === 1
                        ? "Highest priority in Todoist"
                        : priority === 4
                          ? "Lowest priority in Todoist"
                          : `Priority ${priority} in Todoist`,
                )
                .addText((text) =>
                    text
                        .setValue(
                            Object.entries(
                                this.plugin.settings.tasksPluginPriorityMapping,
                            )
                                .filter(([_, value]) => value === priority)
                                .map(([key, _]) => key)
                                .join(","),
                        )
                        .onChange(async (value) => {
                            const keys = value
                                .split(",")
                                .map((k) => k.trim())
                                .filter((k) => k);
                            const newMapping = {
                                ...this.plugin.settings
                                    .tasksPluginPriorityMapping,
                            };
                            // Remove old priority mappings
                            Object.keys(newMapping).forEach((key) => {
                                if (newMapping[key] === priority)
                                    delete newMapping[key];
                            });
                            // Add new priority mappings
                            keys.forEach((key) => (newMapping[key] = priority));
                            this.plugin.settings.tasksPluginPriorityMapping =
                                newMapping;
                            await this.plugin.saveSettings();
                        }),
                );
        });

        // Preferred Priority Format
        const preferredPriorityFormat = new Setting(this.containerEl)
            .setName("Preferred priority format")
            .setDesc(
                "Choose which format takes priority when both Dataview and Tasks plugin priorities are present in a task",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("tasks", "Tasks plugin")
                    .addOption("dataview", "Dataview")
                    .setValue(this.plugin.settings.preferredPriorityFormat)
                    .onChange(async (value: "tasks" | "dataview") => {
                        this.plugin.settings.preferredPriorityFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );

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

        // Todoist Link Format Setting
        new Setting(this.containerEl)
            .setName("Todoist link format")
            .setDesc(
                "Choose which type of Todoist links to insert under the Obsidian task when syncing tasks from Todoist.",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("website", "Todoist website link only")
                    .addOption("app", "Todoist app link only")
                    .addOption("both", "Both website and app links")
                    .setValue(this.plugin.settings.todoistLinkFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.todoistLinkFormat = value;
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

        // Use Markdown Link Format Setting
        new Setting(this.containerEl)
            .setName("Use Markdown link format")
            .setDesc(
                "Format Obsidian links in Todoist task descriptions as Markdown links instead of plain text. " +
                    "For example, [Original task in Obsidian](obsidian://url) instead of Original task in Obsidian: obsidian://url",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.useMdLinkFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.useMdLinkFormat = value;
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
                createFragment((frag) => {
                    frag.appendText(
                        "Add a label to tasks when they are synced to Todoist. ",
                    );
                    frag.createEl("br");
                    frag.appendText(
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
                createFragment((frag) => {
                    frag.appendText("Label rules:");
                    frag.createEl("ul", {}, (ul) => {
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

        // Task Completion Sync
        new Setting(this.containerEl)
            .setName("Task completion sync")
            .setHeading();

        // Completion Timestamp Settings (available for both manual and auto-sync)
        // Function to refresh completion timestamp settings visibility
        const refreshCompletionTimestampSettings = () => {
            const isEnabled = this.plugin.settings.enableCompletionTimestamp;
            const displayStyle = isEnabled ? "" : "none";

            completionTimestampSourceSetting.settingEl.style.display =
                displayStyle;
            completionTimestampFormatSetting.settingEl.style.display =
                displayStyle;
        };

        // Enable Completion Timestamp
        new Setting(this.containerEl)
            .setName("Add completion timestamp")
            .setDesc(
                "When a task is marked complete in Todoist, append a completion timestamp to the task in Obsidian (similar to Task Marker plugin behavior). This works for both manual and automatic sync operations.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableCompletionTimestamp)
                    .onChange(async (value) => {
                        this.plugin.settings.enableCompletionTimestamp = value;
                        await this.plugin.saveSettings();
                        refreshCompletionTimestampSettings();
                    }),
            );

        // Completion Timestamp Source
        const completionTimestampSourceSetting = new Setting(this.containerEl)
            .setName("Completion timestamp source")
            .setDesc(
                "Choose whether to use the actual completion time from Todoist or the time when the sync occurs. Todoist completion time provides more accurate temporal tracking.",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("todoist-completion", "Todoist completion time")
                    .addOption("sync-time", "Sync time")
                    .setValue(this.plugin.settings.completionTimestampSource)
                    .onChange(
                        async (value: "todoist-completion" | "sync-time") => {
                            this.plugin.settings.completionTimestampSource =
                                value;
                            await this.plugin.saveSettings();
                        },
                    ),
            );

        // Completion Timestamp Format
        const completionTimestampFormatSetting = new Setting(this.containerEl)
            .setName("Completion timestamp format")
            .setDesc(
                "Format for completion timestamps using moment.js syntax. Examples: '[✅ ]YYYY-MM-DD[T]HH:mm', '[completion::]YYYY-MM-DD', '[[completion::]YYYY-MM-DD[] ✅ ]YYYY-MM-DD[T]HH:mm'.",
            )
            .addText((text) =>
                text
                    .setPlaceholder("[✅ ]YYYY-MM-DD[T]HH:mm")
                    .setValue(this.plugin.settings.completionTimestampFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.completionTimestampFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Initialize visibility based on current setting
        refreshCompletionTimestampSettings();

        // Enable Task Completion Auto-Sync (main toggle)
        new Setting(this.containerEl)
            .setName("Enable task completion auto-sync")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Automatically synchronize task completion status between Obsidian and Todoist. When enabled, completing a task in either application will instantly update the status in the other.",
                    );
                    frag.createEl("br");
                    frag.createEl("br");
                    frag.createEl("strong").appendText(
                        "🚀 Performance Features:",
                    );
                    frag.createEl("br");
                    frag.appendText(
                        "• Intelligent journal-based sync tracking for optimal performance",
                    );
                    frag.createEl("br");
                    frag.appendText(
                        "• Incremental change detection (only processes modified tasks)",
                    );
                    frag.createEl("br");
                    frag.appendText(
                        "• Smart API usage with rate limit protection",
                    );
                    frag.createEl("br");
                    frag.appendText(
                        "• Four-tier task prioritization system for efficiency",
                    );
                }),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTaskCompletionAutoSync)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTaskCompletionAutoSync =
                            value;
                        await this.plugin.saveSettings();
                        // Restart sync service if needed
                        if (this.plugin.bidirectionalSyncService) {
                            if (value) {
                                this.plugin.bidirectionalSyncService.start();
                            } else {
                                this.plugin.bidirectionalSyncService.stop();
                            }
                        }
                        // Refresh the display to show/hide related settings
                        this.display();
                    }),
            );

        // Only show task completion auto-sync settings when enabled
        if (this.plugin.settings.enableTaskCompletionAutoSync) {
            // Sync Interval
            const syncIntervalSetting = new Setting(this.containerEl).setName(
                "Sync interval",
            );

            // Function to update the description with current values
            const updateSyncIntervalDescription = (syncValue: number) => {
                // Calculate journal maintenance interval: 1/3 of sync interval, minimum 1 minute
                const journalInterval = Math.max(1, Math.round(syncValue / 3));

                // Create a description fragment with proper formatting
                const descFragment = createFragment((frag) => {
                    frag.appendText(
                        "How often to check for task completion changes. Also controls journal maintenance frequency (runs at 1/3 of this interval). Minimum 1 minute, recommended 5-15 minutes to balance responsiveness with API rate limits.",
                    );
                    frag.createEl("br");
                    frag.createEl("br");

                    // Current values section with styling
                    const valuesSpan = frag.createEl("span", {
                        attr: {
                            style: "color: var(--text-muted); font-size: 0.9em;",
                        },
                    });
                    valuesSpan.appendText(
                        `📊 Task completion auto-sync: ${syncValue} minutes`,
                    );
                    valuesSpan.createEl("br");
                    valuesSpan.appendText(
                        `🔧 Journal maintenance: ${journalInterval} minutes`,
                    );
                });

                // Clear and set the new description
                syncIntervalSetting.descEl.empty();
                syncIntervalSetting.descEl.appendChild(descFragment);
            };

            // Set initial description
            updateSyncIntervalDescription(
                this.plugin.settings.syncIntervalMinutes,
            );

            syncIntervalSetting.addSlider((slider) =>
                slider
                    .setLimits(1, 60, 1)
                    .setValue(this.plugin.settings.syncIntervalMinutes)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        // Update description immediately for real-time feedback
                        updateSyncIntervalDescription(value);

                        this.plugin.settings.syncIntervalMinutes = value;
                        await this.plugin.saveSettings();

                        // Restart sync service with new interval
                        if (
                            this.plugin.bidirectionalSyncService &&
                            this.plugin.settings.enableTaskCompletionAutoSync
                        ) {
                            this.plugin.bidirectionalSyncService.stop();
                            this.plugin.bidirectionalSyncService.start();
                        }
                    }),
            );

            // Task completion state optimization setting
            new Setting(this.containerEl)
                .setName("Track tasks completed in both sources")
                .setDesc(
                    createFragment((frag) => {
                        frag.createEl("strong").appendText(
                            "Five-Category Task Optimization System",
                        );
                        frag.createEl("br");
                        frag.appendText(
                            "This plugin uses an intelligent five-category task prioritization system to dramatically reduce unnecessary Todoist API calls while maintaining perfect sync accuracy:",
                        );
                        frag.createEl("br");
                        frag.createEl("br");

                        // Category 1 & 2: High Priority
                        frag.createEl("strong").appendText(
                            "🔴 HIGH PRIORITY (Always Synced):",
                        );
                        frag.createEl("br");
                        frag.appendText("• ");
                        frag.createEl("em").appendText(
                            "Obsidian completed, Todoist open",
                        );
                        frag.appendText(
                            " - Syncs completion to Todoist immediately",
                        );
                        frag.createEl("br");
                        frag.appendText("• ");
                        frag.createEl("em").appendText(
                            "Obsidian open, Todoist completed",
                        );
                        frag.appendText(
                            " - Syncs completion to Obsidian immediately",
                        );
                        frag.createEl("br");
                        frag.createEl("br");

                        // Category 3: Medium Priority
                        frag.createEl("strong").appendText(
                            "🟡 MEDIUM PRIORITY (Normal Intervals):",
                        );
                        frag.createEl("br");
                        frag.appendText("• ");
                        frag.createEl("em").appendText("Both open/active");
                        frag.appendText(
                            " - Checked at your configured sync intervals",
                        );
                        frag.createEl("br");
                        frag.createEl("br");

                        // Category 4: Low Priority (User Configurable)
                        frag.createEl("strong").appendText(
                            "🟢 LOW PRIORITY (User Configurable):",
                        );
                        frag.createEl("br");
                        frag.appendText("• ");
                        frag.createEl("em").appendText("Both completed");
                        frag.appendText(
                            " - This setting controls whether to track these tasks",
                        );
                        frag.createEl("br");
                        frag.appendText("  ◦ When ");
                        frag.createEl("strong").appendText("enabled");
                        frag.appendText(
                            ": Checked very rarely (every 24 hours) in case they're reopened",
                        );
                        frag.createEl("br");
                        frag.appendText("  ◦ When ");
                        frag.createEl("strong").appendText("disabled");
                        frag.appendText(
                            ": Completely skipped - no API calls made",
                        );
                        frag.createEl("br");
                        frag.createEl("br");

                        // Category 5: Skip
                        frag.createEl("strong").appendText(
                            "⚫ SKIP CATEGORY (Never Checked):",
                        );
                        frag.createEl("br");
                        frag.appendText("• ");
                        frag.createEl("em").appendText(
                            "Deleted/orphaned tasks",
                        );
                        frag.appendText(
                            " - Completely ignored, preserved in log for reference only",
                        );
                        frag.createEl("br");
                        frag.createEl("br");

                        // Performance Benefits
                        frag.createEl("strong").appendText(
                            "📈 Performance Impact:",
                        );
                        frag.createEl("br");
                        frag.appendText(
                            "This system reduces unnecessary API calls by ",
                        );
                        frag.createEl("strong").appendText("90-95%");
                        frag.appendText(
                            ", preventing rate limit errors while maintaining perfect sync accuracy. ",
                        );
                        frag.appendText(
                            "Disabling both-completed task tracking provides the maximum performance benefit.",
                        );
                    }),
                )
                .addToggle((toggle) => {
                    toggle
                        .setValue(this.plugin.settings.trackBothCompletedTasks)
                        .onChange(async (value) => {
                            this.plugin.settings.trackBothCompletedTasks =
                                value;
                            await this.plugin.saveSettings();
                        });
                })
                .addExtraButton((button) => {
                    button
                        .setIcon("info")
                        .setTooltip(
                            "Tasks completed in both sources are unlikely to be reopened",
                        )
                        .onClick(() => {
                            new Notice(
                                "When disabled, tasks completed in both Obsidian and Todoist are completely ignored during sync operations, which can significantly reduce API calls. When enabled, these tasks are checked very rarely (every 24 hours) in case they are reopened.",
                            );
                        });
                });

            // Journal-based sync progress setting
            new Setting(this.containerEl)
                .setName("Show sync progress")
                .setDesc(
                    "Display progress notifications during sync operations",
                )
                .addToggle((toggle) => {
                    toggle
                        .setValue(this.plugin.settings.showSyncProgress)
                        .onChange(async (value) => {
                            this.plugin.settings.showSyncProgress = value;
                            await this.plugin.saveSettings();
                        });
                });

            // Journal-based sync settings are always visible since this is now the only sync method
        } // End of task completion auto-sync conditional block

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
                        "Enable built-in patterns to automatically clean up common Markdown elements when syncing to Todoist (checkboxes, callout formatting, quotes, timestamps, block IDs, tags, emojis).",
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

        // Dataview Cleanup Patterns
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

        // Tasks plugin cleanup patterns
        new Setting(this.containerEl)
            .setName("Tasks plugin cleanup patterns")
            .setDesc(
                createFragment((frag) => {
                    frag.appendText(
                        "Comma-separated list of emojis to clean up from task text. When an emoji is found, it and any text following it (until the next emoji or end of line) will be removed.",
                    );
                }),
            )
            .addTextArea((text) => {
                text.setValue(
                    this.plugin.settings.tasksPluginEmojiCleanupPatterns,
                );
                text.onChange(async (value) => {
                    this.plugin.settings.tasksPluginEmojiCleanupPatterns =
                        value;
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

        // Notification
        new Setting(this.containerEl).setName("Notifications").setHeading();

        // Desktop Notification Preference
        new Setting(this.containerEl)
            .setName("Notification preference")
            .setDesc(
                "Choose when to show notifications for sync operations. 'All' shows notifications for both successful syncs and errors. 'Errors only' shows notifications only when sync operations fail. 'None' suppresses all sync notifications.",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("all", "All notifications")
                    .addOption("errors", "Errors only")
                    .addOption("none", "No notifications")
                    .setValue(this.plugin.settings.notificationPreference)
                    .onChange(async (value: "all" | "errors" | "none") => {
                        this.plugin.settings.notificationPreference = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Mobile Notification Preference
        new Setting(this.containerEl)
            .setName("Mobile notification preference")
            .setDesc(
                "Override notification preference specifically for mobile devices. Leave as 'Same as desktop' to use the same setting as above, or choose a different preference for mobile use.",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("null", "Same as desktop")
                    .addOption("all", "All notifications")
                    .addOption("errors", "Errors only")
                    .addOption("none", "No notifications")
                    .setValue(
                        this.plugin.settings.mobileNotificationPreference?.toString() ||
                            "null",
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.mobileNotificationPreference =
                            value === "null"
                                ? null
                                : (value as "all" | "errors" | "none");
                        await this.plugin.saveSettings();
                    }),
            );
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
