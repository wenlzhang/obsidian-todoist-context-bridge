/**
 * ChangeDetector - Intelligent detection of new tasks and completion status changes
 */

import { App, TFile } from "obsidian";
import {
    TaskSyncEntry,
    SyncOperation,
    ChangeDetectionResult,
} from "./SyncJournal";
import { TodoistContextBridgeSettings } from "./Settings";
import { TextParsing } from "./TextParsing";
import { TodoistV2IDs } from "./TodoistV2IDs";
import { UIDProcessing } from "./UIDProcessing";
import { URILinkProcessing } from "./URILinkProcessing";
import { TaskLocationService } from "./TaskLocationService";
import { TaskSyncEntryFactory } from "./TaskSyncEntryFactory";
import { TODOIST_CONSTANTS } from "./constants";
import { createHash } from "crypto";
import { Notice } from "obsidian";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { SyncJournalManager } from "./SyncJournalManager";

export class ChangeDetector {
    private app: App;
    private settings: TodoistContextBridgeSettings;
    private textParsing: TextParsing;
    private todoistApi: TodoistApi;
    private journalManager: SyncJournalManager;
    private uidProcessing: UIDProcessing;
    private todoistV2IDs: TodoistV2IDs;
    private taskLocationService: TaskLocationService;
    private taskSyncEntryFactory: TaskSyncEntryFactory;
    private retryQueue: Map<
        string,
        {
            todoistId: string;
            file: string;
            line: number;
            attempts: number;
            lastAttempt: number;
        }
    > = new Map();

    // API call tracking for monitoring
    private apiCallCount = 0;
    private lastApiCallReset = Date.now();

    // Bulk data caching for efficient comprehensive entry creation
    private lastBulkActiveTaskMap: Record<string, any> = {};
    private lastBulkCompletedTaskMap: Record<string, any> = {};

    // Deleted task tracking is now handled permanently in the journal

    constructor(
        app: App,
        settings: TodoistContextBridgeSettings,
        textParsing: TextParsing,
        todoistApi: TodoistApi,
        journalManager: SyncJournalManager,
    ) {
        this.app = app;
        this.settings = settings;
        this.textParsing = textParsing;
        this.todoistApi = todoistApi;
        this.journalManager = journalManager;
        this.uidProcessing = new UIDProcessing(settings, app);
        this.todoistV2IDs = new TodoistV2IDs(settings);

        // Initialize TaskLocationService with required dependencies
        const uriLinkProcessing = new URILinkProcessing(
            app,
            this.uidProcessing,
            settings,
            textParsing,
        );
        this.taskLocationService = new TaskLocationService(
            app,
            textParsing,
            uriLinkProcessing,
        );

        // Initialize TaskSyncEntryFactory for consolidated entry creation
        this.taskSyncEntryFactory = new TaskSyncEntryFactory(
            textParsing,
            this.taskLocationService,
            settings,
        );
    }

