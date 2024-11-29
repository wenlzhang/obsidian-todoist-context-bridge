import { Notice } from "obsidian";

export class DateProcessing {
    /**
     * Process relative date (e.g., +1D, 1d, 0d) and convert to Todoist format
     * @param dateStr The date string to process
     * @returns A date string in Todoist format, or null if invalid
     */
    public static processRelativeDate(dateStr: string): string | null {
        // Allow formats: +1D, 1d, 0d, + 1 d, etc.
        const relativeMatch = dateStr.trim().match(/^([+-]?\s*\d+)\s*[Dd]$/);
        if (!relativeMatch) {
            return null;
        }

        const [_, daysStr] = relativeMatch;
        // Remove spaces and handle the case where no sign is provided (treat as positive)
        const normalizedDaysStr = daysStr.replace(/\s+/g, '');
        const days = parseInt(normalizedDaysStr);
        
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        if (days === 0) {
            return this.formatDateForTodoist(date);
        }

        if (days > 0 || normalizedDaysStr.startsWith('+')) {
            date.setDate(date.getDate() + Math.abs(days));
        } else {
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
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Validate and format a date string for Todoist
     * @param dateStr The date string to process
     * @returns Formatted date string or null if invalid
     */
    public static validateAndFormatDate(dateStr: string): string | null {
        if (!dateStr.trim()) {
            return null;
        }

        // Try processing as relative date first
        const relativeDate = this.processRelativeDate(dateStr);
        if (relativeDate) {
            return relativeDate;
        }

        // Try parsing as standard date
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return this.formatDateForTodoist(date);
            }
        } catch (e) {
            new Notice("Invalid date format. Please use YYYY-MM-DD or relative format (e.g., 1d, +2d)");
            return null;
        }

        new Notice("Invalid date format. Please use YYYY-MM-DD or relative format (e.g., 1d, +2d)");
        return null;
    }
}
