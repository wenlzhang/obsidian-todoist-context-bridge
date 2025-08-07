# Journal-Based Sync System

The journal-based sync system is the core synchronization engine of the Obsidian Todoist Context Bridge plugin. It provides efficient, reliable, and intelligent task synchronization between Obsidian and Todoist through persistent state tracking.

## Overview

The journal-based sync system maintains a persistent JSON file that tracks the state of all linked tasks between Obsidian and Todoist. This approach enables:

- **Incremental synchronization**: Only processes tasks that have actually changed
- **Efficient API usage**: Minimizes Todoist API calls through intelligent caching
- **Reliable state tracking**: Maintains consistent task states across plugin restarts
- **Self-healing capabilities**: Automatically recovers from inconsistencies

## How It Works

### Journal Structure

The sync journal stores comprehensive information about each linked task:

```json
{
  "version": "2.0",
  "lastUpdated": 1704067200000,
  "lastValidationTime": 1704067200000,
  "tasks": {
    "task_id_123": {
      "todoistId": "task_id_123",
      "obsidianFile": "projects/project-alpha.md",
      "obsidianNoteId": "note_abc123",
      "lineNumber": 15,
      "content": "Complete project documentation",
      "obsidianCompleted": false,
      "todoistCompleted": false,
      "lastSyncOperation": 1704067200000,
      "lastObsidianCheck": 1704067200000,
      "lastTodoistCheck": 1704067200000,
      "category": 3
    }
  },
  "deletedTasks": {
    "old_task_456": {
      "deletedAt": 1704067200000,
      "reason": "task_deleted_todoist"
    }
  }
}
```

### Sync Process

1. **Journal Loading**: Plugin loads the existing journal or creates a new one
2. **Task Discovery**: Scans vault files to discover new Todoist-linked tasks
3. **State Comparison**: Compares current task states with journal records
4. **Change Detection**: Identifies tasks that need synchronization
5. **Sync Execution**: Performs bidirectional sync for changed tasks
6. **Journal Update**: Updates journal with new states and timestamps

## Key Features

### Intelligent Task Prioritization

The journal system uses a **Five-Category Task Prioritization System** to optimize sync performance:

- **Category 1**: Obsidian completed, Todoist open (HIGH PRIORITY)
- **Category 2**: Obsidian open, Todoist completed (HIGH PRIORITY)
- **Category 3**: Both open/active (MEDIUM PRIORITY)
- **Category 4**: Both completed (LOW PRIORITY - user configurable)
- **Category 5**: Deleted/orphaned tasks (SKIP)

### Smart Fallback System

When the journal is stale or incomplete, the system includes intelligent fallback mechanisms:

```typescript
// Try journal first (efficient when current)
let fileTasks = journalManager.getTasksForFile(file.path);

// Smart fallback: If no tasks in journal, discover them directly
if (fileTasks.length === 0) {
    const discoveredTasks = await changeDetector.discoverTasksInFile(file);
    if (discoveredTasks.length > 0) {
        // Update journal immediately (self-healing)
        await journalManager.addTasks(discoveredTasks);
        fileTasks = discoveredTasks;
    }
}
```

### Performance Optimization

**API Call Reduction**: The journal system dramatically reduces Todoist API calls:

- **Before**: 50+ API calls per sync cycle
- **After**: 2-5 API calls per sync cycle (90%+ reduction)

**Efficient Change Detection**:

- Checks Obsidian changes first (no API calls)
- Only queries Todoist when compelling reasons exist
- Uses bulk API operations when possible

### Self-Healing Capabilities

The journal system includes automatic recovery mechanisms:

- **Journal Validation**: Periodically validates journal completeness
- **Missing Task Recovery**: Discovers and adds missing tasks automatically
- **Corruption Recovery**: Attempts to recover from corrupted journal files
- **Backup System**: Maintains automatic backups for data safety

## Configuration

### Sync Interval Settings

