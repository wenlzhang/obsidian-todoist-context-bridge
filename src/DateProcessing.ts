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
        // Start of today in local timezone
        return window.moment().startOf("day").format("YYYY-MM-DD");
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

        // Start with today at start of day in local timezone
        let m = window.moment().startOf("day");

        // Add the specified number of days
        m = m.add(days, "days");

        // Skip weekends if requested
        if (skipWeekends && days > 0) {
            while (m.day() === 0 || m.day() === 6) {
                m = m.add(1, "days");
            }
        }

        return m.format("YYYY-MM-DD");
    }

    /**
     * Format a date for Todoist API
     * @param date The date to format
     * @returns Date string in Todoist format (YYYY-MM-DD[THH:mm])
     */
    public static formatDateForTodoist(date: Date): string {
        const m = window.moment(date);

        // If no time component, return date only
        if (m.hours() === 0 && m.minutes() === 0) {
            return m.format("YYYY-MM-DD");
        }

        // Include timezone offset in the formatted time
        return m.format("YYYY-MM-DDTHH:mm");
    }

    /**
     * Validate date string format with optional time
     * @param dateStr The date string to validate (YYYY-MM-DD[THH:mm])
     * @returns true if format is valid
     */
    private static isValidDateTimeFormat(dateStr: string): boolean {
        return window
            .moment(dateStr, ["YYYY-MM-DD", "YYYY-MM-DDTHH:mm"], true)
            .isValid();
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

        const now = window.moment();
        const inputMoment = window.moment(dateStr);

        // For date-only comparison (no time), compare at start of day
        if (!dateStr.includes("T")) {
            return inputMoment.startOf("day").isBefore(now.startOf("day"));
        }

        // For date-time comparison, compare with current time
        return inputMoment.isBefore(now);
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
     * Check if a relative date string represents a past date
     * @param dateStr The relative date string (e.g., "-1d", "0d", "+1d")
     * @returns true if the relative date represents a past date
     */
    public static isRelativeDateInPast(dateStr: string): boolean {
        // Allow formats: +1D, 1d, 0d, + 1 d, etc.
        const relativeMatch = dateStr.trim().match(/^([+-]?\s*\d+)\s*[Dd]$/);
        if (!relativeMatch) {
            return false;
        }

        const [_, daysStr] = relativeMatch;
        const normalizedDaysStr = daysStr.replace(/\s+/g, "");
        const days = parseInt(normalizedDaysStr);

        // Compare at start of day in local timezone
        const targetDate = window.moment().startOf("day").add(days, "days");
        return targetDate.isBefore(window.moment().startOf("day"));
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
            const formattedDate = this.processRelativeDate(
                dateStr,
                skipWeekends,
            );
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

        // Format based on whether time is present
        const formattedDate = dateStr.includes("T")
            ? m.format("YYYY-MM-DDTHH:mm")
            : m.format("YYYY-MM-DD");

        return {
            formattedDate,
            isInPast: this.isDateInPast(formattedDate),
        };
    }
}
