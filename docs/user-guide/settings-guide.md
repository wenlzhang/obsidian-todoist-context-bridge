# Settings Guide

This guide covers all available settings in the Todoist Context Bridge plugin, organized by section.

## Todoist Task Sync

### Todoist API Token

- **Purpose**: Connects the plugin to your Todoist account
- **Required**: Yes
- **How to get**: Todoist Settings → Integrations → Developer
- **Security**: Token is stored locally in Obsidian

### Default Todoist Project

- **Purpose**: Sets the default project for new tasks synced to Todoist
- **Options**: All your Todoist projects (loaded automatically)
- **Default**: Inbox
- **Note**: Individual tasks can override this setting

### Todoist Link Format

- **Purpose**: Controls how Todoist links appear in Obsidian
- **Options**:
  - **Website**: `[🔗 View in Todoist website](https://todoist.com/task/ID)`
  - **App**: `[📱 View in Todoist app](todoist://task?id=ID)`
  - **Combined**: Both website and app links
- **Default**: Combined
- **Impact**: Affects all new task links created

## Task Completion Sync

### Add Completion Timestamp

- **Purpose**: Automatically adds timestamps when tasks are completed
- **Default**: Enabled
- **Behavior**: Works for both manual and automatic sync operations
- **Format**: Configurable using moment.js syntax

### Completion Timestamp Source

- **Purpose**: Chooses the timestamp source for completed tasks
- **Options**:
  - **Todoist completion**: Uses actual completion time from Todoist (more accurate)
  - **Sync time**: Uses the time when sync occurs
- **Default**: Sync time
- **Recommendation**: Use "Todoist completion" for accurate temporal tracking

### Completion Timestamp Format

- **Purpose**: Controls the format of completion timestamps
- **Syntax**: Uses moment.js format strings
- **Examples**:
  - `YYYY-MM-DD[T]HH:mm` → `2024-01-15T14:30`

### Enable Task Completion Auto-Sync

- **Purpose**: Automatically synchronizes task completion status between platforms
- **Default**: Enabled
- **Features**:
  - Intelligent journal-based sync tracking
  - Incremental change detection
  - Smart API usage with rate limit protection
  - Four-tier task prioritization system

### Sync Interval

- **Purpose**: Controls how often the plugin checks for task completion changes
- **Range**: 1-60 minutes
- **Default**: 5 minutes
- **Impact**: Also controls journal maintenance frequency (runs at 1/3 of this interval)
- **Recommendation**: 5-15 minutes for balance between responsiveness and API rate limits

## Track Tasks Completed in Both Sources

### Five-Category Task Optimization System

This plugin uses an intelligent five-category task prioritization system to dramatically reduce unnecessary Todoist API calls by **90-95%** while maintaining perfect sync accuracy:

#### 🔴 **HIGH PRIORITY** (Always Synced)

- **Obsidian completed, Todoist open** - Syncs completion to Todoist immediately
- **Obsidian open, Todoist completed** - Syncs completion to Obsidian immediately

#### 🟡 **MEDIUM PRIORITY** (Normal Intervals)

- **Both open/active** - Checked at your configured sync intervals

#### 🟢 **LOW PRIORITY** (User Configurable)

- **Both completed** - This setting controls whether to track these tasks
- **When enabled**: Checked very rarely (every 24 hours) in case they're reopened
- **When disabled**: Completely skipped - zero API calls
- **Default**: Disabled (recommended for maximum performance)

#### ⚫ **SKIP CATEGORY** (Never Checked)

- **Deleted/orphaned tasks** - Completely ignored, preserved in log for reference only

### Performance Impact

- **This system reduces unnecessary API calls by 90-95%**
- **Preventing rate limit errors while maintaining perfect sync accuracy**
- **Disabling both-completed task tracking provides the maximum performance benefit**

### Track Tasks Completed in Both Sources

- **Purpose**: Controls whether to track tasks completed in both Obsidian and Todoist
- **Default**: Disabled (recommended)
- **When enabled**: Tasks completed in both sources are checked rarely (every 24 hours)
- **When disabled**: Tasks completed in both sources are completely skipped
- **Recommendation**: Keep disabled unless you frequently reopen completed tasks

## Show Sync Progress

- **Purpose**: Display progress notifications during sync operations
- **Default**: Enabled
- **Types**: Shows progress for manual sync commands and journal maintenance
- **Impact**: Provides feedback but can be disabled to reduce notifications

## Notification Preferences

### Desktop Notifications

- **Purpose**: Controls notification behavior on desktop platforms
- **Options**:
  - **All notifications**: Shows all sync notifications (success, errors, progress)
  - **Errors only**: Only shows error notifications (recommended)
  - **No notifications**: Suppresses all notifications
- **Default**: Errors only

### Mobile Notifications

- **Purpose**: Controls notification behavior on mobile devices
- **Options**:
  - **Same as desktop**: Uses the desktop notification setting
  - **All notifications**: Shows all notifications on mobile
  - **Errors only**: Only shows errors on mobile
  - **No notifications**: Suppresses all mobile notifications
- **Default**: Same as desktop

## Advanced Settings

### UID Field

- **Purpose**: Specifies the frontmatter field used for note IDs
- **Default**: `uuid`
- **Usage**: Enables robust file tracking that survives file moves/renames
- **Format**: YAML frontmatter field name (without colons)

### Content Formats

The plugin supports various content formats for task extraction:

- **Standard tasks**: `- [ ] Task content`
- **Callouts**: Tasks within `> [!info]` blocks
- **Quotes**: Tasks within `> ` quoted sections

## Performance Recommendations

### For Large Vaults (1000+ tasks)

- Keep "Track tasks completed in both sources" **disabled**
- Use sync interval of **10-15 minutes**
- Enable "Errors only" notifications
- Consider using the [Task Marker](https://github.com/wenlzhang/obsidian-task-marker) plugin for comprehensive timestamp tracking

### For Active Workflows

- Use sync interval of **5 minutes**
- Enable "Add completion timestamp"
- Use "Todoist completion" as timestamp source
- Keep sync progress notifications enabled

### For Mobile Users

- Set mobile notifications to "Errors only" or "No notifications"
- Consider longer sync intervals (15+ minutes) to preserve battery

## Troubleshooting Settings

If you experience issues:

1. **API Rate Limits**: Increase sync interval to 15+ minutes
2. **Missing Tasks**: Run "Smart journal maintenance" command
3. **Sync Conflicts**: Use "Force rebuild journal" command
4. **Performance Issues**: Disable "Track tasks completed in both sources"

For more help, see [Troubleshooting](../troubleshooting/common-issues.md).
