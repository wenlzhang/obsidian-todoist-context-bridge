import { Modal, App, Notice } from "obsidian";
import TodoistContextBridgePlugin from "./main";
import { Task } from "@doist/todoist-api-typescript";
import { TodoistV2IDs } from "./TodoistV2IDs";

/**
 * Modal for syncing a task from Todoist to Obsidian
 */
export class TodoistToObsidianModal extends Modal {
    private taskLinkInput = "";
    private plugin: TodoistContextBridgePlugin;
    private onSubmit: (task: Task) => void;
    private todoistV2IDs: TodoistV2IDs;

    constructor(
        app: App,
        plugin: TodoistContextBridgePlugin,
        onSubmit: (task: Task) => void,
        todoistV2IDs: TodoistV2IDs
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.todoistV2IDs = todoistV2IDs;
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
                try {
                    new Notice("Please enter a Todoist task link or ID");
                    return;
                } catch (error) {
                    console.error(error);
                }
            }

            try {
                syncButton.disabled = true;
                syncButton.setText("Loading...");

                // Process the input - either a URL or direct ID
                const input = this.taskLinkInput.trim();
                
                // Log the input for debugging
                // Process user input
                
                // Extract task ID parts - we'll try multiple approaches
                const idParts = await this.extractAllPossibleTaskIds(input);
                
                if (idParts.length === 0) {
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

                // Initialize our task match variable
                let matchedTask: Task | null = null;
                
                // First, fetch all tasks once so we have them available for multiple matching attempts

                let allTasks: Task[] = [];
                try {
                    allTasks = await this.plugin.todoistApi.getTasks();

                } catch (error) {

                    // Continue with direct ID attempts anyway
                }
                
                // Try each extracted ID from most reliable to least reliable
                for (const currentId of idParts) {

                    
                    // Approach 1: Try direct getTask API call for both numeric and alphanumeric IDs
                    try {

                        // For both numeric and the 16-char alphanumeric IDs, try direct API call
                        if (/^\d+$/.test(currentId) || /^[a-zA-Z0-9]{16}$/.test(currentId)) {
                            try {
                                const task = await this.plugin.todoistApi.getTask(currentId);
                                if (task) {

                                    matchedTask = task;
                                    break; // Success - exit the loop
                                }
                            } catch (error: any) {

                                // Continue to next approach
                            }
                        }
                    } catch (error) {

                        // Continue to the next approach
                    }
                    
                    // Approach 2: Match by task ID or URL in the already fetched tasks
                    if (!matchedTask && allTasks.length > 0) {

                        
                        // Try direct ID match
                        matchedTask = allTasks.find(task => task.id === currentId) || null;
                        if (matchedTask) {

                            break;
                        }
                        
                        // Try URL-based matching
                        for (const task of allTasks) {
                            if (!task.url) continue;
                            
                            const taskUrl = task.url.toLowerCase();
                            const currentIdLower = currentId.toLowerCase();
                            
                            // Check if the URL contains our current ID
                            if (taskUrl.includes(currentIdLower)) {

                                matchedTask = task;
                                break;
                            }
                            
                            // Check if this is the last part of the URL path
                            const urlPath = task.url.split('/').pop() || '';
                            if (urlPath.toLowerCase() === currentIdLower) {

                                matchedTask = task;
                                break;
                            }
                            
                            // For alphanumeric IDs, check if URL ends with it
                            if (/^[a-zA-Z0-9]{16}$/.test(currentId) && taskUrl.endsWith(currentIdLower)) {

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
                            

                        
                        // Get all tasks and filter on the client side
                        if (words.length > 0) {
                            try {
                                const allTasks = await this.plugin.todoistApi.getTasks();

                                
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
                                    

                                    
                                    // If we found exactly one task, it's probably the right one
                                    if (matchingTasks.length === 1) {
                                        matchedTask = matchingTasks[0];

                                    } else if (matchingTasks.length > 1) {
                                        // Try to find the most relevant task from multiple matches
                                        // idParts is already awaited earlier, so we can use it directly
                                        for (const possibleId of idParts) {
                                            const urlMatch = matchingTasks.find(task => {
                                                if (!task.url) return false;
                                                return task.url.toLowerCase().includes(possibleId.toLowerCase());
                                            }) || null;
                                            
                                            if (urlMatch) {
                                                matchedTask = urlMatch;

                                                break;
                                            }
                                        }
                                    }
                                }
                            } catch (err) {

                            }
                        }
                    } catch (err) {

                    }
                }
                
                // If we still don't have a match, try with all tasks from Todoist
                if (!matchedTask) {
                    try {
                        // Fetch all tasks if we haven't done so already

                        const allTasks = await this.plugin.todoistApi.getTasks();
                        
                        if (!allTasks || allTasks.length === 0) {

                        } else {
                            // Log tasks for debugging

                            
                            // Try exact URL matching with the original input
                            const originalUrl = this.taskLinkInput.trim();
                            matchedTask = allTasks.find((task: Task) => {
                                if (!task.url) return false;
                                
                                // Normalize URLs for comparison
                                const normalizedTaskUrl = task.url.replace(/https?:\/\//i, '');
                                const normalizedInputUrl = originalUrl.replace(/https?:\/\//i, '');
                                
                                // Match if normalized URLs are equal
                                const exactMatch = normalizedTaskUrl === normalizedInputUrl;
                                // Check for exact URL match
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

                                        
                                        matchedTask = allTasks.find((task: Task) => {
                                            if (!task.url) return false;
                                            return task.url.includes(lastPart);
                                        }) || null;
                                        
                                        if (matchedTask) {

                                        }
                                    }
                                }
                            }
                        } 
                    } catch (err) {

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
    private async normalizeTodoistUrl(url: string): Promise<string> {
        if (!url) return '';
        
        // Always normalize to the official new format: https://app.todoist.com/app/task/<v2_id>
        let normalized = url;
        
        // Convert todoist.com to app.todoist.com
        normalized = normalized.replace(/https?:\/\/todoist\.com(?!\.api)/i, 'https://app.todoist.com');
        
        // Ensure the URL has the correct path structure (/app/task/)
        if (normalized.includes('todoist.com')) {
            // Handle various path formats: /t/, /task/, or missing path
            if (!normalized.includes('/app/task/')) {
                // Remove any existing path structure first
                normalized = normalized.replace(/(app\.)?todoist\.com(?:\/app)?(?:\/task|\/t)?\//i, 'app.todoist.com/');
                // Then add the correct path
                normalized = normalized.replace(/app\.todoist\.com\//i, 'app.todoist.com/app/task/');
            }

            // Extract task ID and check if it's a numeric ID that needs conversion to v2
            const idMatch = normalized.match(/app\.todoist\.com\/app\/task\/([0-9]+)$/);
            if (idMatch && idMatch[1]) {
                try {
                    const numericId = idMatch[1];
                    // Only attempt conversion if it looks like a purely numeric ID
                    if (/^\d+$/.test(numericId)) {
                        const v2Id = await this.todoistV2IDs.getV2Id(numericId);
                        if (v2Id && v2Id !== numericId) {
                            normalized = normalized.replace(numericId, v2Id);

                        }
                    }
                } catch (error) {
                    console.error("Error converting numeric ID to v2 ID:", error);
                }
            }
        }
        

        return normalized;
    }

    /**
     * Extract all possible task IDs from a Todoist task link or ID input
     * @param input Todoist task link or ID
     * @returns Array of possible task IDs, from most likely to least likely
     */
    private async extractAllPossibleTaskIds(input: string): Promise<string[]> {
        // If the input is empty or null, return empty array
        if (!input) return [];
        

        
        const possibleIds: string[] = [];
        let processedInput = input;
        
        // Normalize the input URL if it looks like a URL
        if (input.includes('todoist.com')) {
            processedInput = await this.normalizeTodoistUrl(input);

        }
        
        // 1. Extract alphanumeric ID (most likely to work with the API)
        // For complete URL with slug: extract just the 16-char ID at the end
        const completeUrlMatch = processedInput.match(/[\w-]+-([a-zA-Z0-9]{16})(?:\?|$)/);
        if (completeUrlMatch && completeUrlMatch[1]) {
            const alphanumericId = completeUrlMatch[1];
            possibleIds.push(alphanumericId);

        }
        
        // 2. For short URL: extract just the ID
        const shortUrlMatch = processedInput.match(/\/task\/([a-zA-Z0-9]{16})(?:\?|$)/);
        if (shortUrlMatch && shortUrlMatch[1]) {
            const shortUrlId = shortUrlMatch[1];
            if (!possibleIds.includes(shortUrlId)) {
                possibleIds.push(shortUrlId);

            }
        }
        
        // 3. Direct alphanumeric ID input (16 chars)
        if (/^[a-zA-Z0-9]{16}$/.test(input)) {
            if (!possibleIds.includes(input)) {
                possibleIds.push(input);

            }
        }
        
        // 4. Numeric ID format (old style Todoist)
        const numericMatch = processedInput.match(/\/task\/(\d+)(?:\?|$)/);
        if (numericMatch && numericMatch[1]) {
            const numericId = numericMatch[1];
            if (!possibleIds.includes(numericId)) {
                possibleIds.push(numericId);

            }
        }
        
        // 5. Direct numeric ID input
        if (/^\d+$/.test(input)) {
            if (!possibleIds.includes(input)) {
                possibleIds.push(input);

            }
        }
        
        // 6. Whole URL path as fallback
        const pathMatch = processedInput.match(/\/task\/([\w-]+)(?:\?|$)/);
        if (pathMatch && pathMatch[1]) {
            const wholePath = pathMatch[1];
            if (!possibleIds.includes(wholePath)) {
                possibleIds.push(wholePath);

            }
        }
        
        // 7. For direct slug+ID input
        const directSlugMatch = input.match(/^([\w-]+-[a-zA-Z0-9]{16})$/);
        if (directSlugMatch && directSlugMatch[1]) {
            const directSlug = directSlugMatch[1];
            if (!possibleIds.includes(directSlug)) {
                possibleIds.push(directSlug);

            }
        }
        
        return possibleIds;
    }

    onClose() {
        // Clean up
        this.contentEl.empty();
    }
}
