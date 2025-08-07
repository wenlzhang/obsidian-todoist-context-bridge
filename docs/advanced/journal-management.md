# Journal & Log Management

The Todoist Context Bridge plugin uses an intelligent journal-based sync system to track task states, completion status, and sync history. This document covers all aspects of journal management, including validation, backup, and maintenance operations.

## Overview

### What is the Sync Journal?

The sync journal is a persistent JSON file that stores:

- **Task tracking data**: All linked tasks between Obsidian and Todoist
- **Completion states**: Current completion status in both platforms
- **Content hashes**: MD5 hashes for efficient change detection
- **Sync history**: Timestamps and operation records
- **File tracking**: Note IDs and file paths for robust file handling
- **Deleted task records**: Orphaned tasks for reference and cleanup

### Journal Location

- **Path**: `.obsidian/plugins/todoist-context-bridge/sync-journal.json`
- **Backup location**: `.obsidian/plugins/todoist-context-bridge/backups/`
- **Format**: JSON with structured task entries

## Journal Structure

### Task Entry Format

```json
{
  "tasks": {
    "task-id": {
      "obsidianFile": "/path/to/file.md",
      "noteId": "unique-note-id",
      "todoistId": "12345",
      "obsidianCompleted": false,
      "todoistCompleted": false,
      "obsidianContentHash": "abc123",
      "todoistContentHash": "def456",
      "lastSyncTime": 1704067200000,
      "lastSyncOperation": 1,
      "completionState": "both_open",
      "orphaned": false,
      "deleted": false
    }
  },
  "deletedTasks": {
    "deleted-task-id": {
      "deletionTime": 1704067200000,
      "reason": "file_deleted",
      "originalData": { /* original task data */ }
    }
  },
  "lastValidationTime": 1704067200000,
  "version": "1.0"
}
```

### Completion States

- **`both_open`**: Task is open/incomplete in both platforms
- **`both_completed`**: Task is completed in both platforms  
- **`obsidian_completed`**: Completed in Obsidian, open in Todoist
- **`todoist_completed`**: Completed in Todoist, open in Obsidian

## Journal Management Commands

### Smart Journal Maintenance

**Purpose**: Intelligent, as-needed journal maintenance

**When to use**: Regular maintenance, when sync seems slow

**Features**:

- **Pre-check optimization**: Only runs when needed
- **Intelligent skipping**: Avoids redundant work
- **Minimum intervals**: Respects 5-minute validation intervals
- **Health assessment**: Checks journal completeness before processing
- **Efficient processing**: Only updates missing or changed items

**Process**:

1. Checks journal health (active + deleted tasks vs vault tasks)
2. Skips if journal is 100% complete and recently validated
3. Performs vault scan only if needed
4. Updates missing entries incrementally
5. Validates file paths and note IDs

### Force Rebuild Journal

**Purpose**: Complete journal reconstruction

**When to use**: Journal corruption, major inconsistencies

**Features**:

- **Bypasses all checks**: Ignores pre-check optimization
- **Complete rebuild**: Re-processes ALL tasks from scratch
- **Fresh start**: Creates entirely new journal structure
- **Comprehensive scan**: Scans all files regardless of modification time
- **Full validation**: Validates all task links and states

**Process**:

1. Creates backup of current journal
2. Scans entire vault for linked tasks
3. Fetches current state from Todoist for all tasks
4. Rebuilds journal with fresh data
5. Validates all entries and relationships

### Reset Sync Journal

**Purpose**: Complete journal reset (destructive)

**When to use**: Last resort, complete fresh start needed

**Features**:

- **Two-step confirmation**: Requires typing "RESET" to confirm
- **Complete deletion**: Removes all sync history
- **Fresh initialization**: Creates new empty journal
- **Irreversible operation**: Cannot be undone
- **Safety warnings**: Clear explanation of consequences

## Journal Backup System

### Automatic Backups

The plugin automatically creates backups:

- **Before major operations**: Force rebuild, reset operations
- **On corruption detection**: When journal issues are detected
- **Periodic backups**: Can be configured for regular intervals

### Manual Backup Operations

#### Create Journal Backup
- **Command**: "Create journal backup"
- **Filename format**: `sync-journal-backup-YYYY-MM-DD-HH-mm-ss.json`
- **Content**: Complete copy of current journal
- **Metadata**: Includes creation timestamp and plugin version

