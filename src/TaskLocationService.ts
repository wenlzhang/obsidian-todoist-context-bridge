import { App, TFile } from "obsidian";
import { TaskSyncEntry } from "./SyncJournal";
import { TextParsing } from "./TextParsing";
import { URILinkProcessing } from "./URILinkProcessing";
import { TODOIST_CONSTANTS } from "./constants";

/**
 * TaskLocationService - Centralized service for all task location and identification logic
 *
 * This service handles:
 * - Block ID-based task location (primary method)
 * - Line number fallback for legacy compatibility
 * - Task content reading and status detection
 * - Robust task recovery and re-discovery
 *
 * Replaces fragile line number-based approaches with stable block ID references.
 */
export class TaskLocationService {
    constructor(
        private app: App,
        private textParsing: TextParsing,
        private uriLinkProcessing: URILinkProcessing,
    ) {}

    /**
     * Find a task in Obsidian file by block ID (primary method)
     * Falls back to Todoist ID search if block ID not found
     */
    async findTaskByBlockId(
        file: TFile,
        blockId: string,
        todoistId?: string,
    ): Promise<{ line: number; content: string } | null> {
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            // Primary: Search by block ID
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const extractedBlockId = this.extractBlockId(line);
                if (extractedBlockId === blockId) {
                    // Verify it's actually a task line
                    const taskStatus = this.textParsing.getTaskStatus(line);
                    if (taskStatus === "completed" || taskStatus === "open") {
                        return { line: i, content: line };
                    }
                }
            }

            // Fallback: Search by Todoist ID if provided
            if (todoistId) {
                console.log(
                    `[TASK LOCATION] Block ID ${blockId} not found, falling back to Todoist ID search`,
                );
                return await this.findTaskByTodoistId(file, todoistId);
            }

