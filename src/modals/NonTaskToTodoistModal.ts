import { App, Modal, Notice } from 'obsidian';
import { LoggingService } from '../services/LoggingService';

export class NonTaskToTodoistModal extends Modal {
    private titleInput: string = '';
    private descriptionInput: string = '';
    private onSubmit: (title: string, description: string) => void;
    private includeSelectedText: boolean;
    private logger: LoggingService;

    constructor(app: App, includeSelectedText: boolean, onSubmit: (title: string, description: string) => void) {
        super(app);
        this.logger = LoggingService.getInstance();
        this.onSubmit = onSubmit;
        this.includeSelectedText = includeSelectedText;
        this.logger.debug('NonTaskToTodoistModal initialized', { includeSelectedText });
    }

    onOpen() {
        try {
            this.logger.debug('Opening NonTaskToTodoistModal');
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
            const buttonContainer = contentEl.createDiv({ cls: "todoist-button-container" });
            buttonContainer.style.display = "flex";
            buttonContainer.style.justifyContent = "flex-end";
            buttonContainer.style.gap = "10px";
            buttonContainer.style.marginTop = "1em";

            // Cancel button
            const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
            cancelButton.addEventListener("click", () => {
                this.logger.debug('NonTaskToTodoistModal cancelled');
                this.close();
            });

            // Submit button
            const submitButton = buttonContainer.createEl("button", {
                cls: "mod-cta",
                text: "Create Task"
            });
            submitButton.addEventListener("click", () => {
                try {
                    if (!this.titleInput.trim()) {
                        this.logger.warning('Attempted to submit without title');
                        new Notice('Task title is required');
                        return;
                    }

                    this.logger.debug('Submitting non-task', { 
                        title: this.titleInput,
                        hasDescription: !!this.descriptionInput
                    });

                    this.onSubmit(this.titleInput, this.descriptionInput);
                    this.close();
                } catch (error) {
                    this.logger.error('Error submitting non-task', error instanceof Error ? error : new Error(String(error)));
                    new Notice('Failed to create task. Please try again.');
                }
            });

            // Focus title input
            titleInput.focus();
        } catch (error) {
            this.logger.error('Error opening NonTaskToTodoistModal', error instanceof Error ? error : new Error(String(error)));
            new Notice('Failed to open task modal. Please try again.');
            this.close();
        }
    }

    onClose() {
        this.logger.debug('Closing NonTaskToTodoistModal');
        const { contentEl } = this;
        contentEl.empty();
    }
}