#### Restore Journal from Backup
- **Command**: "Restore journal from backup"
- **Process**:
  1. Opens file picker for backup selection
  2. Validates backup file format and integrity
  3. Creates safety backup of current journal
  4. Restores selected backup as active journal
  5. Validates restored journal structure

#### List Journal Backups
- **Command**: "List journal backups"
- **Information displayed**:
  - Backup filename and timestamp
  - File size and task count
  - Creation date and plugin version
  - Quick restore options

### Backup Best Practices
- **Before major changes**: Always backup before force rebuild or reset
- **Regular intervals**: Create weekly backups for active workflows
- **Before plugin updates**: Backup journal before updating plugin
- **Multiple versions**: Keep several backup versions for different time periods

## Journal Validation

### Validation Process

The journal validation system ensures data integrity:

1. **File path validation**: Checks if tracked files still exist
2. **Note ID verification**: Validates note IDs in frontmatter
3. **Todoist link validation**: Verifies Todoist task links
4. **Completion state sync**: Ensures completion states are accurate
5. **Orphan detection**: Identifies and handles orphaned tasks

### Validation Triggers

- **Plugin startup**: Initial validation on load
- **File modifications**: Real-time validation for changed files
- **Manual commands**: Smart journal maintenance
- **Periodic intervals**: Background validation every sync interval

### Validation Optimization

- **Intelligent pre-check**: Skips validation when journal is healthy
- **Incremental updates**: Only processes changed items
- **Batch operations**: Groups related operations for efficiency
- **Rate limiting**: Respects Todoist API limits during validation

## Performance Optimization

### Five-Category Task System

The journal implements intelligent task prioritization:

#### High Priority (Always Processed)

- **Mismatched completion**: Different completion states between platforms
- **New tasks**: Recently discovered tasks needing initial sync

#### Medium Priority (Normal Intervals)

- **Both active**: Tasks open in both platforms
- **Regular sync**: Processed at configured sync intervals

#### Low Priority (User Configurable)

- **Both completed**: Tasks completed in both platforms
- **Rare checking**: Checked every 24 hours if enabled
- **Skip option**: Can be disabled for maximum performance

#### Skip Category (Never Processed)

- **Deleted tasks**: Orphaned or deleted tasks
- **Reference only**: Preserved in journal for reference

### Performance Benefits

- **90-95% API reduction**: Dramatically fewer Todoist API calls
- **Intelligent caching**: Avoids redundant processing
- **Smart filtering**: Only processes tasks that need attention
- **Rate limit protection**: Prevents Todoist rate limiting

## Troubleshooting Journal Issues

### Common Issues and Solutions

#### Journal Corruption

**Symptoms**: Sync errors, missing tasks, invalid JSON

**Solution**: Use "Force rebuild journal" command

#### Missing Tasks

**Symptoms**: Tasks exist but don't sync

**Solution**: Run "Smart journal maintenance"

#### Performance Issues

**Symptoms**: Slow sync, high API usage

**Solutions**:

- Disable "Track tasks completed in both sources"
- Increase sync interval
- Run journal maintenance

#### File Move Issues

**Symptoms**: Tasks not found after moving files

**Solution**: Journal automatically handles file moves via note IDs

### Advanced Troubleshooting

#### Manual Journal Inspection

1. Use "Open sync journal file" command
2. Check for malformed entries
3. Verify task IDs and file paths
4. Look for orphaned entries

#### Log Analysis

- Check Obsidian console for error messages
- Look for API rate limit warnings
- Monitor sync operation logs
- Review validation messages

#### Recovery Procedures

1. **Backup current state**: Create backup before any fixes
2. **Try smart maintenance**: Start with least invasive option
3. **Force rebuild if needed**: More comprehensive fix
4. **Reset as last resort**: Complete fresh start

## Best Practices

### Regular Maintenance

- Run "Smart journal maintenance" weekly
- Create backups before major operations
- Monitor sync performance and adjust settings
- Keep plugin updated for latest improvements

### Performance Optimization

- Use appropriate sync intervals (5-15 minutes)
- Disable both-completed tracking for large vaults
- Enable error-only notifications
- Use note IDs for robust file tracking

### Data Safety

- Regular backups of journal
- Test restore procedures
- Monitor for corruption signs
- Keep multiple backup versions

### Monitoring

- Watch for sync errors in console
- Monitor API usage patterns
- Check journal health regularly
- Review performance metrics
