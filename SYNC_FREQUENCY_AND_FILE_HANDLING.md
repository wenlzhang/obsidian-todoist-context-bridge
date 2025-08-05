# Enhanced Sync: Frequency Control and File Movement Handling

## Sync Frequency Analysis

### Enhanced Sync Frequency Control
The enhanced log-based sync system uses **the same frequency control** as the regular task completion auto-sync:

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
- **Same Setting**: Both regular and enhanced sync use `syncIntervalMinutes` (1-60 minutes)
- **Same Behavior**: Enhanced sync runs at the same intervals as regular sync
- **Additional Control**: Enhanced sync can be triggered manually via command
- **Performance Difference**: Enhanced sync processes much faster due to incremental changes

### Frequency Comparison:
| Sync Type | Frequency Control | Processing Speed | Manual Trigger |
|-----------|------------------|------------------|----------------|
| Regular Sync | syncIntervalMinutes | Slow (scans all) | No |
| Enhanced Sync | syncIntervalMinutes | Fast (incremental) | Yes |

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
