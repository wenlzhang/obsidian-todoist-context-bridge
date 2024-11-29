import { Notice, Plugin } from "obsidian";
import { TodoistContextBridgeSettings } from "./main";

export interface TaskDetails {
    cleanText: string;
    dueDate: string | null;
    priority: number | null;
}

export class TextParsing {
    constructor(private settings: TodoistContextBridgeSettings) {}

    public readonly blockIdRegex = /\^([a-zA-Z0-9-]+)$/;

    public isTaskLine(line: string): boolean {
        // Check for Markdown task format: "- [ ]" or "* [ ]"
        return /^[\s]*[-*]\s*\[[ x?/-]\]/.test(line);
    }

    public getTaskStatus(line: string): "open" | "completed" | "other" {
        if (!this.isTaskLine(line)) {
            return "other";
        }

        // Check for different task statuses
        if (line.match(/^[\s]*[-*]\s*\[x\]/i)) {
            return "completed";
        } else if (line.match(/^[\s]*[-*]\s*\[ \]/)) {
            return "open";
        } else {
            // Matches tasks with other statuses like [?], [/], [-]
            return "other";
        }
    }

    public isNonEmptyTextLine(line: string): boolean {
        return line.trim().length > 0 && !this.isTaskLine(line);
    }

    public isListItem(line: string): boolean {
        return /^[\s]*[-*+]\s/.test(line);
    }

