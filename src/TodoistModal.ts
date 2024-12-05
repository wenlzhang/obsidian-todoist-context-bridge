import { Modal, App, Notice, ToggleComponent } from "obsidian";
import TodoistContextBridgePlugin from "./main";
import { DateProcessing } from "./DateProcessing";

// Modal for creating Todoist tasks from task text or non-task content
export class TodoistModal extends Modal {
    private titleInput = "";
    private descriptionInput = "";
    private dueDateInput = "";
    private priorityInput = "4"; // Default to lowest priority (p4)
    private projectInput = ""; // Default project ID
    private skipWeekends = false; // Default to not skipping weekends
    private plugin: TodoistContextBridgePlugin;
    private isTaskMode: boolean; // true for task mode, false for non-task mode
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
        isTaskMode: boolean,
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
        this.isTaskMode = isTaskMode;
        this.titleInput = defaultTitle;
        this.descriptionInput = defaultDescription;
        this.dueDateInput = defaultDueDate || this.getDefaultDueDate();
        this.priorityInput = defaultPriority || this.getDefaultPriority();
        this.projectInput = this.plugin.settings.todoistDefaultProject;
        this.onSubmit = onSubmit;
    }

    private getDefaultPriority(): string {
        return this.isTaskMode 
            ? this.plugin.settings.todoistDefaultPriority.toString()
            : this.plugin.settings.nonTaskDefaultPriority.toString();
    }

    private getDefaultDueDate(): string {
        if (!this.isTaskMode) {
            switch (this.plugin.settings.nonTaskDefaultDueDate) {
                case "today":
                    return "0d";
                case "tomorrow":
                    return "1d";
                default:
                    return "";
            }
        }
        return "";
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
        titleInput.style.marginTop = "0.5em";
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
        });

        // Due date input
        const dueDateContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        dueDateContainer.createEl("label", { text: "Due Date (optional)" });

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

        // Priority input
        const priorityContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        priorityContainer.createEl("label", { text: "Priority (optional)" });
        const prioritySelect = priorityContainer.createEl("select", {
            cls: "todoist-input-field dropdown",
        });
        prioritySelect.style.width = "100%";
        prioritySelect.style.height = "40px";
        prioritySelect.style.marginTop = "0.5em";
        prioritySelect.style.marginBottom = "1em";
        prioritySelect.style.appearance = "none";
        prioritySelect.style.paddingRight = "24px";
        prioritySelect.style.cursor = "pointer";

        // Add a help text to explain the priority mapping
        const helpText = priorityContainer.createEl("div", {
            text: "Priority values are mapped according to your settings",
            cls: "setting-item-description",
        });
        helpText.style.fontSize = "0.8em";
        helpText.style.color = "var(--text-muted)";
        helpText.style.marginBottom = "0.5em";

        // Create priority options
        const priorityLabels: Record<number, string> = {
            1: "Priority 1 (Highest)",
            2: "Priority 2",
            3: "Priority 3",
            4: "Priority 4 (Lowest)",
        } as const;

        // Display priorities from highest to lowest
        [1, 2, 3, 4].forEach((uiPriority) => {
            const option = prioritySelect.createEl("option", {
                value: uiPriority.toString(),
                text: priorityLabels[uiPriority],
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
        const projectSelect = projectContainer.createEl("select", {
            cls: "todoist-input-field dropdown",
        });
        projectSelect.style.width = "100%";
        projectSelect.style.height = "40px";
        projectSelect.style.marginTop = "0.5em";
        projectSelect.style.marginBottom = "1em";
        projectSelect.style.appearance = "none";
        projectSelect.style.paddingRight = "24px";
        projectSelect.style.cursor = "pointer";

        // Add a help text to explain the project selection
        const projectHelpText = projectContainer.createEl("div", {
            text: "Select a project for the task (defaults to setting)",
            cls: "setting-item-description",
        });
        projectHelpText.style.fontSize = "0.8em";
        projectHelpText.style.color = "var(--text-muted)";
        projectHelpText.style.marginBottom = "0.5em";

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
        descContainer.createEl("label", { text: "Description (optional)" });
        const descInput = descContainer.createEl("textarea", {
            cls: "todoist-input-field",
            placeholder: "Enter task description",
            value: this.descriptionInput,
        });
        descInput.style.width = "100%";
        descInput.style.height = "100px";
        descInput.style.marginTop = "0.5em";
        descInput.style.marginBottom = "1em";
        descInput.addEventListener("input", (e) => {
            this.descriptionInput = (e.target as HTMLTextAreaElement).value;
        });

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
            if (this.titleInput) {
                this.close();
                this.onSubmit(
                    this.titleInput,
                    this.descriptionInput,
                    this.dueDateInput,
                    this.priorityInput,
                    this.projectInput,
                );
            } else {
                new Notice("Task title is required");
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
