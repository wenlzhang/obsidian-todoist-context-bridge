import { TFile } from "obsidian";
import { Task } from "@doist/todoist-api-typescript";
import { TaskSyncEntry, TaskSyncEntryUtils } from "./SyncJournal";
import { TextParsing } from "./TextParsing";
import { TaskLocationService } from "./TaskLocationService";
import { TodoistContextBridgeSettings } from "./Settings";

/**
 * Centralized factory for creating TaskSyncEntry objects
 * Eliminates duplication and ensures consistency across the codebase
 */
export class TaskSyncEntryFactory {
    constructor(
        private textParsing: TextParsing,
        private taskLocationService: TaskLocationService,
        private settings: TodoistContextBridgeSettings,
    ) {}

    /**
     * Generate content hash for change detection
     * @deprecated Use TaskSyncEntryUtils.generateContentHash instead
     */
    private generateContentHash(content: string): string {
        return TaskSyncEntryUtils.generateContentHash(content);
    }

    /**
     * Determine completion state category for optimization and transparency
     * @deprecated Use TaskSyncEntryUtils.determineCompletionState instead
     */
    private determineCompletionState(
        obsidianCompleted: boolean,
        todoistCompleted: boolean,
    ): TaskSyncEntry["completionState"] {
        return TaskSyncEntryUtils.determineCompletionState(obsidianCompleted, todoistCompleted);
    }

