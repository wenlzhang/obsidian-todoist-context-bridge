# Comprehensive Sync Operations Test

## Test Plan for V1/V2 ID Migration and Sync Fixes

### Test Environment Setup
- Plugin built successfully with all TypeScript errors resolved
- Migration logic fixed to run only when needed (no more repeated startup logs)
- V1/V2 ID conversion integrated throughout all sync services

### Test Categories

## 1. Plugin Initialization Tests
- [ ] Plugin loads without excessive migration logs
- [ ] Migration only runs when actually needed
- [ ] Journal loads correctly with proper V2 ID handling
- [ ] No TypeScript errors or async/await issues

## 2. Manual Single Task Sync Tests
- [ ] Sync selected task to Todoist (V2 ID creation)
- [ ] Sync task from Todoist to Obsidian (V1/V2 ID matching)
- [ ] Task location using TaskLocationUtils works correctly
- [ ] Description sync integration works in manual sync

## 3. Manual Current Task Sync Tests
- [ ] Current task completion sync (Obsidian → Todoist)
- [ ] Current task completion sync (Todoist → Obsidian)
- [ ] V1/V2 ID matching in current task operations
- [ ] Description sync before completion sync

## 4. Manual Full Vault Sync Tests
- [ ] Full vault sync discovers all linked tasks
- [ ] Journal-based task discovery works correctly
- [ ] V1/V2 ID conversion in bulk operations
- [ ] Description sync for all vault tasks
- [ ] Completion status sync for all vault tasks

## 5. Auto-Sync Tests (Enhanced Bidirectional Sync)
- [ ] Auto-sync starts and runs without errors
- [ ] V1/V2 ID matching in auto-sync operations
- [ ] Description sync in auto-sync mode
- [ ] Completion status sync in auto-sync mode
- [ ] No CORS or API rate limit errors
- [ ] Bulk API usage (no individual task API calls)

## 6. Description Sync Integration Tests
- [ ] Description sync mode: disabled
- [ ] Description sync mode: sync text except metadata
- [ ] Description sync mode: sync everything including metadata
- [ ] Description sync before completion sync (correct order)
- [ ] Description sync for completed tasks
- [ ] Programmatic description sync (works for any file)

## 7. V1/V2 ID System Tests
- [ ] V1 numeric ID → V2 alphanumeric ID conversion
- [ ] V2 ID caching and reuse
- [ ] ID matching across different sync operations
- [ ] TodoistIdManager functionality
- [ ] TaskLocationUtils unified task location
- [ ] JournalIdMigration one-time migration

## 8. Logging and Performance Tests
- [ ] Reduced console noise (only with showSyncProgress enabled)
- [ ] No excessive "Added new task" logs
- [ ] No excessive "Skipping retry fetch" logs
- [ ] Migration logs only appear when migration is needed
- [ ] Performance improvement from journal-based sync

## Test Results

### ✅ Completed Tests
1. **Plugin Build**: All TypeScript errors resolved, build successful
2. **Migration Fix**: Migration now only runs when needed, no repeated startup logs
3. **Code Integration**: V1/V2 ID handling integrated across all sync services

### 🔄 In Progress Tests
- Comprehensive regression testing of all sync operations

### ❌ Failed Tests
- None identified yet

## Test Commands Available
- `sync-to-todoist`: Manual single task sync to Todoist
- `sync-from-todoist`: Manual single task sync from Todoist  
- `sync-current-task`: Manual current task completion sync
- `manual-sync`: Manual full vault sync
- Auto-sync: Enabled via settings (Enhanced bidirectional sync)

## Notes
- All major V1/V2 ID conversion logic is now centralized in TodoistIdManager
- TaskLocationUtils provides unified task location across all services
- Description sync is integrated into all sync operations with proper ordering
- Logging has been reduced and respects showSyncProgress setting
- Migration is now efficient and only runs when actually needed
