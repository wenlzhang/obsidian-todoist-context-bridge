# Sync Journal Architecture Design

## Core Concept

Replace the current scanning approach with a persistent sync journal that tracks:
- **New tasks** discovered in Obsidian or Todoist
- **Completion status changes** in either platform
- **Sync operations** and their results
- **Failed operations** for retry logic

## Data Structures

### 1. Sync Journal (Persistent Log File)
```typescript
interface SyncJournal {
    version: string;
    lastSyncTimestamp: number;
    lastObsidianScan: number;
    lastTodoistSync: number;
    
    // Task registry - all known linked tasks
    tasks: Map<string, TaskSyncEntry>;
    
    // Pending operations queue
    pendingOperations: SyncOperation[];
    
    // Failed operations for retry
    failedOperations: SyncOperation[];
    
    // Sync statistics
    stats: SyncStats;
}

interface TaskSyncEntry {
    todoistId: string;
    obsidianFile: string;
    obsidianLine: number;
    
    // Current state
    obsidianCompleted: boolean;
    todoistCompleted: boolean;
    
    // Tracking metadata
    lastObsidianCheck: number;
    lastTodoistCheck: number;
    lastSyncOperation: number;
    
    // Change detection
    obsidianContentHash: string;
    todoistContentHash: string;
    
    // Due date for smart filtering
    todoistDueDate?: string;
}

interface SyncOperation {
    id: string;
    type: 'obsidian_to_todoist' | 'todoist_to_obsidian';
    taskId: string;
    timestamp: number;
    status: 'pending' | 'completed' | 'failed';
    retryCount: number;
    error?: string;
}

interface SyncStats {
    totalTasks: number;
    newTasksFound: number;
    operationsCompleted: number;
    operationsFailed: number;
    lastSyncDuration: number;
}
```

### 2. Change Detection System
```typescript
class ChangeDetector {
    // Detect new tasks in Obsidian files
    async scanForNewTasks(files: TFile[]): Promise<TaskSyncEntry[]>
    
    // Detect completion status changes in Obsidian
    async detectObsidianChanges(knownTasks: TaskSyncEntry[]): Promise<SyncOperation[]>
    
    // Detect completion status changes in Todoist
    async detectTodoistChanges(knownTasks: TaskSyncEntry[]): Promise<SyncOperation[]>
    
    // Generate content hash for change detection
    generateContentHash(content: string): string
}
```

### 3. Sync Journal Manager
```typescript
class SyncJournalManager {
    private journalPath: string;
    private journal: SyncJournal;
    
    // Load/save journal from/to file
    async loadJournal(): Promise<void>
    async saveJournal(): Promise<void>
    
    // Task registry management
    async addTask(task: TaskSyncEntry): Promise<void>
    async updateTask(taskId: string, updates: Partial<TaskSyncEntry>): Promise<void>
    async removeTask(taskId: string): Promise<void>
    
    // Operation queue management
    async addOperation(operation: SyncOperation): Promise<void>
    async completeOperation(operationId: string): Promise<void>
    async failOperation(operationId: string, error: string): Promise<void>
    
    // Query methods
    getTasksNeedingSync(): TaskSyncEntry[]
    getPendingOperations(): SyncOperation[]
    getFailedOperations(): SyncOperation[]
}
```

## Sync Flow

### 1. Incremental Discovery Phase
```typescript
async performIncrementalSync(): Promise<void> {
    // 1. Load existing journal
    await this.journalManager.loadJournal();
    
    // 2. Scan for new tasks (only if files changed since last scan)
    const newTasks = await this.discoverNewTasks();
    
    // 3. Detect changes in known tasks
    const changes = await this.detectChanges();
    
    // 4. Process operations queue
    await this.processOperations();
    
    // 5. Save updated journal
    await this.journalManager.saveJournal();
}

async discoverNewTasks(): Promise<TaskSyncEntry[]> {
    const lastScan = this.journal.lastObsidianScan;
    
    // Only scan files modified since last scan
    const modifiedFiles = this.getFilesModifiedSince(lastScan);
    
    // Scan only modified files for new linked tasks
    const newTasks = await this.scanFilesForNewTasks(modifiedFiles);
    
    // Add to journal
    for (const task of newTasks) {
        await this.journalManager.addTask(task);
    }
    
    return newTasks;
}
```

