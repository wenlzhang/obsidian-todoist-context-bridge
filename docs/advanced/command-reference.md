# Command Reference

This document provides a comprehensive reference for all commands available in the Todoist Context Bridge plugin.

## Task Sync Commands

### Sync Selected Task to Todoist

- **Command ID**: `sync-to-todoist`
- **Usage**: Place cursor on a task line and run the command
- **Function**: Syncs the selected task from Obsidian to Todoist
- **Requirements**: Valid Todoist API token
- **Behavior**: 
  - Creates a new task in Todoist with the same content
  - Adds Todoist links as sub-items in Obsidian
  - Preserves task context and metadata

### Sync Task from Todoist to Obsidian

- **Command ID**: `sync-from-todoist`
- **Usage**: Run command and enter Todoist task ID or URL
- **Function**: Imports a Todoist task into the current Obsidian note
- **Requirements**: Valid Todoist API token
- **Behavior**:
  - Opens modal to input Todoist task ID/URL
  - Creates task in Obsidian with Todoist content
  - Establishes bidirectional link

### Create Todoist Task from Selected Text

- **Command ID**: `create-todoist-from-text`
- **Usage**: Select text and run the command
- **Function**: Converts selected text into a Todoist task
- **Requirements**: Valid Todoist API token
- **Behavior**:
  - Creates task in Todoist with selected text as content
  - Replaces selected text with properly formatted task
  - Adds Todoist links as sub-items

## Task Completion Sync Commands

### Sync Completion Status of Current Task

- **Command ID**: `sync-current-task-completion`
- **Usage**: Place cursor on any task line and run the command
- **Function**: Immediately syncs completion status between platforms
- **Behavior**:
  - Searches task and sub-items for Todoist links
  - Performs direct bidirectional completion sync
  - Updates completion timestamps if enabled
  - Works regardless of auto-sync settings

### Sync Completion Status of All Tasks in Current File

- **Command ID**: `sync-file-tasks-completion`
- **Usage**: Run command while in any file with tasks
- **Function**: Syncs completion status for all tasks in the current file
- **Behavior**:
  - Scans entire file for linked tasks
  - Performs completion sync for each task
  - Uses journal-first approach for efficiency
  - Falls back to discovery if journal is incomplete

### Sync Completion Status of All Tasks in Vault

- **Command ID**: `sync-vault-tasks-completion`
- **Usage**: Run command from anywhere in the vault
- **Function**: Syncs completion status for all tasks in the entire vault
- **Behavior**:
  - Processes all linked tasks in the vault
  - Uses intelligent five-category prioritization
  - Respects user settings for performance optimization
  - Provides progress feedback

## Journal Management Commands

### Smart Journal Maintenance

- **Command ID**: `validate-and-heal-sync-journal`
- **Usage**: Run when you want intelligent journal maintenance
- **Function**: Performs smart, as-needed journal maintenance
- **Behavior**:
  - Checks journal health before processing
  - Only processes what needs updating
  - Skips redundant work when journal is healthy
  - Uses pre-check optimization to avoid unnecessary operations
  - Respects minimum validation intervals (5 minutes)

### Force Rebuild Journal

- **Command ID**: `heal-journal-skip-validation`
- **Usage**: Run when you need complete journal reconstruction
- **Function**: Forces complete journal rebuilding regardless of state
- **Behavior**:
  - Bypasses all pre-checks and optimization
  - Re-processes ALL tasks even if journal appears complete
  - Always rebuilds everything from scratch
  - Use when journal corruption is suspected

### Reset Sync Journal

- **Command ID**: `reset-sync-journal`
- **Usage**: Run when you need to completely reset the sync state
- **Function**: Completely resets the sync journal (destructive operation)
- **Behavior**:
  - Shows two-step confirmation modal
  - Requires typing "RESET" to confirm
  - Deletes all sync history and tracking data
  - Creates fresh journal from scratch
  - **Warning**: This is irreversible

## Journal Backup Commands

### Create Journal Backup

