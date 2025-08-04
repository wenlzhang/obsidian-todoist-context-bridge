import { App, Modal, Setting } from "obsidian";

export class ConfirmationModal extends Modal {
    private title: string;
    private message: string;
    private confirmText: string;
    private cancelText: string;
    private onConfirm: () => void;
    private onCancel?: () => void;
    private isDangerous: boolean;
    private requiresTyping: boolean;
    private confirmationPhrase?: string;
    private userInput: string = "";

    constructor(
        app: App,
        options: {
            title: string;
            message: string;
            confirmText?: string;
            cancelText?: string;
            onConfirm: () => void;
            onCancel?: () => void;
            isDangerous?: boolean;
            requiresTyping?: boolean;
            confirmationPhrase?: string;
        },
    ) {
        super(app);
        this.title = options.title;
        this.message = options.message;
        this.confirmText = options.confirmText || "Confirm";
        this.cancelText = options.cancelText || "Cancel";
        this.onConfirm = options.onConfirm;
        this.onCancel = options.onCancel;
        this.isDangerous = options.isDangerous || false;
        this.requiresTyping = options.requiresTyping || false;
        this.confirmationPhrase = options.confirmationPhrase;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Set modal title
        contentEl.createEl("h2", { text: this.title });

        // Add warning message
        const messageEl = contentEl.createEl("div", {
            cls: "confirmation-message",
        });
        messageEl.innerHTML = this.message;

        // Add danger styling if this is a dangerous operation
        if (this.isDangerous) {
            messageEl.addClass("mod-warning");
        }

        // If typing confirmation is required, add input field
        if (this.requiresTyping && this.confirmationPhrase) {
            const inputContainer = contentEl.createEl("div", {
                cls: "confirmation-input-container",
            });

            inputContainer.createEl("p", {
                text: `To confirm this action, please type "${this.confirmationPhrase}" below:`,
                cls: "confirmation-input-label",
            });

            const inputEl = inputContainer.createEl("input", {
                type: "text",
                placeholder: this.confirmationPhrase,
                cls: "confirmation-input",
            });

            inputEl.addEventListener("input", (e) => {
                this.userInput = (e.target as HTMLInputElement).value;
                this.updateConfirmButton();
            });

            // Focus the input field
            setTimeout(() => inputEl.focus(), 100);
        }

        // Add button container
        const buttonContainer = contentEl.createEl("div", {
            cls: "confirmation-buttons",
        });

        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: this.cancelText,
            cls: "mod-cta",
        });
        cancelButton.addEventListener("click", () => {
            this.close();
            if (this.onCancel) {
                this.onCancel();
            }
        });

        // Confirm button
        const confirmButton = buttonContainer.createEl("button", {
            text: this.confirmText,
            cls: this.isDangerous ? "mod-warning" : "mod-cta",
        });

        // Store reference for updating state
        (this as any).confirmButton = confirmButton;

        confirmButton.addEventListener("click", () => {
            if (this.canConfirm()) {
                this.close();
                this.onConfirm();
            }
        });

        // Initial button state
        this.updateConfirmButton();

        // Handle ESC key to cancel
        this.scope.register([], "Escape", () => {
            this.close();
            if (this.onCancel) {
                this.onCancel();
            }
        });

        // Handle Enter key to confirm (if typing not required or phrase matches)
        this.scope.register([], "Enter", () => {
            if (this.canConfirm()) {
                this.close();
                this.onConfirm();
            }
        });
    }

    private canConfirm(): boolean {
        if (!this.requiresTyping || !this.confirmationPhrase) {
            return true;
        }
        return this.userInput.trim() === this.confirmationPhrase;
    }

    private updateConfirmButton() {
        const confirmButton = (this as any).confirmButton;
        if (confirmButton) {
            const canConfirm = this.canConfirm();
            confirmButton.disabled = !canConfirm;
            confirmButton.style.opacity = canConfirm ? "1" : "0.5";
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
