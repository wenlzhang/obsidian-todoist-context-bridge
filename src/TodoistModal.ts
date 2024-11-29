import { Modal, App, Notice, Setting } from "obsidian";
import TodoistContextBridgePlugin from "./main";
import { DateProcessing } from "./DateProcessing";

// Modal for creating Todoist tasks from task text
export class TaskToTodoistModal extends Modal {
    private titleInput = "";
    private descriptionInput = "";
    private dueDateInput = "";
    private priorityInput = "4"; // Default to lowest priority (p4)
    private skipWeekends = false; // Default to not skipping weekends
    private plugin: TodoistContextBridgePlugin;
    private onSubmit: (
        title: string,
        description: string,
        dueDate: string,
        priority: string,
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
        ) => void,
    ) {
        super(app);
        this.plugin = plugin;
        this.titleInput = defaultTitle;
        this.descriptionInput = defaultDescription;
        this.dueDateInput = defaultDueDate;
        this.priorityInput = defaultPriority || "4";
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
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
        });

        // Due date input
        const dueDateContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        dueDateContainer.createEl("label", { text: "Due Date (optional)" });
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

        // Add help text for date formats
        const dateHelpText = dueDateContainer.createEl("div", {
            text: "Supported formats: absolute dates (e.g., YYYY-MM-DD, YYYY-MM-DDTHH:mm) or relative dates (e.g., 1d, +2d, 0d)",
            cls: "setting-item-description",
        });
        dateHelpText.style.fontSize = "0.8em";
        dateHelpText.style.color = "var(--text-muted)";
        dateHelpText.style.marginBottom = "1em";

        // Weekend skip option (initially hidden)
        const weekendSkipContainer = this.contentEl.createDiv({
            cls: "todoist-input-container",
        });
        weekendSkipContainer.style.display = "none";

        new Setting(weekendSkipContainer)
            .setName("Skip weekends")
            .setDesc(
                "Skip weekends when calculating the due date (recommended for work tasks)",
            )
            .addToggle((toggle) => {
                toggle.setValue(this.skipWeekends).onChange((value) => {
                    this.skipWeekends = value;
                });
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
        prioritySelect.style.marginBottom = "1em";
        prioritySelect.style.appearance = "none"; // Remove native arrow
        prioritySelect.style.paddingRight = "24px"; // Make room for Obsidian's arrow
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
        descInput.style.marginBottom = "0.5em";
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
    private onSubmit: (title: string, description: string) => void;
    private includeSelectedText: boolean;

    constructor(
        app: App,
        includeSelectedText: boolean,
        onSubmit: (title: string, description: string) => void,
    ) {
        super(app);
        this.onSubmit = onSubmit;
        this.includeSelectedText = includeSelectedText;
    }

    onOpen() {
        this.contentEl.createEl("h2", {
            text: "Create Todoist task from text",
        });

        // Task title input
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
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
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
        });
        descInput.style.width = "100%";
        descInput.style.height = "100px";
        descInput.style.marginBottom = "0.5em";
        descInput.addEventListener("input", (e) => {
            this.descriptionInput = (e.target as HTMLTextAreaElement).value;
        });

        // Description info text
        const descInfo = descContainer.createEl("div", {
            cls: "todoist-description-info",
            text: "Note: The task description will automatically include:",
        });
        descInfo.style.fontSize = "0.8em";
        descInfo.style.color = "var(--text-muted)";
        descInfo.style.marginBottom = "1em";

        const descList = descContainer.createEl("ul");
        descList.style.fontSize = "0.8em";
        descList.style.color = "var(--text-muted)";
        descList.style.marginLeft = "1em";
        descList.style.marginBottom = "1em";

        if (this.includeSelectedText) {
            descList.createEl("li", { text: "The selected text" });
        }
        descList.createEl("li", { text: "A reference link back to this note" });

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
            this.close();
            this.onSubmit(this.titleInput, this.descriptionInput);
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
