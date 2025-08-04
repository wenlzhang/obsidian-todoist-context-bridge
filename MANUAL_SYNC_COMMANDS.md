# Manual Sync Commands Guide

## Overview

The Obsidian Todoist Context Bridge plugin provides granular manual sync commands that give you immediate control over task synchronization between Obsidian and Todoist. These commands complement the automatic sync system and are perfect for on-demand synchronization workflows.

## Available Commands

### 1. Sync Current Task Completion Status

**Command**: `Sync current task completion status`

**Usage**:
1. Place your cursor anywhere on a task line (e.g., `- [ ] Complete project documentation`)
2. Open the command palette (Ctrl/Cmd + P)
3. Search for and run "Sync current task completion status"

**Behavior**:
- Searches the current task line and its indented sub-items for Todoist links
- Performs immediate bidirectional completion status synchronization
- Updates the journal after sync for future efficiency
- Works with both enhanced and regular sync services

**Smart Detection**:
The command automatically finds Todoist links in sub-items beneath the main task:
```markdown
- [ ] Complete project documentation
    - [🔗 View in Todoist](https://todoist.com/showTask?id=abc123)
    - Due: 2024-01-15
```

**Error Handling**:
- ❌ "Please place cursor on a task line to sync" - When cursor is not on a task line
- ❌ "No Todoist task found linked to the current task" - When no Todoist link is found
- ✅ Success notification when sync completes

### 2. Sync All Tasks in Current File

**Command**: `Sync all tasks in current file`

**Usage**:
1. Open any file containing Todoist-linked tasks
2. Run the command from the command palette
3. All linked tasks in the file will be synced immediately

**Behavior**:
- Discovers all tasks with Todoist links in the active file
- Uses journal-based task discovery for optimal performance
- Falls back to direct file scanning if journal is stale (smart fallback)
- Syncs completion status for each task bidirectionally
- Updates journal with any newly discovered tasks

**Performance**:
- **When journal is current**: Fast O(1) journal lookup
- **When journal is stale**: Falls back to discovery, then updates journal
- **Self-healing**: System becomes more efficient over time

**Example Output**:
```
[MANUAL SYNC] Found 3 linked tasks in journal for file
[MANUAL SYNC] Synced 2 tasks, 1 already in sync
```

### 3. Sync All Tasks in Vault

**Command**: `Sync all tasks in vault`

**Usage**:
- Run from the command palette to trigger a comprehensive vault-wide sync
- Equivalent to the automatic sync but triggered manually
- Useful for immediate synchronization regardless of sync interval

**Behavior**:
- Processes all linked tasks across your entire vault
- Leverages enhanced sync optimizations when available
- Respects time window filtering settings if enabled
- Provides comprehensive sync progress feedback

## Technical Architecture

### Direct Bidirectional Sync
Manual sync commands perform direct bidirectional synchronization:

1. **Get Current Status**: Read completion status from both Obsidian and Todoist
2. **Compare Status**: Determine which direction needs sync
3. **Perform Sync**: Immediately update the platform that's out of sync
4. **Update Journal**: Record changes in the journal for tracking
5. **Add Timestamp**: Apply completion timestamp when syncing from Todoist to Obsidian

### Smart Fallback System
The file sync command includes intelligent fallback logic:

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

### Service Integration
Manual sync commands work with both sync services:

- **Enhanced Sync Service**: Uses journal-based task discovery and advanced features
- **Regular Sync Service**: Falls back to direct API calls and file modification
- **Automatic Detection**: Plugin automatically selects appropriate service

## User Experience

### Command Palette Integration
All commands are available via Obsidian's command palette:
- Clear, descriptive command names using sentence case
- Context-sensitive commands (editor callback for current task)
- Consistent with Obsidian plugin guidelines

### Error Handling
- Individual task failures don't stop batch operations
- Clear logging for debugging and troubleshooting
- Graceful fallbacks between enhanced and regular sync services
- Informative error messages guide user behavior

### Performance Benefits
- **Single task sync**: O(1) - Direct task lookup and sync
- **File sync**: O(n) where n = tasks in file
- **Vault sync**: Leverages existing optimizations (time window, journal-based)

## Best Practices

### When to Use Manual Sync Commands

1. **Current Task Sync**: 
   - When you just completed a task and want immediate sync
   - For testing task linking and sync behavior
   - When working with specific tasks that need immediate attention

2. **File Sync**:
   - After adding multiple new Todoist-linked tasks to a file
   - When working intensively on a specific project file
   - For focused workflow management

3. **Vault Sync**:
   - When you want to ensure everything is synchronized immediately
   - Before important meetings or deadlines
   - After bulk task operations

### Workflow Integration

Manual sync commands integrate seamlessly with your existing workflow:

- **No interruption**: Commands work regardless of automatic sync interval
- **Immediate feedback**: Clear success/error notifications
- **Journal maintenance**: Commands update the sync journal for future efficiency
- **Timestamp handling**: Respects user preferences for completion timestamps

## Troubleshooting

### Common Issues

**"No Todoist task found linked to the current task"**
- Ensure the task has a Todoist link in its sub-items
- Check that the link format is correct (e.g., `[abc123](https://todoist.com/showTask?id=abc123)`)
- Verify the task is properly indented as a sub-item

**"Found 0 linked tasks in journal for file"**
- This triggers the smart fallback - the command will discover tasks directly
- Journal will be updated automatically for future efficiency
- This is normal behavior when journal is stale or file is new

**Manual sync not working**
- Check that bidirectional sync is enabled in settings
- Verify Todoist API token is valid
- Ensure tasks exist in both Obsidian and Todoist
- Check console logs for detailed error information

### Debug Information

Enable debug logging to troubleshoot issues:
- Manual sync operations use `[MANUAL SYNC]` prefix in logs
- Journal maintenance uses `[JOURNAL MAINTENANCE]` prefix
- Check browser console (Ctrl/Cmd + Shift + I) for detailed information

## Integration with Automatic Sync

Manual sync commands complement the automatic sync system:

- **Independent operation**: Manual commands work regardless of sync interval
- **Journal integration**: Manual commands update the journal used by automatic sync
- **Consistent behavior**: Same bidirectional sync logic and timestamp handling
- **Performance optimization**: Manual commands benefit from journal-based optimizations

The manual sync commands provide the flexibility and control you need for immediate task synchronization while maintaining the efficiency and reliability of the automatic sync system.
