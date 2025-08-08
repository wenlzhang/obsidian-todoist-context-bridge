import { TFile } from "obsidian";
import { Task } from "@doist/todoist-api-typescript";
import { TaskSyncEntry } from "./SyncJournal";
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
     */
    private generateContentHash(content: string): string {
        // Simple hash function for content change detection
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Determine completion state category for optimization and transparency
     */
    private determineCompletionState(
        obsidianCompleted: boolean,
        todoistCompleted: boolean,
    ): TaskSyncEntry["completionState"] {
        if (obsidianCompleted && todoistCompleted) {
            return "both-completed";
        } else if (obsidianCompleted && !todoistCompleted) {
            return "obsidian-completed-todoist-open";
        } else if (!obsidianCompleted && todoistCompleted) {
            return "obsidian-open-todoist-completed";
        } else {
            return "both-open";
        }
    }

    /**
     * Create a comprehensive TaskSyncEntry from Todoist task and Obsidian file data
     * This is the primary method for creating new task entries
     */
    async createComprehensiveEntry(
        todoistId: string,
        todoistTask: Task,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry> {
        const now = Date.now();

        // Extract completion states
        const obsidianCompleted =
            this.textParsing.getTaskStatus(lineContent) === "completed";
        const todoistCompleted = todoistTask.isCompleted ?? false;

        // Get file UID and block ID
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
            firstSyncAt: undefined, // Will be set when first sync operation occurs

            // File tracking for moves
            lastPathValidation: now,

            // Orphaned task tracking
            isOrphaned: false,
            orphanedAt: undefined, // Will be set if task becomes orphaned
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
        return {
            // Task identification
            todoistId,
            obsidianNoteId: existingEntry?.obsidianNoteId || "",
            obsidianFile,
            obsidianLine,
            obsidianBlockId: existingEntry?.obsidianBlockId,

            // Minimal completion state (will be updated later)
            obsidianCompleted: false,
            todoistCompleted: false,
            completionState: "both-open",

            // Minimal tracking metadata
            lastObsidianCheck: 0,
            lastTodoistCheck: 0,
            lastSyncOperation: 0,

            // Empty hashes (will be updated later)
            obsidianContentHash: "",
            todoistContentHash: "",

            // Minimal creation tracking
            discoveredAt: 0,
            firstSyncAt: undefined, // Will be set when first sync operation occurs

            // File tracking for moves
            lastPathValidation: 0,

            // Orphaned task tracking
            isOrphaned: false,
            orphanedAt: undefined, // Will be set if task becomes orphaned
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