            return null;
        } catch (error) {
            console.error(
                `[TASK LOCATION] Error finding task by block ID ${blockId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Find a task in Obsidian file by Todoist ID (fallback method)
     * Used when block ID is not available or not found
     */
    async findTaskByTodoistId(
        file: TFile,
        todoistId: string,
    ): Promise<{ line: number; content: string } | null> {
        try {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Check if this line contains the Todoist ID
                if (line.includes(todoistId)) {
                    // Verify it's actually a task line
                    const taskStatus = this.textParsing.getTaskStatus(line);
                    if (taskStatus === "completed" || taskStatus === "open") {
                        return { line: i, content: line };
                    }
                }
            }

            return null;
        } catch (error) {
            console.error(
                `[TASK LOCATION] Error finding task by Todoist ID ${todoistId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Get task content and status using the most reliable method available
     * Prioritizes block ID, falls back to Todoist ID search, then line number (legacy)
     */
    async getTaskContent(taskEntry: TaskSyncEntry): Promise<{
        line: number;
        content: string;
        blockId?: string;
        needsJournalUpdate: boolean;
    } | null> {
        try {
            const file = this.app.vault.getAbstractFileByPath(
                taskEntry.obsidianFile,
            ) as TFile;
            if (!file) {
                console.log(
                    `[TASK LOCATION] File not found: ${taskEntry.obsidianFile}`,
                );
                return null;
            }

            let result: { line: number; content: string } | null = null;
            let needsJournalUpdate = false;

            // Method 1: Try block ID if available
            if (taskEntry.obsidianBlockId) {
                result = await this.findTaskByBlockId(
                    file,
                    taskEntry.obsidianBlockId,
                    taskEntry.todoistId,
                );
                if (result) {
                    console.log(
                        `[TASK LOCATION] ✅ Task found by block ID: ${taskEntry.todoistId}`,
                    );
                } else {
                    console.log(
                        `[TASK LOCATION] Block ID ${taskEntry.obsidianBlockId} not found, trying fallback methods`,
                    );
                }
            }

            // Method 2: Try Todoist ID search if block ID failed (more reliable than line number)
            if (!result) {
                result = await this.findTaskByTodoistId(
                    file,
                    taskEntry.todoistId,
                );
                if (result) {
                    console.log(
                        `[TASK LOCATION] Task found by Todoist ID search: ${taskEntry.todoistId} at line ${result.line}`,
                    );
                    needsJournalUpdate = true;

                    // Extract block ID from found line for future use
                    const blockId = this.extractBlockId(result.content);
                    if (blockId) {
                        console.log(
                            `[TASK LOCATION] Found block ID ${blockId} for task ${taskEntry.todoistId}`,
                        );
                    }
                } else {
                    console.log(
                        `[TASK LOCATION] Todoist ID search failed for ${taskEntry.todoistId}, trying line number fallback`,
                    );
                }
            }

            // Method 3: Try line number as last resort (legacy fallback)
            if (!result && taskEntry.obsidianLine !== undefined) {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                if (taskEntry.obsidianLine < lines.length) {
                    const lineContent = lines[taskEntry.obsidianLine];
                    // Verify this line contains the expected task
                    if (lineContent.includes(taskEntry.todoistId)) {
                        result = {
                            line: taskEntry.obsidianLine,
                            content: lineContent,
                        };
                        console.log(
                            `[TASK LOCATION] Task found by line number fallback: ${taskEntry.todoistId}`,
                        );

                        // Extract block ID from this line for future use
                        const blockId = this.extractBlockId(lineContent);
                        if (blockId && !taskEntry.obsidianBlockId) {
                            needsJournalUpdate = true;
                            console.log(
                                `[TASK LOCATION] Found block ID ${blockId} for task ${taskEntry.todoistId}`,
                            );
                        }
                    } else {
                        console.log(
                            `[TASK LOCATION] Line ${taskEntry.obsidianLine} doesn't contain expected task ${taskEntry.todoistId}`,
                        );
                    }
                }
            }

            if (!result) {
                console.warn(
                    `[TASK LOCATION] Task not found: ${taskEntry.todoistId} in ${taskEntry.obsidianFile}`,
                );
                return null;
            }

            // Extract block ID from the found content
            const blockId = this.extractBlockId(result.content);

            return {
                line: result.line,
                content: result.content,
                blockId: blockId || undefined,
                needsJournalUpdate,
            };
        } catch (error) {
            console.error(
                `[TASK LOCATION] Error getting task content for ${taskEntry.todoistId}:`,
                error,
            );
            return null;
        }
    }

    // ==========================================
    // CONSOLIDATED ID EXTRACTION METHODS
    // ==========================================

    /**
     * Extract block ID from a task line
     * Consolidated from TextParsing.extractBlockId()
     */
    extractBlockId(line: string): string | null {
        const match = line.match(/\^([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    }

    /**
     * Extract Todoist ID from sub-items of a task (enhanced with flexible search)
     * Consolidated from ChangeDetector.findTodoistIdInSubItems()
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
     * Get UID from file frontmatter
     * Consolidated from UIDProcessing.getUidFromFile()
     * Note: Accessing settings through constructor parameter instead of private property
     */
    getUidFromFile(file: TFile, uidField: string): string | null {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const existingUid = frontmatter?.[uidField];
        return existingUid && existingUid.trim() !== "" ? existingUid : null;
    }

    /**
     * Find file by UID across the entire vault
     * Consolidated from UIDProcessing.findFileByUid()
     * Used for robust file tracking when files are moved
     */
    findFileByUid(uid: string, uidField: string): TFile | null {
        const markdownFiles = this.app.vault.getMarkdownFiles();

        for (const file of markdownFiles) {
            const fileUid = this.getUidFromFile(file, uidField);
            if (fileUid === uid) {
                return file;
            }
        }

        return null;
    }

    /**
     * Validate and update task location information
     * Returns updated location data that should be saved to journal
     */
    async validateTaskLocation(taskEntry: TaskSyncEntry): Promise<{
        obsidianLine?: number;
        obsidianBlockId?: string;
        lastPathValidation?: number;
        isValid: boolean;
    }> {
        const taskContent = await this.getTaskContent(taskEntry);

        if (!taskContent) {
            return { isValid: false };
        }

        const updates: any = {
            isValid: true,
            lastPathValidation: Date.now(),
        };

        // Update line number if it changed
        if (taskContent.line !== taskEntry.obsidianLine) {
            updates.obsidianLine = taskContent.line;
        }

        // Update or add block ID if available
        if (
            taskContent.blockId &&
            taskContent.blockId !== taskEntry.obsidianBlockId
        ) {
            updates.obsidianBlockId = taskContent.blockId;
        }

        return updates;
    }
}
