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
                    console.debug("Fetched all tasks:", allTasks?.length);
                    
                    if (!allTasks || allTasks.length === 0) {
                        new Notice("No tasks found in your Todoist account.");
                        syncButton.disabled = false;
                        syncButton.setText("Sync task");
                        return;
                    }
                    
                    // Log all tasks for debugging
                    allTasks.forEach((task, index) => {
                        console.debug(`Task ${index}:`, task.id, task.content, task.url);
                    });
                    
                    // Try multiple approaches to find the task
                    let matchedTask = null;
                    
                    // 1. First try the most reliable method - direct ID matching for tasks with numeric IDs
                    if (/^\d+$/.test(taskId)) {
                        matchedTask = allTasks.find(task => task.id === taskId);
                        console.debug("Tried matching by direct numeric ID:", taskId, matchedTask ? "Found" : "Not found");
                    }
                    
                    // 2. For string-based IDs or slugs, try exact URL matching
                    if (!matchedTask) {
                        const originalUrl = this.taskLinkInput.trim();
                        
                        // Check for exact URL match
                        matchedTask = allTasks.find(task => {
                            if (!task.url) return false;
                            
                            // Normalize URLs for comparison
                            const normalizedTaskUrl = task.url.replace(/https?:\/\//i, '');
                            const normalizedInputUrl = originalUrl.replace(/https?:\/\//i, '');
                            
                            // Match if normalized URLs are equal
                            const exactMatch = normalizedTaskUrl === normalizedInputUrl;
                            if (exactMatch) console.debug("Found exact URL match:", task.id, task.content);
                            return exactMatch;
                        });
                    }
                    
                    // 3. Try URL fragment matching - useful for new format URLs
                    if (!matchedTask) {
                        matchedTask = allTasks.find(task => {
                            if (!task.url || !taskId) return false;
                            
                            // Check if the task's URL contains our taskId as a segment
                            const urlContainsId = task.url.includes(`/task/${taskId}`);
                            
                            // Also check if just the ending segment contains our taskId
                            const urlPath = task.url.split('/').pop() || '';
                            const urlPathContainsId = urlPath === taskId;
                            
                            const result = urlContainsId || urlPathContainsId;
                            if (result) console.debug("Found URL fragment match:", task.id, task.content);
                            return result;
                        });
                    }
                    
                    // 4. Try content-based matching for new format URLs with task titles
                    if (!matchedTask && taskId.includes('-')) {
                        // This is likely a task slug with title-id format
                        matchedTask = allTasks.find(task => {
                            if (!task.content) return false;
                            
                            // Convert task content to a slug-like format for comparison
                            const contentSlug = task.content
                                .toLowerCase()
                                .replace(/[^a-z0-9\s-]/g, '')
                                .replace(/\s+/g, '-');
                                
                            // Check if significant parts of the task content appear in the taskId
                            const titleWordsInSlug = contentSlug.length > 3 && taskId.includes(contentSlug);
                            
                            // Also try the reverse - if words from the taskId appear in the content
                            const taskWords = taskId.split('-')
                                .filter(word => word.length > 3)
                                .map(word => word.toLowerCase());
                                
                            const slugWordsInTitle = taskWords.some(word => 
                                task.content.toLowerCase().includes(word));
                                
                            const result = titleWordsInSlug || slugWordsInTitle;
                            if (result) console.debug("Found content match:", task.id, task.content, "with:", taskId);
                            return result;
                        });
                    }
                    
                    // 5. Special case for the new format URLs: try to extract the alphanumeric ID at the end
                    if (!matchedTask && taskId.includes('-')) {
                        // Extract just the last part after the last hyphen (the actual ID in the new format)
                        const parts = taskId.split('-');
                        if (parts.length > 1) {
                            const lastPart = parts[parts.length - 1];
                            console.debug("Trying with just the last part of the slug:", lastPart);
                            
                            // Look for tasks with this ID fragment in their URL
                            matchedTask = allTasks.find(task => {
                                if (!task.url) return false;
                                return task.url.includes(lastPart);
                            });
                            
                            if (matchedTask) {
                                console.debug("Found task using last segment ID:", matchedTask.id, matchedTask.content);
                            }
                        }
                    }
                    
                    // 6. One last attempt - try fetching tasks with a filter based on the content
                    // This is especially helpful for the new-style Todoist URLs where the task name is in the URL
                    if (!matchedTask && this.taskLinkInput.includes('todoist.com')) {
                        try {
                            // Extract potential words from the URL that might be part of the task content
                            const urlPath = this.taskLinkInput.split('/').pop() || '';
                            const potentialWords = urlPath.split('-')
                                .filter(word => word.length > 3)
                                .map(word => word.toLowerCase());
                            
                            if (potentialWords.length > 0) {
                                console.debug("Trying API search with words from URL:", potentialWords);
                                
                                // For each potential word, try to find tasks containing it
                                for (const word of potentialWords) {
                                    // Skip very common words and short words
                                    if (word.length < 4 || ['task', 'todo', 'item'].includes(word)) continue;
                                    
                                    try {
                                        // Try to use the API's filter to find tasks with this content
                                        const filteredTasks = await this.plugin.todoistApi.getTasks({
                                            filter: `${word}`
                                        });
                                        
                                        if (filteredTasks && filteredTasks.length > 0) {
                                            console.debug(`Found ${filteredTasks.length} tasks containing '${word}'`);  
                                            // If we found exactly one task, it's probably the right one
                                            if (filteredTasks.length === 1) {
                                                matchedTask = filteredTasks[0];
                                                console.debug("Found unique task via API search:", matchedTask.id, matchedTask.content);
                                                break;
                                            }
                                            
                                            // If we have multiple matches, try to find one that matches our URL
                                            const urlMatch = filteredTasks.find(task => {
                                                if (!task.url || !this.taskLinkInput) return false;
                                                return this.normalizeTodoistUrl(task.url).includes(taskId) || 
                                                       this.normalizeTodoistUrl(this.taskLinkInput).includes(task.id);
                                            });
                                            
                                            if (urlMatch) {
                                                matchedTask = urlMatch;
                                                console.debug("Found URL matching task via API search:", matchedTask.id, matchedTask.content);
                                                break;
                                            }
                                        }
                                    } catch (err) {
                                        console.debug("Error during filtered search:", err);
                                        // Continue with other words if this one failed
                                    }
                                }
                            }
                        } catch (err) {
                            console.debug("Error during content-based search:", err);
                        }
                    }
                    
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
     * Normalize a Todoist URL to ensure consistent format
     * @param url The Todoist URL to normalize
     * @returns Normalized URL with consistent format
     */
    private normalizeTodoistUrl(url: string): string {
        if (!url) return '';
        
        // Ensure the URL uses the new format (app.todoist.com)
        let normalized = url.replace(/https?:\/\/todoist\.com/i, 'https://app.todoist.com');
        
        // Ensure the URL has the full path structure
        if (!normalized.includes('/app/task/') && normalized.includes('todoist.com')) {
            normalized = normalized.replace(/todoist\.com\/?/i, 'todoist.com/app/task/');
        }
        
        return normalized;
    }
    
    /**
     * Extract task ID from a Todoist task link or ID
     * @param input Todoist task link or ID
     * @returns Task ID or null if invalid
     */
    private extractTaskId(input: string): string | null {
        // If the input is empty or null, return null
        if (!input) return null;
        
        console.debug("Extracting task ID from:", input);
        
        // Normalize the input URL if it looks like a URL
        if (input.includes('todoist.com')) {
            input = this.normalizeTodoistUrl(input);
            console.debug("Normalized input URL:", input);
        }
        
        // Extract from old URL format with numeric ID: https://app.todoist.com/app/task/1234567890
        const oldUrlMatch = input.match(/todoist\.com\/app\/task\/(\d+)/);
        if (oldUrlMatch && oldUrlMatch[1]) {
            console.debug("Matched old URL format with numeric ID:", oldUrlMatch[1]);
            return oldUrlMatch[1];
        }
        
        // Extract from new URL format: https://app.todoist.com/app/task/task-name-alphanumeric-id
        const newUrlMatch = input.match(/todoist\.com\/app\/task\/([\w-]+)/);
        if (newUrlMatch && newUrlMatch[1]) {
            const fullPath = newUrlMatch[1];
            console.debug("Matched new URL format with full path:", fullPath);
            return fullPath;
        }
        
        // Handle direct ID input: either numeric or string-based
        if (/^[\w-]+$/.test(input)) {
            console.debug("Input appears to be a direct task ID or slug:", input);
            return input;
        }
        
        return null;
    }

    onClose() {
        // Clean up
        this.contentEl.empty();
    }
}
