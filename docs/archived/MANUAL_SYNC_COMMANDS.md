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
- Performs immediate completion status synchronization
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
- Syncs completion status for each task automatically
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
- Uses journal-based sync for optimal performance
- Leverages intelligent task prioritization
- Provides comprehensive sync progress feedback

## Technical Architecture

### Five-Category Task Prioritization in Manual Sync

Manual sync commands leverage the same intelligent **Five-Category Task Prioritization System** used by automatic sync, but with immediate processing regardless of timing constraints:

#### How Categories Affect Manual Sync

**🔴 HIGH PRIORITY (Categories 1 & 2): Immediate Sync**
- **Mismatched completion status** between Obsidian and Todoist
- **Manual sync behavior**: Always processed immediately
- **API calls**: Essential calls made regardless of optimization settings
- **User benefit**: Ensures data consistency when manually triggered

**🟡 MEDIUM PRIORITY (Category 3): Normal Processing**
- **Both platforms have tasks open/active**
- **Manual sync behavior**: Checked and synced if needed
- **API calls**: Made when manual sync is triggered
- **User benefit**: Ensures active tasks are synchronized on demand

**🟢 LOW PRIORITY (Category 4): Respects User Settings**
- **Both platforms have tasks completed**
- **Manual sync behavior**: 
  - **If tracking enabled**: Tasks are checked and synced
  - **If tracking disabled**: Tasks are skipped (consistent with automatic sync)
- **API calls**: Respects "Track tasks completed in both sources" setting
- **User benefit**: Manual sync honors performance optimization preferences

**⚫ SKIP CATEGORY (Category 5): Always Skipped**
- **Deleted or orphaned tasks**
- **Manual sync behavior**: Completely ignored
- **API calls**: Zero - maximum efficiency
- **User benefit**: No wasted processing on non-existent tasks

#### Manual Sync Advantages

**Immediate Processing**: Unlike automatic sync which respects timing intervals, manual sync commands:
- Process HIGH PRIORITY tasks immediately regardless of last check time
- Override timing constraints for MEDIUM PRIORITY tasks
- Still respect user settings for LOW PRIORITY tasks
- Always skip SKIP CATEGORY tasks for efficiency

**Performance Benefits**: Manual sync commands benefit from category optimization:
- **Reduced API calls**: Only processes tasks that need attention
- **Smart skipping**: Automatically ignores deleted/orphaned tasks
- **User control**: Respects performance settings for completed tasks
- **Efficient processing**: Focuses on tasks likely to need synchronization

### Direct Completion Sync
Manual sync commands perform direct completion status synchronization:

1. **Get Current Status**: Read completion status from both Obsidian and Todoist
2. **Determine Category**: Classify task using five-category system
3. **Apply Category Logic**: Process according to category rules and user settings
4. **Perform Sync**: Immediately update the platform that's out of sync (if needed)
5. **Update Journal**: Record changes in the journal for tracking
6. **Add Timestamp**: Apply completion timestamp when syncing from Todoist to Obsidian

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

- **Journal-Based Sync**: Uses intelligent task discovery and state tracking
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
- **Vault sync**: Uses journal-based sync for optimal performance

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
- Check that task completion auto-sync is enabled in settings
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
- **Consistent behavior**: Same completion sync logic and timestamp handling
- **Performance optimization**: Manual commands benefit from journal-based optimizations

The manual sync commands provide the flexibility and control you need for immediate task synchronization while maintaining the efficiency and reliability of the automatic sync system.