    /**
     * Create a comprehensive TaskSyncEntry from Todoist task and Obsidian file data
     * This is the primary method for creating new task entries
     * ✅ INTEGRATED: Uses prioritized file location and task location strategies
     */
    async createComprehensiveEntry(
        todoistId: string,
        todoistTask: Task,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry> {
        const now = Date.now();

        // ✅ PRIORITIZED STRATEGY: Use TaskLocationService for robust file and task handling
        const fileUid = this.taskLocationService.getUidFromFile(
            file,
            this.settings.uidField,
        );
        const blockId = this.taskLocationService.extractBlockId(lineContent);

        // Create preliminary entry for validation
        const preliminaryEntry: TaskSyncEntry = {
            todoistId,
            obsidianNoteId: fileUid || "",
            obsidianFile: file.path,
            obsidianLine: lineIndex,
            obsidianBlockId: blockId || undefined,
            obsidianCompleted: false, // Will be validated
            todoistCompleted: todoistTask.isCompleted ?? false,
            completionState: "both-open", // Will be determined
            lastObsidianCheck: now,
            lastTodoistCheck: now,
            lastSyncOperation: 0,
            obsidianContentHash: "", // Will be generated
            todoistContentHash: "", // Will be generated
            todoistDueDate: todoistTask.due?.date,
            discoveredAt: now,
            firstSyncAt: undefined,
            lastPathValidation: now,
            isOrphaned: false,
            orphanedAt: undefined,
            hasBeenBothCompleted: false, // 🔒 COMPLETION FINALITY: Initialize as false for new entries
        };

        // ✅ PRIORITIZED VALIDATION: Use TaskLocationService to validate and enhance entry
        const taskContent = await this.taskLocationService.getTaskContent(
            preliminaryEntry,
            this.settings.uidField,
        );

        if (!taskContent) {
            // Fallback to direct content analysis if prioritized location fails
            console.warn(
                `[TASK SYNC FACTORY] Prioritized location failed for ${todoistId}, using fallback`,
            );
            return this.createFallbackEntry(
                todoistId,
                todoistTask,
                file,
                lineIndex,
                lineContent,
            );
        }

        // ✅ ENHANCED ENTRY: Use validated content and location data
        const obsidianCompleted =
            this.textParsing.getTaskStatus(taskContent.content) === "completed";
        const todoistCompleted = todoistTask.isCompleted ?? false;

        // Generate content hashes from validated content
        const obsidianContentHash = this.generateContentHash(
            taskContent.content,
        );
        const todoistContentHash = this.generateContentHash(
            todoistTask.content,
        );

        // Determine completion state category
        const completionState = this.determineCompletionState(
            obsidianCompleted,
            todoistCompleted,
        );

        return {
            // Task identification - enhanced with prioritized location data
            todoistId,
            obsidianNoteId: fileUid || "",
            obsidianFile: file.path,
            obsidianLine: taskContent.line, // ✅ Use validated line from prioritized location
            obsidianBlockId: taskContent.blockId || blockId || undefined, // ✅ Prioritized block ID

            // Current completion state - validated through prioritized strategy
            obsidianCompleted,
            todoistCompleted,
            completionState,

            // Tracking metadata
            lastObsidianCheck: now,
            lastTodoistCheck: now,
            lastSyncOperation: 0,

            // Change detection hashes - from validated content
            obsidianContentHash,
            todoistContentHash,

            // Due date for smart filtering
            todoistDueDate: todoistTask.due?.date,

            // Creation tracking
            discoveredAt: now,
            firstSyncAt: undefined, // Will be set when first sync operation occurs

            // File tracking for moves - enhanced with prioritized validation
            lastPathValidation: taskContent.needsJournalUpdate
                ? now
                : preliminaryEntry.lastPathValidation,

            // Orphaned task tracking
            isOrphaned: false,
            orphanedAt: undefined, // Will be set if task becomes orphaned
        };
    }

    /**
     * Create fallback entry when prioritized location strategies fail
     * Uses direct content analysis as last resort
     */
    private createFallbackEntry(
        todoistId: string,
        todoistTask: Task,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): TaskSyncEntry {
        const now = Date.now();

        // Direct content analysis (fallback approach)
        const obsidianCompleted =
            this.textParsing.getTaskStatus(lineContent) === "completed";
        const todoistCompleted = todoistTask.isCompleted ?? false;

        // Direct file UID and block ID extraction
        const fileUid = this.taskLocationService.getUidFromFile(
            file,
            this.settings.uidField,
        );
        const blockId = this.taskLocationService.extractBlockId(lineContent);

        // Generate content hashes
        const obsidianContentHash = this.generateContentHash(lineContent);
        const todoistContentHash = this.generateContentHash(
            todoistTask.content,
        );

        // Determine completion state category
        const completionState = this.determineCompletionState(
            obsidianCompleted,
            todoistCompleted,
        );

        return {
            // Task identification
            todoistId,
            obsidianNoteId: fileUid || "",
            obsidianFile: file.path,
            obsidianLine: lineIndex,
            obsidianBlockId: blockId || undefined,

            // Current completion state
            obsidianCompleted,
            todoistCompleted,
            completionState,

            // Tracking metadata
            lastObsidianCheck: now,
            lastTodoistCheck: now,
            lastSyncOperation: 0,

            // Change detection hashes
            obsidianContentHash,
            todoistContentHash,

            // Due date for smart filtering
            todoistDueDate: todoistTask.due?.date,

            // Creation tracking
            discoveredAt: now,
            firstSyncAt: undefined,

            // File tracking for moves
            lastPathValidation: now,

            // Orphaned task tracking
            isOrphaned: false,
            orphanedAt: undefined,

            // 🔒 COMPLETION FINALITY: Initialize as false for new entries
            hasBeenBothCompleted: false,
        };
    }

    /**
     * Create a minimal TaskSyncEntry for temporary operations (e.g., retry queue processing)
     * Only includes essential fields needed for task location
     */
    createMinimalEntry(
        todoistId: string,
        obsidianFile: string,
        obsidianLine: number,
        existingEntry?: Partial<TaskSyncEntry>,
    ): TaskSyncEntry {
        // Use base entry creation utility to reduce duplication
        const baseEntry = TaskSyncEntryUtils.createBaseEntry(
            todoistId,
            existingEntry?.obsidianNoteId || "",
            obsidianFile,
            obsidianLine,
            0, // Use 0 for minimal entries (will be updated later)
        );

        // Override specific fields for minimal entry behavior
        return {
            ...baseEntry,
            obsidianBlockId: existingEntry?.obsidianBlockId,
            hasBeenBothCompleted: existingEntry?.hasBeenBothCompleted ?? false,
        };
    }

    /**
     * Create TaskSyncEntry from bulk data processing
     * Optimized for performance during bulk operations
     */
    createFromBulkData(
        todoistId: string,
        todoistTask: any,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): TaskSyncEntry {
        const now = Date.now();

        // Extract completion states
        const obsidianCompleted =
            this.textParsing.getTaskStatus(lineContent) === "completed";
        const todoistCompleted = todoistTask.isCompleted ?? false;

        // Get file UID (no block ID extraction for performance)
        const fileUid = this.taskLocationService.getUidFromFile(
            file,
            this.settings.uidField,
        );

        // Generate content hashes
        const obsidianContentHash = this.generateContentHash(lineContent);
        const todoistContentHash = this.generateContentHash(
            todoistTask.content,
        );

        // Determine completion state category
        const completionState = this.determineCompletionState(
            obsidianCompleted,
            todoistCompleted,
        );

        return {
            // Task identification
            todoistId,
            obsidianNoteId: fileUid || "",
            obsidianFile: file.path,
            obsidianLine: lineIndex,
            // Note: obsidianBlockId not extracted for performance in bulk operations

            // Current completion state
            obsidianCompleted,
            todoistCompleted,
            completionState,

            // Tracking metadata
            lastObsidianCheck: now,
            lastTodoistCheck: now,
            lastSyncOperation: 0,

            // Change detection hashes
            obsidianContentHash,
            todoistContentHash,

            // Due date for smart filtering
            todoistDueDate: todoistTask.due?.date,

            // Creation tracking
            discoveredAt: now,
            firstSyncAt: undefined, // Will be set when first sync operation occurs

            // File tracking for moves
            lastPathValidation: now,

            // Orphaned task tracking
            isOrphaned: false,
            orphanedAt: undefined, // Will be set if task becomes orphaned

            // 🔒 COMPLETION FINALITY: Initialize as false for new entries
            hasBeenBothCompleted: false,
        };
    }

    /**
     * Update existing TaskSyncEntry with new data
     * Preserves important metadata while updating changed fields
     */
    updateEntry(
        existingEntry: TaskSyncEntry,
        updates: Partial<TaskSyncEntry>,
    ): TaskSyncEntry {
        const now = Date.now();

        // Create updated entry
        const updatedEntry: TaskSyncEntry = {
            ...existingEntry,
            ...updates,
        };

        // Update completion state if completion status changed
        if (
            updates.obsidianCompleted !== undefined ||
            updates.todoistCompleted !== undefined
        ) {
            updatedEntry.completionState = this.determineCompletionState(
                updatedEntry.obsidianCompleted,
                updatedEntry.todoistCompleted,
            );
        }

        // Update check timestamps if content changed
        if (updates.obsidianContentHash !== undefined) {
            updatedEntry.lastObsidianCheck = now;
        }
        if (updates.todoistContentHash !== undefined) {
            updatedEntry.lastTodoistCheck = now;
        }

        return updatedEntry;
    }
}
