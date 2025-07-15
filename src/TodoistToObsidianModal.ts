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
            text: "Paste a Todoist task link (e.g. https://app.todoist.com/app/task/task-name-id) or just the task ID",
        });
        helpText.style.fontSize = "0.8em";
        helpText.style.color = "var(--text-muted)";
        helpText.style.marginTop = "0.5em";
        helpText.style.marginBottom = "0.5em";
        
        // Input field
        const linkInput = inputContainer.createEl("input", {
            type: "text",
            cls: "todoist-input-field",
            placeholder: "https://app.todoist.com/app/task/example-task-id or example-task-id",
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

                // Todoist's API uses numeric IDs internally, while the UI uses string-based IDs
                // We need to use a different approach based on the ID format
                try {
                    // First try to treat it as a numeric ID for backwards compatibility
                    if (/^\d+$/.test(taskId)) {
                        try {
                            const task = await this.plugin.todoistApi.getTask(taskId);
                            if (task) {
                                // Call the onSubmit callback with the fetched task
                                this.onSubmit(task);
                                this.close();
                                return;
                            }
                        } catch (error) {
                            // If we get here, the numeric ID didn't work - we'll try the search approach next
                            console.debug("Numeric ID approach failed, trying search-based approach:", error);
                        }
                    }
                    
                    // For string-based IDs, we need to get all tasks and find the one with matching URL
                    const allTasks = await this.plugin.todoistApi.getTasks();
                    
                    if (!allTasks || allTasks.length === 0) {
                        new Notice("No tasks found in your Todoist account.");
                        syncButton.disabled = false;
                        syncButton.setText("Sync task");
                        return;
                    }
                    
                    // Try to find the task with a matching URL fragment
                    // The task URL fragment should match our extracted taskId
                    const matchedTask = allTasks.find(task => {
                        // For the new URL format, the last part of the URL is the string-based ID
                        // That should match what we extracted as taskId
                        return task.url && task.url.includes(taskId);
                    });
                    
                    if (!matchedTask) {
                        new Notice("Task not found. Please check if the task exists and you have access to it.");
                        syncButton.disabled = false;
                        syncButton.setText("Sync task");
                        return;
                    }
                    
                    // Call the onSubmit callback with the found task
                    this.onSubmit(matchedTask);
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
        // If it's a number (just the ID), return it directly - old format
        if (/^\d+$/.test(input)) {
            return input;
        }
        
        // Extract from old URL format: https://todoist.com/app/task/1234567890
        const oldUrlMatch = input.match(/todoist\.com\/app\/task\/(\d+)/);
        if (oldUrlMatch && oldUrlMatch[1]) {
            return oldUrlMatch[1];
        }
        
        // Extract from new URL format: https://app.todoist.com/app/task/task-name-alphanumeric-id
        // The new format uses strings like: test-syncing-todoist-task-to-obsidian-2-6cPGH6Vpgcm7WqGC
        // Where the actual ID is just the part after the last hyphen: 6cPGH6Vpgcm7WqGC
        const newUrlMatch = input.match(/todoist\.com\/app\/task\/([\w-]+)/);
        if (newUrlMatch && newUrlMatch[1]) {
            const fullPath = newUrlMatch[1];
            // Extract the actual ID (part after the last hyphen)
            const parts = fullPath.split('-');
            if (parts.length > 1) {
                // Return just the last part (the actual ID)
                return parts[parts.length - 1];
            }
            // If there are no hyphens, return the whole string
            return fullPath;
        }
        
        // If the input itself looks like a task ID in the new format (text-with-hyphens-and-alphanumeric)
        if (/^[\w-]+$/.test(input)) {
            // Check if this is a full ID with hyphens (task name followed by actual ID)
            const parts = input.split('-');
            if (parts.length > 1) {
                // Return just the last part which should be the actual ID
                return parts[parts.length - 1];
            }
            // If there are no hyphens or just one segment, return as is
            return input;
        }
        
        return null;
    }

    onClose() {
        // Clean up
        this.contentEl.empty();
    }
}
