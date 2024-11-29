import { Notice } from "obsidian";
import { TodoistContextBridgeSettings } from "./Settings";

export interface DateValidationResult {
    formattedDate: string;
    isInPast: boolean;
}

export class DateProcessing {
    private static settings: TodoistContextBridgeSettings;

    public static initialize(settings: TodoistContextBridgeSettings) {
        this.settings = settings;
    }

    /**
     * Get today's date formatted for Todoist
     */
    public static getTodayFormatted(): string {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.formatDateForTodoist(today);
    }

    /**
     * Process relative date (e.g., +1D, 1d, 0d) and convert to Todoist format
     * @param dateStr The date string to process
     * @param skipWeekends Whether to skip weekends in the calculation
     * @returns A date string in Todoist format, or null if invalid
     */
    public static processRelativeDate(
        dateStr: string,
        skipWeekends = false,
    ): string | null {
        // Allow formats: +1D, 1d, 0d, + 1 d, etc.
        const relativeMatch = dateStr.trim().match(/^([+-]?\s*\d+)\s*[Dd]$/);
        if (!relativeMatch) {
            return null;
        }

        const [_, daysStr] = relativeMatch;
        // Remove spaces and handle the case where no sign is provided (treat as positive)
        const normalizedDaysStr = daysStr.replace(/\s+/g, "");
        const days = parseInt(normalizedDaysStr);

        const date = new Date();
        date.setHours(0, 0, 0, 0);

        if (days === 0) {
            return this.formatDateForTodoist(date);
        }

        if (days > 0 || normalizedDaysStr.startsWith("+")) {
            let daysToAdd = Math.abs(days);
            if (skipWeekends) {
                // Skip weekends when calculating future dates
                const currentDate = new Date(date);
                while (daysToAdd > 0) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    // Skip Saturday (6) and Sunday (0)
                    if (
                        currentDate.getDay() !== 0 &&
                        currentDate.getDay() !== 6
                    ) {
                        daysToAdd--;
                    }
                }
                return this.formatDateForTodoist(currentDate);
            } else {
                date.setDate(date.getDate() + daysToAdd);
            }
        } else {
            // For negative dates, just subtract the days
            date.setDate(date.getDate() + days); // days is already negative
        }

        return this.formatDateForTodoist(date);
    }

    /**
     * Format a date for Todoist API
     * @param date The date to format
     * @returns Date string in Todoist format (YYYY-MM-DD)
     */
    public static formatDateForTodoist(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    /**
     * Check if a date is in the past
     * @param dateStr Date string in YYYY-MM-DD format
     * @returns true if date is in the past
     */
    public static isDateInPast(dateStr: string): boolean {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const date = new Date(dateStr);
        return date < today;
    }

    /**
     * Process a date string according to moment.js format patterns
     * @param dateStr The date string to process
     * @returns Original date string if it matches a moment pattern, or null if no match
     */
    private static processMomentFormat(dateStr: string): string | null {
        if (!this.settings?.momentFormatCleanupPatterns) {
            return null;
        }

        const momentPatterns = this.settings.momentFormatCleanupPatterns
            .split(",")
            .map((pattern) => pattern.trim());

        for (const pattern of momentPatterns) {
            try {
                // Extract the prefix and moment format
                const prefixMatch = pattern.match(/^\[(.*?)\]/);
                const prefix = prefixMatch ? prefixMatch[1] : "";
                const momentFormat = prefixMatch
                    ? pattern.slice(prefixMatch[0].length)
                    : pattern;

                if (dateStr.match(new RegExp(momentFormat))) {
                    // Return the original date string if it matches a moment format
                    // This maintains compatibility with existing moment.js patterns
                    return dateStr;
                }
            } catch (e) {
                console.warn(`Invalid moment.js format pattern: ${pattern}`, e);
            }
        }
        return null;
    }

    /**
     * Validate and format a date string for Todoist
     * @param dateStr The date string to process
     * @param skipWeekends Whether to skip weekends for relative dates
     * @returns Validation result containing formatted date and past date status, or null if invalid
     */
    public static validateAndFormatDate(
        dateStr: string,
        skipWeekends = false,
    ): DateValidationResult | null {
        if (!dateStr.trim()) {
            return null;
        }

        let formattedDate: string | null = null;

        // Try processing as relative date first
        formattedDate = this.processRelativeDate(dateStr, skipWeekends);

        // If not a relative date, try moment.js format
        if (!formattedDate) {
            formattedDate = this.processMomentFormat(dateStr);
        }

        // If not a moment.js format, try parsing as standard date
        if (!formattedDate) {
            try {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    formattedDate = this.formatDateForTodoist(date);
                }
            } catch (e) {
                new Notice(
                    "Invalid date format. Please use YYYY-MM-DD or relative format (e.g., 1d, +2d)",
                );
                return null;
            }
        }

        if (!formattedDate) {
            new Notice(
                "Invalid date format. Please use YYYY-MM-DD or relative format (e.g., 1d, +2d)",
            );
            return null;
        }

        const isInPast = this.isDateInPast(formattedDate);
        if (isInPast && this.settings?.warnPastDueDate) {
            new Notice("Warning: The due date is in the past");
        }

        return {
            formattedDate,
            isInPast,
        };
    }
}
