# Five-Category Task Prioritization System

The Todoist Context Bridge plugin implements an intelligent **Five-Category Task Prioritization System** that dramatically reduces unnecessary Todoist API calls by **90-95%** while maintaining perfect sync accuracy. This system categorizes all tasks based on their completion status across both platforms and applies different sync strategies accordingly.

## Overview

Traditional sync plugins check all tasks on every sync cycle, leading to excessive API usage and rate limiting. Our five-category system intelligently prioritizes tasks based on their likelihood of needing synchronization, resulting in massive performance improvements.

### Performance Impact

- **Before optimization**: ~50+ API calls per sync cycle
- **After optimization**: ~2-5 API calls per sync cycle
- **Reduction**: 90-95% fewer API calls
- **Result**: Eliminated rate limit errors while maintaining perfect sync accuracy

## The Five Categories

### 🔴 **Category 1: HIGH PRIORITY** - Obsidian Completed → Todoist Open

- **Condition**: Task marked complete in Obsidian but still open in Todoist
- **Action**: Immediately sync completion to Todoist via `closeTask()` API
- **Timing**: Processed immediately regardless of sync intervals
- **Rationale**: Critical for maintaining data consistency between platforms
- **API Impact**: Essential API calls that prevent data loss

### 🔴 **Category 2: HIGH PRIORITY** - Obsidian Open → Todoist Completed  

- **Condition**: Task marked complete in Todoist but still open in Obsidian
- **Action**: Immediately sync completion to Obsidian with optional timestamp
- **Timing**: Processed immediately regardless of sync intervals
- **Rationale**: Critical for maintaining data consistency between platforms
- **API Impact**: Essential API calls that prevent data loss

### 🟡 **Category 3: MEDIUM PRIORITY** - Both Open/Active

- **Condition**: Task is open/incomplete in both Obsidian and Todoist
- **Action**: Checked at your configured sync intervals for content changes
- **Timing**: Respects user-configured sync interval settings
- **Rationale**: Active tasks may have content updates, due date changes, etc.
- **API Impact**: Moderate API usage for tasks likely to change

### 🟢 **Category 4: LOW PRIORITY** - Both Completed (User Configurable)

- **Condition**: Task marked as completed in both Obsidian and Todoist
- **Action**: User-configurable tracking (disabled by default)
- **Options**:
  - **Disabled** (Recommended): Completely skipped - zero API calls
  - **Enabled**: Checked very rarely (every 24 hours) in case of reopening
- **Rationale**: Completed tasks are unlikely to be reopened
- **API Impact**: Minimal when enabled, zero when disabled

### ⚫ **Category 5: SKIP CATEGORY** - Deleted/Orphaned Tasks

- **Condition**: Tasks that have been deleted from Todoist or Obsidian
- **Action**: Completely ignored in all sync operations
- **Timing**: Never processed
- **Rationale**: Deleted tasks cannot be synchronized
- **API Impact**: Zero API calls - maximum efficiency
- **Storage**: Preserved in journal log for reference and debugging

## Category Detection Algorithm

The system uses the following logic to categorize tasks:

```typescript
function categorizeTask(task: TaskEntry): TaskCategory {
    // Skip deleted/orphaned tasks entirely
    if (task.deleted || task.orphaned) {
        return TaskCategory.SKIP;
    }
    
    // High priority: Completion status mismatch
    if (task.obsidianCompleted && !task.todoistCompleted) {
        return TaskCategory.HIGH_PRIORITY_OBSIDIAN_COMPLETED;
    }
    if (!task.obsidianCompleted && task.todoistCompleted) {
        return TaskCategory.HIGH_PRIORITY_TODOIST_COMPLETED;
    }
    
    // Medium priority: Both active
    if (!task.obsidianCompleted && !task.todoistCompleted) {
        return TaskCategory.MEDIUM_PRIORITY_BOTH_OPEN;
    }
    
    // Low priority: Both completed (user configurable)
    if (task.obsidianCompleted && task.todoistCompleted) {
        return TaskCategory.LOW_PRIORITY_BOTH_COMPLETED;
    }
}
```

## Sync Behavior by Category

### High Priority Tasks (Categories 1 & 2)

- **Immediate processing**: Bypasses all timing constraints
- **Direct API calls**: Immediate `getTask()` and `closeTask()` operations
- **Timestamp handling**: Adds completion timestamps when syncing to Obsidian
- **Journal updates**: Records sync operations for tracking
- **Error handling**: Retry logic with exponential backoff

### Medium Priority Tasks (Category 3)