    public getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : "";
    }

    // Todo Check if used anywhere
    public extractBlockId(line: string): string | null {
        const match = line.match(this.blockIdRegex);
        return match ? match[1] : null;
    }

    // Check if a date is in the past
    private isDateInPast(dateStr: string): boolean {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(dateStr);
        return dueDate < today;
    }

    // Process relative date (e.g., +1D, 1d, 0d)
    private processRelativeDate(dateStr: string): string | null {
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
            return date.toISOString().split('T')[0];
        }

        if (days > 0 || normalizedDaysStr.startsWith('+')) {
            let daysToAdd = Math.abs(days);
            if (this.settings.skipWeekends) {
                // Skip weekends when calculating future dates
                let currentDate = new Date(date);
                while (daysToAdd > 0) {
                    currentDate.setDate(currentDate.getDate() + 1);
                    // Skip Saturday (6) and Sunday (0)
                    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                        daysToAdd--;
                    }
                }
                return currentDate.toISOString().split('T')[0];
            } else {
                date.setDate(date.getDate() + daysToAdd);
            }
        } else {
            // For negative dates, just subtract the days
            date.setDate(date.getDate() + days); // days is already negative
        }

        return date.toISOString().split('T')[0];
    }

    public extractTaskDetails(taskText: string): TaskDetails {
        let text = taskText;

        // Extract and remove due date in dataview format [due::YYYY-MM-DD], allowing for spaces
        let dueDate: string | null = null;
        const dataviewDueMatch = text.match(
            new RegExp(
                `\\[\\s*${this.settings.dataviewDueDateKey}\\s*::\\s*((?:\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?|[+-]?\\s*\\d+\\s*[Dd]|${this.settings.momentFormatCleanupPatterns}))\\s*\\]`,
            ),
        );
        
        if (dataviewDueMatch) {
            const rawDate = dataviewDueMatch[1].trim();
            
            // Try to process as relative date first
            const relativeDate = this.processRelativeDate(rawDate);
            if (relativeDate) {
                dueDate = relativeDate;
            } else {
                // If not a relative date, check if it matches moment.js format
                if (this.settings.momentFormatCleanupPatterns) {
                    const momentPatterns = this.settings.momentFormatCleanupPatterns
                        .split(",")
                        .map(pattern => pattern.trim());
                    
                    for (const pattern of momentPatterns) {
                        try {
                            // Extract the prefix and moment format
                            const prefixMatch = pattern.match(/^\[(.*?)\]/);
                            const prefix = prefixMatch ? prefixMatch[1] : "";
                            const momentFormat = prefixMatch
                                ? pattern.slice(prefixMatch[0].length)
                                : pattern;

                            if (rawDate.match(new RegExp(momentFormat))) {
                                dueDate = rawDate;
                                break;
                            }
                        } catch (e) {
                            console.warn(`Invalid moment.js format pattern: ${pattern}`, e);
                        }
                    }
                }
                
                // If not a moment.js format, use as standard date
                if (!dueDate) {
                    dueDate = rawDate;
                }
            }

            // Check if date is in the past and show warning if enabled
            if (dueDate && this.settings.warnPastDueDate && this.isDateInPast(dueDate)) {
                new Notice("Task due date is in the past. Consider updating it before syncing.");
            }

            text = text.replace(dataviewDueMatch[0], "");
        } else if (this.settings.setTodayAsDefaultDueDate) {
            // Set today as default due date if enabled
            dueDate = new Date().toISOString().split('T')[0];
        }

        // Extract and remove priority in dataview format [p::1], allowing for spaces
        let priority: number | null = null;
        const dataviewPriorityMatch = text.match(
            new RegExp(
                `\\[\\s*${this.settings.dataviewPriorityKey}\\s*::\\s*([^\\]]+)\\s*\\]`,
            ),
        );
        if (dataviewPriorityMatch) {
            const priorityStr = dataviewPriorityMatch[1].trim().toLowerCase();
            priority = this.parsePriority(priorityStr);
            text = text.replace(dataviewPriorityMatch[0], "");
        }

        // Remove dataview cleanup keys if defined
        if (this.settings.dataviewCleanupKeys) {
            const keys = this.settings.dataviewCleanupKeys
                .split(",")
                .map((key) => key.trim());
            for (const key of keys) {
                if (key) {
                    // Match any value after the key (including dates, text, tags, etc.)
                    // Allow spaces around key, ::, and value
                    // Allow tags (#) in both key and value
                    const keyPattern = new RegExp(
                        `\\[\\s*(?:#)?${key}(?:#[^\\s:\\]]+)*\\s*::\\s*([^\\]]*)\\s*\\]`,
                        "g",
                    );
                    text = text.replace(keyPattern, "");
                }
            }
        }

        // Remove Moment.js format patterns if defined
        if (this.settings.momentFormatCleanupPatterns) {
            const patterns = this.settings.momentFormatCleanupPatterns
                .split(",")
                .map((pattern) => pattern.trim());
            for (const pattern of patterns) {
                if (pattern) {
                    try {
                        // Extract the prefix (text and emojis in brackets) and the Moment.js format
                        const prefixMatch = pattern.match(/^\[(.*?)\]/);
                        const prefix = prefixMatch ? prefixMatch[1] : "";
                        const momentFormat = prefixMatch
                            ? pattern.slice(prefixMatch[0].length)
                            : pattern;

                        // Convert Moment.js format to regex pattern
                        const regexPattern = momentFormat
                            .replace(/YYYY/g, "\\d{4}")
                            .replace(/MM/g, "\\d{2}")
                            .replace(/DD/g, "\\d{2}")
                            .replace(/HH/g, "\\d{2}")
                            .replace(/mm/g, "\\d{2}")
                            .replace(/ss/g, "\\d{2}")
                            .replace(/T/g, "T");

                        // Create the full pattern with optional prefix
                        const fullPattern = prefix
                            ? new RegExp(`${prefix}\\s*${regexPattern}`, "g")
                            : new RegExp(regexPattern, "g");

                        text = text.replace(fullPattern, "");
                    } catch (e) {
                        console.warn(
                            `Invalid Moment.js format pattern: ${pattern}`,
                            e,
                        );
                    }
                }
            }
        }

        // Apply custom cleanup patterns
        if (this.settings.taskTextCleanupPatterns.length > 0) {
            for (const pattern of this.settings.taskTextCleanupPatterns) {
                if (pattern.trim()) {
                    // Only process non-empty patterns
                    try {
                        const regex = new RegExp(pattern.trim(), "gu");
                        text = text.replace(regex, "");
                    } catch (e) {
                        console.warn(`Invalid regex pattern: ${pattern}`, e);
                    }
                }
            }
        }

        // Apply default cleanup patterns if enabled
        if (this.settings.useDefaultTaskTextCleanupPatterns) {
            // Remove checkbox
            text = text.replace(/^[\s-]*\[[ x?/-]\]/, "");

            // Remove timestamp with 📝 emoji (but don't use it as due date)
            text = text.replace(/📝\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/, "");

            // Remove block ID
            text = text.replace(/\^[a-zA-Z0-9-]+$/, "");

            // Remove tags
            text = text.replace(/#[^\s]+/g, "");

            // Remove any remaining emojis
            text = text.replace(
                /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
                "",
            );
        }

        // Clean up extra spaces and trim
        text = text.replace(/\s+/g, " ").trim();

        return {
            cleanText: text,
            dueDate: dueDate,
            priority: priority,
        };
    }

    private parsePriority(priorityStr: string): number | null {
        // Convert input to lowercase for case-insensitive matching
        const lowercaseInput = priorityStr.toLowerCase();

        // Look up the Todoist UI priority (1-4) in the mapping
        for (const [key, value] of Object.entries(
            this.settings.priorityMapping,
        )) {
            if (key.toLowerCase() === lowercaseInput) {
                return value; // Return UI priority (1=highest, 4=lowest)
            }
        }

        return null;
    }

    private parseDueDate(dateStr: string): string | null {
        // Implement date parsing logic here
        // For now, just return the date string
        return dateStr;
    }

    private cleanupTaskText(text: string): string {
        // Implement task text cleanup logic here
        // For now, just return the original text
        return text;
    }
}
