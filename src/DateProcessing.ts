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
        // Create date in UTC to avoid timezone issues
        const today = new Date();
        const utcDate = new Date(
            Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
        );
        return this.formatDateForTodoist(utcDate);
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

        // Create date in UTC to avoid timezone issues
        const today = new Date();
        const date = new Date(
            Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
        );

        if (days === 0) {
            return this.formatDateForTodoist(date);
        }

        if (days > 0 || normalizedDaysStr.startsWith("+")) {
            let daysToAdd = Math.abs(days);
            if (skipWeekends) {
                // Skip weekends when calculating future dates
                const currentDate = new Date(date);
                while (daysToAdd > 0) {
                    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                    // Skip Saturday (6) and Sunday (0)
                    if (
                        currentDate.getUTCDay() !== 0 &&
                        currentDate.getUTCDay() !== 6
                    ) {
                        daysToAdd--;
                    }
                }
                return this.formatDateForTodoist(currentDate);
            } else {
                date.setUTCDate(date.getUTCDate() + daysToAdd);
            }
        } else {
            // For negative dates, just subtract the days
            date.setUTCDate(date.getUTCDate() + days); // days is already negative
        }

        return this.formatDateForTodoist(date);
    }

    /**
     * Format a date for Todoist API
     * @param date The date to format
     * @returns Date string in Todoist format (YYYY-MM-DD[THH:mm])
     */
    public static formatDateForTodoist(date: Date): string {
        const m = window.moment(date);
        const baseDate = m.format("YYYY-MM-DD");
        
        // Add time information if hours or minutes are non-zero
        if (m.hours() !== 0 || m.minutes() !== 0) {
            return m.format("YYYY-MM-DDTHH:mm");
        }

        return baseDate;
    }

    /**
     * Validate date string format with optional time
     * @param dateStr The date string to validate (YYYY-MM-DD[THH:mm])
     * @returns true if format is valid
     */
    private static isValidDateTimeFormat(dateStr: string): boolean {
        return window.moment(dateStr, ["YYYY-MM-DD", "YYYY-MM-DDTHH:mm"], true).isValid();
    }

    /**
     * Check if a date is in the past
     * @param dateStr Date string in YYYY-MM-DD[THH:mm] format
     * @returns true if date is in the past
     */
    public static isDateInPast(dateStr: string): boolean {
        // For relative dates, check if they represent past dates
        if (this.isRelativeDate(dateStr)) {
            return this.isRelativeDateInPast(dateStr);
        }

        const inputMoment = window.moment(dateStr);
        return inputMoment.isBefore(window.moment());
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
     * Check if a date string is a relative date (e.g., +1D, 1d, 0d)
     * @param dateStr The date string to check
     * @returns True if the string is a relative date, false otherwise
     */
    public static isRelativeDate(dateStr: string): boolean {
        return /^[+-]?\s*\d+\s*[Dd]$/.test(dateStr.trim());
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

        // Try processing as relative date first
        if (this.isRelativeDate(dateStr)) {
            const formattedDate = this.processRelativeDate(dateStr, skipWeekends);
            if (formattedDate) {
                return {
                    formattedDate,
                    isInPast: this.isRelativeDateInPast(dateStr),
                };
            }
        }

        // If not a relative date, validate the date-time format
        if (!this.isValidDateTimeFormat(dateStr)) {
            new Notice(
                "Invalid date format. Please use YYYY-MM-DD[THH:mm] or relative format (e.g., 1d, +2d)",
            );
            return null;
        }

        // Parse using moment.js
        const m = window.moment(dateStr);
        if (!m.isValid()) {
            new Notice(
                "Invalid date format. Please use YYYY-MM-DD[THH:mm] or relative format (e.g., 1d, +2d)",
            );
            return null;
        }

        const formattedDate = m.hours() || m.minutes() 
            ? m.format("YYYY-MM-DDTHH:mm")
            : m.format("YYYY-MM-DD");

        return {
            formattedDate,
            isInPast: this.isDateInPast(formattedDate),
        };
    }

    /**
     * Check if a relative date string represents a past date
     * @param dateStr The relative date string (e.g., "-1d", "0d", "+1d")
     * @returns true if the relative date represents a past date
     */
    private static isRelativeDateInPast(dateStr: string): boolean {
        const relativeMatch = dateStr.trim().match(/^([+-]?\s*\d+)\s*[Dd]$/);
        if (!relativeMatch) {
            return false;
        }

        const [_, daysStr] = relativeMatch;
        const normalizedDaysStr = daysStr.replace(/\s+/g, "");
        const days = parseInt(normalizedDaysStr);

        // Consider negative days as past dates
        return days < 0;
    }
}
