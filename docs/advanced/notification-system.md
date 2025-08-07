# Notification System

The Obsidian Todoist Context Bridge plugin includes a comprehensive notification system that provides feedback on sync operations while allowing users to customize their notification preferences for both desktop and mobile platforms.

## Overview

The notification system provides real-time feedback for:

- Task synchronization success and failures
- API connection issues and rate limiting
- Journal maintenance operations
- Error conditions and recovery attempts

## Notification Preferences

### Desktop and Mobile Configuration

The plugin allows separate notification preferences for desktop and mobile platforms:

**Desktop Options**:

- **All notifications**: Shows success, error, and info messages
- **Errors only**: Shows only error messages and critical issues
- **No notifications**: Suppresses all notifications

**Mobile Options**:

- **Same as desktop**: Uses the same preference as desktop
- **All notifications**: Shows all notifications regardless of desktop setting
- **Errors only**: Shows only errors regardless of desktop setting  
- **No notifications**: Suppresses all notifications regardless of desktop setting

### Default Configuration

**Recommended Settings**:

- **Desktop**: "Errors only" (reduces notification noise)
- **Mobile**: "Same as desktop" (consistent experience)

This configuration ensures you're notified of important issues while avoiding notification fatigue from routine sync operations.

## Notification Types

### Success Notifications

**Task Sync Success**:

- "Task successfully synced to Todoist!"
- "Task successfully created in Todoist!"
- "Task completion status synchronized"

**Journal Operations**:

- "Journal backup created successfully"
- "Journal validation completed"
- "Smart journal maintenance completed"

**Behavior**:

- Shown when "All notifications" is enabled
- Suppressed when "Errors only" or "No notifications" is selected
- Provides positive feedback for successful operations

### Error Notifications

**API Errors**:

- "Failed to connect to Todoist API"
- "Rate limit exceeded - sync paused"
- "Invalid API token - please check settings"

**Sync Errors**:

- "Task sync failed - please try again"
- "Journal corruption detected"
- "File access error during sync"

**Behavior**:

- Always shown unless "No notifications" is selected
- Critical for troubleshooting and error resolution
- Include actionable guidance when possible

### Info Notifications

**System Status**:

- "Sync interval updated to 30 minutes"
- "Journal maintenance scheduled"
- "Backup restored successfully"

**Behavior**:

- Shown when "All notifications" is enabled
- Provide system status updates
- Help users understand plugin behavior

## Platform Detection

### Automatic Detection

The notification system automatically detects the current platform:

```typescript
// Smart platform detection
const isMobile = this.app.isMobile;
const preference = isMobile 
    ? (settings.mobileNotificationPreference || settings.notificationPreference)
    : settings.notificationPreference;
```

**Desktop Platform**:

- Uses `notificationPreference` setting
- Optimized for desktop workflow patterns
- Supports all notification types

**Mobile Platform**:

- Uses `mobileNotificationPreference` if set, otherwise falls back to desktop preference
- Optimized for mobile usage patterns
- Considers screen space and user attention

### Platform-Specific Behavior

**Desktop Notifications**:

- Longer display duration for detailed messages
- Support for rich formatting and links
- Less intrusive positioning

**Mobile Notifications**:

- Shorter display duration to avoid screen clutter
- Simplified messaging for small screens
- More prominent error notifications

## Configuration

### Settings Interface

**Notification Preferences Section**:

```
Desktop notifications: [Dropdown: All notifications / Errors only / No notifications]
Mobile notifications: [Dropdown: Same as desktop / All notifications / Errors only / No notifications]
```

**Setting Descriptions**:

- Clear explanation of each option
- Examples of notification types
- Platform-specific guidance

### Real-time Updates

**Settings Changes**:

- Notification preferences take effect immediately
- No plugin restart required
- Test notifications available for verification

**Preference Persistence**:

- Settings saved to plugin data.json
- Preserved across plugin restarts
- Synced across devices (if using Obsidian Sync)

## Implementation Details

### NotificationHelper Class

**Core Methods**:

```typescript
class NotificationHelper {
    showSuccess(message: string): void
    showError(message: string): void  
    showInfo(message: string): void
    
    private shouldShowNotification(type: NotificationType): boolean
    private detectPlatform(): 'desktop' | 'mobile'
}
```

**Smart Filtering**:

- Checks user preferences before displaying
- Respects platform-specific settings
- Handles edge cases gracefully

### Integration Points

**Sync Operations**:

- TodoistTaskSync.ts: Task creation and sync notifications
- EnhancedBidirectionalSyncService.ts: Automatic sync feedback
- Manual sync commands: Immediate operation feedback

**Journal Operations**:

- SyncJournalManager.ts: Journal maintenance notifications
- Backup operations: Success/failure feedback
- Validation results: Health status updates

**Error Handling**:

- API failures: Connection and authentication issues
- Rate limiting: Temporary service interruptions
- Data corruption: Recovery operation status

## Best Practices

### Notification Strategy

**For Most Users**:

- Desktop: "Errors only" (reduces noise)
- Mobile: "Same as desktop" (consistency)
- Monitor error notifications for issues

**For Power Users**:

- Desktop: "All notifications" (full visibility)
- Mobile: "Errors only" (focused on problems)
- Use notifications for workflow optimization

**For Minimal Distraction**:

- Desktop: "Errors only" (critical issues only)
- Mobile: "No notifications" (silent operation)
- Check console logs for detailed information

### Troubleshooting with Notifications

**Error Notification Workflow**:

1. Note the specific error message
2. Check the troubleshooting guide for solutions
3. Verify API token and connection
4. Run manual sync to test resolution

**Performance Monitoring**:

- Success notifications indicate healthy operation
- Frequent error notifications suggest configuration issues
- Missing notifications may indicate preference misconfiguration

## Customization Options

### Message Formatting

**Success Messages**:

- Brief, positive confirmation
- Include relevant task or operation details
- Use consistent terminology

**Error Messages**:

- Clear problem description
- Actionable guidance when possible
- Reference to documentation for complex issues

**Info Messages**:

- System status updates
- Configuration change confirmations
- Maintenance operation results

### Timing and Display

**Display Duration**:

- Success: 3 seconds (brief confirmation)
- Error: 5 seconds (time to read and act)
- Info: 4 seconds (informational update)

**Frequency Limits**:

- Prevents notification spam
- Groups similar notifications
- Respects user attention patterns

## Future Enhancements

### Planned Features

**Notification Categories**:

- Granular control over notification types
- Custom notification sounds
- Visual notification styling

**Advanced Filtering**:

- Time-based notification rules
- Context-aware notifications
- Integration with Obsidian's notification system

**Analytics Integration**:

- Notification effectiveness metrics
- User preference analytics
- Performance impact monitoring

## Related Documentation

- [Settings Guide](../user-guide/settings-guide.md) - Complete settings reference
- [Common Issues](../troubleshooting/common-issues.md) - Error notification troubleshooting
- [Performance Optimization](performance-optimization.md) - Reducing notification overhead
- [Architecture Overview](../technical/architecture.md) - Technical implementation details
