import { Modal, App, Notice, ToggleComponent } from "obsidian";
import TodoistContextBridgePlugin from "./main";
import { DateProcessing } from "./DateProcessing";

// Modal for creating Todoist tasks from task text
export class TaskToTodoistModal extends Modal {
    private titleInput = "";
    private descriptionInput = "";
    private dueDateInput = "";
    private priorityInput = "4"; // Default to lowest priority (p4)
    private projectInput = ""; // Default project ID
    private skipWeekends = false; // Default to not skipping weekends
    private plugin: TodoistContextBridgePlugin;
    private onSubmit: (
        title: string,
        description: string,
        dueDate: string,
        priority: string,
        projectId: string,
    ) => void;

    constructor(
        app: App,
        plugin: TodoistContextBridgePlugin,
        defaultTitle: string,
        defaultDescription: string,
        defaultDueDate: string,
        defaultPriority: string,
        onSubmit: (
            title: string,
            description: string,
            dueDate: string,
            priority: string,
            projectId: string,
        ) => void,
    ) {
        super(app);
        this.plugin = plugin;
        this.titleInput = defaultTitle;
        this.descriptionInput = defaultDescription;
        this.dueDateInput = defaultDueDate;
        this.priorityInput = defaultPriority || "4";
        this.projectInput = this.plugin.settings.todoistDefaultProject;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        this.contentEl.createEl("h2", { text: "Create Todoist task" });

        // Task title input
        const titleContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        titleContainer.createEl("label", { text: "Task title (required)" });
        const titleInput = titleContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "Enter task title",
            value: this.titleInput,
        });
        titleInput.style.width = "100%";
        titleInput.style.height = "40px";
        titleInput.style.marginTop = "0.5em"; // Add space between label and input
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
        });

        // Due date input
        const dueDateContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        dueDateContainer.createEl("label", { text: "Due date (optional)" });

        // Add reminder about relative dates above the input box
        const dueDateReminder = dueDateContainer.createEl("div", {
            cls: "setting-item-description",
            text: "Enter absolute dates in Dataview format, e.g., 2025-01-01, 2025-01-01T12:00.",
        });
        dueDateReminder.style.fontSize = "0.8em";
        dueDateReminder.style.color = "var(--text-muted)";
        dueDateReminder.style.marginTop = "0.5em"; // Add space between label and description
        dueDateReminder.style.marginBottom = "0.5em";

        // Add help text for date formats
        const dateHelpText = dueDateContainer.createEl("div", {
            text: "Or use relative dates, e.g., 0d (today), 1d (tomorrow), +2d (in 2 days). Relative dates can skip weekends if enabled below.",
            cls: "setting-item-description",
        });
        dateHelpText.style.fontSize = "0.8em";
        dateHelpText.style.color = "var(--text-muted)";
        dateHelpText.style.marginBottom = "1em";

        const dueDateInput = dueDateContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "YYYY-MM-DD, +1d, 1d, or 0d for today",
            value: this.dueDateInput,
        });
        dueDateInput.style.width = "100%";
        dueDateInput.style.height = "40px";
        dueDateInput.style.marginBottom = "0.5em";
        dueDateInput.addEventListener("input", (e) => {
            this.dueDateInput = (e.target as HTMLInputElement).value;

            // Show/hide weekend skip option based on whether it's a relative date
            const isRelativeDate = /^[+-]?\s*\d+\s*[Dd]$/.test(
                this.dueDateInput.trim(),
            );
            weekendSkipContainer.style.display = isRelativeDate
                ? "block"
                : "none";
        });

        // Weekend skip option (initially hidden)
        const weekendSkipContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        weekendSkipContainer.style.display = "none";
        weekendSkipContainer.style.backgroundColor =
            "var(--background-modifier-form-field)";
        weekendSkipContainer.style.padding = "10px 0"; // Only add vertical padding
        weekendSkipContainer.style.borderRadius = "5px";
        weekendSkipContainer.style.marginBottom = "1em";

        // Create a flex container for the entire weekend skip section
        const weekendSkipFlexContainer = weekendSkipContainer.createEl("div");
        weekendSkipFlexContainer.style.display = "flex";
        weekendSkipFlexContainer.style.justifyContent = "space-between";
        weekendSkipFlexContainer.style.alignItems = "flex-start";
        weekendSkipFlexContainer.style.gap = "20px";
        weekendSkipFlexContainer.style.padding = "0 0px"; // Add horizontal padding here instead

        // Left side container for label and description
        const textContainer = weekendSkipFlexContainer.createEl("div");
        textContainer.style.flex = "1";

        const weekendSkipLabel = textContainer.createEl("div", {
            cls: "todoist-input-label",
            text: "Skip weekends",
        });
        weekendSkipLabel.style.display = "block";
        weekendSkipLabel.style.marginBottom = "0.2em";

        const weekendSkipDesc = textContainer.createEl("div", {
            cls: "setting-item-description",
            text: "Skip weekends when calculating the due date (recommended for work tasks)",
        });
        weekendSkipDesc.style.fontSize = "0.8em";
        weekendSkipDesc.style.color = "var(--text-muted)";
        weekendSkipDesc.style.marginBottom = "0.5em";

        // Right side container for toggle
        const toggleContainer = weekendSkipFlexContainer.createEl("div");
        toggleContainer.style.marginTop = "3px"; // Align with the label

        const toggle = new ToggleComponent(toggleContainer);
        toggle.setValue(this.skipWeekends);
        toggle.onChange((value) => {
            this.skipWeekends = value;
        });

        // Priority input
        const priorityContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        priorityContainer.createEl("label", { text: "Priority (optional)" });

        // Add help text to explain the priority mapping (moved above dropdown)
        const helpText = priorityContainer.createEl("div", {
            text: "Priority values are mapped according to your settings",
            cls: "setting-item-description",
        });
        helpText.style.fontSize = "0.8em";
        helpText.style.color = "var(--text-muted)";
        helpText.style.marginBottom = "0.5em";

        const prioritySelect = priorityContainer.createEl("select", {
            cls: "todoist-input-field dropdown",
        });
        prioritySelect.style.width = "100%";
        prioritySelect.style.height = "40px";
        prioritySelect.style.marginTop = "0.5em"; // Add space between label and dropdown
        prioritySelect.style.marginBottom = "1em";
        prioritySelect.style.appearance = "none"; // Remove native arrow
        prioritySelect.style.paddingRight = "24px"; // Make room for Obsidian's arrow
        prioritySelect.style.cursor = "pointer";

        // Create priority options
        const priorityLabels: Record<number, string> = {
            1: "Priority 1 (Highest)",
            2: "Priority 2",
            3: "Priority 3",
            4: "Priority 4 (Lowest)",
        } as const;

        // Display priorities from highest to lowest
        [1, 2, 3, 4].forEach((uiPriority) => {
            // Get mapped values for this priority level
            const mappedValues = Object.entries(
                this.plugin.settings.priorityMapping,
            )
                .filter(([_, value]) => value === uiPriority)
                .map(([key, _]) => key);

            const label =
                mappedValues.length > 0
                    ? `${priorityLabels[uiPriority]} [${mappedValues.join(", ")}]`
                    : priorityLabels[uiPriority];

            const option = prioritySelect.createEl("option", {
                value: uiPriority.toString(),
                text: label,
            });

            if (uiPriority.toString() === this.priorityInput) {
                option.selected = true;
            }
        });

        prioritySelect.addEventListener("change", (e) => {
            this.priorityInput = (e.target as HTMLSelectElement).value;
        });

        // Project selection dropdown
        const projectContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        projectContainer.createEl("label", { text: "Project" });

        // Add help text to explain the project selection (moved above dropdown)
        const projectHelpText = projectContainer.createEl("div", {
            text: "Select a project for the task (defaults to setting)",
            cls: "setting-item-description",
        });
        projectHelpText.style.fontSize = "0.8em";
        projectHelpText.style.color = "var(--text-muted)";
        projectHelpText.style.marginBottom = "0.5em";

        const projectSelect = projectContainer.createEl("select", {
            cls: "todoist-input-field dropdown",
        });
        projectSelect.style.width = "100%";
        projectSelect.style.height = "40px";
        projectSelect.style.marginTop = "0.5em"; // Add space between label and dropdown
        projectSelect.style.marginBottom = "1em";
        projectSelect.style.appearance = "none"; // Remove native arrow
        projectSelect.style.paddingRight = "24px"; // Make room for Obsidian's arrow
        projectSelect.style.cursor = "pointer";

        // Load projects and populate dropdown
        const loadProjects = async () => {
            try {
                const projects = await this.plugin.todoistApi?.getProjects();
                if (projects) {
                    projectSelect.empty();
                    projects.forEach((project) => {
                        const option = projectSelect.createEl("option", {
                            value: project.id,
                            text: project.name,
                        });
                        if (project.id === this.projectInput) {
                            option.selected = true;
                        }
                    });
                }
            } catch (error) {
                console.error("Failed to load projects:", error);
                new Notice("Failed to load Todoist projects");
            }
        };

        loadProjects();

        projectSelect.addEventListener("change", (e) => {
            this.projectInput = (e.target as HTMLSelectElement).value;
        });

        // Task description input
        const descContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        descContainer.createEl("label", {
            text: "Additional description (optional)",
        });
        const descInput = descContainer.createEl("textarea", {
            cls: "todoist-input-field",
            placeholder: "Enter additional description",
            value: this.descriptionInput,
        });
        descInput.style.width = "100%";
        descInput.style.height = "100px";
        descInput.style.marginTop = "0.5em"; // Add space between label and textarea
        descInput.style.marginBottom = "1em";
        descInput.addEventListener("input", (e) => {
            this.descriptionInput = (e.target as HTMLTextAreaElement).value;
        });

        // Description info
        const descInfo = descContainer.createEl("div", {
            cls: "todoist-description-info",
            text: "The description will include:",
        });
        descInfo.style.color = "var(--text-muted)";
        descInfo.style.marginBottom = "1em";

        const descList = descContainer.createEl("ul");
        descList.style.fontSize = "0.8em";
        descList.style.color = "var(--text-muted)";
        descList.style.marginLeft = "1em";
        descList.style.marginBottom = "1em";

        descList.createEl("li", { text: "Your description above" });
        descList.createEl("li", { text: "A reference link back to this note" });

        // Reminder text
        const reminderText = descContainer.createEl("div", {
            cls: "todoist-description-reminder",
            text: "Remember to review and adjust the task description in Todoist as needed.",
        });
        reminderText.style.fontSize = "0.8em";
        reminderText.style.color = "var(--text-muted)";
        reminderText.style.marginBottom = "1em";

        // Buttons container
        const buttonContainer = this.contentEl.createDiv({
            cls: "todoist-input-buttons",
        });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";

        // Create button
        const createButton = buttonContainer.createEl("button", {
            text: "Create task",
            cls: "mod-cta",
        });
        createButton.addEventListener("click", () => {
            if (!this.titleInput.trim()) {
                new Notice("Please enter a task title");
                return;
            }

            // Process and validate the due date
            let processedDueDate = "";
            if (this.dueDateInput.trim()) {
                const validationResult = DateProcessing.validateAndFormatDate(
                    this.dueDateInput,
                    this.skipWeekends,
                );
                if (!validationResult) {
                    return; // validateAndFormatDate will show appropriate error
                }

                if (validationResult.isInPast) {
                    const shouldProceed = confirm(
                        "The due date you entered is in the past. Do you want to proceed with creating the task?",
                    );
                    if (!shouldProceed) {
                        return;
                    }
                }

                processedDueDate = validationResult.formattedDate;
            }

            this.onSubmit(
                this.titleInput.trim(),
                this.descriptionInput.trim(),
                processedDueDate,
                this.priorityInput,
                this.projectInput,
            );
            this.close();
        });

        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel",
        });
        cancelButton.addEventListener("click", () => {
            this.close();
        });

        // Focus title input
        titleInput.focus();
    }

    onClose() {
        this.contentEl.empty();
    }
}

