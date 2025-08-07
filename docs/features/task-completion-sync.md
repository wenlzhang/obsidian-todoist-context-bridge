# Task Completion Auto-Sync

The Task Completion Auto-Sync feature automatically synchronizes task completion status between Obsidian and Todoist, ensuring your task states remain consistent across both platforms without manual intervention.

## Overview

This feature monitors task completion changes in both Obsidian and Todoist and automatically synchronizes the completion status bidirectionally. When you complete a task in either platform, it will automatically be marked as completed in the other platform.

### Key Benefits

- **Seamless workflow**: Complete tasks in either platform without worrying about manual sync
- **Temporal accuracy**: Preserves actual completion times from Todoist
- **Intelligent performance**: Uses five-category prioritization to minimize API usage
- **Reliable operation**: Built-in error handling and retry mechanisms

## How It Works

### Automatic Detection

The plugin continuously monitors:

- **Obsidian tasks**: Detects when tasks are marked complete (`[x]`) or incomplete (`[ ]`)
- **Todoist tasks**: Monitors completion status changes via API
- **Content changes**: Tracks task content modifications using MD5 hashing
- **New tasks**: Automatically discovers newly linked tasks

### Bidirectional Sync

- **Obsidian → Todoist**: When you complete a task in Obsidian, it's automatically marked complete in Todoist
- **Todoist → Obsidian**: When you complete a task in Todoist, it's automatically marked complete in Obsidian with optional timestamp

### Journal-Based Tracking

The system uses a persistent journal to track:

- Task completion states in both platforms
- Last sync timestamps
- Content hashes for change detection
- Sync operation history

## Configuration

### Enable Auto-Sync

1. Go to Settings → Community plugins → Todoist Context Bridge
2. Enable "Task completion auto-sync"
3. Configure your preferred sync interval (recommended: 5-15 minutes)

### Completion Timestamps

When tasks are completed in Todoist and synced to Obsidian, you can automatically add completion timestamps:

#### Enable Timestamps

- **Setting**: "Add completion timestamp"
- **Default**: Enabled
- **Behavior**: Adds timestamp when syncing from Todoist to Obsidian

#### Timestamp Source

- **Todoist completion**: Uses the actual completion time from Todoist (more accurate)
- **Sync time**: Uses the time when the sync occurs
- **Recommendation**: Use "Todoist completion" for accurate temporal tracking

#### Timestamp Format

Customize the timestamp format using moment.js syntax:

- **Example**: `[✅ ]YYYY-MM-DD` → `✅ 2024-01-15`

### Sync Interval

- **Range**: 1-60 minutes
- **Default**: 5 minutes
- **Recommendation**: 5-15 minutes for balance between responsiveness and API efficiency
- **Impact**: Also controls journal maintenance frequency

## Performance Optimization

### Five-Category System Integration

Auto-sync uses the intelligent five-category task prioritization system:

#### Immediate Sync (High Priority)

- **Completion mismatches**: Tasks with different completion states between platforms
- **Processing**: Immediate sync regardless of interval
- **API usage**: Essential calls only

#### Regular Sync (Medium Priority)

- **Both active**: Tasks open in both platforms
- **Processing**: Checked at configured sync intervals
- **API usage**: Conservative, content-hash based

#### Optional Sync (Low Priority)

- **Both completed**: Tasks completed in both platforms
- **Processing**: User-configurable (disabled by default)
- **API usage**: Minimal when enabled, zero when disabled

### Performance Benefits

- **90-95% API reduction**: Compared to traditional sync methods
- **Rate limit prevention**: Intelligent throttling prevents Todoist rate limits
- **Efficient processing**: Only syncs tasks that actually need updating

## Manual Sync Commands

While auto-sync handles most scenarios, manual commands provide immediate control:

### Sync Current Task

- **Command**: "Sync completion status of current task"
- **Usage**: Place cursor on task line and run command
- **Behavior**: Immediate bidirectional completion sync

