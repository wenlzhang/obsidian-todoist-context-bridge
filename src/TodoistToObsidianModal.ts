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

                // Process the input - either a URL or direct ID
                const input = this.taskLinkInput.trim();
                
                // Log the input for debugging
                console.debug("User input for task:", input);
                
                // Extract task ID parts - we'll try multiple approaches
                const idParts = this.extractAllPossibleTaskIds(input);
                
                if (idParts.length === 0) {
                    new Notice("Invalid Todoist task link or ID. Please check your input.");
                    syncButton.disabled = false;
                    syncButton.setText("Sync task");
                    return;
                }
                
                console.debug("Extracted possible task IDs:", idParts);

                if (!this.plugin.todoistApi) {
                    new Notice("Todoist API not initialized. Please check your API token in settings.");
                    this.close();
                    return;
                }

                // Initialize our task match variable
                let matchedTask: Task | null = null;
                
                // First, fetch all tasks once so we have them available for multiple matching attempts
                console.debug("Fetching all tasks for matching");
                let allTasks: Task[] = [];
                try {
                    allTasks = await this.plugin.todoistApi.getTasks();
                    console.debug(`Successfully fetched ${allTasks.length} tasks from Todoist`);
                } catch (error) {
                    console.debug("Failed to fetch all tasks:", error);
                    // Continue with direct ID attempts anyway
                }
                
                // Try each extracted ID from most reliable to least reliable
                for (const currentId of idParts) {
                    console.debug("Trying to find task with ID:", currentId);
                    
                    // Approach 1: Try direct getTask API call for both numeric and alphanumeric IDs
                    try {
                        console.debug("Attempting direct API call with ID:", currentId);
                        // For both numeric and the 16-char alphanumeric IDs, try direct API call
                        if (/^\d+$/.test(currentId) || /^[a-zA-Z0-9]{16}$/.test(currentId)) {
                            try {
                                const task = await this.plugin.todoistApi.getTask(currentId);
                                if (task) {
                                    console.debug("Found task via direct API call:", task.id, task.content);
                                    matchedTask = task;
                                    break; // Success - exit the loop
                                }
                            } catch (error: any) {
                                console.debug("Direct API call failed for ID:", currentId, error);
                                // Continue to next approach
                            }
                        }
                    } catch (error) {
                        console.debug("Error in direct task fetch attempt:", error);
                        // Continue to the next approach
                    }
                    
                    // Approach 2: Match by task ID or URL in the already fetched tasks
                    if (!matchedTask && allTasks.length > 0) {
                        console.debug("Attempting to match task by ID/URL from fetched tasks");
                        
                        // Try direct ID match
                        matchedTask = allTasks.find(task => task.id === currentId) || null;
                        if (matchedTask) {
                            console.debug("Found task by exact ID match:", matchedTask.id, matchedTask.content);
                            break;
                        }
                        
                        // Try URL-based matching
                        for (const task of allTasks) {
                            if (!task.url) continue;
                            
                            const taskUrl = task.url.toLowerCase();
                            const currentIdLower = currentId.toLowerCase();
                            
                            // Check if the URL contains our current ID
                            if (taskUrl.includes(currentIdLower)) {
                                console.debug("Found task by URL containing ID:", task.id, task.content);
                                matchedTask = task;
                                break;
                            }
                            
                            // Check if this is the last part of the URL path
                            const urlPath = task.url.split('/').pop() || '';
                            if (urlPath.toLowerCase() === currentIdLower) {
                                console.debug("Found task by matching URL path:", task.id, task.content);
                                matchedTask = task;
                                break;
                            }
                            
                            // For alphanumeric IDs, check if URL ends with it
                            if (/^[a-zA-Z0-9]{16}$/.test(currentId) && taskUrl.endsWith(currentIdLower)) {
                                console.debug("Found task by URL ending with ID:", task.id, task.content);
                                matchedTask = task;
                                break;
                            }
                        }
                        
                        // If we found a match, exit the outer loop
                        if (matchedTask) break;
                    }
                }
                
                // If we still don't have a match, try one more approach by fetching all tasks and doing client-side filtering
                if (!matchedTask && input.includes('-')) {
                    try {
                        // Extract potential words from the input that might be in the task content
                        const words = input.split(/[-_\s]/)  // Split by hyphens, underscores, or spaces
                            .filter(word => word.length > 3)  // Only consider words longer than 3 chars
                            .map(word => word.toLowerCase());
                            
                        console.debug("Extracted words for client-side content search:", words);
                        
                        // Get all tasks and filter on the client side
                        if (words.length > 0) {
                            try {
                                const allTasks = await this.plugin.todoistApi.getTasks();
                                console.debug(`Fetched ${allTasks.length} tasks for client-side content search`);
                                
                                if (allTasks && allTasks.length > 0) {
                                    // Filter tasks that contain any of our significant words
                                    const matchingTasks = allTasks.filter(task => {
                                        if (!task.content) return false;
                                        const taskContentLower = task.content.toLowerCase();
                                        
                                        // Skip very common words
                                        const significantWords = words.filter(w => 
                                            !['task', 'todo', 'item', 'the'].includes(w));
                                            
                                        // Check if task content contains any of our words
                                        return significantWords.some(word => taskContentLower.includes(word));
                                    });
                                    
                                    console.debug(`Found ${matchingTasks.length} tasks with matching content`);
                                    
                                    // If we found exactly one task, it's probably the right one
                                    if (matchingTasks.length === 1) {
                                        matchedTask = matchingTasks[0];
                                        console.debug("Found unique task via content search:", matchedTask.id, matchedTask.content);
                                    } else if (matchingTasks.length > 1) {
                                        // Try to find the most relevant task from multiple matches
                                        for (const possibleId of idParts) {
                                            const urlMatch = matchingTasks.find(task => {
                                                if (!task.url) return false;
                                                return task.url.toLowerCase().includes(possibleId.toLowerCase());
                                            }) || null;
                                            
                                            if (urlMatch) {
                                                matchedTask = urlMatch;
                                                console.debug("Found matching task via content search + URL match:", matchedTask.id, matchedTask.content);
                                                break;
                                            }
                                        }
                                    }
                                }
                            } catch (err) {
                                console.debug("Error during all tasks fetch for content search:", err);
                            }
                        }
                    } catch (err) {
                        console.debug("Error during content-based search:", err);
                    }
                }
                
                // If we still don't have a match, try with all tasks from Todoist
                if (!matchedTask) {
                    try {
                        // Fetch all tasks if we haven't done so already
                        console.debug("Fetching all tasks for final matching attempt");
                        const allTasks = await this.plugin.todoistApi.getTasks();
                        
                        if (!allTasks || allTasks.length === 0) {
                            console.debug("No tasks found in Todoist account");
                        } else {
                            // Log tasks for debugging
                            console.debug(`Fetched ${allTasks.length} tasks for final matching attempt`);
                            
                            // Try exact URL matching with the original input
                            const originalUrl = this.taskLinkInput.trim();
                            matchedTask = allTasks.find((task: Task) => {
                                if (!task.url) return false;
                                
                                // Normalize URLs for comparison
                                const normalizedTaskUrl = task.url.replace(/https?:\/\//i, '');
                                const normalizedInputUrl = originalUrl.replace(/https?:\/\//i, '');
                                
                                // Match if normalized URLs are equal
                                const exactMatch = normalizedTaskUrl === normalizedInputUrl;
                                if (exactMatch) console.debug("Found exact URL match:", task.id, task.content);
                                return exactMatch;
                            }) || null;
                            
                            // If still no match, try to match by content similarity
                            if (!matchedTask && input.includes('-')) {
                                // Get potential title words from the input
                                const inputWords = input.split(/[-_\s]/)
                                    .filter((word: string) => word.length > 3)
                                    .map((word: string) => word.toLowerCase());
                                    
                                if (inputWords.length > 0) {
                                    // Look for tasks whose content contains words from the input
                                    matchedTask = allTasks.find((task: Task) => {
                                        if (!task.content) return false;
                                        
                                        const taskContentLower = task.content.toLowerCase();
                                        // Check if any of the significant words appear in the task content
                                        const wordsInContent = inputWords.some(
                                            (word: string) => taskContentLower.includes(word)
                                        );
                                        
                                        if (wordsInContent) {
                                            console.debug("Found content match by words:", task.id, task.content);
                                        }
                                        return wordsInContent;
                                    }) || null;
                                }
                            }
                            
                            // Special case: try to match the last part of the input which might be the ID
                            if (!matchedTask && input.includes('-')) {
                                const parts = input.split('-');
                                if (parts.length > 1) {
                                    const lastPart = parts[parts.length - 1];
                                    if (lastPart.length > 5) {  // Only try if it looks like a substantial ID
                                        console.debug("Trying with just the last part of the input:", lastPart);
                                        
                                        matchedTask = allTasks.find((task: Task) => {
                                            if (!task.url) return false;
                                            return task.url.includes(lastPart);
                                        }) || null;
                                        
                                        if (matchedTask) {
                                            console.debug("Found task using last segment ID:", matchedTask.id, matchedTask.content);
                                        }
                                    }
                                }
                            }
                        } 
                    } catch (err) {
                        console.debug("Error during final matching attempt:", err);
                    }
                }
                
                // At this point, we've exhausted all attempts to find the task with the given IDs
                if (!matchedTask) {
                    new Notice("Task not found. Please check if the task exists and you have access to it.");
                    syncButton.disabled = false;
                    syncButton.setText("Sync task");
                    return;
                }
                
                // We found a task, use it
                this.onSubmit(matchedTask);
                this.close();
                
            } catch (err) {
                console.error("Error syncing task:", err);
                new Notice("Error syncing task. Check the console for details.");
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
     * Extract all possible task IDs from a Todoist task link or ID input
     * @param input Todoist task link or ID
     * @returns Array of possible task IDs, from most likely to least likely
     */
    private extractAllPossibleTaskIds(input: string): string[] {
        // If the input is empty or null, return empty array
        if (!input) return [];
        
        console.debug("Extracting all possible task IDs from:", input);
        
        const possibleIds: string[] = [];
        let processedInput = input;
        
        // Normalize the input URL if it looks like a URL
        if (input.includes('todoist.com')) {
            processedInput = this.normalizeTodoistUrl(input);
            console.debug("Normalized input URL:", processedInput);
        }
        
        // 1. Extract alphanumeric ID (most likely to work with the API)
        // For complete URL with slug: extract just the 16-char ID at the end
        const completeUrlMatch = processedInput.match(/[\w-]+-([a-zA-Z0-9]{16})(?:\?|$)/);
        if (completeUrlMatch && completeUrlMatch[1]) {
            const alphanumericId = completeUrlMatch[1];
            possibleIds.push(alphanumericId);
            console.debug("Extracted alphanumeric ID from complete URL:", alphanumericId);
        }
        
        // 2. For short URL: extract just the ID
        const shortUrlMatch = processedInput.match(/\/task\/([a-zA-Z0-9]{16})(?:\?|$)/);
        if (shortUrlMatch && shortUrlMatch[1]) {
            const shortUrlId = shortUrlMatch[1];
            if (!possibleIds.includes(shortUrlId)) {
                possibleIds.push(shortUrlId);
                console.debug("Extracted ID from short URL:", shortUrlId);
            }
        }
        
        // 3. Direct alphanumeric ID input (16 chars)
        if (/^[a-zA-Z0-9]{16}$/.test(input)) {
            if (!possibleIds.includes(input)) {
                possibleIds.push(input);
                console.debug("Input appears to be a direct alphanumeric ID:", input);
            }
        }
        
        // 4. Numeric ID format (old style Todoist)
        const numericMatch = processedInput.match(/\/task\/(\d+)(?:\?|$)/);
        if (numericMatch && numericMatch[1]) {
            const numericId = numericMatch[1];
            if (!possibleIds.includes(numericId)) {
                possibleIds.push(numericId);
                console.debug("Extracted numeric ID:", numericId);
            }
        }
        
        // 5. Direct numeric ID input
        if (/^\d+$/.test(input)) {
            if (!possibleIds.includes(input)) {
                possibleIds.push(input);
                console.debug("Input appears to be a direct numeric ID:", input);
            }
        }
        
        // 6. Whole URL path as fallback
        const pathMatch = processedInput.match(/\/task\/([\w-]+)(?:\?|$)/);
        if (pathMatch && pathMatch[1]) {
            const wholePath = pathMatch[1];
            if (!possibleIds.includes(wholePath)) {
                possibleIds.push(wholePath);
                console.debug("Extracted whole URL path as fallback:", wholePath);
            }
        }
        
        // 7. For direct slug+ID input
        const directSlugMatch = input.match(/^([\w-]+-[a-zA-Z0-9]{16})$/);
        if (directSlugMatch && directSlugMatch[1]) {
            const directSlug = directSlugMatch[1];
            if (!possibleIds.includes(directSlug)) {
                possibleIds.push(directSlug);
                console.debug("Input appears to be a direct slug+ID:", directSlug);
            }
        }
        
        return possibleIds;
    }
    
    /**
     * Extract task ID from a Todoist task link or ID (legacy method kept for backward compatibility)
     * @param input Todoist task link or ID
     * @returns Task ID or null if invalid
     */
    private extractTaskId(input: string): string | null {
        const ids = this.extractAllPossibleTaskIds(input);
        return ids.length > 0 ? ids[0] : null;
    }

    onClose() {
        // Clean up
        this.contentEl.empty();
    }
}
