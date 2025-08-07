# API Reference

This document provides a comprehensive reference for the Todoist Context Bridge plugin's internal APIs, interfaces, and data structures.

## Core Interfaces

### Settings Interface

```typescript
interface TodoistContextBridgeSettings {
    // Authentication
    todoistApiToken: string;
    defaultProjectId: string;
    
    // Task Linking
    todoistLinkFormat: "website" | "app" | "both";
    
    // Task Completion Auto-Sync
    enableBidirectionalSync: boolean;
    syncIntervalMinutes: number;
    completionTimestampFormat: string;
    completionTimestampSource: "sync-time" | "todoist-completion";
    enableCompletionTimestamp: boolean;
    
    // Five-Category Task System
    trackBothCompletedTasks: boolean;
    
    // Notifications
    notificationPreference: "all" | "errors-only" | "none";
    
    // Advanced
    uidFieldName: string;
}
```

### Journal Data Structures

#### SyncJournal

```typescript
interface SyncJournal {
    tasks: Record<string, TaskEntry>;
    deletedTasks: Record<string, DeletedTaskEntry>;
    lastValidationTime?: number;
    version: string;
}
```

#### TaskEntry

```typescript
interface TaskEntry {
    // File Identification
    obsidianFile: string;
    noteId?: string;
    
    // Task Identification
    todoistId: string;
    obsidianLine?: number;
    
    // Completion Status
    obsidianCompleted: boolean;
    todoistCompleted: boolean;
    
    // Content Tracking
    obsidianContentHash: string;
    todoistContentHash: string;
    
    // Timestamps
    lastSyncTime: number;
    lastSyncOperation: number;
    lastObsidianCheck: number;
    lastTodoistCheck: number;
    
    // State Management
    completionState: CompletionState;
    orphaned?: boolean;
    deleted?: boolean;
}
```

#### DeletedTaskEntry

```typescript
interface DeletedTaskEntry {
    todoistId: string;
    obsidianFile: string;
    deletedAt: number;
    reason: "file-deleted" | "task-removed" | "manual-deletion";
    lastKnownContent?: string;
}
```

### Completion States

```typescript
type CompletionState = 
    | "obsidian-completed-todoist-open"     // High Priority
    | "obsidian-open-todoist-completed"     // High Priority
    | "both-open"                           // Medium Priority
    | "both-completed"                      // Low Priority (configurable)
    | "deleted-or-orphaned";                // Skip Category
```

### Sync Operations

#### SyncOperation

```typescript
interface SyncOperation {
    type: "obsidian_to_todoist" | "todoist_to_obsidian";
    taskId: string;
    todoistId: string;
    obsidianFile: string;
    obsidianLine?: number;
    operation: "complete" | "uncomplete" | "update-content";
    timestamp: number;
    metadata?: Record<string, any>;
}
```

## Core Services API

### EnhancedBidirectionalSyncService

#### Constructor

```typescript
constructor(
    app: App,
    settings: TodoistContextBridgeSettings,
    todoistApi: TodoistAPI,
    textParsing: TextParsing
)
```

#### Key Methods

##### start()

```typescript
async start(): Promise<void>
```
Initializes the sync service with deferred background processing.

##### stop()

```typescript
stop(): void
```
Stops the sync service and cleans up resources.

##### performSync()

```typescript
async performSync(): Promise<void>
```
Executes a complete sync cycle with change detection and processing.

##### syncSingleTask()

```typescript
async syncSingleTask(
    activeFile: TFile,
    todoistId: string,
    taskLine: string,
    lineNumber: number
): Promise<void>
```
Performs direct bidirectional sync for a single task.

##### syncFileTasksCompletion()

```typescript
async syncFileTasksCompletion(file: TFile): Promise<void>
```
Syncs all linked tasks in a specific file.

##### triggerManualSync()

```typescript
async triggerManualSync(): Promise<void>
```
Performs manual sync across the entire vault.

### ChangeDetector

#### Constructor

```typescript
constructor(
    app: App,
    settings: TodoistContextBridgeSettings,
    todoistApi: TodoistAPI,
    textParsing: TextParsing,
    journalManager: SyncJournalManager
)
```

#### Key Methods

##### detectChanges()

```typescript
async detectChanges(): Promise<SyncOperation[]>
```
Detects changes across all tracked tasks and returns sync operations.

##### discoverTasksInFile()

```typescript
async discoverTasksInFile(file: TFile): Promise<TaskEntry[]>
```
Discovers all Todoist-linked tasks in a specific file.

##### validateJournalCompleteness()