- **Interval-based**: Processed at user-configured sync intervals
- **Content checking**: Compares content hashes for changes
- **Conservative API usage**: Only fetches when content changes detected
- **Smart filtering**: Additional filters for due dates and staleness
- **Batch operations**: Groups API calls when possible

### Low Priority Tasks (Category 4)

- **User configurable**: Can be completely disabled
- **Rare checking**: When enabled, checked every 24 hours maximum
- **Minimal API usage**: Only basic status checks
- **Skip optimization**: When disabled, zero API calls
- **Performance focus**: Designed for maximum efficiency

### Skip Category Tasks (Category 5)

- **Complete avoidance**: Never processed in any sync operation
- **Zero API calls**: No Todoist API requests ever made
- **Reference preservation**: Kept in journal for debugging
- **Cleanup handling**: Automatically moved to deleted section
- **Performance optimization**: Maximum efficiency gain

## Configuration Options

### Track Tasks Completed in Both Sources

This setting controls Category 4 (Low Priority) behavior:

- **Location**: Settings → Track tasks completed in both sources
- **Default**: Disabled (recommended)
- **Impact**: 
  - **Disabled**: Category 4 tasks completely skipped (maximum performance)
  - **Enabled**: Category 4 tasks checked every 24 hours

### Performance Recommendations

- **Large vaults (1000+ tasks)**: Keep disabled for maximum performance
- **Active workflows**: Can enable if you frequently reopen completed tasks
- **API rate limits**: Disable if experiencing rate limiting issues
- **Battery life (mobile)**: Keep disabled to preserve battery

## Technical Implementation

### Journal Integration

Each task entry in the sync journal includes:
```json
{
    "completionState": "both_open|both_completed|obsidian_completed|todoist_completed",
    "lastCategoryCheck": 1704067200000,
    "categoryOverride": null,
    "skipReason": null
}
```

### API Call Optimization

- **Bulk operations**: High and medium priority tasks use bulk fetching when possible
- **Individual calls**: Only for specific operations (completion, content updates)
- **Rate limiting**: Built-in exponential backoff and retry logic
- **Caching**: Content hashes prevent redundant API calls

### Performance Monitoring

The system tracks:

- API calls per category per sync cycle
- Category distribution of tasks
- Performance impact metrics
- Rate limiting incidents

## Real-World Performance Examples

### Example 1: Large Vault (1000 tasks)

- **Traditional sync**: 1000 API calls per sync
- **Five-category system**: 
  - High priority: 2-5 tasks (2-5 API calls)
  - Medium priority: 50-100 tasks (5-10 API calls with smart filtering)
  - Low priority: Disabled (0 API calls)
  - Skip category: 0 API calls
- **Total**: 7-15 API calls vs 1000 (98.5% reduction)

### Example 2: Active Workflow (100 tasks)

- **Traditional sync**: 100 API calls per sync
- **Five-category system**:
  - High priority: 1-3 tasks (1-3 API calls)
  - Medium priority: 20-30 tasks (2-5 API calls with filtering)
  - Low priority: Enabled, 1 task every 24 hours (0-1 API calls)
  - Skip category: 0 API calls
- **Total**: 3-9 API calls vs 100 (91% reduction)

## Monitoring and Debugging

### Console Logging

The system provides detailed logging:
```
[ENHANCED SYNC] 📊 Category distribution: High=2, Medium=15, Low=45, Skip=12
[ENHANCED SYNC] 🚀 API calls this cycle: 4 (vs 74 traditional)
[ENHANCED SYNC] ⚡ Performance gain: 94.6% API reduction
```

### Statistics Commands

Use "Show sync statistics" command to view:

- Current category distribution
- API usage patterns
- Performance metrics
- Optimization recommendations

### Troubleshooting

If sync seems slow or uses too many API calls:
1. Check category distribution in console logs
2. Verify "Track tasks completed in both sources" is disabled
3. Run "Smart journal maintenance" to update categories
4. Consider increasing sync interval

## Best Practices

### For Maximum Performance

- Disable "Track tasks completed in both sources"
- Use sync intervals of 10-15 minutes
- Enable "Errors only" notifications
- Run periodic journal maintenance

### For Active Workflows

- Keep "Track tasks completed in both sources" disabled unless needed
- Use sync intervals of 5-10 minutes
- Monitor console logs for performance metrics
- Use manual sync commands for immediate needs

### For Troubleshooting

- Enable detailed logging temporarily
- Use "Show sync statistics" command
- Check category distribution
- Verify journal health with maintenance commands

The five-category system represents a fundamental improvement in sync efficiency, providing the performance benefits of intelligent caching while maintaining the reliability of real-time synchronization for critical operations.