### 2. Change Detection Phase
```typescript
async detectChanges(): Promise<SyncOperation[]> {
    const operations: SyncOperation[] = [];
    const knownTasks = this.journal.tasks;
    
    for (const [taskId, taskEntry] of knownTasks) {
        // Check Obsidian side for changes
        const obsidianChange = await this.checkObsidianTaskChange(taskEntry);
        if (obsidianChange) {
            operations.push(obsidianChange);
        }
        
        // Check Todoist side for changes (with smart filtering)
        if (this.shouldCheckTodoistTask(taskEntry)) {
            const todoistChange = await this.checkTodoistTaskChange(taskEntry);
            if (todoistChange) {
                operations.push(todoistChange);
            }
        }
    }
    
    return operations;
}

shouldCheckTodoistTask(task: TaskSyncEntry): boolean {
    // Always check if task has future due date
    if (task.todoistDueDate && new Date(task.todoistDueDate) > new Date()) {
        return true;
    }
    
    // Check if within time window
    const timeWindow = this.settings.syncTimeWindowDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - timeWindow;
    
    return task.lastTodoistCheck > cutoff;
}
```

### 3. Operation Processing Phase
```typescript
async processOperations(): Promise<void> {
    const pendingOps = this.journalManager.getPendingOperations();
    
    for (const operation of pendingOps) {
        try {
            await this.executeOperation(operation);
            await this.journalManager.completeOperation(operation.id);
        } catch (error) {
            await this.journalManager.failOperation(operation.id, error.message);
        }
    }
    
    // Retry failed operations (with exponential backoff)
    await this.retryFailedOperations();
}
```

## Performance Benefits

### Current Approach vs Log-Based Approach

| Metric | Current (Scanning) | Log-Based | Improvement |
|--------|-------------------|-----------|-------------|
| **Complexity** | O(total tasks) | O(changed tasks) | ~100x faster |
| **API Calls** | All tasks every sync | Only changed tasks | ~95% reduction |
| **File I/O** | All files every sync | Only modified files | ~90% reduction |
| **Memory Usage** | Temporary (lost on restart) | Persistent state | Reliable |
| **Interruption Recovery** | Start from scratch | Resume from journal | Robust |
| **User Feedback** | Limited | Detailed progress | Better UX |

### Example Performance Scenario
- **1000 historical tasks, 5 new changes per day**
- Current: Process 1000 tasks every sync
- Log-based: Process 5 tasks every sync
- **Result: 200x performance improvement**

## Implementation Strategy

### Phase 1: Core Journal Infrastructure
1. Implement `SyncJournalManager` class
2. Design journal file format and storage
3. Create change detection utilities
4. Add journal migration from current approach

### Phase 2: Incremental Sync Logic
1. Replace scanning with journal-based discovery
2. Implement change detection for both platforms
3. Add operation queue processing
4. Integrate with existing sync methods

### Phase 3: Advanced Features
1. Add retry logic with exponential backoff
2. Implement sync progress UI
3. Add manual sync controls (force resync, reset journal)
4. Performance monitoring and statistics

### Phase 4: Migration and Cleanup
1. Migrate existing users seamlessly
2. Remove old scanning code
3. Add comprehensive testing
4. Update documentation

## User Benefits

1. **Dramatically faster sync** - especially for users with many historical tasks
2. **Reliable operation** - survives interruptions and restarts
3. **Clear progress feedback** - know exactly what's being synced
4. **Error recovery** - failed operations are retried automatically
5. **Selective control** - manual sync options for power users
6. **Future-proof** - scales with growing task collections

This log-based approach would transform the plugin from a "brute force scanner" into an "intelligent sync engine" that learns and adapts to user patterns while providing superior performance and reliability.