```typescript
async validateJournalCompleteness(
    processingType: "smart maintenance" | "force rebuild"
): Promise<void>
```
Validates and heals the journal to ensure all linked tasks are tracked.

##### bulkFetchTodoistTasks()

```typescript
async bulkFetchTodoistTasks(): Promise<Record<string, any>>
```
Efficiently fetches all active Todoist tasks with V1/V2 ID compatibility.

### SyncJournalManager

#### Constructor

```typescript
constructor(app: App, settings: TodoistContextBridgeSettings)
```

#### Key Methods

##### loadJournal()

```typescript
async loadJournal(): Promise<void>
```
Loads the journal from disk with migration and validation.

##### saveJournal()

```typescript
async saveJournal(): Promise<void>
```
Saves the journal to disk with atomic operations.

##### addTask()

```typescript
async addTask(taskEntry: TaskEntry): Promise<void>
```
Adds a new task entry to the journal.

##### updateTask()

```typescript
updateTask(taskId: string, updates: Partial<TaskEntry>): void
```
Updates an existing task entry in the journal.

##### removeTask()

```typescript
removeTask(taskId: string): void
```
Removes a task from the journal (moves to deleted section).

##### getAllTasks()

```typescript
getAllTasks(): Record<string, TaskEntry>
```
Returns all active tasks from the journal.

##### getDeletedTasks()

```typescript
getDeletedTasks(): Record<string, DeletedTaskEntry>
```
Returns all deleted tasks from the journal.

##### createBackup()

```typescript
async createBackup(reason: string): Promise<string>
```
Creates a timestamped backup of the journal.

##### resetJournal()

```typescript
async resetJournal(): Promise<void>
```
Resets the journal to default state (with confirmation).

### TodoistAPI

#### Constructor

```typescript
constructor(apiToken: string)
```

#### Key Methods

##### getTasks()

```typescript
async getTasks(): Promise<Task[]>
```
Fetches all active tasks from Todoist.

##### getTask()

```typescript
async getTask(taskId: string): Promise<Task>
```
Fetches a specific task by ID.

##### createTask()

```typescript
async createTask(taskData: CreateTaskData): Promise<Task>
```
Creates a new task in Todoist.

##### updateTask()

```typescript
async updateTask(taskId: string, updates: UpdateTaskData): Promise<Task>
```
Updates an existing task in Todoist.

##### closeTask()

```typescript
async closeTask(taskId: string): Promise<void>
```
Marks a task as completed in Todoist.

##### reopenTask()

```typescript
async reopenTask(taskId: string): Promise<void>
```
Reopens a completed task in Todoist.

##### getProjects()

```typescript
async getProjects(): Promise<Project[]>
```
Fetches all projects from Todoist.

### TextParsing

#### Constructor

```typescript
constructor(settings: TodoistContextBridgeSettings)
```

#### Key Methods

##### isTaskLine()

```typescript
isTaskLine(line: string): boolean
```
Determines if a line contains a task.

##### getTaskStatus()

```typescript
getTaskStatus(line: string): "completed" | "incomplete"
```
Extracts the completion status from a task line.

##### extractTodoistLinks()

```typescript
extractTodoistLinks(content: string): string[]
```
Extracts Todoist task IDs from content.

##### hasCompletionTimestamp()

```typescript
hasCompletionTimestamp(line: string): boolean
```
Checks if a task line already has a completion timestamp.

##### addCompletionTimestamp()

```typescript
addCompletionTimestamp(
    line: string,
    todoistCompletedAt?: string
): string
```
Adds a completion timestamp to a task line.

## Event System

### Sync Events

The plugin emits various events during sync operations:

#### sync-started

```typescript
interface SyncStartedEvent {
    type: "manual" | "auto";
    timestamp: number;
    scope: "vault" | "file" | "task";
}
```

#### sync-completed

```typescript
interface SyncCompletedEvent {
    type: "manual" | "auto";
    timestamp: number;
    operations: SyncOperation[];
    duration: number;
}
```

#### sync-error

```typescript
interface SyncErrorEvent {
    type: "manual" | "auto";
    timestamp: number;
    error: Error;
    context: string;
}
```

#### task-synced

```typescript
interface TaskSyncedEvent {
    taskId: string;
    todoistId: string;
    operation: SyncOperation;
    timestamp: number;
}
```

## Command API

### Registered Commands

#### Manual Sync Commands

- `todoist-context-bridge:sync-single-task` - Sync current task
- `todoist-context-bridge:sync-file-tasks` - Sync all tasks in current file
- `todoist-context-bridge:trigger-manual-sync` - Sync entire vault

