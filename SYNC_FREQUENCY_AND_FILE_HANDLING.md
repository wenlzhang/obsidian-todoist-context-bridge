# Journal-Based Sync: Frequency Control and File Movement Handling

## Overview

### Journal-Based Sync Frequency Control
The journal-based sync system uses **the same frequency control** as the regular task completion auto-sync:

```typescript
// In EnhancedBidirectionalSyncService.ts (lines 79-84)
if (this.settings.syncIntervalMinutes > 0) {
    this.syncInterval = window.setInterval(
        () => this.performSync(),
        this.settings.syncIntervalMinutes * 60 * 1000
    );
}
```

### Key Points:
- **Frequency Control**: Uses `syncIntervalMinutes` setting (1-1440 minutes)
- **Automatic Sync**: Runs at configured intervals for continuous synchronization
- **Manual Control**: Can be triggered manually via command for immediate updates
- **Performance**: Processes efficiently using incremental changes and journal tracking

### Sync Characteristics:
| Feature | Journal-Based Sync |
|---------|-------------------|
| Frequency Control | syncIntervalMinutes |
| Processing Speed | Fast (incremental) |
| Manual Trigger | Yes |
| Performance | Optimized with state tracking |
| Task Prioritization | Five-category system |
| API Call Reduction | 90-95% fewer calls |

## Five-Category Task Prioritization and Sync Frequency

The journal-based sync system implements an intelligent **Five-Category Task Prioritization System** that works in conjunction with sync frequency control to optimize performance while maintaining accuracy.

### How Categories Interact with Sync Frequency

#### 🔴 **HIGH PRIORITY (Categories 1 & 2): Override Frequency**
- **Mismatched completion status** between Obsidian and Todoist
- **Frequency Behavior**: Processed **immediately** regardless of sync interval
- **Performance Impact**: Essential for data consistency
- **User Benefit**: Critical changes sync instantly, not waiting for next interval

#### 🟡 **MEDIUM PRIORITY (Category 3): Respect Frequency**
- **Both platforms have tasks open/active**
- **Frequency Behavior**: Checked **only** when sync interval triggers
- **Performance Impact**: 80-90% reduction compared to always-checking
- **User Control**: Sync interval directly controls how often these are checked

#### 🟢 **LOW PRIORITY (Category 4): Extended Frequency**
- **Both platforms have tasks completed**
- **Frequency Behavior**: 
  - **If tracking disabled** (default): Never checked
  - **If tracking enabled**: Checked every **24 hours** regardless of sync interval
- **Performance Impact**: 95-100% reduction in API calls
- **Rationale**: Completed tasks rarely change, so extended intervals are sufficient

#### ⚫ **SKIP CATEGORY (Category 5): No Frequency**
- **Deleted or orphaned tasks**
- **Frequency Behavior**: Never processed
- **Performance Impact**: 100% reduction - maximum efficiency
- **File Handling**: Automatically detected during file validation

### Sync Frequency Optimization Strategy

**Traditional Approach (Inefficient):**
```typescript
// Old approach - all tasks checked every interval
setInterval(() => {
    for (const task of allTasks) {
        await checkTodoistTask(task); // API call for EVERY task
    }
}, syncIntervalMinutes * 60 * 1000);
// Result: High API usage, rate limiting issues
```

**Five-Category Approach (Optimized):**
```typescript
// New approach - category-aware frequency control
setInterval(() => {
    for (const task of allTasks) {
        const category = determineTaskCategory(task);
        
        switch (category) {
            case TaskCategory.HIGH_PRIORITY_1:
            case TaskCategory.HIGH_PRIORITY_2:
                // Always process (already handled immediately)
                break;
                
            case TaskCategory.MEDIUM_PRIORITY:
                // Process at sync interval
                await checkTodoistTask(task);
                break;
                
            case TaskCategory.LOW_PRIORITY:
                // Process at extended interval (24h) if enabled
                if (settings.trackBothCompleted && 
                    shouldCheckRarely(task, 24 * 60 * 60 * 1000)) {
                    await checkTodoistTask(task);
                }
                break;
                
            case TaskCategory.SKIP:
                // Never process
                continue;
        }
    }
}, syncIntervalMinutes * 60 * 1000);
// Result: 90-95% fewer API calls, no rate limiting
```

### Performance Impact by Sync Frequency

#### Short Intervals (1-5 minutes)
- **Traditional**: Very high API usage, frequent rate limiting
- **Five-Category**: Sustainable API usage, only medium-priority tasks affected
- **Benefit**: Responsive sync for active tasks without overwhelming API

#### Medium Intervals (15-30 minutes)
- **Traditional**: Moderate API usage, occasional rate limiting
- **Five-Category**: Very low API usage, excellent performance
- **Benefit**: Balanced responsiveness and efficiency

#### Long Intervals (60+ minutes)
- **Traditional**: Lower API usage but poor responsiveness
- **Five-Category**: Minimal API usage, high-priority tasks still immediate
- **Benefit**: Maximum efficiency while maintaining critical sync accuracy

### Frequency Recommendations by Use Case

**Active Development/Writing (1-5 minutes):**
- High-priority tasks sync immediately
- Medium-priority tasks checked frequently
- Low-priority tasks: Disable tracking for maximum performance
- Skip category: Automatically ignored

**Regular Note-Taking (15-30 minutes):**
- Balanced approach for most users
- Good responsiveness without excessive API usage
- Low-priority tasks: Consider enabling if you reopen completed tasks

