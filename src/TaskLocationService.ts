import { App, TFile } from "obsidian";
import { TextParsing } from "./TextParsing";
import { URILinkProcessing } from "./URILinkProcessing";
import { TaskSyncEntry } from "./SyncJournal";
import { RegexPatterns } from "./RegexPatterns";
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
     * OPTIMIZED: Single file read with cached content
     */
    async findTaskByBlockId(
        file: TFile,
        blockId: string,
        todoistId?: string,
    ): Promise<{ line: number; content: string } | null> {
        try {
            // ✅ OPTIMIZATION: Single file read for all location methods
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            // Primary: Search by block ID using cached content
            const blockResult = this.findTaskByBlockIdInLines(lines, blockId);
            if (blockResult) {
                return blockResult;
            }

            // Fallback: Search by Todoist ID if provided (using same cached content)
            if (todoistId) {
                console.log(
                    `[TASK LOCATION] Block ID ${blockId} not found, falling back to Todoist ID search`,
                );
                return this.findTaskByTodoistIdInLines(lines, todoistId);
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
     * OPTIMIZED: Single file read with cached content
     */
    async findTaskByTodoistId(
        file: TFile,
        todoistId: string,
    ): Promise<{ line: number; content: string } | null> {
        try {
            // ✅ OPTIMIZATION: Single file read, then use cached content method
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            return this.findTaskByTodoistIdInLines(lines, todoistId);
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
     * OPTIMIZED: Single file read with cached content for all location methods
     * FILE LOCATION: Prioritized strategy (UID first, then file path)
     */
    async getTaskContent(
        taskEntry: TaskSyncEntry,
        uidField: string,
    ): Promise<{
        line: number;
        content: string;
        blockId?: string;
        needsJournalUpdate: boolean;
        fileLocationMethod?: "uid" | "path" | "updated";
    } | null> {
        try {
            // ✅ PRIORITIZED FILE LOCATION STRATEGY
            const fileLocationResult = this.findFileByPrioritizedStrategy(
                taskEntry,
                uidField,
            );
            if (!fileLocationResult.file) {
                console.log(
                    `[TASK LOCATION] File not found for task ${taskEntry.todoistId}`,
                );
                return null;
            }

            const { file, method, needsFilePathUpdate } = fileLocationResult;

            // ✅ OPTIMIZATION: Single file read for all location methods
            const fileContent = await this.app.vault.read(file);
            const lines = fileContent.split("\n");

            // Try all location methods with cached file content
            const result = this.findTaskInCachedContent(taskEntry, lines);

            if (!result) {
                console.log(
                    `[TASK LOCATION] Task not found: ${taskEntry.todoistId}`,
                );
                return null;
            }

            // Extract block ID from result if not already present
            const blockId = this.extractBlockId(result.content);
            const needsJournalUpdate =
                result.needsJournalUpdate ||
                !!(blockId && !taskEntry.obsidianBlockId) ||
                needsFilePathUpdate;

            return {
                line: result.line,
                content: result.content,
                blockId: blockId || undefined,
                needsJournalUpdate,
                fileLocationMethod: method,
            };
        } catch (error) {
            console.error(
                `[TASK LOCATION] Error getting task content for ${taskEntry.todoistId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Find file using prioritized strategy: UID first, then file path fallback
     * This addresses the architectural gap in file location robustness
     * STRATEGY: obsidianNoteId (UID) → obsidianFile (path) → validation & update
     */
    findFileByPrioritizedStrategy(
        taskEntry: TaskSyncEntry,
        uidField: string,
    ): {
        file: TFile | null;
        method: "uid" | "path" | "updated";
        needsFilePathUpdate: boolean;
    } {
        // Strategy 1: Try UID-based lookup first (most robust, survives file moves)
        if (taskEntry.obsidianNoteId) {
            const fileByUid = this.findFileByUid(
                taskEntry.obsidianNoteId,
                uidField,
            );
            if (fileByUid) {
                // Check if file path needs updating in journal
                const needsFilePathUpdate =
                    fileByUid.path !== taskEntry.obsidianFile;
                return {
                    file: fileByUid,
                    method: needsFilePathUpdate ? "updated" : "uid",
                    needsFilePathUpdate,
                };
            }
        }

        // Strategy 2: Fallback to file path lookup
        const fileByPath = this.app.vault.getAbstractFileByPath(
            taskEntry.obsidianFile,
        ) as TFile;
        if (fileByPath) {
            return {
                file: fileByPath,
                method: "path",
                needsFilePathUpdate: false,
            };
        }

        // Strategy 3: File not found by either method
        return {
            file: null,
            method: "path",
            needsFilePathUpdate: false,
        };
    }

    /**
     * Find task in cached file content using all available location methods
     * OPTIMIZATION: All location methods use the same cached content (no additional file reads)
     */
    private findTaskInCachedContent(
        taskEntry: TaskSyncEntry,
        lines: string[],
    ): { line: number; content: string; needsJournalUpdate: boolean } | null {
        // Method 1: Try block ID if available (highest priority)
        if (taskEntry.obsidianBlockId) {
            const blockResult = this.findTaskByBlockIdInLines(
                lines,
                taskEntry.obsidianBlockId,
            );
            if (blockResult) {
                console.log(
                    `[TASK LOCATION] ✅ Task found by block ID: ${taskEntry.todoistId}`,
                );
                return { ...blockResult, needsJournalUpdate: false };
            } else {
                console.log(
                    `[TASK LOCATION] Block ID ${taskEntry.obsidianBlockId} not found, trying fallback methods`,
                );
            }
        }

        // Method 2: Try Todoist ID search (medium priority)
        const todoistResult = this.findTaskByTodoistIdInLines(
            lines,
            taskEntry.todoistId,
        );
        if (todoistResult) {
            console.log(
                `[TASK LOCATION] Task found by Todoist ID search: ${taskEntry.todoistId} at line ${todoistResult.line}`,
            );

            // Extract block ID from found line for future use
            const blockId = this.extractBlockId(todoistResult.content);
            if (blockId) {
                console.log(
                    `[TASK LOCATION] Found block ID ${blockId} for task ${taskEntry.todoistId}`,
                );
            }

            return { ...todoistResult, needsJournalUpdate: true };
        } else {
            console.log(
                `[TASK LOCATION] Todoist ID search failed for ${taskEntry.todoistId}, trying line number fallback`,
            );
        }

        // Method 3: Try line number as last resort (lowest priority)
        if (
            taskEntry.obsidianLine !== undefined &&
            taskEntry.obsidianLine < lines.length
        ) {
            const lineContent = lines[taskEntry.obsidianLine];
            // Verify this line contains the expected task
            if (lineContent.includes(taskEntry.todoistId)) {
                console.log(
                    `[TASK LOCATION] Task found by line number fallback: ${taskEntry.todoistId}`,
                );

                // Extract block ID from this line for future use
                const blockId = this.extractBlockId(lineContent);
                const needsJournalUpdate = !!(
                    blockId && !taskEntry.obsidianBlockId
                );
                if (needsJournalUpdate) {
                    console.log(
                        `[TASK LOCATION] Found block ID ${blockId} for task ${taskEntry.todoistId}`,
                    );
                }

                return {
                    line: taskEntry.obsidianLine,
                    content: lineContent,
                    needsJournalUpdate,
                };
            } else {
                console.log(
                    `[TASK LOCATION] Line ${taskEntry.obsidianLine} doesn't contain expected task ${taskEntry.todoistId}`,
                );
            }
        }

        return null;
    }

    /**
     * Find task by block ID in cached lines (no file read)
     */
    private findTaskByBlockIdInLines(
        lines: string[],
        blockId: string,
    ): { line: number; content: string } | null {
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
        return null;
    }

    /**
     * Find task by Todoist ID in cached lines (no file read)
     */
    private findTaskByTodoistIdInLines(
        lines: string[],
        todoistId: string,
    ): { line: number; content: string } | null {
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
    }

    /**
     * Extract block ID from a task line
     * Uses centralized regex pattern from RegexPatterns
     * Updated to handle timestamp-based block IDs like ^2025-08-02T19-46-53
     */
    extractBlockId(line: string): string | null {
        const match = line.match(RegexPatterns.BLOCK_ID_PATTERN);
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
    async validateTaskLocation(
        taskEntry: TaskSyncEntry,
        uidField: string,
    ): Promise<{
        obsidianLine?: number;
        obsidianBlockId?: string;
        lastPathValidation?: number;
        isValid: boolean;
    }> {
        const taskContent = await this.getTaskContent(taskEntry, uidField);

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
