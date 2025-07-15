import { Modal, App, Notice } from "obsidian";
import TodoistContextBridgePlugin from "./main";
import { Task } from "@doist/todoist-api-typescript";

/**
 * Modal for syncing a task from Todoist to Obsidian
 */
export class TodoistToObsidianModal extends Modal {
    private taskLinkInput = "";
    private plugin: TodoistContextBridgePlugin;
    private onSubmit: (task: Task) => void;

    constructor(
        app: App,
        plugin: TodoistContextBridgePlugin,
        onSubmit: (task: Task) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        this.contentEl.createEl("h2", { text: "Sync Todoist task to Obsidian" });

        // Container for the entire form
        const formContainer = this.contentEl.createDiv({
            cls: "todoist-input-container"
        });
        
        // Task link/ID input
        const inputContainer = formContainer.createDiv({
            cls: "todoist-input-container",
        });
        inputContainer.createEl("label", { text: "Todoist task link or ID (required)" });
        
        // Add help text
        const helpText = inputContainer.createEl("div", {
            cls: "setting-item-description",
            text: "Paste a Todoist task link (https://todoist.com/app/task/1234567890) or just the task ID (1234567890)",
        });
        helpText.style.fontSize = "0.8em";
        helpText.style.color = "var(--text-muted)";
        helpText.style.marginTop = "0.5em";
        helpText.style.marginBottom = "0.5em";
        
        // Input field
        const linkInput = inputContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "https://todoist.com/app/task/1234567890 or 1234567890",
        });
        linkInput.style.width = "100%";
        linkInput.style.height = "40px";
        linkInput.style.marginTop = "0.5em";
        linkInput.style.marginBottom = "1em";
        
        linkInput.addEventListener("input", (e) => {
            this.taskLinkInput = (e.target as HTMLInputElement).value;
        });

        // Information about what will be imported
        const infoContainer = formContainer.createDiv({
            cls: "todoist-info-container",
        });
        
        const infoTitle = infoContainer.createEl("div", {
            cls: "todoist-info-title",
            text: "The following details will be imported:",
        });
        infoTitle.style.fontWeight = "bold";
        infoTitle.style.marginTop = "1em";
        infoTitle.style.marginBottom = "0.5em";
        
        const infoList = infoContainer.createEl("ul");
        infoList.style.fontSize = "0.9em";
        infoList.style.color = "var(--text-muted)";
        infoList.style.marginLeft = "1em";
        infoList.style.marginBottom = "1em";
        
        infoList.createEl("li", { text: "Task title" });
        infoList.createEl("li", { text: "Due date (if available)" });
        infoList.createEl("li", { text: "Priority" });
        infoList.createEl("li", { text: "Link to the original Todoist task" });
        
        // Note about format
        const formatInfo = formContainer.createDiv({
            cls: "format-info",
        });
        formatInfo.createEl("div", {
            text: "The task will be formatted according to your settings (Dataview or Tasks plugin).",
            cls: "setting-item-description",
        }).style.fontSize = "0.9em";

        // Buttons container
        const buttonContainer = this.contentEl.createDiv({
            cls: "todoist-input-buttons",
        });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";
        buttonContainer.style.marginTop = "1em";

        // Cancel button
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel",
        });
        cancelButton.addEventListener("click", () => {
            this.close();
        });

        // Sync button
        const syncButton = buttonContainer.createEl("button", {
            text: "Sync task",
            cls: "mod-cta",
        });
        syncButton.addEventListener("click", async () => {
            if (!this.taskLinkInput.trim()) {
                new Notice("Please enter a Todoist task link or ID");
                return;
            }

            try {
                syncButton.disabled = true;
                syncButton.setText("Loading...");

                // Extract task ID from input (could be a full URL or just an ID)
                const taskId = this.extractTaskId(this.taskLinkInput.trim());
                
                if (!taskId) {
                    new Notice("Invalid Todoist task link or ID. Please check your input.");
                    syncButton.disabled = false;
                    syncButton.setText("Sync task");
                    return;
                }

                if (!this.plugin.todoistApi) {
                    new Notice("Todoist API not initialized. Please check your API token in settings.");
                    this.close();
                    return;
                }

                // Fetch the task from Todoist
                try {
                    const task = await this.plugin.todoistApi.getTask(taskId);
                    
                    if (!task) {
                        new Notice("Task not found. Please check if the task exists and you have access to it.");
                        syncButton.disabled = false;
                        syncButton.setText("Sync task");
                        return;
                    }
                    
                    // Call the onSubmit callback with the fetched task
                    this.onSubmit(task);
                    this.close();
                } catch (error) {
                    console.error("Failed to fetch task from Todoist:", error);
                    new Notice("Failed to fetch task from Todoist. Please check if the task exists and you have access to it.");
                    syncButton.disabled = false;
                    syncButton.setText("Sync task");
                }
            } catch (error) {
                console.error("Error in task sync:", error);
                new Notice("An error occurred while syncing the task.");
                syncButton.disabled = false;
                syncButton.setText("Sync task");
            }
        });
    }

    /**
     * Extract task ID from a Todoist task link or ID
     * @param input Todoist task link or ID
     * @returns Task ID or null if invalid
     */
    private extractTaskId(input: string): string | null {
        // If it's a number (just the ID), return it directly
        if (/^\d+$/.test(input)) {
            return input;
        }
        
        // Extract from URL format: https://todoist.com/app/task/1234567890
        const urlMatch = input.match(/todoist\.com\/app\/task\/(\d+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
        
        return null;
    }

    onClose() {
        // Clean up
        this.contentEl.empty();
    }
}