**Archival/Reference Vaults (60+ minutes):**
- Minimal sync activity expected
- High-priority tasks still sync immediately when they occur
- Low-priority tasks: Keep disabled for maximum efficiency
- Perfect for large vaults with mostly historical content

## File Movement Impact Analysis

### Current Problem
The journal currently tracks files by their **absolute path**:
```json
{
  "todoistId": "6cWf27cpFVVJV77C",
  "obsidianFile": "Todoist Context Bridge/Test Todoist Context Bridge auto sync - 202508021943.md",
  "obsidianLine": 7,
  // ... other properties
}
```

### Impact of Moving Files:
1. **Immediate Impact**: Task becomes "orphaned" in journal
2. **Performance Impact**: Plugin must scan all files to rediscover the task
3. **Sync Disruption**: Task may be treated as "new" again
4. **Journal Bloat**: Old entries remain with invalid paths

## Proposed Solution: Robust File Tracking

### Option 1: Obsidian File ID Tracking (Recommended)
Use Obsidian's internal file tracking system:

```typescript
interface TaskSyncEntry {
    todoistId: string;
    obsidianFileId: string;  // Use file.stat.ctime + file.stat.size as unique ID
    obsidianFilePath: string; // Keep path for display/debugging
    obsidianLine: number;
    // ... other properties
}
```

### Option 2: Content-Based Tracking
Track tasks by their content hash and context:

```typescript
interface TaskSyncEntry {
    todoistId: string;
    obsidianFileId: string;
    obsidianFilePath: string;
    taskContentHash: string;  // Hash of task + surrounding context
    taskContext: string;      // Unique context around the task
    // ... other properties
}
```

### Option 3: Hybrid Approach (Best Performance)
Combine file ID tracking with periodic cleanup:

```typescript
interface TaskSyncEntry {
    todoistId: string;
    obsidianFileId: string;
    obsidianFilePath: string;
    lastPathValidation: number; // Timestamp of last path check
    // ... other properties
}
```

## Implementation Strategy

### Phase 1: Add File ID Tracking
1. Modify `TaskSyncEntry` interface to include file ID
2. Update `ChangeDetector` to generate stable file IDs
3. Add path validation and correction logic

### Phase 2: Journal Migration
1. Add migration logic for existing journals
2. Implement path correction when files are moved
3. Add cleanup for orphaned entries

### Phase 3: Performance Optimization
1. Add file lookup cache
2. Implement batch file validation
3. Add journal compaction

## Code Implementation

### Enhanced TaskSyncEntry Interface:
```typescript
export interface TaskSyncEntry {
    todoistId: string;
    obsidianFileId: string;        // Stable file identifier
    obsidianFilePath: string;      // Current path (may change)
    obsidianLine: number;
    contentHash: string;
    isCompleted: boolean;
    lastObsidianCheck: number;
    lastTodoistCheck: number;
    lastSyncTimestamp: number;
    lastPathValidation?: number;   // When path was last validated
}
```

### File ID Generation:
```typescript
private generateFileId(file: TFile): string {
    // Use file creation time + initial size as stable ID
    return `${file.stat.ctime}_${file.stat.size}_${file.basename}`;
}
```

### Path Validation and Correction:
```typescript
private async validateAndCorrectPath(entry: TaskSyncEntry): Promise<string | null> {
    // Check if current path is still valid
    const file = this.app.vault.getAbstractFileByPath(entry.obsidianFilePath);
    if (file instanceof TFile) {
        return entry.obsidianFilePath; // Path is still valid
    }
    
    // Search for file by ID
    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
        if (this.generateFileId(file) === entry.obsidianFileId) {
            // Found the moved file, update path
            entry.obsidianFilePath = file.path;
            entry.lastPathValidation = Date.now();
            return file.path;
        }
    }
    
    return null; // File not found (deleted?)
}
```

## Performance Impact Mitigation

### Current Performance Issues:
- **File Move**: O(n) search through all files
- **Journal Bloat**: Orphaned entries slow down operations
- **Redundant Processing**: Moved tasks treated as new

### Optimized Performance:
- **File Move**: O(1) lookup with file ID + path correction
- **Journal Cleanup**: Periodic removal of orphaned entries
- **Smart Processing**: Moved tasks maintain sync history

### Performance Metrics:
| Scenario | Current Impact | Optimized Impact |
|----------|---------------|------------------|
| Single file move | Scan all files | Update single entry |
| Multiple moves | Linear degradation | Constant time |
| Large vault | Significant slowdown | Minimal impact |

## Migration Strategy

### For Existing Users:
1. **Backward Compatibility**: Old journal format still works
2. **Gradual Migration**: File IDs added during normal sync operations
3. **Path Correction**: Automatic correction when files are found
4. **Journal Cleanup**: Optional cleanup command for orphaned entries

### User Experience:
- **Transparent**: File moves handled automatically
- **Resilient**: Sync continues even after major file reorganization
- **Informative**: Statistics show path corrections and cleanup

## Recommended Implementation Priority:
1. **High Priority**: Fix journal file location (✅ Done)
2. **High Priority**: Add file ID tracking for new entries
3. **Medium Priority**: Implement path validation and correction
4. **Low Priority**: Add journal cleanup and compaction

This approach ensures that file movements don't negatively impact sync performance while maintaining backward compatibility with existing journals.
