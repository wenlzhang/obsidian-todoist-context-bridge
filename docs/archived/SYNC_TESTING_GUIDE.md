# V1/V2 ID Standardization - Comprehensive Sync Testing Guide

## Overview
This guide outlines the comprehensive regression testing plan for all sync operations after the V1/V2 ID standardization implementation.

## ✅ Core System Tests (Completed)
- [x] TodoistIdManager: Canonical ID handling, caching, batch conversion
- [x] JournalIdMigration: V1→V2 migration detection and execution  
- [x] TypeScript build: All modules compile successfully
- [x] NotificationHelper: All references updated and working

## 🔄 Phase 3: Sync Operations Testing

### Test Environment Setup
1. **Development Server**: Running (`npm run dev`)
2. **Clean Environment**: No existing plugin data
3. **Test Data**: Create sample Obsidian files with Todoist links

### Critical Test Scenarios

#### 1. Journal Loading and Migration
- [ ] **Test**: Load plugin with existing V1 journal data
- [ ] **Expected**: Automatic migration to V2 IDs, backup creation
- [ ] **Verify**: Migration stats logged, journal version updated to "1.2.0-v2"

#### 2. Manual Sync Operations
- [ ] **Single Task Sync**: Sync individual task completion status
- [ ] **File-Level Sync**: Sync all tasks in a single file
- [ ] **Vault-Level Sync**: Sync all tasks across entire vault
- [ ] **Description Sync**: Test all three modes (none, filtered, full)

#### 3. Auto-Sync Operations  
- [ ] **Todoist→Obsidian**: Completion status sync from Todoist
- [ ] **Obsidian→Todoist**: Completion status sync to Todoist
- [ ] **Description Auto-Sync**: Automatic description syncing
- [ ] **V1/V2 ID Handling**: Verify robust ID matching in auto-sync

#### 4. Task Location and Matching
- [ ] **V1 ID Tasks**: Locate tasks with numeric IDs
- [ ] **V2 ID Tasks**: Locate tasks with alphanumeric IDs  
- [ ] **Mixed ID Environment**: Handle both ID types simultaneously
- [ ] **Line Number Changes**: Robust task location when line numbers shift

#### 5. Edge Cases and Error Handling
- [ ] **Network Errors**: Graceful handling of API failures
- [ ] **Invalid IDs**: Handle malformed or non-existent task IDs
- [ ] **Concurrent Operations**: Multiple sync operations running simultaneously
- [ ] **Large Vaults**: Performance with many tasks and files

### Testing Methodology

#### Pre-Test Setup
1. Create test vault with sample files containing Todoist links
2. Ensure valid Todoist API token is configured
3. Enable detailed logging for debugging

#### Test Execution
1. Execute each test scenario systematically
2. Monitor console logs for errors or warnings
3. Verify expected behavior and data integrity
4. Document any issues or unexpected behavior

#### Post-Test Validation
1. Check journal data integrity
2. Verify all IDs are in canonical V2 format
3. Confirm no data loss during operations
4. Review performance metrics

### Success Criteria
- ✅ All sync operations complete without errors
- ✅ V1/V2 ID conversion works seamlessly
- ✅ Journal migration preserves all data
- ✅ Task location is robust and reliable
- ✅ Performance is acceptable for large vaults
- ✅ Error handling is graceful and informative

### Known Limitations
- Without valid Todoist API token, V1→V2 conversion falls back to original IDs
- This is expected behavior and doesn't affect functionality
- Real V1→V2 conversion requires active Todoist API access

## Next Steps
1. Execute comprehensive testing in Obsidian environment
2. Document any issues or regressions found
3. Fix any problems discovered during testing
4. Finalize V1/V2 ID standardization implementation
5. Update documentation and user guides