The journal maintenance frequency is automatically calculated based on your sync interval:

- **Sync interval**: User-configurable (1-60 minutes)
- **Journal maintenance**: Runs at 1/3 of sync interval (minimum 2 minutes)
- **Example**: 15-minute sync → 5-minute journal maintenance

### Performance Settings

**Track tasks completed in both sources**:

- **Enabled**: Category 4 tasks are tracked and synced
- **Disabled**: Category 4 tasks are skipped for better performance

**Completion timestamp format**:

- Configurable timestamp format for completed tasks
- Uses Moment.js formatting patterns

## Journal Management

### Validation and Healing

The system provides commands for journal maintenance:

- **Smart journal maintenance**: Intelligent validation with pre-checks
- **Force rebuild journal**: Complete journal reconstruction
- **Create journal backup**: Manual backup creation

### Backup System

**Automatic Backups**:

- Created before major journal operations
- Stored with timestamps for easy identification
- Automatic cleanup of old backups

**Manual Backups**:

- Available via command palette
- Useful before major vault changes
- Can be restored manually if needed

## Technical Details

### File Tracking

The journal system uses a robust file tracking approach:

1. **Primary Identifier**: Note ID from frontmatter (resilient to file moves)
2. **Secondary Identifier**: File path (updated when files move)
3. **Lookup Strategy**: Always tries note ID first, falls back to file path

### State Management

**Task States**:

- `obsidianCompleted`: Task completion status in Obsidian
- `todoistCompleted`: Task completion status in Todoist
- `lastSyncOperation`: Timestamp of last sync operation
- `category`: Current task category for prioritization

**Timestamps**:

- `lastObsidianCheck`: Last time Obsidian state was checked
- `lastTodoistCheck`: Last time Todoist state was checked
- `lastSyncOperation`: Last time task was actually synced

### Error Handling

**Graceful Degradation**:

- Individual task failures don't stop batch operations
- Automatic fallback to direct file scanning when needed
- Comprehensive error logging for troubleshooting

**Recovery Mechanisms**:

- Journal corruption detection and recovery
- Missing task discovery and integration
- Backup restoration capabilities

## Best Practices

### Optimal Performance

1. **Regular Validation**: Let the system run its automatic validation cycles
2. **Reasonable Sync Intervals**: Use 15-30 minute intervals for most workflows
3. **Clean Journal**: Occasionally run "Smart journal maintenance" command
4. **Monitor Performance**: Check console logs for API usage patterns

### Troubleshooting

1. **Sync Issues**: Run "Smart journal maintenance" to validate journal health
2. **Performance Problems**: Check if journal validation is running too frequently
3. **Missing Tasks**: Use "Force rebuild journal" to rediscover all tasks
4. **Corruption**: Restore from backup if journal becomes corrupted

### Workflow Integration

**Daily Use**:

- Let automatic sync handle routine synchronization
- Use manual sync commands for immediate needs
- Monitor journal health through settings feedback

**Maintenance**:

- Run journal maintenance weekly or when issues arise
- Create manual backups before major vault reorganizations
- Check sync logs if performance degrades

## Migration and Compatibility

### Version Compatibility

The journal system supports automatic migration between versions:

- **V1 to V2**: Automatic migration with data preservation
- **Backward Compatibility**: Older journal formats are automatically upgraded
- **Data Integrity**: Migration includes verification and error checking

### Vault Changes

- **File Moves**: Journal automatically updates file paths when files are moved
- **Note ID Changes**: System can handle note ID updates through file path fallback
- **Bulk Operations**: Smart handling of bulk file operations and reorganizations

## Related Documentation

- [Five-Category Task System](five-category-system.md) - Task prioritization details
- [Journal Management](../advanced/journal-management.md) - Advanced journal operations
- [Performance Optimization](../advanced/performance-optimization.md) - System tuning
- [Architecture Overview](../technical/architecture.md) - Technical implementation details
