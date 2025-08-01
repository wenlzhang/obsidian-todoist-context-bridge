import { Notice, Platform } from "obsidian";
import { TodoistContextBridgeSettings } from "./Settings";

/**
 * Helper class for managing notifications based on user preferences
 */
export class NotificationHelper {
    constructor(private settings: TodoistContextBridgeSettings) {}

    /**
     * Shows a success notification if user preferences allow it
     * @param message The success message to display
     */
    showSuccess(message: string): void {
        if (this.shouldShowNotification("success")) {
            new Notice(message);
        }
    }

    /**
     * Shows an error notification if user preferences allow it
     * @param message The error message to display
     */
    showError(message: string): void {
        if (this.shouldShowNotification("error")) {
            new Notice(message);
        }
    }

    /**
     * Shows an info notification if user preferences allow it
     * @param message The info message to display
     */
    showInfo(message: string): void {
        if (this.shouldShowNotification("info")) {
            new Notice(message);
        }
    }

    /**
     * Determines if a notification should be shown based on user preferences
     * @param type The type of notification: "success", "error", or "info"
     * @returns true if the notification should be shown
     */
    private shouldShowNotification(
        type: "success" | "error" | "info",
    ): boolean {
        // Get the appropriate preference based on platform
        const preference = this.getEffectiveNotificationPreference();

        switch (preference) {
            case "none":
                return false;
            case "errors":
                return type === "error";
            case "all":
                return true;
            default:
                return true; // Fallback to showing all notifications
        }
    }

    /**
     * Gets the effective notification preference based on platform
     * @returns The notification preference to use
     */
    private getEffectiveNotificationPreference(): "all" | "errors" | "none" {
        // Check if we're on mobile and have a mobile-specific preference
        if (
            Platform.isMobile &&
            this.settings.mobileNotificationPreference !== null
        ) {
            return this.settings.mobileNotificationPreference;
        }

        // Use the general notification preference
        return this.settings.notificationPreference;
    }
}