### Sync Current File

- **Command**: "Sync completion status of all tasks in current file"
- **Usage**: Run while in any file with linked tasks
- **Behavior**: Syncs all tasks in the current file

### Sync Entire Vault

- **Command**: "Sync completion status of all tasks in vault"
- **Usage**: Run from anywhere in vault
- **Behavior**: Comprehensive sync of all linked tasks

## Task Requirements

### Linking Requirements

For auto-sync to work, tasks must be properly linked between platforms:

1. **Obsidian to Todoist**: Use "Sync selected task to Todoist" command
2. **Todoist to Obsidian**: Use "Sync task from Todoist to Obsidian" command
3. **Verification**: Linked tasks will have Todoist links as sub-items in Obsidian

### Supported Task Formats

The plugin recognizes various task formats:

- **Standard**: `- [ ] Task content`
- **Callouts**: Tasks within `> [!info]` blocks
- **Quotes**: Tasks within `> ` quoted sections

### Content Matching

- Tasks must have the same content in both platforms for reliable matching
- Content changes are detected and can trigger sync operations
- Block references and timestamps are preserved during sync

## Troubleshooting

### Common Issues

#### Tasks Not Syncing

**Possible causes**:

- Tasks not properly linked between platforms
- Auto-sync disabled in settings
- API token issues

**Solutions**:

1. Verify tasks are linked (check for Todoist sub-items in Obsidian)
2. Check that auto-sync is enabled in settings
3. Verify Todoist API token is valid
4. Run "Smart journal maintenance" command

#### Sync Delays

**Possible causes**:

- Long sync intervals
- High API usage
- Network connectivity issues

**Solutions**:

1. Reduce sync interval in settings
2. Disable "Track tasks completed in both sources" for better performance
3. Check internet connection
4. Monitor console for API rate limit warnings

#### Missing Timestamps

**Possible causes**:

- Timestamp feature disabled
- Sync direction (Obsidian → Todoist doesn't add timestamps)
- Format issues

**Solutions**:

1. Enable "Add completion timestamp" in settings
2. Verify timestamp format syntax
3. Check that sync is from Todoist → Obsidian (timestamps only added in this direction)

### Advanced Troubleshooting

#### Console Monitoring

Check the Obsidian console (Ctrl/Cmd + Shift + I) for:

- Sync operation logs
- API rate limit warnings
- Error messages
- Performance metrics

#### Journal Health

Use journal management commands:

- "Smart journal maintenance" for routine maintenance
- "Force rebuild journal" for major issues
- "Show sync statistics" for performance monitoring

## Best Practices

### For Optimal Performance

- Use sync intervals of 5-15 minutes
- Disable "Track tasks completed in both sources" unless needed
- Enable "Errors only" notifications to reduce noise
- Run periodic journal maintenance

### For Accurate Tracking

- Use "Todoist completion" as timestamp source
- Enable completion timestamps
- Use consistent task content between platforms
- Avoid manual editing of Todoist links in Obsidian

### For Large Vaults

- Increase sync interval to 15+ minutes
- Disable both-completed task tracking
- Use manual sync commands for immediate needs
- Monitor API usage in console logs

### Integration with Other Plugins

- **Task Marker**: Use for comprehensive timestamp tracking in Obsidian
- **Dataview**: Query tasks with completion timestamps
- **Tasks**: Enhanced task management with sync integration

## Security and Privacy

### Data Handling

- All sync data is stored locally in Obsidian
- Todoist API token is stored securely in Obsidian settings
- No data is sent to third-party servers (except Todoist API)

### API Usage

- Respects Todoist API rate limits
- Uses efficient batch operations when possible
- Implements retry logic for network issues
- Provides detailed logging for transparency

The Task Completion Auto-Sync feature transforms your workflow by eliminating the mental overhead of manually keeping task states synchronized, allowing you to focus on what matters most: getting things done.