    /**
     * Add failed task discovery to retry queue for future attempts
     */
    private async addToRetryQueue(
        todoistId: string,
        filePath: string,
        lineNumber: number,
    ): Promise<void> {
        const key = `${todoistId}:${filePath}:${lineNumber}`;
        const existing = this.retryQueue.get(key);

        if (existing) {
            // Update existing entry
            existing.attempts += 1;
            existing.lastAttempt = Date.now();

            // Remove from queue after 3 failed attempts to prevent infinite retries
            if (existing.attempts >= 3) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Removing task ${todoistId} from retry queue after ${existing.attempts} failed attempts`,
                );
                this.retryQueue.delete(key);
                return;
            }
        } else {
            // Add new entry
            this.retryQueue.set(key, {
                todoistId,
                file: filePath,
                line: lineNumber,
                attempts: 1,
                lastAttempt: Date.now(),
            });
        }

        // Only log on first attempt to reduce console noise
        // Removed verbose retry queue logging
    }

    /**
     * Ensure journal completeness by adding placeholder entries for all linked tasks
     * This addresses the architectural gap where linked tasks might exist in vault
     * but not be tracked in journal due to API failures or other issues
     */
    private async ensureJournalCompleteness(): Promise<void> {
        const knownTasks = this.journalManager.getAllTasks();
        const allFiles = this.app.vault.getMarkdownFiles();
        let placeholdersAdded = 0;

        // Ensuring journal completeness

        for (const file of allFiles) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Check if this is a task line
                    if (this.textParsing.isTaskLine(line)) {
                        // Look for Todoist link in subsequent lines
                        const todoistId =
                            this.taskLocationService.findTodoistIdInSubItems(
                                lines,
                                i,
                            );

                        if (todoistId && !knownTasks[todoistId]) {
                            // This linked task is not in journal - add comprehensive entry
                            const comprehensiveTask =
                                await this.createComprehensiveTaskEntry(
                                    todoistId,
                                    file,
                                    i,
                                    line,
                                );

                            if (comprehensiveTask) {
                                await this.journalManager.addTask(
                                    comprehensiveTask,
                                );
                                placeholdersAdded++;
                                // Added placeholder for task
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error ensuring completeness for ${file.path}:`,
                    error,
                );
            }
        }

        if (placeholdersAdded > 0) {
            await this.journalManager.saveJournal();
            // Added placeholder entries to ensure journal completeness
        }
    }

    /**
     * Create a comprehensive task entry with full Todoist data (replaces placeholder approach)
     * Ensures consistency with journal validation entries by fetching complete task information
     */
    private async createComprehensiveTaskEntry(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry | null> {
        try {
            const now = Date.now();
            const obsidianCompleted =
                this.textParsing.getTaskStatus(lineContent) === "completed";
            const fileUid = this.taskLocationService.getUidFromFile(
                file,
                this.settings.uidField,
            );

            // 🚫 CRITICAL: Check if task is already marked as deleted in journal
            // This prevents unnecessary API calls for known deleted tasks
            if (this.journalManager.isTaskDeleted(todoistId)) {
                // Skip deleted tasks silently
                return null;
            }

            // 🎯 FIVE-CATEGORY OPTIMIZATION: Check if we should process this task based on existing journal data
            const existingTask =
                this.journalManager.getTaskByTodoistId(todoistId);
            if (existingTask) {
                const completionState =
                    this.getTaskCompletionState(existingTask);

                // Category 4: both-completed - respect user setting
                if (
                    completionState === "both-completed" &&
                    !this.settings.trackBothCompletedTasks
                ) {
                    return null;
                }

                // Category 5: deleted - already handled above
                if (completionState === "deleted") {
                    return null;
                }

                // For existing tasks, check if we should make API call based on timing and category
                if (!this.shouldCheckTodoistTaskNow(existingTask)) {
                    return existingTask; // Return existing data instead of making API call
                }
            }

            // First try to get task from existing bulk data if available
            let todoistTask = null;
            if (
                this.lastBulkActiveTaskMap &&
                this.lastBulkActiveTaskMap[todoistId]
            ) {
                todoistTask = this.lastBulkActiveTaskMap[todoistId];
                // Using cached bulk data
            } else if (
                this.lastBulkCompletedTaskMap &&
                this.lastBulkCompletedTaskMap[todoistId]
            ) {
                todoistTask = this.lastBulkCompletedTaskMap[todoistId];
                // Using cached completed bulk data
            } else {
                // Fallback to individual API call for comprehensive data
                // Fetching individual task data
                todoistTask = await this.getTodoistTaskWithRetry(todoistId);
            }

            if (!todoistTask) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Could not fetch task data for ${todoistId} - task may be deleted`,
                );
                return null;
            }

            // Create comprehensive entry using consolidated factory
            const comprehensiveEntry =
                await this.taskSyncEntryFactory.createComprehensiveEntry(
                    todoistId,
                    todoistTask,
                    file,
                    lineIndex,
                    lineContent,
                );

            // Log block ID capture for debugging
            if (comprehensiveEntry.obsidianBlockId) {
                console.log(
                    `[CHANGE DETECTOR] 📝 Captured block ID ${comprehensiveEntry.obsidianBlockId} for new task ${todoistId}`,
                );
            } else {
                console.log(
                    `[CHANGE DETECTOR] ⚠️ No block ID found for new task ${todoistId} - will rely on fallback methods`,
                );
            }

            // Entry created successfully - reduced logging
            return comprehensiveEntry;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error creating comprehensive entry for ${todoistId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Process retry queue during change detection
     */
    private async processRetryQueue(): Promise<TaskSyncEntry[]> {
        const retriedTasks: TaskSyncEntry[] = [];
        const now = Date.now();
        const retryDelay = 5 * 60 * 1000; // 5 minutes between retries

        for (const [key, entry] of this.retryQueue.entries()) {
            // Only retry if enough time has passed
            if (now - entry.lastAttempt < retryDelay) {
                continue;
            }

            try {
                // Try to get existing task data from journal to include block ID
                const existingTask = this.journalManager.getTaskByTodoistId(
                    entry.todoistId,
                );

                // Create a temporary task entry for TaskLocationService lookup using factory
                const tempTaskEntry =
                    this.taskSyncEntryFactory.createMinimalEntry(
                        entry.todoistId,
                        entry.file,
                        entry.line - 1, // Convert to 0-based index
                        existingTask || undefined, // Pass existing task data for block ID and note ID
                    );

                // Log block ID usage for debugging
                if (existingTask?.obsidianBlockId) {
                    console.log(
                        `[CHANGE DETECTOR] 📝 Using block ID ${existingTask.obsidianBlockId} for retry queue task ${entry.todoistId}`,
                    );
                } else {
                    console.log(
                        `[CHANGE DETECTOR] ⚠️ No block ID available for retry queue task ${entry.todoistId} - using fallback methods`,
                    );
                }

                // Use TaskLocationService for robust task location
                const taskContent =
                    await this.taskLocationService.getTaskContent(
                        tempTaskEntry,
                        this.settings.uidField,
                    );
                if (!taskContent) {
                    // Task no longer exists, remove from queue
                    this.retryQueue.delete(key);
                    continue;
                }

                const file = this.app.vault.getAbstractFileByPath(
                    entry.file,
                ) as TFile;
                if (!file) {
                    // File no longer exists, remove from queue
                    this.retryQueue.delete(key);
                    continue;
                }

                const newTask = await this.createTaskSyncEntry(
                    entry.todoistId,
                    file,
                    taskContent.line, // Use discovered line from TaskLocationService
                    taskContent.content,
                );

                if (newTask) {
                    retriedTasks.push(newTask);
                    this.retryQueue.delete(key);
                } else {
                    // Update attempt count, will be removed if max attempts reached
                    await this.addToRetryQueue(
                        entry.todoistId,
                        entry.file,
                        entry.line,
                    );
                }

                // Small delay between retries
                await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error processing retry for ${entry.todoistId}:`,
                    error,
                );
                // Update attempt count
                await this.addToRetryQueue(
                    entry.todoistId,
                    entry.file,
                    entry.line,
                );
            }
        }

        return retriedTasks;
    }

    /**
     * Recover orphaned tasks that may still be valid
     * This method checks all orphaned tasks and attempts to recover them if they exist in both systems
     */
    async recoverOrphanedTasks(): Promise<void> {
        const allTasks = this.journalManager.getAllTasks();
        const orphanedTasks = Object.values(allTasks).filter(
            (task) => task.isOrphaned,
        );

        if (orphanedTasks.length === 0) {
            return;
        }

        let recoveredCount = 0;
        for (const task of orphanedTasks) {
            const recovered = await this.attemptOrphanedTaskRecovery(task);
            if (recovered) {
                recoveredCount++;
            }
        }

        if (recoveredCount > 0) {
            console.log(
                `[CHANGE DETECTOR] ✅ Recovered ${recoveredCount} orphaned tasks`,
            );
            await this.journalManager.saveJournal();
        }
    }

    /**
     * Perform efficient change detection focused on sync operations
     */
    async detectChanges(): Promise<ChangeDetectionResult> {
        const result: ChangeDetectionResult = {
            newTasks: [],
            modifiedTasks: [],
            operations: [],
        };

        const startTime = Date.now();
        const startApiCalls = this.apiCallCount;
        // Starting change detection - reduced logging

        try {
            // 1. Discover new tasks in Obsidian (only if needed)
            result.newTasks = await this.discoverNewTasks();

            // 1a. Process retry queue for previously failed discoveries
            const retriedTasks = await this.processRetryQueue();
            if (retriedTasks.length > 0) {
                result.newTasks.push(...retriedTasks);
                // Successfully recovered tasks from retry queue
            }

            // 1b. Ensure journal completeness: Add placeholder entries for failed discoveries
            // This ensures ALL linked tasks are tracked in journal, even if API calls fail
            await this.ensureJournalCompleteness();

            // 1c. Add newly discovered tasks to journal (critical for journal integrity)
            if (result.newTasks.length > 0) {
                for (const task of result.newTasks) {
                    await this.journalManager.addTask(task);
                }
                await this.journalManager.saveJournal();
            } else {
                // Even if no new tasks, save the updated scan time
                await this.journalManager.saveJournal();
            }

            // 2. Detect changes in known tasks - focus on tasks that need sync
            const tasksNeedingCheck = this.journalManager.getTasksNeedingSync();
            let checkedTasks = 0;

            for (const taskEntry of tasksNeedingCheck) {
                const changes = await this.detectTaskChanges(taskEntry);
                if (changes.length > 0) {
                    result.operations.push(...changes);
                    result.modifiedTasks.push(taskEntry);
                }
                checkedTasks++;
            }

            const duration = Date.now() - startTime;
            const apiCallsMade = this.apiCallCount - startApiCalls;
            const summary = [];
            if (result.newTasks.length > 0)
                summary.push(`${result.newTasks.length} new tasks`);
            if (result.operations.length > 0)
                summary.push(`${result.operations.length} sync operations`);

            // Only log when changes are actually found
            if (summary.length > 0) {
                // Change detection completed
            }

            // Update journal stats
            if (apiCallsMade > 0) {
                this.journalManager.updateStats({
                    apiCallsLastSync: apiCallsMade,
                    tasksProcessedLastSync: checkedTasks,
                });
            }
        } catch (error) {
            console.error(
                "[CHANGE DETECTOR] Error during change detection:",
                error,
            );
            throw error;
        }

        return result;
    }

    /**
     * Discover new tasks in Obsidian files
     */
    async discoverNewTasks(): Promise<TaskSyncEntry[]> {
        const newTasks: TaskSyncEntry[] = [];
        const knownTasks = this.journalManager.getAllTasks();

        // Get the actual last scan time from journal metadata (not task check times)
        const lastScanTime = this.journalManager.getLastScanTime();
        const isInitialScan = lastScanTime === 0;

        const scanStartTime = Date.now();
        // Reduce verbose logging - only log significant scans
        const shouldLogDetails = isInitialScan || false;

        // Get files to scan with enhanced logic to prevent missing tasks
        const filesToScan = await this.getFilesToScan(lastScanTime);
        const allFiles = this.app.vault.getMarkdownFiles().length;
        const scanType =
            lastScanTime === 0
                ? "initial full scan"
                : filesToScan.length === allFiles
                  ? "forced full scan"
                  : "incremental scan";
        if (shouldLogDetails) {
            console.log(
                `[CHANGE DETECTOR] ${scanType.toUpperCase()}: Scanning ${filesToScan.length}/${allFiles} files for new tasks`,
            );
        }

        for (const file of filesToScan) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Check if this is a task line
                    if (this.textParsing.isTaskLine(line)) {
                        // Look for Todoist link in subsequent lines
                        const todoistId =
                            this.taskLocationService.findTodoistIdInSubItems(
                                lines,
                                i,
                            );

                        if (todoistId && !knownTasks[todoistId]) {
                            // This is a new linked task
                            const newTask = await this.createTaskSyncEntry(
                                todoistId,
                                file,
                                i,
                                line,
                            );

                            if (newTask) {
                                newTasks.push(newTask);
                                // Discovered new task
                            } else {
                                // Add to retry queue for future attempts instead of just logging
                                await this.addToRetryQueue(
                                    todoistId,
                                    file.path,
                                    i + 1,
                                );
                            }
                            // Add small delay to prevent rate limiting
                            await new Promise((resolve) =>
                                setTimeout(resolve, 100),
                            );
                        }
                    }
                }
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error scanning file ${file.path}:`,
                    error,
                );
            }
        }

        // Update the last scan time in memory (but don't save journal yet - let caller handle that)
        const scanEndTime = Date.now();
        const scanDuration = scanEndTime - scanStartTime;
        this.journalManager.updateLastScanTime(scanEndTime);

        // Scan completed - found new linked tasks

        // NOTE: Journal is NOT saved here - caller must handle adding discovered tasks and saving

        return newTasks;
    }

    /**
     * Discover all tasks in a specific file
     */
    async discoverTasksInFile(file: TFile): Promise<TaskSyncEntry[]> {
        const fileTasks: TaskSyncEntry[] = [];

        try {
            // Scanning file for tasks - reduced logging
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check if this is a task line
                if (this.textParsing.isTaskLine(line)) {
                    // Look for Todoist link in subsequent lines
                    const todoistId =
                        this.taskLocationService.findTodoistIdInSubItems(
                            lines,
                            i,
                        );

                    if (todoistId) {
                        // Create task entry for this linked task
                        const taskEntry = await this.createTaskSyncEntry(
                            todoistId,
                            file,
                            i,
                            line,
                        );

                        if (taskEntry) {
                            fileTasks.push(taskEntry);
                            // Task found - will check for changes (logging only if changes detected)
                        }
                    }
                }
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error scanning file ${file.path}:`,
                error,
            );
        }

        return fileTasks;
    }

    /**
     * Detect changes in a specific task (FIXED: Check both directions for existing mismatches)
     * Only makes Todoist API calls when necessary
     */
    async detectTaskChanges(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation[]> {
        const operations: SyncOperation[] = [];

        try {
            // STEP 1: Check Obsidian side for changes (no API call)
            const obsidianChange =
                await this.checkObsidianTaskChange(taskEntry);
            if (obsidianChange) {
                operations.push(obsidianChange);
            }

            // STEP 2: Check Todoist side for changes (with smart filtering)
            // IMPORTANT: Don't skip this even if Obsidian changed - we need to detect existing mismatches
            if (this.shouldCheckTodoistTaskNow(taskEntry)) {
                const todoistChange =
                    await this.checkTodoistTaskChange(taskEntry);
                if (todoistChange) {
                    operations.push(todoistChange);
                }
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error checking task ${taskEntry.todoistId}:`,
                error,
            );
        }

        return operations;
    }

    /**
     * Check for changes in Obsidian task using robust block ID-based location
     */
    private async checkObsidianTaskChange(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation | null> {
        try {
            // Use TaskLocationService for robust task location and content reading
            const taskContent = await this.taskLocationService.getTaskContent(
                taskEntry,
                this.settings.uidField,
            );

            if (!taskContent) {
                console.warn(
                    `[CHANGE DETECTOR] ❌ Task not found: ${taskEntry.todoistId} in ${taskEntry.obsidianFile}`,
                );
                return null;
            }

            // Update journal if location information changed
            if (taskContent.needsJournalUpdate) {
                const updates: any = {
                    lastPathValidation: Date.now(),
                };

                if (taskContent.line !== taskEntry.obsidianLine) {
                    updates.obsidianLine = taskContent.line;
                    console.log(
                        `[CHANGE DETECTOR] 📝 Updated line number for ${taskEntry.todoistId}: ${taskEntry.obsidianLine} → ${taskContent.line}`,
                    );
                }

                if (
                    taskContent.blockId &&
                    taskContent.blockId !== taskEntry.obsidianBlockId
                ) {
                    updates.obsidianBlockId = taskContent.blockId;
                    console.log(
                        `[CHANGE DETECTOR] 📝 Updated block ID for ${taskEntry.todoistId}: ${taskContent.blockId}`,
                    );
                }

                await this.journalManager.updateTask(
                    taskEntry.todoistId,
                    updates,
                );

                // Update local reference for continued processing
                taskEntry.obsidianLine = taskContent.line;
                if (taskContent.blockId) {
                    taskEntry.obsidianBlockId = taskContent.blockId;
                }
            }

            const currentLine = taskContent.content;
            const currentHash = this.generateContentHash(currentLine);

            // Check if content changed
            if (currentHash !== taskEntry.obsidianContentHash) {
                const currentCompleted =
                    this.textParsing.getTaskStatus(currentLine) === "completed";

                // Check if completion status changed
                if (currentCompleted !== taskEntry.obsidianCompleted) {
                    console.log(
                        `[CHANGE DETECTOR] Obsidian status changed for ${taskEntry.todoistId}: ${taskEntry.obsidianCompleted} -> ${currentCompleted}`,
                    );

                    // Update task entry with new completion state
                    const completionState = this.getTaskCompletionState({
                        ...taskEntry,
                        obsidianCompleted: currentCompleted,
                    });

                    // 🔒 COMPLETION FINALITY: Track when tasks achieve both-completed status
                    const journalUpdates: any = {
                        obsidianCompleted: currentCompleted,
                        obsidianContentHash: currentHash,
                        lastObsidianCheck: Date.now(),
                        completionState, // Track completion state for optimization
                    };

                    // Set completion finality flag when both platforms become completed
                    if (completionState === "both-completed" && !taskEntry.hasBeenBothCompleted) {
                        journalUpdates.hasBeenBothCompleted = true;
                        console.log(
                            `[CHANGE DETECTOR] 🔒 Completion finality achieved for ${taskEntry.todoistId} - future reopening will not sync`,
                        );
                    }

                    await this.journalManager.updateTask(taskEntry.todoistId, journalUpdates);

                    // 🔒 COMPLETION FINALITY CHECK: Prevent reopening sync for tasks that have been both-completed
                    if (taskEntry.hasBeenBothCompleted && !currentCompleted && taskEntry.todoistCompleted) {
                        // Task was reopened in Obsidian but has completion finality - don't sync reopening
                        console.log(
                            `[CHANGE DETECTOR] 🔒 Completion finality: Task ${taskEntry.todoistId} reopened in Obsidian but will not sync to Todoist (was previously both-completed)`,
                        );
                        return null; // No sync operation
                    }

                    // Create sync operation for both directions (respecting completion finality)
                    if (currentCompleted && !taskEntry.todoistCompleted) {
                        // Obsidian completed, sync to Todoist (always allowed - moving toward completion)
                        return {
                            id: `obs-to-tod-${taskEntry.todoistId}-${Date.now()}`,
                            type: "obsidian_to_todoist",
                            taskId: taskEntry.todoistId,
                            timestamp: Date.now(),
                            status: "pending",
                            retryCount: 0,
                            data: {
                                newCompletionState: true,
                                obsidianContent: currentLine,
                            },
                        };
                    } else if (
                        !currentCompleted &&
                        taskEntry.todoistCompleted &&
                        !taskEntry.hasBeenBothCompleted
                    ) {
                        // Obsidian uncompleted, sync to Todoist (only if not completion-final)
                        return {
                            id: `obs-to-tod-${taskEntry.todoistId}-${Date.now()}`,
                            type: "obsidian_to_todoist",
                            taskId: taskEntry.todoistId,
                            timestamp: Date.now(),
                            status: "pending",
                            retryCount: 0,
                            data: {
                                newCompletionState: false,
                                obsidianContent: currentLine,
                            },
                        };
                    } else if (currentCompleted && taskEntry.todoistCompleted) {
                        // Both completed - no sync needed, but update journal
                        console.log(
                            `[CHANGE DETECTOR] Both tasks completed for ${taskEntry.todoistId} - no sync needed`,
                        );
                    } else if (
                        !currentCompleted &&
                        !taskEntry.todoistCompleted
                    ) {
                        // Both uncompleted - no sync needed, but update journal
                        console.log(
                            `[CHANGE DETECTOR] Both tasks uncompleted for ${taskEntry.todoistId} - no sync needed`,
                        );
                    }
                } else {
                    // Content changed but not completion status - just update hash
                    await this.journalManager.updateTask(taskEntry.todoistId, {
                        obsidianContentHash: currentHash,
                        lastObsidianCheck: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error checking Obsidian task ${taskEntry.todoistId}:`,
                error,
            );
        }

        return null;
    }

    /**
     * Check for changes in Todoist task (OPTIMIZED: Journal-first approach)
     * Only makes API calls when absolutely necessary based on freshness and priority
     */
    private async checkTodoistTaskChange(
        taskEntry: TaskSyncEntry,
    ): Promise<SyncOperation | null> {
        const now = Date.now();
        const timeSinceLastCheck = now - (taskEntry.lastTodoistCheck || 0);

        // OPTIMIZATION 1: Skip API call if journal data is fresh enough
        const userSyncIntervalMs =
            this.settings.syncIntervalMinutes * 60 * 1000;

        // OPTIMIZATION 2: Check task completion state priority
        const taskState = this.getTaskCompletionState(taskEntry);

        // Skip tasks completed in both sources if user disabled tracking
        if (
            taskState === "both-completed" &&
            !this.settings.trackBothCompletedTasks
        ) {
            return null;
        }

        // OPTIMIZATION 3: Use bulk data if available to avoid individual API call
        let task: any = null;

        // Try to get task from bulk cache first
        if (this.lastBulkActiveTaskMap[taskEntry.todoistId]) {
            task = this.lastBulkActiveTaskMap[taskEntry.todoistId];
            // Using bulk cache - reduced logging
        } else if (this.lastBulkCompletedTaskMap[taskEntry.todoistId]) {
            task = this.lastBulkCompletedTaskMap[taskEntry.todoistId];
            // Using bulk completed cache - reduced logging
        } else {
            // 🚫 CRITICAL: Check if task is already marked as deleted in journal
            // This prevents unnecessary API calls for known deleted tasks
            if (this.journalManager.isTaskDeleted(taskEntry.todoistId)) {
                // Skip deleted task silently
                return null;
            }

            // 🎯 FIVE-CATEGORY OPTIMIZATION: Check completion state and user settings
            const completionState = this.getTaskCompletionState(taskEntry);

            // Category 4: both-completed - respect user setting
            if (
                completionState === "both-completed" &&
                !this.settings.trackBothCompletedTasks
            ) {
                return null;
            }

            // Category 5: deleted - already handled above
            if (completionState === "deleted") {
                return null;
            }

            // Check if we should make API call based on timing and category priority
            if (!this.shouldCheckTodoistTaskNow(taskEntry)) {
                return null;
            }

            // Fallback to individual API call only if necessary
            try {
                task = await this.getTodoistTaskWithRetry(taskEntry.todoistId);
                if (!task) {
                    console.log(
                        `[CHANGE DETECTOR] Task not found via API: ${taskEntry.todoistId}`,
                    );

                    // VALIDATION: Don't immediately orphan - implement grace period and verification
                    const timeSinceLastFound =
                        now -
                        (taskEntry.lastTodoistCheck ||
                            taskEntry.discoveredAt ||
                            0);
                    const ORPHAN_GRACE_PERIOD = 24 * 60 * 60 * 1000; // 24 hours grace period

                    if (timeSinceLastFound < ORPHAN_GRACE_PERIOD) {
                        // Update check time but don't orphan yet
                        await this.journalManager.updateTask(
                            taskEntry.todoistId,
                            {
                                lastTodoistCheck: now,
                            },
                        );
                        return null;
                    }

                    // Only orphan after grace period and if not already orphaned
                    if (!taskEntry.isOrphaned) {
                        console.warn(
                            `[CHANGE DETECTOR] 🏷️ Marking task as orphaned after grace period: ${taskEntry.todoistId}`,
                        );
                        await this.journalManager.updateTask(
                            taskEntry.todoistId,
                            {
                                lastTodoistCheck: now,
                                isOrphaned: true,
                                orphanedAt: now,
                            },
                        );
                    }
                    return null;
                }
                // Individual API call for task not in bulk cache
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error checking Todoist task ${taskEntry.todoistId}:`,
                    error,
                );
                // Don't orphan on API errors - could be temporary network/rate limit issues
                return null;
            }
        }

        const currentCompleted = task.isCompleted ?? false;
        const currentHash = this.generateContentHash(task.content);

        // Check if completion status changed
        if (currentCompleted !== taskEntry.todoistCompleted) {
            console.log(
                `[CHANGE DETECTOR] Todoist status changed for ${taskEntry.todoistId}: ${taskEntry.todoistCompleted} -> ${currentCompleted}`,
            );

            // Update task entry with new completion state
            const completionState = this.getTaskCompletionState({
                ...taskEntry,
                todoistCompleted: currentCompleted,
            });

            // 🔒 COMPLETION FINALITY: Track when tasks achieve both-completed status
            const journalUpdates: any = {
                todoistCompleted: currentCompleted,
                todoistContentHash: currentHash,
                lastTodoistCheck: now,
                todoistDueDate: (task as any).due?.date,
                completionState, // Track completion state for optimization
            };

            // Set completion finality flag when both platforms become completed
            if (completionState === "both-completed" && !taskEntry.hasBeenBothCompleted) {
                journalUpdates.hasBeenBothCompleted = true;
                console.log(
                    `[CHANGE DETECTOR] 🔒 Completion finality achieved for ${taskEntry.todoistId} - future reopening will not sync`,
                );
            }

            await this.journalManager.updateTask(taskEntry.todoistId, journalUpdates);

            // 🔒 COMPLETION FINALITY CHECK: Prevent reopening sync for tasks that have been both-completed
            if (taskEntry.hasBeenBothCompleted && !currentCompleted && taskEntry.obsidianCompleted) {
                // Task was reopened in Todoist but has completion finality - don't sync reopening
                console.log(
                    `[CHANGE DETECTOR] 🔒 Completion finality: Task ${taskEntry.todoistId} reopened in Todoist but will not sync to Obsidian (was previously both-completed)`,
                );
                return null; // No sync operation
            }

            // Create sync operation for both directions (respecting completion finality)
            if (currentCompleted && !taskEntry.obsidianCompleted) {
                // Todoist completed, sync to Obsidian (always allowed - moving toward completion)
                return {
                    id: `tod-to-obs-${taskEntry.todoistId}-${Date.now()}`,
                    type: "todoist_to_obsidian",
                    taskId: taskEntry.todoistId,
                    timestamp: Date.now(),
                    status: "pending",
                    retryCount: 0,
                    data: {
                        newCompletionState: true,
                        todoistCompletedAt:
                            (task as any).completed_at ||
                            (task as any).completedAt,
                    },
                };
            } else if (!currentCompleted && taskEntry.obsidianCompleted && !taskEntry.hasBeenBothCompleted) {
                // Todoist uncompleted, sync to Obsidian (only if not completion-final)
                return {
                    id: `tod-to-obs-${taskEntry.todoistId}-${Date.now()}`,
                    type: "todoist_to_obsidian",
                    taskId: taskEntry.todoistId,
                    timestamp: Date.now(),
                    status: "pending",
                    retryCount: 0,
                    data: {
                        newCompletionState: false,
                        todoistCompletedAt: undefined,
                    },
                };
            } else if (currentCompleted && taskEntry.obsidianCompleted) {
                // Both completed - no sync needed, but update journal
                console.log(
                    `[CHANGE DETECTOR] Both tasks completed for ${taskEntry.todoistId} - no sync needed`,
                );
            } else if (!currentCompleted && !taskEntry.obsidianCompleted) {
                // Both uncompleted - no sync needed, but update journal
                console.log(
                    `[CHANGE DETECTOR] Both tasks uncompleted for ${taskEntry.todoistId} - no sync needed`,
                );
            }
        } else {
            // No Todoist completion status change - check for persistent mismatch with current Obsidian state
            // STEP 1: Double-check current Obsidian state by reading the actual file
            let currentObsidianCompleted: boolean;
            try {
                const file = this.app.vault.getAbstractFileByPath(
                    taskEntry.obsidianFile,
                ) as TFile;
                if (!file) {
                    console.warn(
                        `[CHANGE DETECTOR] File not found for mismatch check: ${taskEntry.obsidianFile}`,
                    );
                    return null;
                }

                // Use TaskLocationService for robust task location
                const taskContent =
                    await this.taskLocationService.getTaskContent(
                        taskEntry,
                        this.settings.uidField,
                    );
                if (!taskContent) {
                    console.warn(
                        `[CHANGE DETECTOR] Task not found for mismatch check: ${taskEntry.todoistId}`,
                    );
                    return null;
                }

                // Update journal if location information changed
                if (taskContent.needsJournalUpdate) {
                    const updates: any = {
                        lastPathValidation: Date.now(),
                    };

                    if (taskContent.line !== taskEntry.obsidianLine) {
                        updates.obsidianLine = taskContent.line;
                    }

                    if (
                        taskContent.blockId &&
                        taskContent.blockId !== taskEntry.obsidianBlockId
                    ) {
                        updates.obsidianBlockId = taskContent.blockId;
                    }

                    await this.journalManager.updateTask(
                        taskEntry.todoistId,
                        updates,
                    );

                    // Update local reference for continued processing
                    taskEntry.obsidianLine = taskContent.line;
                    if (taskContent.blockId) {
                        taskEntry.obsidianBlockId = taskContent.blockId;
                    }
                }

                const currentLine = taskContent.content;
                currentObsidianCompleted =
                    this.textParsing.getTaskStatus(currentLine) === "completed";
            } catch (error) {
                console.error(
                    `[CHANGE DETECTOR] Error reading Obsidian state for ${taskEntry.todoistId}:`,
                    error,
                );
                return null;
            }

            // STEP 2: Compare actual current states (API-verified Todoist vs file-verified Obsidian)
            if (currentCompleted !== currentObsidianCompleted) {
                console.log(
                    `[CHANGE DETECTOR] ✅ Confirmed persistent mismatch for ${taskEntry.todoistId}: Todoist=${currentCompleted}, Obsidian=${currentObsidianCompleted} (journal had: ${taskEntry.obsidianCompleted})`,
                );

                // STEP 3: Update journal with both current states
                const completionState = this.getTaskCompletionState({
                    ...taskEntry,
                    todoistCompleted: currentCompleted,
                    obsidianCompleted: currentObsidianCompleted,
                });

                await this.journalManager.updateTask(taskEntry.todoistId, {
                    todoistCompleted: currentCompleted,
                    obsidianCompleted: currentObsidianCompleted,
                    todoistContentHash: currentHash,
                    lastTodoistCheck: now,
                    lastObsidianCheck: now,
                    todoistDueDate: (task as any).due?.date,
                    completionState,
                });

                // STEP 4: Create sync operation to resolve the confirmed mismatch
                if (currentCompleted && !currentObsidianCompleted) {
                    // Todoist completed, sync to Obsidian
                    return {
                        id: `tod-to-obs-${taskEntry.todoistId}-${Date.now()}`,
                        type: "todoist_to_obsidian",
                        taskId: taskEntry.todoistId,
                        timestamp: Date.now(),
                        status: "pending",
                        retryCount: 0,
                        data: {
                            newCompletionState: true,
                            todoistCompletedAt:
                                (task as any).completed_at ||
                                (task as any).completedAt,
                        },
                    };
                } else if (!currentCompleted && currentObsidianCompleted) {
                    // Obsidian completed, Todoist uncompleted - sync FROM Obsidian TO Todoist
                    return {
                        id: `obs-to-tod-${taskEntry.todoistId}-${Date.now()}`,
                        type: "obsidian_to_todoist",
                        taskId: taskEntry.todoistId,
                        timestamp: Date.now(),
                        status: "pending",
                        retryCount: 0,
                        data: {
                            newCompletionState: true,
                            obsidianContent: undefined, // Will be filled by sync service
                        },
                    };
                }
            } else if (
                currentObsidianCompleted !== taskEntry.obsidianCompleted
            ) {
                // No mismatch between sources, but journal had stale Obsidian state - update it
                console.log(
                    `[CHANGE DETECTOR] 📝 Journal had stale Obsidian state for ${taskEntry.todoistId}: updating ${taskEntry.obsidianCompleted} -> ${currentObsidianCompleted}`,
                );

                const completionState = this.getTaskCompletionState({
                    ...taskEntry,
                    obsidianCompleted: currentObsidianCompleted,
                });

                await this.journalManager.updateTask(taskEntry.todoistId, {
                    obsidianCompleted: currentObsidianCompleted,
                    lastObsidianCheck: now,
                    completionState,
                });
            }
        }

        // No completion status change - only update journal if other meaningful changes
        const updates: Partial<TaskSyncEntry> = {
            lastTodoistCheck: now,
        };

        let hasContentChanges = false;

        // Check if content hash changed
        if (currentHash !== taskEntry.todoistContentHash) {
            updates.todoistContentHash = currentHash;
            hasContentChanges = true;
        }

        // Check if due date changed
        const newDueDate = (task as any).due?.date;
        if (newDueDate !== taskEntry.todoistDueDate) {
            updates.todoistDueDate = newDueDate;
            hasContentChanges = true;
        }

        // Always update completion state for optimization tracking
        const completionState = this.getTaskCompletionState(taskEntry);
        if (completionState !== taskEntry.completionState) {
            updates.completionState = completionState;
            hasContentChanges = true;
        }

        // Update journal if there are meaningful changes or significant time has passed
        if (hasContentChanges || timeSinceLastCheck > 60 * 60 * 1000) {
            // 1 hour
            await this.journalManager.updateTask(taskEntry.todoistId, updates);
        }

        return null;
    }

    /**
     * Attempt to recover orphaned tasks that may still be valid
     * This checks if orphaned tasks actually exist in both systems and un-orphans them
     */
    private async attemptOrphanedTaskRecovery(
        taskEntry: TaskSyncEntry,
    ): Promise<boolean> {
        if (!taskEntry.isOrphaned) {
            return false; // Not orphaned, no recovery needed
        }

        try {
            // Check if task exists in Todoist
            const todoistTask = await this.getTodoistTaskWithRetry(
                taskEntry.todoistId,
            );
            if (!todoistTask) {
                return false;
            }

            // Check if task exists in Obsidian file using robust TaskLocationService
            const taskContent = await this.taskLocationService.getTaskContent(
                taskEntry,
                this.settings.uidField,
            );
            if (!taskContent) {
                return false; // Task not found in Obsidian file
            }

            // Update journal with any location changes discovered during recovery
            const updates: any = {
                isOrphaned: false,
                orphanedAt: undefined,
                lastTodoistCheck: Date.now(),
                lastPathValidation: Date.now(),
            };

            if (taskContent.needsJournalUpdate) {
                if (taskContent.line !== taskEntry.obsidianLine) {
                    updates.obsidianLine = taskContent.line;
                    console.log(
                        `[CHANGE DETECTOR] 📝 Updated line number during recovery for ${taskEntry.todoistId}: ${taskEntry.obsidianLine} → ${taskContent.line}`,
                    );
                }

                if (
                    taskContent.blockId &&
                    taskContent.blockId !== taskEntry.obsidianBlockId
                ) {
                    updates.obsidianBlockId = taskContent.blockId;
                    console.log(
                        `[CHANGE DETECTOR] 📝 Updated block ID during recovery for ${taskEntry.todoistId}: ${taskContent.blockId}`,
                    );
                }
            }

            // Task exists in both systems and location is verified - recover it!
            await this.journalManager.updateTask(taskEntry.todoistId, updates);

            return true;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error during orphaned task recovery: ${taskEntry.todoistId}`,
                error,
            );
            return false;
        }
    }

    /**
     * Get the completion state category for a task based on Obsidian and Todoist status
     * This helps optimize sync operations by prioritizing tasks likely to change
     * OPTIMIZATION: Includes deleted task detection as a fifth category for complete skip
     */
    public getTaskCompletionState(
        task: TaskSyncEntry,
    ):
        | "obsidian-completed-todoist-open"
        | "obsidian-open-todoist-completed"
        | "both-open"
        | "both-completed"
        | "deleted" {
        // OPTIMIZATION: Check if task is deleted/orphaned first (fifth category)
        // Once a task is marked as deleted in the log file, we completely ignore it
        if (task.isOrphaned) {
            return "deleted"; // SKIP CATEGORY: No processing needed, preserved in log for reference
        }

        const obsCompleted = task.obsidianCompleted || false;
        const todCompleted = task.todoistCompleted || false;

        if (obsCompleted && !todCompleted) {
            return "obsidian-completed-todoist-open"; // HIGH PRIORITY: Needs sync to Todoist
        } else if (!obsCompleted && todCompleted) {
            return "obsidian-open-todoist-completed"; // HIGH PRIORITY: Needs sync to Obsidian
        } else if (!obsCompleted && !todCompleted) {
            return "both-open"; // MEDIUM PRIORITY: Both active, might change
        } else {
            return "both-completed"; // LOW PRIORITY: Both done, unlikely to reopen
        }
    }

    /**
     * Get statistics about task completion states for monitoring optimization effectiveness
     * OPTIMIZATION: Includes deleted tasks as fifth category for complete tracking
     */
    public getTaskCompletionStats(): { [key: string]: number } {
        const allTasks = this.journalManager.getAllTasks();
        const stats = {
            "obsidian-completed-todoist-open": 0,
            "obsidian-open-todoist-completed": 0,
            "both-open": 0,
            "both-completed": 0,
            deleted: 0, // Fifth category: deleted/orphaned tasks
            total: 0,
        };

        for (const task of Object.values(allTasks)) {
            const state = this.getTaskCompletionState(task);
            stats[state]++;
            stats.total++;
        }

        return stats;
    }

    /**
     * Determine if we should check a Todoist task NOW (OPTIMIZED APPROACH)
     * Prioritizes tasks based on completion status patterns - focusing on tasks
     * that are likely to change, while deprioritizing tasks completed in both sources
     * OPTIMIZATION: Completely skips deleted tasks (fifth category)
     */
    private shouldCheckTodoistTaskNow(task: TaskSyncEntry): boolean {
        const now = Date.now();
        const timeSinceLastCheck = now - task.lastTodoistCheck;

        // Get task completion state for optimization
        const taskState = this.getTaskCompletionState(task);

        // OPTIMIZATION: Completely skip deleted tasks (fifth category)
        // Once a task is marked as deleted in the log file, we never check it again
        if (taskState === "deleted") {
            return false; // Never check deleted tasks
        }

        // PRIORITY 0: Tasks with mismatched completion status (CRITICAL)
        // These should be checked immediately regardless of timing
        if (
            taskState === "obsidian-completed-todoist-open" ||
            taskState === "obsidian-open-todoist-completed"
        ) {
            return true; // Always check mismatched tasks
        }

        // OPTIMIZATION: Skip tasks completed in BOTH sources (user-configurable)
        if (taskState === "both-completed") {
            // Check user preference for tracking both-completed tasks
            if (!this.settings.trackBothCompletedTasks) {
                // User disabled tracking - completely skip these tasks
                if (Math.random() < 0.005) {
                    // 0.5% chance to log
                    console.log(
                        `[CHANGE DETECTOR] ⚡ Optimization: Completely skipping task ${task.todoistId} (completed in both sources, tracking disabled)`,
                    );
                }
                return false; // Never check
            } else {
                // User enabled tracking - check very rarely (24 hours)
                const BOTH_COMPLETED_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
                const shouldCheck =
                    timeSinceLastCheck > BOTH_COMPLETED_CHECK_INTERVAL;
                return shouldCheck;
            }
        }

        // Use user's sync interval as base for different priority levels
        const userSyncIntervalMs =
            this.settings.syncIntervalMinutes * 60 * 1000;

        // PRIORITY LEVELS based on task completion state:

        // MEDIUM PRIORITY: Tasks open in both sources (might change)
        if (taskState === "both-open") {
            const BOTH_OPEN_CHECK_INTERVAL = userSyncIntervalMs; // Normal sync interval

            // Check if enough time has passed since last check
            if (timeSinceLastCheck >= BOTH_OPEN_CHECK_INTERVAL) {
                return true; // Always check if sync interval has passed
            }

            return false; // Not due for check yet
        }

        // Default: Don't check (conservative approach)
        // Journal-based optimization with four-category prioritization is sufficient
        // Time window filtering removed as redundant - journal tracking is more precise
        return false;
    }

    /**
     * Get files to scan for new tasks
     * Enhanced with journal completeness validation to avoid missing tasks
     */
    private async getFilesToScan(lastScan: number): Promise<TFile[]> {
        let files: TFile[];

        // Get all markdown files in the vault
        files = this.app.vault.getMarkdownFiles();

        // Enhanced logic: only filter if we have a solid baseline and recent scan
        if (lastScan > 0) {
            const stats = this.journalManager.getStats();
            const hasRecentScan = Date.now() - lastScan < 24 * 60 * 60 * 1000; // Within 24 hours
            const hasTaskBaseline = stats.totalTasks > 5; // Has discovered some tasks

            // Only use incremental scan if we have both a recent scan and task baseline
            // This prevents permanently missing tasks due to failed initial scans
            if (hasRecentScan && hasTaskBaseline) {
                const filteredFiles = files.filter(
                    (file) => file.stat.mtime > lastScan,
                );
                // Incremental scan - reduced logging to avoid routine noise
                files = filteredFiles;
            } else {
                console.log(
                    `[CHANGE DETECTOR] Force full scan - Recent: ${hasRecentScan}, Baseline: ${hasTaskBaseline} (${stats.totalTasks} tasks)`,
                );
            }
        }

        return files;
    }

    /**
     * Normalize a Todoist ID to ensure compatibility with current API
     * Tries to get V2 ID for numeric IDs, returns original if already V2 or conversion fails
     */
    private async normalizeTodoistId(todoistId: string): Promise<string> {
        if (!todoistId) return todoistId;

        // If already alphanumeric (V2 format), return as-is
        if (/^[\w-]+$/.test(todoistId) && !/^\d+$/.test(todoistId)) {
            return todoistId;
        }

        // If numeric (V1 format), try to get V2 equivalent
        if (/^\d+$/.test(todoistId)) {
            try {
                const v2Id = await this.todoistV2IDs.getV2Id(todoistId);
                return v2Id || todoistId; // Return V2 ID if available, otherwise original
            } catch (error) {
                // Failed to normalize ID - reduced logging
                return todoistId; // Return original on error
            }
        }

        return todoistId; // Return original for any other format
    }

    /**
     * Efficiently lookup a task from the bulk-fetched task map
     * Handles both V1 and V2 ID formats by checking multiple possible keys
     */
    private async getTaskFromBulkMap(
        todoistId: string,
        taskMap: Record<string, any>,
    ): Promise<any | null> {
        if (!todoistId || !taskMap) return null;

        // First, try direct lookup with original ID
        if (taskMap[todoistId]) {
            return taskMap[todoistId];
        }

        // If not found and ID is numeric (V1), try to get V2 equivalent
        if (/^\d+$/.test(todoistId)) {
            try {
                const v2Id = await this.todoistV2IDs.getV2Id(todoistId);
                if (v2Id && v2Id !== todoistId && taskMap[v2Id]) {
                    console.log(
                        `[CHANGE DETECTOR] ✅ Found task via V2 ID mapping: ${todoistId} -> ${v2Id}`,
                    );
                    return taskMap[v2Id];
                }
            } catch (error) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Failed to lookup V2 ID for ${todoistId}:`,
                    error,
                );
            }
        }

        // If still not found and ID is alphanumeric (V2), it might be mapped under a V1 key
        // This is less common but possible if the bulk fetch returned V1 IDs
        if (/^[\w-]+$/.test(todoistId) && !/^\d+$/.test(todoistId)) {
            // Look for any task that has this as a v2_id or similar property
            for (const [key, task] of Object.entries(taskMap)) {
                if (
                    task &&
                    (task.v2_id === todoistId || task.id === todoistId)
                ) {
                    console.log(
                        `[CHANGE DETECTOR] ✅ Found task via reverse mapping: ${todoistId} found under key ${key}`,
                    );
                    return task;
                }
            }
        }

        return null; // Task not found in bulk map
    }

    /**
     * Get Todoist task with permanent deleted task tracking and ID normalization
     * Uses TodoistV2IDs module to handle both V1 and V2 ID formats
     */
    private async getTodoistTaskWithRetry(
        todoistId: string,
        maxRetries = 3,
    ): Promise<any | null> {
        // NEVER call API for permanently deleted tasks
        if (this.journalManager.isTaskDeleted(todoistId)) {
            // Silently skip deleted tasks to reduce console noise
            // (This is expected behavior - deleted tasks should not generate API calls)
            return null;
        }

        // Normalize the ID to ensure API compatibility
        // 🚫 CRITICAL: Check if task is already marked as deleted in journal
        // This prevents unnecessary API calls for known deleted tasks
        if (this.journalManager.isTaskDeleted(todoistId)) {
            return null;
        }

        // 🎯 FIVE-CATEGORY OPTIMIZATION: Check if we should fetch this task based on existing journal data
        const existingTask = this.journalManager.getTaskByTodoistId(todoistId);
        if (existingTask) {
            const completionState = this.getTaskCompletionState(existingTask);

            // Category 4: both-completed - respect user setting
            if (
                completionState === "both-completed" &&
                !this.settings.trackBothCompletedTasks
            ) {
                return null;
            }

            // Category 5: deleted - already handled above
            if (completionState === "deleted") {
                return null;
            }

            // For existing tasks, check if we should make API call based on timing and category
            if (!this.shouldCheckTodoistTaskNow(existingTask)) {
                console.log(
                    `[CHANGE DETECTOR] ⏰ Skipping retry fetch for task ${todoistId} - not due for check based on category [${completionState}] and timing`,
                );
                return null; // Don't retry if not due for check
            }
        }

        const normalizedId = await this.normalizeTodoistId(todoistId);

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Add small delay between requests to prevent rate limiting
                if (attempt > 0) {
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt - 1),
                        5000,
                    ); // Exponential backoff, max 5s
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }

                // Use normalized ID for API call
                const task = await this.todoistApi.getTask(normalizedId);
                this.apiCallCount++; // Track successful API calls
                return task; // Success!
            } catch (error: any) {
                const statusCode = error.response?.status || error.status;

                if (statusCode === 404) {
                    // Task deleted - permanently mark and NEVER try again
                    // ✅ OPTIMIZED: Reduce logging noise for expected deleted tasks
                    await this.journalManager.markAsDeleted(
                        todoistId,
                        "deleted",
                        404,
                        undefined,
                        "API returned 404 - task deleted in Todoist",
                    );
                    return null;
                } else if (statusCode === 403) {
                    // Permission denied - permanently mark as inaccessible
                    // ✅ OPTIMIZED: Reduce logging noise for expected inaccessible tasks
                    await this.journalManager.markAsDeleted(
                        todoistId,
                        "inaccessible",
                        403,
                        undefined,
                        "API returned 403 - task is private or inaccessible",
                    );
                    return null;
                } else if (statusCode === 429) {
                    // Rate limit - retry with backoff (don't mark as deleted)
                    if (attempt === maxRetries) {
                        console.warn(
                            `[CHANGE DETECTOR] ⚠️ Rate limit exceeded for task ${todoistId}, will retry later`,
                        );
                        return null;
                    }
                    // Continue to next retry
                } else {
                    // Other error - don't retry but don't mark as deleted
                    console.error(
                        `[CHANGE DETECTOR] API error for task ${todoistId}: ${statusCode} - ${error.message}`,
                    );
                    return null;
                }
            }
        }

        return null; // All retries failed
    }

    /**
     * Get API call statistics
     */
    getApiCallStats(): {
        apiCallsThisSession: number;
        sessionStartTime: number;
        callsPerMinute: number;
    } {
        const sessionDuration = Date.now() - this.lastApiCallReset;
        const sessionMinutes = sessionDuration / (60 * 1000);
        const callsPerMinute =
            sessionMinutes > 0 ? this.apiCallCount / sessionMinutes : 0;

        return {
            apiCallsThisSession: this.apiCallCount,
            sessionStartTime: this.lastApiCallReset,
            callsPerMinute: Math.round(callsPerMinute * 100) / 100,
        };
    }

    /**
     * Get deleted task statistics from journal
     */
    getDeletedTaskStats(): {
        deletedTasks: number;
        inaccessibleTasks: number;
        userRemovedTasks: number;
    } {
        const allDeleted = this.journalManager.getAllDeletedTasks();
        const deleted = Object.values(allDeleted).filter(
            (t) => t.reason === "deleted",
        ).length;
        const inaccessible = Object.values(allDeleted).filter(
            (t) => t.reason === "inaccessible",
        ).length;
        const userRemoved = Object.values(allDeleted).filter(
            (t) => t.reason === "user_removed",
        ).length;

        return {
            deletedTasks: deleted,
            inaccessibleTasks: inaccessible,
            userRemovedTasks: userRemoved,
        };
    }

    /**
     * Reset API call counter (useful for monitoring)
     */
    resetApiCallStats(): void {
        this.apiCallCount = 0;
        this.lastApiCallReset = Date.now();
        // API call stats reset - reduced logging
    }

    /**
     * Create a new TaskSyncEntry with UID-based file tracking
     */
    private async createTaskSyncEntry(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
    ): Promise<TaskSyncEntry | null> {
        try {
            // 🚫 CRITICAL: Check if task is already marked as deleted in journal
            // This prevents unnecessary API calls for known deleted tasks
            if (this.journalManager.isTaskDeleted(todoistId)) {
                // Skip deleted tasks silently
                return null;
            }

            // 🎯 FIVE-CATEGORY OPTIMIZATION: Check if we should process this task based on existing journal data
            const existingTask =
                this.journalManager.getTaskByTodoistId(todoistId);
            if (existingTask) {
                const completionState =
                    this.getTaskCompletionState(existingTask);

                // Category 4: both-completed - respect user setting
                if (
                    completionState === "both-completed" &&
                    !this.settings.trackBothCompletedTasks
                ) {
                    return null;
                }

                // Category 5: deleted - already handled above
                if (completionState === "deleted") {
                    return null;
                }

                // For existing tasks, check if we should make API call based on timing and category
                if (!this.shouldCheckTodoistTaskNow(existingTask)) {
                    return existingTask; // Return existing data instead of making API call
                }
            }

            // Get initial Todoist task data with smart retry and cleanup logic
            const todoistTask = await this.getTodoistTaskWithRetry(todoistId);
            if (!todoistTask) {
                // getTodoistTaskWithRetry handles logging and cleanup for deleted/inaccessible tasks
                return null;
            }

            // Use consolidated factory for comprehensive entry creation
            const taskEntry =
                await this.taskSyncEntryFactory.createComprehensiveEntry(
                    todoistId,
                    todoistTask,
                    file,
                    lineIndex,
                    lineContent,
                );

            return taskEntry;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error creating task entry for ${todoistId}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Generate content hash for change detection
     * Delegates to SyncJournalManager to avoid duplication
     */
    private generateContentHash(content: string): string {
        return this.journalManager.generateContentHash(content);
    }

    /**
     * Intelligent pre-check to determine if journal validation/maintenance is needed
     * Skips expensive operations when journal is already complete and up-to-date
     */
    private async shouldSkipJournalValidation(): Promise<{
        shouldSkip: boolean;
        reason: string;
        quickStats?: {
            vaultTasks: number;
            activeTasks: number;
            deletedTasks: number;
            totalTracked: number;
        };
    }> {
        // Pre-checking journal validation needs

        // Get basic counts without expensive file scanning
        const activeTaskIds = Object.keys(this.journalManager.getAllTasks());
        const deletedTaskIds = Object.keys(
            this.journalManager.getAllDeletedTasks(),
        );
        // ✅ FIXED: Use unique count to handle potential duplicates
        const uniqueTrackedIds = [
            ...new Set([...activeTaskIds, ...deletedTaskIds]),
        ];
        const totalTracked = uniqueTrackedIds.length;

        // Check if we have any tasks at all - if not, we need validation
        if (totalTracked === 0) {
            return {
                shouldSkip: false,
                reason: "No tasks tracked in journal - validation needed",
            };
        }

        // Check last validation timestamp to avoid too frequent validations
        const lastValidation = this.journalManager.getLastValidationTime();
        const now = Date.now();
        const timeSinceLastValidation = now - (lastValidation || 0);

        // ✅ FIXED: Base validation interval on user's sync interval, not hardcoded value
        const syncIntervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
        const MIN_VALIDATION_INTERVAL = Math.max(
            30 * 1000, // Minimum 30 seconds for development
            Math.min(
                syncIntervalMs / 4, // 1/4 of sync interval
                5 * 60 * 1000, // Maximum 5 minutes
            ),
        );

        if (
            lastValidation &&
            timeSinceLastValidation < MIN_VALIDATION_INTERVAL
        ) {
            // ✅ ENHANCED: Show interval coordination in logs
            const intervalMinutes =
                Math.round((MIN_VALIDATION_INTERVAL / 60000) * 10) / 10;
            const syncMinutes = this.settings.syncIntervalMinutes;

            return {
                shouldSkip: true,
                reason: `Recent validation (${Math.round(timeSinceLastValidation / 1000)}s ago) - skipping (interval: ${intervalMinutes}min based on ${syncMinutes}min sync)`,
                quickStats: {
                    vaultTasks: 0, // Will be filled if needed
                    activeTasks: activeTaskIds.length,
                    deletedTasks: deletedTaskIds.length,
                    totalTracked,
                },
            };
        }

        // Now do the more expensive vault scan to check completeness
        const vaultTaskIds = await this.scanAllFilesForTaskIds();
        // ✅ FIXED: Use the same unique tracked IDs from above
        const missing = vaultTaskIds.filter(
            (id) => !uniqueTrackedIds.includes(id),
        );

        const quickStats = {
            vaultTasks: vaultTaskIds.length,
            activeTasks: activeTaskIds.length,
            deletedTasks: deletedTaskIds.length,
            totalTracked,
        };

        // If journal is 100% complete, we can skip
        if (missing.length === 0 && vaultTaskIds.length === totalTracked) {
            // ✅ ENHANCED: More detailed and consistent pre-check completion logging
            const actualDeletedCount = totalTracked - activeTaskIds.length;
            return {
                shouldSkip: true,
                reason: "Journal is 100% complete - no validation needed",
                quickStats,
            };
        }

        // Journal needs validation/maintenance
        console.log(
            `[CHANGE DETECTOR] ⚠️ Pre-check failed: Journal needs validation (${missing.length} missing tasks, ${vaultTaskIds.length} vault vs ${totalTracked} tracked)`,
        );
        return {
            shouldSkip: false,
            reason: `Journal incomplete: ${missing.length} missing tasks`,
            quickStats,
        };
    }

    /**
     * Validate journal completeness against actual vault content
     * OPTIMIZED: Now includes intelligent pre-check to skip when not needed
     */
    async validateJournalCompleteness(
        forceValidation: boolean = false,
    ): Promise<{
        missing: string[];
        total: number;
        journalCount: number;
        completeness: number;
        skipped?: boolean;
        skipReason?: string;
    }> {
        // Intelligent pre-check (unless forced)
        if (!forceValidation) {
            const preCheck = await this.shouldSkipJournalValidation();
            if (preCheck.shouldSkip) {
                console.log(
                    `[CHANGE DETECTOR] ⚡ Skipping validation: ${preCheck.reason}`,
                );

                // Return cached/estimated results without expensive operations
                const stats = preCheck.quickStats!;
                return {
                    missing: [],
                    total: stats.vaultTasks || stats.totalTracked,
                    journalCount: stats.totalTracked,
                    completeness: 100,
                    skipped: true,
                    skipReason: preCheck.reason,
                };
            }
            // Pre-check indicates validation needed
        } else {
            // Forced validation - skipping pre-check
        }

        // Performing journal completeness validation

        const vaultTaskIds = await this.scanAllFilesForTaskIds();
        const activeTaskIds = Object.keys(this.journalManager.getAllTasks());
        const deletedTaskIds = Object.keys(
            this.journalManager.getAllDeletedTasks(),
        );

        // ✅ FIXED: Combine both active AND deleted tasks for completeness check
        const allTrackedTaskIds = [...activeTaskIds, ...deletedTaskIds];

        // Debug: Log what we found
        // Found task IDs in vault
        console.log(
            `[CHANGE DETECTOR] 📖 Found ${activeTaskIds.length} active task IDs in journal: ${activeTaskIds.slice(0, 10).join(", ")}...`,
        );
        // Found deleted task IDs in journal

        // ✅ CRITICAL FIX: Check for overlapping IDs between active and deleted
        const overlappingIds = activeTaskIds.filter((id) =>
            deletedTaskIds.includes(id),
        );
        if (overlappingIds.length > 0) {
            console.error(
                `[CHANGE DETECTOR] 🚨 CRITICAL ERROR: ${overlappingIds.length} task IDs exist in BOTH active and deleted sections!`,
            );
            console.error(
                `[CHANGE DETECTOR] Overlapping IDs: ${overlappingIds.slice(0, 10).join(", ")}...`,
            );
            // Auto-fix: Remove duplicates from deleted section to prevent double-counting
            const cleanDeletedIds = deletedTaskIds.filter(
                (id) => !activeTaskIds.includes(id),
            );
            await this.journalManager.cleanupDuplicateEntries(overlappingIds);
        }

        // ✅ FIXED: Use Set to ensure no duplicates when combining active + deleted
        const uniqueTrackedIds = [
            ...new Set([...activeTaskIds, ...deletedTaskIds]),
        ];

        // ✅ ENHANCED: More detailed logging for debugging
        // Task count summary calculated

        // ✅ SANITY CHECK: Warn if tracked > vault (should be impossible)
        if (uniqueTrackedIds.length > vaultTaskIds.length) {
            console.warn(
                `[CHANGE DETECTOR] ⚠️ CALCULATION WARNING: Tracked tasks (${uniqueTrackedIds.length}) > Vault tasks (${vaultTaskIds.length}) - investigating...`,
            );
            // Log the extra tracked IDs for debugging
            const extraIds = uniqueTrackedIds.filter(
                (id) => !vaultTaskIds.includes(id),
            );
            console.warn(
                `[CHANGE DETECTOR] Extra tracked IDs not in vault: ${extraIds.slice(0, 10).join(", ")}${extraIds.length > 10 ? "..." : ""}`,
            );
        }

        // ✅ FIXED: Check against UNIQUE tracked tasks (no duplicates)
        const missing = vaultTaskIds.filter(
            (id) => !uniqueTrackedIds.includes(id),
        );

        const completeness =
            vaultTaskIds.length > 0
                ? ((vaultTaskIds.length - missing.length) /
                      vaultTaskIds.length) *
                  100
                : 100;

        const result = {
            missing,
            total: vaultTaskIds.length,
            journalCount: uniqueTrackedIds.length, // ✅ FIXED: Use unique count (no duplicates)
            completeness: Math.round(completeness * 100) / 100,
        };

        // Update last validation timestamp
        this.journalManager.updateLastValidationTime();

        if (missing.length > 0) {
            console.warn(
                `[CHANGE DETECTOR] ⚠️ Journal incomplete: ${missing.length} tasks missing (${result.completeness}% complete)`,
            );
            console.log(
                `[CHANGE DETECTOR] Missing task IDs: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` (and ${missing.length - 10} more)` : ""}`,
            );
        } else {
            // ✅ ENHANCED: More detailed and consistent completion logging
            const actualDeletedCount =
                uniqueTrackedIds.length - activeTaskIds.length;
            console.log(
                `[CHANGE DETECTOR] ✅ Journal validation complete: All ${vaultTaskIds.length} vault tasks tracked (${activeTaskIds.length} active + ${actualDeletedCount} deleted = ${uniqueTrackedIds.length} total)`,
            );
        }

        return result;
    }

    /**
     * Scan all files to find all Todoist task IDs (for validation)
     * ✅ FIXED: Use Set for proper deduplication and better logging
     */
    private async scanAllFilesForTaskIds(): Promise<string[]> {
        const allTaskIds = new Set<string>();
        const files = this.app.vault.getMarkdownFiles();
        let totalTaskLines = 0;
        let duplicatesSkipped = 0;

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");
                const fileTaskIds = new Set<string>();

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (this.textParsing.isTaskLine(line)) {
                        totalTaskLines++;
                        const todoistId =
                            this.taskLocationService.findTodoistIdInSubItems(
                                lines,
                                i,
                            );
                        if (todoistId) {
                            if (fileTaskIds.has(todoistId)) {
                                duplicatesSkipped++;
                            } else {
                                fileTaskIds.add(todoistId);
                                allTaskIds.add(todoistId);
                            }
                        }
                    }
                }

                if (fileTaskIds.size > 0) {
                    console.log(
                        `[CHANGE DETECTOR] 📄 File ${file.name}: ${fileTaskIds.size} unique task IDs found`,
                    );
                }
            } catch (error) {
                console.warn(
                    `[CHANGE DETECTOR] Error scanning ${file.path}:`,
                    error,
                );
            }
        }

        // Scan complete
        return Array.from(allTaskIds);
    }

    /**
     * Smart journal maintenance using BULK optimization and incremental saving
     * ✨ OPTIMIZED: Intelligent pre-check skips maintenance when journal is already complete
     * ✨ 117x more efficient: 1 API call instead of 117 individual calls!
     *
     * This method implements "Smart journal maintenance" - it only processes what's needed
     * and skips redundant work when the journal is already healthy.
     */
    async healJournal(
        forceHealing: boolean = false,
    ): Promise<{ healed: number; failed: number; skipped?: boolean }> {
        // Create backup before healing operations (unified system)
        try {
            await this.journalManager.createTimestampedBackup("healing");
        } catch (error) {
            console.warn(
                "[CHANGE DETECTOR] Could not create healing backup:",
                error,
            );
        }

        // Intelligent validation with pre-check (unless forced)
        const validation = await this.validateJournalCompleteness(forceHealing);

        // ✅ FIXED: Force rebuild should NEVER be skipped, even if validation was skipped
        if (validation.skipped && !forceHealing) {
            console.log(
                `[CHANGE DETECTOR] ⚡ Smart maintenance skipped: ${validation.skipReason}`,
            );
            return { healed: 0, failed: 0, skipped: true };
        }

        // ✅ FIXED: Force rebuild should proceed even if journal appears complete
        if (validation.missing.length === 0 && !forceHealing) {
            console.log(
                `[CHANGE DETECTOR] ✅ Journal already complete - all ${validation.total} linked tasks are tracked`,
            );
            return { healed: 0, failed: 0 };
        }

        // ✅ ENHANCED: Special handling for force rebuild
        if (forceHealing && validation.missing.length === 0) {
            console.log(
                `[CHANGE DETECTOR] 🔧 FORCE REBUILD: Re-processing all ${validation.total} tasks despite journal appearing complete`,
            );
            // For force rebuild, we'll re-process all tasks to ensure data integrity
        }

        let healed = 0;
        let failed = 0;
        let bulkTaskMap: Record<string, any> = {};

        // ✅ ENHANCED: Determine tasks to process based on operation type
        const tasksToHeal =
            forceHealing && validation.missing.length === 0
                ? await this.scanAllFilesForTaskIds() // Force rebuild: process ALL tasks
                : validation.missing; // Smart maintenance: only missing tasks

        const processingType =
            forceHealing && validation.missing.length === 0
                ? "ALL tasks (force rebuild)"
                : "missing tasks";

        console.log(
            `[CHANGE DETECTOR] Found ${tasksToHeal.length} ${processingType} out of ${validation.total} total. Starting BULK processing...`,
        );

        // Show minimal user notification
        const userNotice = new Notice(
            `🚀 Journal maintenance: Processing ${tasksToHeal.length} ${processingType} via bulk API...`,
            8000,
        );

        // 📦 Create timestamped backup before risky maintenance operation
        await this.journalManager.createBackupForOperation("maintenance");

        // Temporarily disable auto-save during bulk operations
        this.journalManager.setAutoSave(false);

        try {
            // STEP 1: Bulk fetch ALL active tasks in a single API call (MASSIVE optimization!)
            try {
                bulkTaskMap = await this.bulkFetchTodoistTasks();
                this.lastBulkActiveTaskMap = bulkTaskMap; // ✅ Cache for comprehensive entries
                console.log(
                    `[CHANGE DETECTOR] 🎯 Bulk fetch successful: ${Object.keys(bulkTaskMap).length} active tasks retrieved`,
                );
            } catch (error) {
                const statusCode =
                    (error as any).response?.status || (error as any).status;
                if (statusCode === 429) {
                    userNotice.hide();
                    new Notice(
                        "⚠️ API rate limit reached. Please try again in a few minutes.",
                        8000,
                    );
                    return { healed: 0, failed: validation.missing.length };
                }
                throw error; // Re-throw other errors
            }

            // STEP 1.5: OPTIMIZED bulk fetch completed/archived tasks with smart batching
            let completedTaskMap: Record<string, any> = {};
            try {
                // Use optimized parameters based on vault size
                const taskCount = validation.missing.length;
                const optimizedOptions = {
                    maxConcurrency: taskCount > 100 ? 8 : 5, // More concurrent for large vaults
                    batchSize: taskCount > 200 ? 20 : 15, // Larger batches for many tasks
                    adaptiveDelay: true, // Always use adaptive delays
                };

                completedTaskMap = await this.bulkFetchCompletedTasks(
                    undefined,
                    optimizedOptions,
                );
                this.lastBulkCompletedTaskMap = completedTaskMap; // ✅ Cache for comprehensive entries
                console.log(
                    `[CHANGE DETECTOR] 🏆 OPTIMIZED bulk completed fetch successful: ${Object.keys(completedTaskMap).length} completed tasks retrieved`,
                );
            } catch (error) {
                console.warn(
                    "[CHANGE DETECTOR] ⚠️ Optimized bulk completed fetch failed, will fall back to individual calls:",
                    error,
                );
            }

            // STEP 2: Create a task location map for efficient lookup
            const taskLocationMap = new Map<
                string,
                { file: TFile; lineIndex: number; lineContent: string }
            >();

            const files = this.app.vault.getMarkdownFiles();
            for (const file of files) {
                try {
                    const content = await this.app.vault.read(file);
                    const lines = content.split("\n");

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (this.textParsing.isTaskLine(line)) {
                            const todoistId =
                                this.taskLocationService.findTodoistIdInSubItems(
                                    lines,
                                    i,
                                );
                            if (todoistId) {
                                // Debug: Log all found task IDs
                                console.log(
                                    `[CHANGE DETECTOR] 🔍 Found task ID ${todoistId} in ${file.name}:${i + 1} - To Process: ${tasksToHeal.includes(todoistId)}`,
                                );

                                if (tasksToHeal.includes(todoistId)) {
                                    taskLocationMap.set(todoistId, {
                                        file,
                                        lineIndex: i,
                                        lineContent: line,
                                    });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        `[CHANGE DETECTOR] Error scanning ${file.path}:`,
                        error,
                    );
                }
            }

            // STEP 3: Process tasks efficiently using bulk data
            const tasksToProcess = Array.from(taskLocationMap.entries());
            let processedCount = 0;

            // Debug: Log what task IDs we're trying to heal
            const missingTaskIds = validation.missing.slice(0, 10);
            console.log(
                `[CHANGE DETECTOR] 🔍 Looking for missing task IDs (sample): ${missingTaskIds.join(", ")}`,
            );
            console.log(
                `[CHANGE DETECTOR] 📊 Processing ${tasksToProcess.length} tasks from ${taskLocationMap.size} found in vault`,
            );

            // Additional debug: Check if task IDs look valid (can be numeric V1 or alphanumeric V2)
            const invalidIds = missingTaskIds.filter(
                (id) => !/^[\w-]+$/.test(id),
            );
            if (invalidIds.length > 0) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Found potentially invalid task IDs (non-alphanumeric): ${invalidIds.join(", ")}`,
                );
            }

            for (const [todoistId, location] of tasksToProcess) {
                try {
                    processedCount++;

                    // Try to find task in combined bulk data (active + completed)
                    let todoistTask = await this.getTaskFromBulkMap(
                        todoistId,
                        bulkTaskMap,
                    );

                    // If not found in active tasks, check completed tasks
                    if (!todoistTask && completedTaskMap[todoistId]) {
                        todoistTask = completedTaskMap[todoistId];
                        console.log(
                            `[CHANGE DETECTOR] 🏆 Found task ${todoistId} in completed tasks bulk data`,
                        );
                    }

                    // Debug: Log bulk lookup results
                    if (todoistTask) {
                        console.log(
                            `[CHANGE DETECTOR] 🎯 Found task ${todoistId} in bulk data (completed: ${todoistTask.isCompleted})`,
                        );
                    } else {
                        // Only log debug info for first few missing tasks to reduce noise
                        if (processedCount <= 3) {
                            const activeBulkKeys = Object.keys(
                                bulkTaskMap,
                            ).slice(0, 5);
                            const completedBulkKeys = Object.keys(
                                completedTaskMap,
                            ).slice(0, 5);
                            console.log(
                                `[CHANGE DETECTOR] 🔍 Debug sample - Active: [${activeBulkKeys.join(", ")}], Completed: [${completedBulkKeys.join(", ")}], Task ${todoistId}: ${/^\d+$/.test(todoistId) ? "V1" : "V2"}`,
                            );
                        }
                    }

                    if (todoistTask) {
                        // Task found in bulk data - create entry WITHOUT API call
                        const taskEntry =
                            await this.createTaskSyncEntryFromBulkData(
                                todoistId,
                                location.file,
                                location.lineIndex,
                                location.lineContent,
                                todoistTask,
                            );

                        if (taskEntry) {
                            await this.journalManager.addTask(taskEntry);
                            // 🔥 INCREMENTAL SAVE: Save immediately to prevent data loss
                            await this.journalManager.forceSaveIfDirty();
                            healed++;
                        } else {
                            failed++;
                            console.warn(
                                `[CHANGE DETECTOR] ❌ Failed to create entry from bulk data: ${todoistId}`,
                            );
                        }
                    } else {
                        // Task not found in either active or completed bulk data
                        // This should be very rare now - only for truly deleted/inaccessible tasks
                        console.log(
                            `[CHANGE DETECTOR] ⚠️ Task ${todoistId} not found in bulk data (active: ${Object.keys(bulkTaskMap).length}, completed: ${Object.keys(completedTaskMap).length}) - likely deleted`,
                        );

                        // Only use individual fetch as absolute last resort
                        // Apply minimal delay since this should be rare
                        await new Promise((resolve) =>
                            setTimeout(resolve, 200),
                        );

                        const individualTask =
                            await this.fetchIndividualTask(todoistId);

                        if (individualTask) {
                            // Very rare case - task exists but wasn't in bulk data
                            console.log(
                                `[CHANGE DETECTOR] 🔍 Rare case: Task ${todoistId} found via individual fetch but not in bulk data`,
                            );

                            const taskEntry =
                                await this.createTaskSyncEntryFromBulkData(
                                    todoistId,
                                    location.file,
                                    location.lineIndex,
                                    location.lineContent,
                                    individualTask,
                                );

                            if (taskEntry) {
                                await this.journalManager.addTask(taskEntry);
                                await this.journalManager.forceSaveIfDirty();
                                healed++;
                            } else {
                                failed++;
                                console.warn(
                                    `[CHANGE DETECTOR] ❌ Failed to create entry from individual fetch: ${todoistId}`,
                                );
                            }
                        } else {
                            // Truly deleted or inaccessible - mark as such
                            // Only log first few deletions to reduce console noise
                            if (failed < 5) {
                                console.log(
                                    `[CHANGE DETECTOR] 🗑️ Task ${todoistId} confirmed deleted - not found in bulk or individual fetch`,
                                );
                            } else if (failed === 5) {
                                console.log(
                                    `[CHANGE DETECTOR] 🗑️ Task ${todoistId} confirmed deleted (suppressing further deletion logs to reduce noise)`,
                                );
                            }
                            await this.journalManager.markAsDeleted(
                                todoistId,
                                "deleted",
                                undefined,
                                location.file.path,
                                "Not found in active bulk, completed bulk, or individual fetch - confirmed deleted",
                            );
                            await this.journalManager.forceSaveIfDirty();
                            failed++;
                        }
                    }

                    // Progress logging every 20 tasks
                    if (processedCount % 20 === 0) {
                        console.log(
                            `[CHANGE DETECTOR] 📊 Progress: ${healed} healed, ${failed} failed, ${tasksToProcess.length - processedCount} remaining`,
                        );
                    }
                } catch (error) {
                    failed++;
                    console.error(
                        `[CHANGE DETECTOR] ❌ Error processing task ${todoistId}:`,
                        error,
                    );
                }
            }
        } finally {
            // Re-enable auto-save and ensure final save
            this.journalManager.setAutoSave(true);
            await this.journalManager.forceSaveIfDirty();
        }

        // Final notification
        try {
            userNotice.hide();
        } catch (e) {
            // Notice might already be dismissed
        }

        const apiCallsUsed = 1 + (failed > 0 ? failed : 0); // Bulk + individual calls for failed tasks
        const message = `✅ Journal maintenance complete! ${healed} tasks processed${failed > 0 ? `, ${failed} failed/deleted` : ""} (Used ${apiCallsUsed} API calls)`;
        new Notice(message, 8000);
        console.log(
            `[CHANGE DETECTOR] 🏥 BULK MAINTENANCE COMPLETE - ${healed} processed, ${failed} failed. Bulk fetch found ${Object.keys(bulkTaskMap).length} active tasks.`,
        );

        return { healed, failed };
    }

    /**
     * Bulk fetch completed/archived tasks from Todoist using Sync API
     * OPTIMIZED: Supports parallel processing, smart batching, and adaptive rate limiting
     * Handles completed, deleted, and archived tasks efficiently
     */
    private async bulkFetchCompletedTasks(
        projectIds?: string[],
        options: {
            maxConcurrency?: number;
            batchSize?: number;
            adaptiveDelay?: boolean;
        } = {},
    ): Promise<Record<string, any>> {
        const {
            maxConcurrency = 5, // Parallel requests
            batchSize = 15, // Larger batches for efficiency
            adaptiveDelay = true, // Adjust delays based on response times
        } = options;

        const completedTaskMap: Record<string, any> = {};
        let totalApiCalls = 0;
        let totalCompleted = 0;
        const startTime = Date.now();

        try {
            console.log(
                "[CHANGE DETECTOR] 🏆 OPTIMIZED bulk fetching completed tasks from Todoist Sync API...",
            );

            if (!projectIds || projectIds.length === 0) {
                // If no specific projects, get all user projects first
                const allProjects = await this.todoistApi.getProjects();
                projectIds = allProjects.map((p: any) => p.id);
                console.log(
                    `[CHANGE DETECTOR] 📁 Found ${projectIds.length} projects to check for completed tasks`,
                );
            }

            // Process projects in parallel batches for maximum efficiency
            const batches: string[][] = [];
            for (let i = 0; i < projectIds.length; i += batchSize) {
                batches.push(projectIds.slice(i, i + batchSize));
            }

            console.log(
                `[CHANGE DETECTOR] 🚀 Processing ${projectIds.length} projects in ${batches.length} batches (max ${maxConcurrency} concurrent)`,
            );

            // Process batches with controlled concurrency
            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                const batch = batches[batchIndex];
                const batchStartTime = Date.now();

                console.log(
                    `[CHANGE DETECTOR] 📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} projects)`,
                );

                // Process projects in this batch with controlled concurrency
                const semaphore = new Array(maxConcurrency).fill(null);
                const projectPromises = batch.map(async (projectId, index) => {
                    // Wait for available slot
                    const slotIndex = index % maxConcurrency;
                    if (index >= maxConcurrency) {
                        await semaphore[slotIndex];
                    }

                    // Create promise for this project
                    const projectPromise = this.fetchCompletedTasksForProject(
                        projectId,
                        adaptiveDelay,
                    );
                    semaphore[slotIndex] = projectPromise;

                    return projectPromise;
                });

                // Wait for all projects in this batch to complete
                const batchResults = await Promise.allSettled(projectPromises);

                // Process results
                for (const result of batchResults) {
                    if (result.status === "fulfilled") {
                        const { tasks, apiCalls } = result.value;
                        Object.assign(completedTaskMap, tasks);
                        totalCompleted += Object.keys(tasks).length;
                        totalApiCalls += apiCalls;
                    } else {
                        console.warn(
                            "[CHANGE DETECTOR] ⚠️ Project fetch failed:",
                            result.reason,
                        );
                    }
                }

                const batchDuration = Date.now() - batchStartTime;
                console.log(
                    `[CHANGE DETECTOR] ✅ Batch ${batchIndex + 1} complete: ${batchDuration}ms, ${totalCompleted} tasks so far`,
                );

                // Adaptive delay between batches based on performance
                if (batchIndex < batches.length - 1) {
                    const delay = adaptiveDelay
                        ? Math.max(200, Math.min(1000, batchDuration / 10)) // Scale with batch time
                        : 500;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }

            const totalDuration = Date.now() - startTime;
            console.log(
                `[CHANGE DETECTOR] ✅ OPTIMIZED bulk completed tasks fetch complete: ${totalCompleted} completed tasks retrieved from ${projectIds.length} projects in ${totalDuration}ms (${totalApiCalls} API calls)`,
            );

            // Update global API call counter
            this.apiCallCount += totalApiCalls;

            return completedTaskMap;
        } catch (error) {
            console.error(
                "[CHANGE DETECTOR] Error in optimized bulk completed tasks fetch:",
                error,
            );
            return {};
        }
    }

    /**
     * Helper method to fetch completed tasks for a single project with pagination support
     * Returns both the tasks and the number of API calls made
     */
    private async fetchCompletedTasksForProject(
        projectId: string,
        adaptiveDelay: boolean,
    ): Promise<{ tasks: Record<string, any>; apiCalls: number }> {
        const tasks: Record<string, any> = {};
        let apiCalls = 0;
        const projectStartTime = Date.now();

        try {
            // Initial request for this project
            const response = await fetch(
                `https://api.todoist.com/sync/v9/archive/items?project_id=${projectId}&limit=200`,
                {
                    headers: {
                        Authorization: `Bearer ${this.settings.todoistAPIToken}`,
                    },
                },
            );
            apiCalls++;

            if (!response.ok) {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Failed to fetch completed tasks for project ${projectId}: ${response.status}`,
                );
                return { tasks, apiCalls };
            }

            const data = await response.json();
            const completedItems = data.items || [];

            // Process initial batch
            for (const item of completedItems) {
                tasks[item.id] = {
                    ...item,
                    isCompleted: true,
                    completed_at: item.completed_at,
                };
            }

            // Handle pagination if there are more results
            let nextCursor = data.next_cursor;
            let pageCount = 1;

            while (data.has_more && nextCursor && pageCount < 10) {
                // Limit to 10 pages per project
                const nextResponse = await fetch(
                    `https://api.todoist.com/sync/v9/archive/items?project_id=${projectId}&limit=200&cursor=${nextCursor}`,
                    {
                        headers: {
                            Authorization: `Bearer ${this.settings.todoistAPIToken}`,
                        },
                    },
                );
                apiCalls++;
                pageCount++;

                if (nextResponse.ok) {
                    const nextData = await nextResponse.json();
                    const nextItems = nextData.items || [];

                    for (const item of nextItems) {
                        tasks[item.id] = {
                            ...item,
                            isCompleted: true,
                            completed_at: item.completed_at,
                        };
                    }

                    nextCursor = nextData.next_cursor;
                    if (!nextData.has_more) break;
                } else {
                    console.warn(
                        `[CHANGE DETECTOR] ⚠️ Failed to fetch page ${pageCount} for project ${projectId}`,
                    );
                    break;
                }

                // Adaptive delay between pagination requests
                if (adaptiveDelay) {
                    const delay = Math.min(150, 50 + pageCount * 10); // Increase delay with page count
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            const projectDuration = Date.now() - projectStartTime;
            const taskCount = Object.keys(tasks).length;

            if (taskCount > 0) {
                console.log(
                    `[CHANGE DETECTOR] 📋 Project ${projectId}: ${taskCount} completed tasks, ${apiCalls} API calls, ${projectDuration}ms`,
                );
            }

            return { tasks, apiCalls };
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error fetching completed tasks for project ${projectId}:`,
                error,
            );
            return { tasks, apiCalls };
        }
    }

    /**
     * Bulk fetch all active tasks from Todoist in a single API request
     * This is MUCH more efficient than individual getTask() calls
     * Uses TodoistV2IDs module to properly handle ID compatibility
     * NOTE: Only fetches ACTIVE tasks - completed/archived tasks use bulkFetchCompletedTasks()
     */
    private async bulkFetchTodoistTasks(): Promise<Record<string, any>> {
        try {
            console.log(
                "[CHANGE DETECTOR] 🚀 Bulk fetching all active tasks from Todoist...",
            );
            const allTasks = await this.todoistApi.getTasks();
            this.apiCallCount++; // Track successful API call

            console.log(
                `[CHANGE DETECTOR] 📊 Bulk fetch returned ${allTasks.length} ACTIVE tasks (completed tasks not included)`,
            );

            // Convert to lookup map by ID for efficient access
            // Use TodoistV2IDs module to handle both V1 (numeric) and V2 (alphanumeric) ID formats
            const taskMap: Record<string, any> = {};
            const numericIds: string[] = [];
            const alphanumericIds: string[] = [];

            // First pass: Map all tasks by their primary ID and categorize ID types
            for (const task of allTasks) {
                taskMap[task.id] = task;

                // Categorize ID types for debugging
                if (/^\d+$/.test(task.id)) {
                    numericIds.push(task.id);
                } else if (/^[\w-]+$/.test(task.id)) {
                    alphanumericIds.push(task.id);
                }
            }

            console.log(
                `[CHANGE DETECTOR] ✅ Bulk fetch complete: ${allTasks.length} active tasks retrieved`,
            );
            console.log(
                `[CHANGE DETECTOR] 🔍 ID formats - Numeric (V1): ${numericIds.length}, Alphanumeric (V2): ${alphanumericIds.length}`,
            );

            // Second pass: For numeric IDs, try to get their V2 equivalents and create cross-mapping
            // This ensures we can find tasks whether we're looking by V1 or V2 ID
            if (numericIds.length > 0) {
                console.log(
                    `[CHANGE DETECTOR] 🔄 Creating V1/V2 ID cross-mapping for ${numericIds.length} numeric IDs...`,
                );

                let mappedCount = 0;
                for (const numericId of numericIds.slice(0, 10)) {
                    // Limit to first 10 to avoid excessive API calls
                    try {
                        const v2Id = await this.todoistV2IDs.getV2Id(numericId);
                        if (v2Id && v2Id !== numericId) {
                            // Cross-map: V2 ID -> task object
                            taskMap[v2Id] = taskMap[numericId];
                            mappedCount++;
                            console.log(
                                `[CHANGE DETECTOR] ✅ Mapped V1 ID ${numericId} <-> V2 ID ${v2Id}`,
                            );
                        }
                    } catch (error) {
                        console.warn(
                            `[CHANGE DETECTOR] ⚠️ Failed to get V2 ID for ${numericId}:`,
                            error,
                        );
                    }
                }
            }

            // Debug: Log sample task IDs
            const sampleIds = Object.keys(taskMap).slice(0, 10);
            console.log(
                `[CHANGE DETECTOR] 📋 Sample task IDs in map: ${sampleIds.join(", ")}`,
            );

            return taskMap;
        } catch (error: any) {
            const statusCode = error.response?.status || error.status;
            console.error(
                `[CHANGE DETECTOR] ❌ Bulk fetch failed (${statusCode}):`,
                error.message,
            );

            if (statusCode === 429) {
                console.warn(
                    "[CHANGE DETECTOR] 🚦 Rate limit encountered in bulk fetch",
                );
            }

            throw error; // Re-throw to be handled by caller
        }
    }

    /**
     * Fallback: Fetch individual task using single API call (for tasks not in bulk results)
     * This handles completed tasks, archived tasks, etc. that getTasks() doesn't return
     */
    private async fetchIndividualTask(todoistId: string): Promise<any | null> {
        try {
            // 🚫 CRITICAL: Check if task is already marked as deleted in journal
            // This prevents unnecessary API calls for known deleted tasks
            if (this.journalManager.isTaskDeleted(todoistId)) {
                return null;
            }

            // 🎯 FIVE-CATEGORY OPTIMIZATION: Check if we should fetch this task based on existing journal data
            const existingTask =
                this.journalManager.getTaskByTodoistId(todoistId);
            if (existingTask) {
                const completionState =
                    this.getTaskCompletionState(existingTask);

                // Category 4: both-completed - respect user setting
                if (
                    completionState === "both-completed" &&
                    !this.settings.trackBothCompletedTasks
                ) {
                    return null;
                }

                // Category 5: deleted - already handled above
                if (completionState === "deleted") {
                    return null;
                }

                // For existing tasks, check if we should make API call based on timing and category
                if (!this.shouldCheckTodoistTaskNow(existingTask)) {
                    console.log(
                        `[CHANGE DETECTOR] ⏰ Skipping individual fetch for task ${todoistId} - not due for check based on category [${completionState}] and timing`,
                    );
                    return existingTask; // Return existing data instead of making API call
                }
            }

            const task = await this.todoistApi.getTask(todoistId);
            this.apiCallCount++; // Track successful API call
            return task;
        } catch (error: any) {
            const statusCode = error.response?.status || error.status;

            if (statusCode === 404) {
                console.log(
                    `[CHANGE DETECTOR] 🗑️ Individual fetch: Task ${todoistId} not found (404) - truly deleted`,
                );
                return null;
            } else if (statusCode === 403) {
                console.log(
                    `[CHANGE DETECTOR] 🔒 Individual fetch: Task ${todoistId} inaccessible (403) - permission denied`,
                );
                return null;
            } else {
                console.warn(
                    `[CHANGE DETECTOR] ⚠️ Individual fetch failed for ${todoistId}: ${statusCode} - ${error.message}`,
                );
                return null;
            }
        }
    }

    /**
     * Create task sync entry from bulk fetched data (no API call needed)
     */
    private async createTaskSyncEntryFromBulkData(
        todoistId: string,
        file: TFile,
        lineIndex: number,
        lineContent: string,
        todoistTask: any,
    ): Promise<TaskSyncEntry | null> {
        try {
            // Use consolidated factory for bulk data processing
            const taskEntry = this.taskSyncEntryFactory.createFromBulkData(
                todoistId,
                todoistTask,
                file,
                lineIndex,
                lineContent,
            );

            return taskEntry;
        } catch (error) {
            console.error(
                `[CHANGE DETECTOR] Error creating task entry from bulk data for ${todoistId}:`,
                error,
            );
            return null;
        }
    }
}
