import { App, TFile } from "obsidian";
import { TextParsing } from "./TextParsing";
import { URILinkProcessing } from "./URILinkProcessing";
import { TaskSyncEntry } from "./SyncJournal";

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
                const extractedBlockId = this.textParsing.extractBlockId(line);
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
                    const blockId = this.textParsing.extractBlockId(
                        result.content,
                    );
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
                        const blockId =
                            this.textParsing.extractBlockId(lineContent);
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
            const blockId = this.textParsing.extractBlockId(result.content);

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

    /**
     * Extract block ID from a task line, creating one if it doesn't exist
     * This ensures all tasks have stable block ID references
     */
    async ensureTaskHasBlockId(
        file: TFile,
        lineNumber: number,
        taskContent: string,
    ): Promise<string | null> {
        try {
            // Check if task already has a block ID
            const existingBlockId =
                this.textParsing.extractBlockId(taskContent);
            if (existingBlockId) {
                return existingBlockId;
            }

            // Task doesn't have block ID - we would need an editor to create one
            // For now, return null and log that block ID creation is needed
            console.log(
                `[TASK LOCATION] 📝 Task at line ${lineNumber} needs block ID creation`,
            );
            return null;
        } catch (error) {
            console.error(
                `[TASK LOCATION] Error ensuring block ID for task at line ${lineNumber}:`,
                error,
            );
            return null;
        }
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