// Modal for creating Todoist tasks from non-task text
export class NonTaskToTodoistModal extends Modal {
    private titleInput = "";
    private descriptionInput = "";
    private dueDateInput = "";
    private priorityInput = "4"; // Default to lowest priority (p4)
    private projectInput = ""; // Default project ID
    private skipWeekends = false; // Default to not skipping weekends
    private plugin: TodoistContextBridgePlugin;
    private includeSelectedText: boolean;
    private onSubmit: (
        title: string,
        description: string,
        dueDate: string,
        priority: string,
        projectId: string,
    ) => void;

    constructor(
        app: App,
        includeSelectedText: boolean,
        plugin: TodoistContextBridgePlugin,
        onSubmit: (
            title: string,
            description: string,
            dueDate: string,
            priority: string,
            projectId: string,
        ) => void,
    ) {
        super(app);
        this.includeSelectedText = includeSelectedText;
        this.plugin = plugin;
        this.projectInput = this.plugin.settings.todoistDefaultProject;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        this.contentEl.createEl("h2", { text: "Create Todoist task" });

        // Title input
        const titleContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        titleContainer.createEl("label", { text: "Task title (required)" });
        const titleInput = titleContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "Enter task title",
        });
        titleInput.style.width = "100%";
        titleInput.style.height = "40px";
        titleInput.style.marginTop = "0.5em"; // Add space between label and input
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
        });

        // Due date input
        const dueDateContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        dueDateContainer.createEl("label", { text: "Due date (optional)" });

        // Add reminder about relative dates above the input box
        const dueDateReminder = dueDateContainer.createEl("div", {
            cls: "setting-item-description",
            text: "Enter absolute dates in Dataview format, e.g., 2025-01-01, 2025-01-01T12:00.",
        });
        dueDateReminder.style.fontSize = "0.8em";
        dueDateReminder.style.color = "var(--text-muted)";
        dueDateReminder.style.marginTop = "0.5em";
        dueDateReminder.style.marginBottom = "0.5em";

        // Add help text for date formats
        const dateHelpText = dueDateContainer.createEl("div", {
            text: "Or use relative dates, e.g., 0d (today), 1d (tomorrow), +2d (in 2 days). Relative dates can skip weekends if enabled below.",
            cls: "setting-item-description",
        });
        dateHelpText.style.fontSize = "0.8em";
        dateHelpText.style.color = "var(--text-muted)";
        dateHelpText.style.marginBottom = "1em";

        const dueDateInput = dueDateContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "YYYY-MM-DD, +1d, 1d, or 0d for today",
            value: this.dueDateInput,
        });
        dueDateInput.style.width = "100%";
        dueDateInput.style.height = "40px";
        dueDateInput.style.marginBottom = "0.5em";
        dueDateInput.addEventListener("input", (e) => {
            this.dueDateInput = (e.target as HTMLInputElement).value;

            // Show/hide weekend skip option based on whether it's a relative date
            const isRelativeDate = DateProcessing.isRelativeDate(this.dueDateInput.trim());
            weekendSkipContainer.style.display = isRelativeDate
                ? "block"
                : "none";
        });

        // Weekend skip option (initially hidden)
        const weekendSkipContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        weekendSkipContainer.style.display = "none";
        weekendSkipContainer.style.backgroundColor =
            "var(--background-modifier-form-field)";
        weekendSkipContainer.style.padding = "10px 0";
        weekendSkipContainer.style.borderRadius = "5px";
        weekendSkipContainer.style.marginBottom = "1em";

        // Create a flex container for the entire weekend skip section
        const weekendSkipFlexContainer = weekendSkipContainer.createEl("div");
        weekendSkipFlexContainer.style.display = "flex";
        weekendSkipFlexContainer.style.justifyContent = "space-between";
        weekendSkipFlexContainer.style.alignItems = "flex-start";
        weekendSkipFlexContainer.style.gap = "20px";
        weekendSkipFlexContainer.style.padding = "0 10px";

        // Left side container for label and description
        const textContainer = weekendSkipFlexContainer.createEl("div");
        textContainer.style.flex = "1";

        const weekendSkipLabel = textContainer.createEl("div", {
            cls: "todoist-input-label",
            text: "Skip weekends",
        });
        weekendSkipLabel.style.display = "block";
        weekendSkipLabel.style.marginBottom = "0.2em";

        const weekendSkipDesc = textContainer.createEl("div", {
            cls: "setting-item-description",
            text: "Skip weekends when calculating the due date (recommended for work tasks)",
        });
        weekendSkipDesc.style.fontSize = "0.8em";
        weekendSkipDesc.style.color = "var(--text-muted)";
        weekendSkipDesc.style.marginBottom = "0.5em";

        // Right side container for toggle
        const toggleContainer = weekendSkipFlexContainer.createEl("div");
        toggleContainer.style.marginTop = "3px";

        const toggle = new ToggleComponent(toggleContainer);
        toggle.setValue(this.skipWeekends);
        toggle.onChange((value) => {
            this.skipWeekends = value;
        });

        // Priority selection
        const priorityContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        priorityContainer.createEl("label", { text: "Priority (optional)" });

        // Add help text to explain the priority mapping (moved above dropdown)
        const helpText = priorityContainer.createEl("div", {
            text: "Priority values are mapped according to your settings",
            cls: "setting-item-description",
        });
        helpText.style.fontSize = "0.8em";
        helpText.style.color = "var(--text-muted)";
        helpText.style.marginBottom = "0.5em";

        const prioritySelect = priorityContainer.createEl("select", {
            cls: "todoist-input-field dropdown",
        });
        prioritySelect.style.width = "100%";
        prioritySelect.style.height = "40px";
        prioritySelect.style.marginTop = "0.5em"; // Add space between label and dropdown
        prioritySelect.style.marginBottom = "1em";
        prioritySelect.style.appearance = "none"; // Remove native arrow
        prioritySelect.style.paddingRight = "24px"; // Make room for Obsidian's arrow
        prioritySelect.style.cursor = "pointer";

        // Create priority options
        const priorityLabels: Record<number, string> = {
            1: "Priority 1 (Highest)",
            2: "Priority 2",
            3: "Priority 3",
            4: "Priority 4 (Lowest)",
        } as const;

        // Display priorities from highest to lowest
        [1, 2, 3, 4].forEach((uiPriority) => {
            // Get mapped values for this priority level
            const mappedValues = Object.entries(this.plugin.settings.priorityMapping)
                .filter(([_, value]) => value === uiPriority)
                .map(([key, _]) => key);

            const label = mappedValues.length > 0
                ? `${priorityLabels[uiPriority]} [${mappedValues.join(", ")}]`
                : priorityLabels[uiPriority];

            const option = prioritySelect.createEl("option", {
                value: uiPriority.toString(),
                text: label,
            });

            if (uiPriority.toString() === this.priorityInput) {
                option.selected = true;
            }
        });

        prioritySelect.addEventListener("change", (e) => {
            this.priorityInput = (e.target as HTMLSelectElement).value;
        });

        // Project selection dropdown
        const projectContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        projectContainer.createEl("label", { text: "Project" });

        // Add help text to explain the project selection (moved above dropdown)
        const projectHelpText = projectContainer.createEl("div", {
            text: "Select a project for the task (defaults to setting)",
            cls: "setting-item-description",
        });
        projectHelpText.style.fontSize = "0.8em";
        projectHelpText.style.color = "var(--text-muted)";
        projectHelpText.style.marginBottom = "0.5em";

        const projectSelect = projectContainer.createEl("select", {
            cls: "todoist-input-field dropdown",
        });
        projectSelect.style.width = "100%";
        projectSelect.style.height = "40px";
        projectSelect.style.marginTop = "0.5em"; // Add space between label and dropdown
        projectSelect.style.marginBottom = "1em";
        projectSelect.style.appearance = "none"; // Remove native arrow
        projectSelect.style.paddingRight = "24px"; // Make room for Obsidian's arrow
        projectSelect.style.cursor = "pointer";

        // Load projects and populate dropdown
        const loadProjects = async () => {
            try {
                const projects = await this.plugin.todoistApi?.getProjects();
                if (projects) {
                    projectSelect.empty();
                    projects.forEach((project) => {
                        const option = projectSelect.createEl("option", {
                            value: project.id,
                            text: project.name,
                        });
                        if (project.id === this.projectInput) {
                            option.selected = true;
                        }
                    });
                }
            } catch (error) {
                console.error("Failed to load projects:", error);
                new Notice("Failed to load Todoist projects");
            }
        };

        loadProjects();

        projectSelect.addEventListener("change", (e) => {
            this.projectInput = (e.target as HTMLSelectElement).value;
        });

        // Description input
        const descContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        descContainer.createEl("label", {
            text: "Additional description (optional)",
        });
        const descInput = descContainer.createEl("textarea", {
            cls: "todoist-input-field",
            placeholder: "Enter additional description",
            value: this.descriptionInput,
        });
        descInput.style.width = "100%";
        descInput.style.height = "100px";
        descInput.style.marginTop = "0.5em";
        descInput.style.marginBottom = "1em";
        descInput.addEventListener("input", (e) => {
            this.descriptionInput = (e.target as HTMLTextAreaElement).value;
        });

        // Description info
        const descInfo = descContainer.createEl("div", {
            cls: "todoist-description-info",
            text: "The description will include:",
        });
        descInfo.style.color = "var(--text-muted)";
        descInfo.style.marginBottom = "1em";

        const descList = descContainer.createEl("ul");
        descList.style.fontSize = "0.8em";
        descList.style.color = "var(--text-muted)";
        descList.style.marginLeft = "1em";
        descList.style.marginBottom = "1em";

        descList.createEl("li", { text: "Your description above" });
        descList.createEl("li", { text: "A reference link back to this note" });

        // Reminder text
        const reminderText = descContainer.createEl("div", {
            cls: "todoist-description-reminder",
            text: "Remember to review and adjust the task description in Todoist as needed.",
        });
        reminderText.style.fontSize = "0.8em";
        reminderText.style.color = "var(--text-muted)";
        reminderText.style.marginBottom = "1em";

        // Buttons container
        const buttonContainer = this.contentEl.createDiv({
            cls: "todoist-button-container",
        });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";

        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel",
        });
        cancelButton.addEventListener("click", () => {
            this.close();
        });

        // Create button
        const createButton = buttonContainer.createEl("button", {
            text: "Create",
            cls: "mod-cta",
        });
        createButton.addEventListener("click", () => {
            // Validate title
            const trimmedTitle = this.titleInput.trim();
            if (!trimmedTitle) {
                new Notice("Task title is required");
                return;
            }

            // Process due date if provided
            let processedDueDate = this.dueDateInput.trim();
            if (processedDueDate) {
                const dateResult = DateProcessing.validateAndFormatDate(
                    processedDueDate,
                    this.skipWeekends
                );
                if (dateResult) {
                    processedDueDate = dateResult.formattedDate;
                } else {
                    return; // Invalid date format
                }
            }

            this.close();
            this.onSubmit(
                trimmedTitle,
                this.descriptionInput.trim(),
                processedDueDate,
                this.priorityInput,
                this.projectInput,
            );
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
