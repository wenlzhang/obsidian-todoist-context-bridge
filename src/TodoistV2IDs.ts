import { TodoistContextBridgeSettings } from "./Settings";

/**
 * Helper class to handle v2 (alphanumeric) Todoist IDs
 * Provides methods to work with both numeric and v2 IDs
 */
export class TodoistV2IDs {
    constructor(private settings: TodoistContextBridgeSettings) {}

    /**
     * Get the v2 (alphanumeric) ID for a task using the Todoist Sync API
     * @param numericId The numeric ID of the task
     * @returns Promise resolving to the v2 ID if found, or the numeric ID as fallback
     */
    public async getV2Id(numericId: string): Promise<string> {
        if (!numericId) return "";
        if (!this.settings.todoistAPIToken) {
            console.warn("No Todoist API token found, cannot fetch v2 ID");
            return numericId;
        }

        try {
            // Using the Todoist Sync API to get task details including v2_id
            const response = await fetch(
                `https://api.todoist.com/sync/v9/items/get?item_id=${numericId}`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${this.settings.todoistAPIToken}`,
                    },
                },
            );

            if (!response.ok) {
                throw new Error(`Failed to get task info: ${response.status}`);
            }

            const data = await response.json();

            // Check if v2_id exists in the response
            if (data && data.item && data.item.v2_id) {
                return data.item.v2_id;
            } else {
                return numericId;
            }
        } catch (error: any) {
            // ✅ OPTIMIZED: Better CORS and network error handling
            const errorMessage = error.message || error.toString();

            // Handle CORS errors silently (common in certain environments)
            if (
                errorMessage.includes("CORS") ||
                errorMessage.includes("Network request failed") ||
                errorMessage.includes("Failed to fetch")
            ) {
                // Silently fallback for CORS/network issues - these are expected in some environments
                return numericId;
            }

            // Only log unexpected errors to reduce console noise
            if (
                !errorMessage.includes("404") &&
                !errorMessage.includes("403")
            ) {
                console.warn(
                    `[V2 ID] Warning fetching v2 ID for ${numericId}:`,
                    errorMessage,
                );
            }

            // Always fallback to numeric ID if we can't fetch the v2 ID
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
