import { App, Modal, Notice } from 'obsidian';

export class NonTaskToTodoistModal extends Modal {
    private titleInput: string = '';
    private descriptionInput: string = '';
    private onSubmit: (title: string, description: string) => void;
    private includeSelectedText: boolean;

    constructor(app: App, includeSelectedText: boolean, onSubmit: (title: string, description: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.includeSelectedText = includeSelectedText;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Create Todoist task from text" });

        // Task title input
        const titleContainer = contentEl.createDiv({ cls: "todoist-input-container" });
        titleContainer.createEl("label", { text: "Task title (required)" });
        const titleInput = titleContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "Enter task title"
        });
        titleInput.style.width = "100%";
        titleInput.style.height = "40px";
        titleInput.style.marginBottom = "1em";
        titleInput.addEventListener("input", (e) => {
            this.titleInput = (e.target as HTMLInputElement).value;
        });

        // Task description input
        const descContainer = contentEl.createDiv({ cls: "todoist-input-container" });
        descContainer.createEl("label", { text: "Additional description (optional)" });
        const descInput = descContainer.createEl("textarea", {
            cls: "todoist-input-field",
            placeholder: "Enter additional description"
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
            text: "Note: The task description will automatically include:" 
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
        const buttonContainer = contentEl.createDiv({ cls: "todoist-input-buttons" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";

        // Create button
        const createButton = buttonContainer.createEl("button", {
            text: "Create task",
            cls: "mod-cta"
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
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            this.close();
        });

        // Focus title input
        titleInput.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
