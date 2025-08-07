import { Editor } from "obsidian";
import { TODOIST_CONSTANTS } from "./constants";
import { TextParsing } from "./TextParsing";

/**
 * Unified utilities for task location and Todoist ID extraction
 * Consolidates all task location logic across the codebase
 */
export class TaskLocationUtils {
    private textParsing: TextParsing;

    constructor(textParsing: TextParsing) {
        this.textParsing = textParsing;
    }

    /**
     * Robust task location using Todoist ID-first strategy
     * This is the unified method for finding tasks across the codebase
     */
    findTaskByTodoistId(
        contentLines: string[],
        todoistId: string,
        hintLineNumber?: number,
    ): { taskLineIndex: number; taskLineContent: string } | null {
        // Strategy 1: Check hint line first (optimization for journal-tracked tasks)
        if (
            hintLineNumber !== undefined &&
            hintLineNumber >= 0 &&
            hintLineNumber < contentLines.length
        ) {
            const hintLine = contentLines[hintLineNumber];
            if (this.textParsing.isTaskLine(hintLine)) {
                const foundId = this.findTodoistIdInSubItems(
                    contentLines,
                    hintLineNumber,
                );
                if (foundId === todoistId) {
                    return {
                        taskLineIndex: hintLineNumber,
                        taskLineContent: hintLine,
                    };
                }
            }
        }

        // Strategy 2: Scan entire file for Todoist ID, then find task line above it
        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];

            // Check if this line contains our Todoist ID
            const linkMatch = line.match(TODOIST_CONSTANTS.LINK_PATTERN);
            if (linkMatch && linkMatch[1] === todoistId) {
                // Found the Todoist ID! Now find the task line above it
                const taskLineIndex = this.findTaskLineForTodoistLink(
                    contentLines,
                    i,
                );
                if (taskLineIndex !== null) {
                    return {
                        taskLineIndex,
                        taskLineContent: contentLines[taskLineIndex],
                    };
                }
            }
        }

        return null;
    }

    /**
     * Find Todoist ID in sub-items of a task
     * Consolidated from ChangeDetector's enhanced version with flexible search
     */
    findTodoistIdInSubItems(
        lines: string[],
        taskLineIndex: number,
    ): string | null {
        const taskIndentation = this.textParsing.getLineIndentation(
            lines[taskLineIndex],
        );

        // Enhanced search: Look in a wider scope to catch more link patterns
        for (let i = taskLineIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            const lineIndentation = this.textParsing.getLineIndentation(line);

            // Check if line is empty or just whitespace - continue searching
            if (line.trim() === "") {
                continue;
            }

            // Stop if we've reached a line with same or less indentation (non-empty)
            if (lineIndentation.length <= taskIndentation.length) {
                // But first check this line too - sometimes links are at same level
                const sameLevelMatch = line.match(
                    TODOIST_CONSTANTS.LINK_PATTERN,
                );
                if (sameLevelMatch && i === taskLineIndex + 1) {
                    // Link immediately after task on same level is likely related
                    return sameLevelMatch[1];
                }
                break;
            }

            // Look for Todoist task link using multiple patterns
            const taskIdMatch = line.match(TODOIST_CONSTANTS.LINK_PATTERN);
            if (taskIdMatch) {
                const foundId = taskIdMatch[1];

                // Validate: Todoist task IDs can be numeric (V1) or alphanumeric (V2)
                if (!/^[\w-]+$/.test(foundId)) {
                    console.warn(
                        `[TASK LOCATION] ⚠️ Invalid task ID format '${foundId}' - should be alphanumeric`,
                    );
                    return null;
                }

                return foundId;
            }

            // Also check for alternative link formats that might be missed (supports both V1 and V2 IDs)
            const alternativeMatch = line.match(
                /todoist\.com.*?task.*?([\w-]+)/i,
            );
            if (alternativeMatch) {
                const foundId = alternativeMatch[1];
                return foundId;
            }
        }

        return null;
    }

    /**
     * Find Todoist ID from Editor (backward compatibility with TodoistTaskSync)
     */
    getTodoistTaskIdFromEditor(
        editor: Editor,
        taskLine: number,
    ): string | null {
        // Convert editor content to lines array for unified processing
        const totalLines = editor.lineCount();
        const lines: string[] = [];
        for (let i = 0; i < totalLines; i++) {
            lines.push(editor.getLine(i));
        }

        return this.findTodoistIdInSubItems(lines, taskLine);
    }

    /**
     * Extract Todoist ID from a task line and its sub-items
     * Unified method supporting both direct line checking and sub-item scanning
     */
    extractTodoistIdFromLine(
        taskLine: string,
        allLines: string[],
        startLineIndex: number,
    ): string | null {
        // Check if the task line itself contains a Todoist link
        const todoistLinkMatch = taskLine.match(TODOIST_CONSTANTS.LINK_PATTERN);
        if (todoistLinkMatch) {
            return todoistLinkMatch[1];
        }

        // Use unified sub-item search
        return this.findTodoistIdInSubItems(allLines, startLineIndex);
    }

    /**
     * Find the task line that corresponds to a Todoist link
     * The task line is typically the nearest line above with less indentation
     */
    private findTaskLineForTodoistLink(
        contentLines: string[],
        linkLineIndex: number,
    ): number | null {
        const linkLine = contentLines[linkLineIndex];
        const linkIndentation = this.textParsing.getLineIndentation(linkLine);

        // Search backwards from the link to find the parent task
        for (let i = linkLineIndex - 1; i >= 0; i--) {
            const line = contentLines[i];
            const lineIndentation = this.textParsing.getLineIndentation(line);

            // Skip empty lines
            if (line.trim() === "") {
                continue;
            }

            // If we find a line with less indentation that's a task, that's our parent
            if (
                lineIndentation.length < linkIndentation.length &&
                this.textParsing.isTaskLine(line)
            ) {
                return i;
            }

            // If we find a line with same or less indentation that's not a task, we've gone too far
            if (lineIndentation.length <= linkIndentation.length) {
                break;
            }
        }

        return null;
    }

    /**
     * Get line indentation (delegated to TextParsing for consistency)
     */
    private getLineIndentation(line: string): string {
        return this.textParsing.getLineIndentation(line);
    }
}
