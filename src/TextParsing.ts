import { Notice } from "obsidian";
import { TodoistContextBridgeSettings } from "./Settings";
import { DateProcessing } from "./DateProcessing";
import { RegexPatterns } from "./RegexPatterns";

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

    public extractBlockId(line: string): string | null {
        const match = line.match(this.blockIdRegex);
        return match ? match[1] : null;
    }

    public extractTaskDetails(taskText: string): TaskDetails {
        let text = taskText;

        // Initialize due date as null
        let dueDate: string | null = null;
        let tasksPluginDate: string | null = null;
        let dataviewDate: string | null = null;

        // Extract and remove due date in Tasks plugin format if enabled
        if (this.settings.enableTasksPluginDueDate) {
            const tasksPluginDueMatch = text.match(
                /(📅)\s*(\d{4}-\d{2}-\d{2})/
            );

            if (tasksPluginDueMatch) {
                const rawDate = tasksPluginDueMatch[2].trim();
                const validationResult = DateProcessing.validateAndFormatDate(rawDate);

                if (validationResult) {
                    tasksPluginDate = validationResult.formattedDate;

                    if (validationResult.isInPast && this.settings.warnPastDueDate) {
                        new Notice(
                            "Task due date is in the past. Consider updating it before syncing."
                        );
                    }
                }
                text = text.replace(tasksPluginDueMatch[0], "");
            }
        }

        // Check for DataView format due date
        const dataviewDueMatch = text.match(
            new RegExp(
                `\\[\\s*${this.settings.dataviewDueDateKey}\\s*::\\s*(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)\\s*\\]`,
            )
        );

        if (dataviewDueMatch) {
            const rawDate = dataviewDueMatch[1].trim();
            const validationResult = DateProcessing.validateAndFormatDate(rawDate);

            if (validationResult) {
                dataviewDate = validationResult.formattedDate;

                if (validationResult.isInPast && this.settings.warnPastDueDate) {
                    new Notice(
                        "Task due date is in the past. Consider updating it before syncing."
                    );
                }
            }
            text = text.replace(dataviewDueMatch[0], "");
        }

        // Set today as default due date if enabled and no due date found in either format
        if (!dueDate && this.settings.setTodayAsDefaultDueDate) {
            dueDate = DateProcessing.getTodayFormatted();
        }

        // Remove dataview cleanup keys if defined
        if (this.settings.dataviewCleanupKeys) {
            const keys = this.settings.dataviewCleanupKeys
                .split(",")
                .map((key) => key.trim());
            for (const key of keys) {
                if (key) {
                    const keyPattern = new RegExp(
                        `\\[\\s*(?:#)?${key}(?:#[^\\s:\\]]+)*\\s*::\\s*([^\\]]*)\\s*\\]`,
                        "g",
                    );
                    text = text.replace(keyPattern, "");
                }
            }
        }

        // Clean up Tasks plugin date markers if defined
        if (this.settings.tasksDateMarkers) {
            // Use RegexPatterns class for consistent pattern matching
            const tasksDatePattern = RegexPatterns.createTasksDateMarkersPattern(
                this.settings.tasksDateMarkers
            );
            text = text.replace(new RegExp(tasksDatePattern, 'g'), "");

            // Also process each marker individually for thorough cleanup
            const markers = this.settings.tasksDateMarkers
                .split(",")
                .map(marker => marker.trim())
                .filter(marker => marker.length > 0);
            
            for (const marker of markers) {
                // Escape the marker for regex and create pattern for the marker with its date
                const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = new RegExp(
                    `${escapedMarker}\\s*\\d{4}-\\d{2}-\\d{2}(?:(?:T|\\s+)\\d{2}:\\d{2}(?::\\d{2})?)?`,
                    "g"
                );
                text = text.replace(pattern, "");
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
                        // Extract the prefix and moment format
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
                            `Invalid moment.js format pattern: ${pattern}`,
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
                ""
            );
        }

        // Clean up extra spaces and trim
        text = text.replace(/\s+/g, " ").trim();

        // Extract and remove priority in dataview format [p::1], allowing for spaces
        let priority: number | null = null;
        
        // Check for Tasks plugin priority if enabled
        if (this.settings.enableTasksPluginPriority) {
            // Match any of the Tasks plugin priority emojis
            const tasksPluginPriorityMatch = text.match(/(⏬|🔽|🔼|⏫|🔺)/);
            if (tasksPluginPriorityMatch) {
                const priorityEmoji = tasksPluginPriorityMatch[1];
                // Get priority from mapping
                priority = this.settings.priorityMapping[priorityEmoji] || null;
                // Remove the emoji from text
                text = text.replace(priorityEmoji, "");
            }
        }

        // Check for Dataview priority if no Tasks plugin priority found
        if (!priority) {
            const dataviewPriorityMatch = text.match(
                new RegExp(
                    `\\[\\s*${this.settings.dataviewPriorityKey}\\s*::\\s*([^\\]]+)\\s*\\]`
                )
            );
            if (dataviewPriorityMatch) {
                const priorityStr = dataviewPriorityMatch[1].trim().toLowerCase();
                priority = this.parsePriority(priorityStr);
                text = text.replace(dataviewPriorityMatch[0], "");
            }
        }

        // Remove dataview cleanup keys if defined
        if (this.settings.dataviewCleanupKeys) {
            const keys = this.settings.dataviewCleanupKeys
                .split(",")
                .map((key) => key.trim());
            for (const key of keys) {
                if (key) {
                    const keyPattern = new RegExp(
                        `\\[\\s*(?:#)?${key}(?:#[^\\s:\\]]+)*\\s*::\\s*([^\\]]*)\\s*\\]`,
                        "g",
                    );
                    text = text.replace(keyPattern, "");
                }
            }
        }

        // Determine which date to use based on settings and availability
        if (tasksPluginDate && dataviewDate) {
            // Both formats present, use preferred format
            dueDate = this.settings.preferredDueDateFormat === 'tasks' 
                ? tasksPluginDate 
                : dataviewDate;
        } else {
            // Use whichever format is available
            dueDate = tasksPluginDate || dataviewDate;
        }

        return {
            cleanText: text,
            dueDate: dueDate,
            priority: priority,
        };
    }

    /**
     * Validates if a string is a valid Obsidian tag name
     * @param tagName The tag name to validate (without the # prefix)
     * @returns boolean indicating if the tag name is valid
     */
    isValidObsidianTag(tagName: string): boolean {
        if (!tagName || tagName.trim().length === 0) {
            return false;
        }
        // Remove # prefix if present
        tagName = tagName.replace(/^#/, "");
        // Only allow alphanumeric characters, underscores, and hyphens
        return /^[A-Za-z0-9_-]+$/.test(tagName);
    }

    /**
     * Validates an Obsidian tag and returns validation result with error message if invalid
     * @param tagName The tag name to validate (without the # prefix)
     * @returns Object containing validation result and error message if invalid
     */
    validateObsidianTag(tagName: string): {
        isValid: boolean;
        errorMessage: string;
    } {
        if (!tagName) {
            return { isValid: true, errorMessage: "" };
        }

        tagName = tagName.trim();

        if (tagName.startsWith("#")) {
            return {
                isValid: false,
                errorMessage: "Please enter the tag name without the # symbol!",
            };
        }

        if (tagName.endsWith(" ")) {
            return {
                isValid: false,
                errorMessage: "Tag name cannot end with a space!",
            };
        }

        if (!this.isValidObsidianTag(tagName)) {
            return {
                isValid: false,
                errorMessage:
                    "Tag name can only contain letters, numbers, hyphens, and underscores!",
            };
        }

        return { isValid: true, errorMessage: "" };
    }

    /**
     * Validates if a string is a valid Todoist label
     * @param label The label to validate
     * @returns boolean indicating if the label is valid
     */
    isValidTodoistLabel(label: string): boolean {
        if (!label || label.trim().length === 0) {
            return true; // Empty label is valid as it's optional
        }
        // Remove # prefix if present
        label = label.replace(/^#/, "");
        // Allow alphanumeric characters, underscores, hyphens, and spaces
        // with a maximum length of 60 characters (Todoist's limit)
        return /^[\w\s-]{1,60}$/.test(label);
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
}
