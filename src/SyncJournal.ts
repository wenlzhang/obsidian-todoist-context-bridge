/**
 * Sync Journal - Persistent state tracking for efficient bidirectional sync
 * Inspired by Readwise and Hypothesis plugin patterns
 */

import { TFile } from "obsidian";

/**
 * Main sync journal structure - persisted to file
 */
export interface SyncJournal {
    version: string;
    lastSyncTimestamp: number;
    lastObsidianScan: number;
    lastTodoistSync: number;

    // Task registry - all known linked tasks
    tasks: Record<string, TaskSyncEntry>;

    // Permanently deleted/inaccessible tasks - never sync these again
    deletedTasks: Record<string, DeletedTaskEntry>;

    // Pending operations queue
    pendingOperations: SyncOperation[];

    // Failed operations for retry
    failedOperations: SyncOperation[];

    // Sync statistics
    stats: SyncStats;
}

/**
 * Individual task entry in the sync journal
 */
export interface TaskSyncEntry {
    // Task identification
    todoistId: string;
    obsidianNoteId: string; // Primary identifier - note ID from frontmatter
    obsidianFile: string; // Secondary identifier - file path (updated when file moves)
    obsidianLine: number;

    // Current completion state
    obsidianCompleted: boolean;
    todoistCompleted: boolean;

    // Tracking metadata
    lastObsidianCheck: number;
    lastTodoistCheck: number;
    lastSyncOperation: number;

    // Change detection hashes
    obsidianContentHash: string;
    todoistContentHash: string;

    // Due date for smart filtering
    todoistDueDate?: string;

    // Creation tracking
    discoveredAt: number;
    firstSyncAt?: number;

    // File tracking for moves
    lastPathValidation?: number;
}

/**
 * Permanently deleted or inaccessible task entry
 */
export interface DeletedTaskEntry {
    todoistId: string;
    reason: "deleted" | "inaccessible" | "user_removed";
    deletedAt: number;
    lastObsidianFile?: string; // Where it was last seen in Obsidian
    httpStatus?: number; // 404, 403, etc.
    notes?: string; // Optional notes about deletion
}

/**
 * Sync operation for queue processing
 */
export interface SyncOperation {
    id: string;
    type: "obsidian_to_todoist" | "todoist_to_obsidian";
    taskId: string;
    timestamp: number;
    status: "pending" | "completed" | "failed";
    retryCount: number;
    error?: string;

    // Operation-specific data
    data?: {
        newCompletionState?: boolean;
        todoistCompletedAt?: string;
        obsidianContent?: string;
    };
}

/**
 * Sync statistics for monitoring
 */
export interface SyncStats {
    totalTasks: number;
    newTasksFound: number;
    operationsCompleted: number;
    operationsFailed: number;
    lastSyncDuration: number;
    totalSyncOperations: number;

    // Operation tracking (for command display)
    successfulOperations: number;
    failedOperations: number;
    lastSyncTimestamp: number | null;

    // Performance metrics
    averageSyncDuration: number;
    tasksProcessedLastSync: number;
    apiCallsLastSync: number;
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
    newTasks: TaskSyncEntry[];
    modifiedTasks: TaskSyncEntry[];
    operations: SyncOperation[];
}

/**
 * Sync progress information
 */
export interface SyncProgress {
    phase: "discovery" | "change_detection" | "operations" | "complete";
    currentOperation?: string;
    completedOperations: number;
    totalOperations: number;
    errors: string[];
    startTime: number;
}

/**
 * Default empty sync journal
 */
export const DEFAULT_SYNC_JOURNAL: SyncJournal = {
    version: "1.1.0", // Updated version for deleted task tracking
    lastSyncTimestamp: 0,
    lastObsidianScan: 0,
    lastTodoistSync: 0,
    tasks: {},
    deletedTasks: {}, // New section for permanently deleted tasks
    pendingOperations: [],
    failedOperations: [],
    stats: {
        totalTasks: 0,
        newTasksFound: 0,
        operationsCompleted: 0,
        operationsFailed: 0,
        lastSyncDuration: 0,
        totalSyncOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        lastSyncTimestamp: null,
        averageSyncDuration: 0,
        tasksProcessedLastSync: 0,
        apiCallsLastSync: 0,
    },
};