- **Command ID**: `create-journal-backup`
- **Usage**: Run to manually create a backup of the current journal
- **Function**: Creates a timestamped backup of the sync journal
- **Behavior**:
  - Creates backup in `.obsidian/plugins/todoist-context-bridge/backups/`
  - Uses timestamp format: `sync-journal-backup-YYYY-MM-DD-HH-mm-ss.json`
  - Preserves all task tracking data and sync history
  - Provides confirmation notification

### Restore Journal from Backup

- **Command ID**: `restore-journal-backup`
- **Usage**: Run to restore journal from a previous backup
- **Function**: Restores sync journal from a selected backup file
- **Behavior**:
  - Opens file picker to select backup file
  - Validates backup file format
  - Creates backup of current journal before restoration
  - Restores selected backup as active journal
  - Provides detailed feedback on restoration process

### List Journal Backups

- **Command ID**: `list-journal-backups`
- **Usage**: Run to see all available journal backups
- **Function**: Displays information about available backup files
- **Behavior**:
  - Lists all backup files with timestamps
  - Shows file sizes and creation dates
  - Provides quick access to backup management
  - Helps identify which backup to restore

## Advanced Sync Commands

### Trigger Manual Sync

- **Command ID**: `trigger-manual-sync`
- **Usage**: Run to force immediate sync of all tasks
- **Function**: Performs comprehensive manual sync operation
- **Behavior**:
  - Bypasses timing constraints
  - Processes high and medium priority tasks immediately
  - Respects user settings for low priority tasks
  - Updates journal with discovered changes
  - Provides detailed progress feedback

### Sync Current File Tasks

- **Command ID**: `sync-current-file-tasks`
- **Usage**: Run to sync all tasks in the current file
- **Function**: Comprehensive sync for current file only
- **Behavior**:
  - Discovers all linked tasks in current file
  - Performs bidirectional sync for each task
  - Updates journal entries
  - More focused than vault-wide sync

## Utility Commands

### Open Sync Journal File

- **Command ID**: `open-sync-journal`
- **Usage**: Run to view the raw sync journal file
- **Function**: Opens the sync journal JSON file for inspection
- **Behavior**:
  - Opens journal file in Obsidian editor
  - Allows manual inspection of sync state
  - Useful for debugging and troubleshooting
  - **Caution**: Manual editing not recommended

### Show Sync Statistics

- **Command ID**: `show-sync-stats`
- **Usage**: Run to display current sync statistics
- **Function**: Shows comprehensive sync system statistics
- **Behavior**:
  - Displays task counts by category
  - Shows journal health information
  - Provides performance metrics
  - Useful for monitoring sync system health

## Command Usage Tips

### Performance Optimization

- Use **Smart journal maintenance** regularly for optimal performance
- Use **Sync current file tasks** for focused work
- Use **Force rebuild journal** only when necessary (it's resource-intensive)

### Troubleshooting

- If sync seems broken, try **Smart journal maintenance** first
- If that doesn't help, use **Force rebuild journal**
- For complete reset, use **Reset sync journal** (last resort)

### Backup Strategy

- Run **Create journal backup** before major operations
- Keep multiple backups for different time periods
- Use **List journal backups** to manage backup files

### Daily Workflow

- **Sync selected task to Todoist**: For promoting important tasks
- **Sync completion status of current task**: For immediate completion sync
- **Smart journal maintenance**: Weekly or when performance degrades

## Keyboard Shortcuts

You can assign keyboard shortcuts to frequently used commands:

1. Go to Settings → Hotkeys
2. Search for "Todoist Context Bridge"
3. Assign shortcuts to your most-used commands

### Recommended Shortcuts

- `Ctrl/Cmd + Shift + T`: Sync selected task to Todoist
- `Ctrl/Cmd + Shift + C`: Sync completion status of current task
- `Ctrl/Cmd + Shift + F`: Sync completion status of all tasks in current file

## Command Availability

All commands require:
- Valid Todoist API token configured
- Active internet connection for Todoist API access
- Appropriate permissions for file operations

Some commands have additional requirements noted in their descriptions above.
