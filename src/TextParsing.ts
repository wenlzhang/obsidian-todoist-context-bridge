import { TodoistContextBridgeSettings } from "./main";

export interface TaskDetails {
    cleanText: string;
    dueDate: string | null;
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

    public extractTaskDetails(taskText: string): TaskDetails {
        let text = taskText;

        // Extract and remove due date in dataview format [due::YYYY-MM-DD]
        let dueDate: string | null = null;
        const dataviewDueMatch = text.match(
            new RegExp(
                `\\[${this.settings.dataviewDueDateKey}::(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)\\]`,
            ),
        );
        if (dataviewDueMatch) {
            dueDate = dataviewDueMatch[1];
            text = text.replace(dataviewDueMatch[0], "");
        }

        // Remove dataview cleanup keys if defined
        if (this.settings.dataviewCleanupKeys) {
            const keys = this.settings.dataviewCleanupKeys.split(",").map(key => key.trim());
            for (const key of keys) {
                if (key) {
                    // Match any value after the key (including dates, text, etc.)
                    const keyPattern = new RegExp(`\\[${key}::([^\\]]+)\\]`, "g");
                    text = text.replace(keyPattern, "");
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
        };
    }
}
