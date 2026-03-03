import { TodoistApi } from "@doist/todoist-api-typescript";
import { TodoistContextBridgeSettings } from "./Settings";

/**
 * Helper class to handle v2 (alphanumeric) Todoist IDs
 * Provides methods to work with both numeric and v2 IDs
 *
 * Note: In the new Todoist API v1, all IDs are already alphanumeric strings.
 * This class primarily handles backward compatibility with old numeric IDs
 * that may still exist in Obsidian notes.
 */
export class TodoistV2IDs {
    private todoistApi: TodoistApi | null = null;

    constructor(private settings: TodoistContextBridgeSettings) {}

    /**
     * Set the TodoistApi instance for making API calls
     */
    public setApi(api: TodoistApi | null) {
        this.todoistApi = api;
    }

    /**
     * Get the v2 (alphanumeric) ID for a task using the Todoist API
     * @param numericId The numeric ID of the task
     * @returns Promise resolving to the v2 ID if found, or the numeric ID as fallback
     */
    public async getV2Id(numericId: string): Promise<string> {
        if (!numericId) return "";

        // If it's already alphanumeric, return as-is
        if (/[a-zA-Z]/.test(numericId)) {
            return numericId;
        }

        if (!this.todoistApi) {
            console.warn(
                "No Todoist API instance available, cannot fetch v2 ID",
            );
            return numericId;
        }

        try {
            // Use the SDK's getTask method to fetch the task and get its string ID
            const task = await this.todoistApi.getTask(numericId);
            if (task && task.id) {
                return task.id;
            }
            return numericId;
        } catch (error) {
            console.error("Error fetching v2 ID:", error);
            // Fallback to numeric ID if we can't fetch the v2 ID
            return numericId;
        }
    }

    /**
     * Convert a potentially old-style Todoist URL to the new format with v2 ID
     * @param url The original Todoist URL
     * @returns Promise resolving to the updated URL with v2 ID
     */
    public async convertToV2Url(url: string): Promise<string> {
        if (!url) return "";

        // Extract the ID from the URL
        const idMatch = url.match(/\/task\/([^/]+)(?:$|\/|\?)/);
        if (!idMatch || !idMatch[1]) return url;

        const originalId = idMatch[1];

        // Check if the ID is already alphanumeric (v2 format)
        if (/[a-zA-Z]/.test(originalId)) {
            return url; // Already a v2 ID, return as is
        }

        // Get the v2 ID for this numeric ID
        const v2Id = await this.getV2Id(originalId);

        // If we couldn't get the v2 ID, return the original URL
        if (v2Id === originalId) return url;

        // Replace the numeric ID with the v2 ID in the URL
        return url.replace(`/task/${originalId}`, `/task/${v2Id}`);
    }
}