#### Journal Management Commands

- `todoist-context-bridge:smart-journal-maintenance` - Intelligent journal maintenance
- `todoist-context-bridge:force-rebuild-journal` - Force complete journal rebuild
- `todoist-context-bridge:backup-sync-journal` - Create journal backup
- `todoist-context-bridge:reset-sync-journal` - Reset journal (with confirmation)

#### Task Creation Commands

- `todoist-context-bridge:create-task` - Create new Todoist task from selection
- `todoist-context-bridge:todoist-to-obsidian` - Import Todoist tasks to Obsidian

### Command Context

Commands receive context about the current state:

```typescript
interface CommandContext {
    activeFile?: TFile;
    selection?: string;
    cursor?: EditorPosition;
    linkedTasks?: TaskEntry[];
}
```

## Utility Functions

### Content Hashing

```typescript
function generateContentHash(content: string): string
```
Generates a hash for content change detection.

### ID Conversion

```typescript
function normalizeTaskId(taskId: string): string
```
Normalizes task IDs for V1/V2 compatibility.

### Timestamp Formatting

```typescript
function formatTimestamp(
    date: Date,
    format: string
): string
```
Formats timestamps using moment.js patterns.

### File Path Validation

```typescript
function validateFilePath(
    app: App,
    filePath: string
): Promise<boolean>
```
Validates that a file path exists and is accessible.

## Error Handling

### Error Types

#### SyncError

```typescript
class SyncError extends Error {
    code: string;
    context: Record<string, any>;
    recoverable: boolean;
}
```

#### APIError

```typescript
class APIError extends Error {
    status: number;
    response: any;
    retryable: boolean;
}
```

#### JournalError

```typescript
class JournalError extends Error {
    operation: string;
    journalPath: string;
    backupCreated: boolean;
}
```

### Error Codes

- `TODOIST_API_ERROR` - Todoist API communication failure
- `JOURNAL_CORRUPTION` - Journal file corruption detected
- `FILE_NOT_FOUND` - Referenced file no longer exists
- `TASK_NOT_FOUND` - Referenced task no longer exists
- `RATE_LIMIT_EXCEEDED` - API rate limit exceeded
- `AUTHENTICATION_FAILED` - Invalid API token
- `NETWORK_ERROR` - Network connectivity issues

## Performance Monitoring

### Metrics Collection

The plugin collects performance metrics:

```typescript
interface PerformanceMetrics {
    syncDuration: number;
    apiCallCount: number;
    filesScanned: number;
    tasksProcessed: number;
    errorsEncountered: number;
    memoryUsage: number;
}
```

### Performance Events

#### performance-metric

```typescript
interface PerformanceMetricEvent {
    metric: keyof PerformanceMetrics;
    value: number;
    timestamp: number;
    context: string;
}
```

## Configuration

### Default Settings

```typescript
const DEFAULT_SETTINGS: TodoistContextBridgeSettings = {
    todoistApiToken: "",
    defaultProjectId: "",
    todoistLinkFormat: "website",
    enableBidirectionalSync: false,
    syncIntervalMinutes: 15,
    completionTimestampFormat: "YYYY-MM-DD HH:mm",
    completionTimestampSource: "sync-time",
    enableCompletionTimestamp: true,
    trackBothCompletedTasks: false,
    notificationPreference: "errors-only",
    uidFieldName: "uid"
};
```

### Setting Validation

```typescript
function validateSettings(
    settings: Partial<TodoistContextBridgeSettings>
): ValidationResult
```

## Migration

### Journal Schema Versions

The plugin supports migration between journal schema versions:

- **v1.0**: Initial journal format
- **v1.1**: Added completion states
- **v1.2**: Added note ID tracking
- **v1.3**: Added orphaned task tracking

### Migration Functions

```typescript
function migrateJournal(
    journal: any,
    fromVersion: string,
    toVersion: string
): SyncJournal
```

## Testing Utilities

### Mock Objects

```typescript
interface MockTodoistAPI extends TodoistAPI {
    setMockResponse(method: string, response: any): void;
    getCallHistory(): APICall[];
}

interface MockApp extends App {
    setMockVault(vault: MockVault): void;
    setMockWorkspace(workspace: MockWorkspace): void;
}
```

### Test Helpers

```typescript
function createTestJournal(): SyncJournal
function createTestTask(): TaskEntry
function createTestSettings(): TodoistContextBridgeSettings
```

This API reference provides comprehensive documentation for developers working with the Todoist Context Bridge plugin's internal systems and for users building integrations or extensions.
