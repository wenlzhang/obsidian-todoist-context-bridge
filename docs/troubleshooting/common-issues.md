# Common Issues & Solutions

This guide covers the most frequently encountered issues and their solutions when using the Todoist Context Bridge plugin.

## Installation & Setup Issues

### Plugin Not Loading

**Symptoms**: Plugin doesn't appear in Community plugins list or fails to enable

**Solutions**:

1. **Check Obsidian version**: Ensure you're running Obsidian 0.15.0 or higher
2. **Restart Obsidian**: Close and reopen Obsidian completely
3. **Manual installation**: Try manual installation if community plugin install fails
4. **Check plugin folder**: Verify files are in `.obsidian/plugins/todoist-context-bridge/`
5. **Console errors**: Check Developer Console (Ctrl/Cmd + Shift + I) for error messages

### API Token Issues

**Symptoms**: "Please configure your Todoist API token" error, commands don't work

**Solutions**:

1. **Verify token**: Go to [Todoist Settings → Integrations → Developer](https://todoist.com/prefs/integrations) and copy the correct token
2. **Check token format**: Token should be a long alphanumeric string (40+ characters)
3. **Re-enter token**: Delete and re-enter the token in plugin settings
4. **Test connection**: Try running "Sync selected task to Todoist" on a simple task
5. **Network issues**: Verify internet connection and firewall settings

### Projects Not Loading

**Symptoms**: Default project dropdown shows "Failed to load projects" or "Loading projects..."

**Solutions**:

1. **API token first**: Ensure valid API token is configured
2. **Refresh settings**: Close and reopen plugin settings
3. **Manual refresh**: Click the refresh button next to the API token field
4. **Network connectivity**: Check internet connection
5. **Todoist service**: Verify Todoist.com is accessible

## Sync Issues

### Tasks Not Syncing

**Symptoms**: Tasks exist in both platforms but completion status doesn't sync

**Possible Causes & Solutions**:

#### Tasks Not Properly Linked

- **Check for Todoist links**: Linked tasks should have Todoist sub-items in Obsidian
- **Re-link tasks**: Use "Sync selected task to Todoist" to establish proper links
- **Verify task content**: Ensure task content matches between platforms

#### Auto-Sync Disabled

- **Enable auto-sync**: Go to Settings → "Task completion auto-sync"
- **Check sync interval**: Verify interval is reasonable (5-15 minutes)
- **Manual sync**: Try manual sync commands to test functionality

#### Journal Issues

- **Run maintenance**: Use "Smart journal maintenance" command
- **Check journal health**: Use "Show sync statistics" command
- **Force rebuild**: If needed, use "Force rebuild journal" command

### Sync Delays

**Symptoms**: Tasks sync eventually but with significant delays

**Solutions**:

1. **Reduce sync interval**: Lower the sync interval in settings (minimum 1 minute)
2. **Check API usage**: Monitor console for rate limit warnings
3. **Disable both-completed tracking**: Turn off "Track tasks completed in both sources"
4. **Network latency**: Check internet connection speed and stability
5. **Manual sync**: Use manual commands for immediate sync needs

### Completion Status Conflicts

**Symptoms**: Tasks show different completion status in each platform

**Solutions**:

1. **Manual sync current task**: Place cursor on task and run completion sync command
2. **Check task linking**: Verify tasks are properly linked with Todoist sub-items
3. **Journal validation**: Run "Smart journal maintenance" to fix inconsistencies
4. **Content verification**: Ensure task content is identical in both platforms

## Performance Issues

### Slow Sync Operations

**Symptoms**: Sync takes a long time, high CPU usage, frequent API calls

**Solutions**:

1. **Optimize settings**:
   - Disable "Track tasks completed in both sources"
   - Increase sync interval to 15+ minutes
   - Enable "Errors only" notifications
2. **Journal maintenance**: Run "Smart journal maintenance" regularly
3. **Check task count**: Use "Show sync statistics" to see task distribution
4. **Monitor console**: Look for excessive API calls in console logs

### Rate Limit Errors

**Symptoms**: "429" errors in console, sync failures, API limit warnings

**Solutions**:

1. **Increase sync interval**: Set to 15+ minutes
2. **Disable both-completed tracking**: Reduces API calls by 90%+
3. **Check journal health**: Run journal maintenance to fix inefficiencies
4. **Monitor API usage**: Watch console logs for API call patterns
5. **Temporary pause**: Disable auto-sync temporarily if rate limiting persists

### High Memory Usage

**Symptoms**: Obsidian becomes slow, high memory usage, performance degradation

**Solutions**:

1. **Journal optimization**: Run "Smart journal maintenance"
2. **Reduce sync frequency**: Increase sync interval
3. **Check vault size**: Large vaults may need performance optimization
4. **Restart Obsidian**: Temporary fix for memory leaks
5. **Monitor journal size**: Check sync journal file size

## Task Linking Issues

### Missing Todoist Links

**Symptoms**: Tasks synced but no Todoist sub-items appear in Obsidian

**Solutions**:

1. **Re-sync task**: Use "Sync selected task to Todoist" again
2. **Check link format**: Verify link format setting in plugin settings
3. **Manual link addition**: Add Todoist links manually if needed
4. **File permissions**: Ensure Obsidian can write to the file
5. **Content conflicts**: Check for conflicting content in task area

### Broken Task Links

**Symptoms**: Todoist links exist but don't work or point to wrong tasks

**Solutions**:

1. **Verify task IDs**: Check that Todoist task IDs in links are correct
2. **Re-establish links**: Delete existing links and re-sync task
3. **Check Todoist task**: Verify task still exists in Todoist
4. **Update links**: Use "Sync task from Todoist to Obsidian" to refresh links
5. **Journal cleanup**: Run "Force rebuild journal" if links are corrupted

### Duplicate Tasks

**Symptoms**: Same task appears multiple times in Todoist or Obsidian

**Solutions**:

1. **Journal validation**: Run "Smart journal maintenance" to detect duplicates
2. **Manual cleanup**: Delete duplicate tasks manually
3. **Re-sync properly**: Use proper sync commands instead of manual copying
4. **Check task content**: Ensure tasks have unique content
5. **Force rebuild**: Use "Force rebuild journal" for major cleanup

## File and Content Issues

### File Move Problems

**Symptoms**: Tasks not found after moving files, broken sync after file reorganization

**Solutions**:

1. **Note ID setup**: Configure `uidField` in settings for robust file tracking
2. **Add note IDs**: Add unique IDs to frontmatter of moved files
3. **Journal update**: Run "Smart journal maintenance" after file moves
4. **Manual re-linking**: Re-sync tasks in moved files if needed
5. **Check file paths**: Verify file paths are updated in journal

### Content Format Issues

**Symptoms**: Tasks not recognized, sync doesn't work for certain task formats

**Solutions**:

1. **Use standard format**: Ensure tasks use `- [ ]` or `- [x]` format
2. **Check indentation**: Verify proper indentation for sub-items
3. **Avoid special characters**: Some characters may interfere with parsing
4. **Test with simple tasks**: Try with basic task content first
5. **Check supported formats**: Review documentation for supported task formats

### Timestamp Issues

**Symptoms**: Completion timestamps missing, wrong format, or incorrect times

**Solutions**:

1. **Enable timestamps**: Turn on "Add completion timestamp" in settings
2. **Check format**: Verify timestamp format using moment.js syntax
3. **Source setting**: Choose between "Todoist completion" and "Sync time"
4. **Sync direction**: Timestamps only added when syncing from Todoist to Obsidian
5. **Format validation**: Test timestamp format with online moment.js validators

## Journal and Data Issues

### Journal Corruption

**Symptoms**: Sync errors, missing tasks, invalid JSON errors in console

**Solutions**:

1. **Backup first**: Create journal backup before any fixes
2. **Smart maintenance**: Try "Smart journal maintenance" first
3. **Force rebuild**: Use "Force rebuild journal" for major corruption
4. **Restore backup**: Use "Restore journal from backup" if available
5. **Reset journal**: Last resort - use "Reset sync journal" (destructive)

### Missing Journal Data

**Symptoms**: Tasks exist but not tracked in journal, sync statistics show low counts

**Solutions**:

1. **Journal validation**: Run "Smart journal maintenance"
2. **Check file existence**: Verify sync journal file exists
3. **Permissions**: Ensure Obsidian can read/write journal file
4. **Force discovery**: Use "Force rebuild journal" to rediscover all tasks
5. **Manual backup restore**: Restore from backup if data was lost

### Journal Size Issues

**Symptoms**: Large journal file, slow performance, high memory usage

**Solutions**:

1. **Clean deleted tasks**: Journal automatically manages deleted tasks
2. **Optimize settings**: Disable both-completed tracking
3. **Regular maintenance**: Run journal maintenance weekly
4. **Check task count**: Use "Show sync statistics" to monitor size
5. **Consider reset**: For extremely large journals, consider reset and rebuild

## Error Messages

### "Enhanced sync service is required"

**Symptoms**: Manual sync commands fail with this error

**Solutions**:

1. **Enable auto-sync**: Turn on "Task completion auto-sync" in settings
2. **Restart plugin**: Disable and re-enable the plugin
3. **Check settings**: Verify all required settings are configured
4. **Restart Obsidian**: Close and reopen Obsidian

### "Task not found" Errors

**Symptoms**: Sync operations fail with task not found messages

**Solutions**:

1. **Verify task exists**: Check that task exists in both platforms
2. **Check task IDs**: Verify Todoist task IDs are correct
3. **Re-link tasks**: Use sync commands to re-establish links
4. **Journal cleanup**: Run journal maintenance to clean up orphaned entries

### Network and API Errors

**Symptoms**: Connection errors, timeout errors, API failures

**Solutions**:

1. **Check internet**: Verify stable internet connection
2. **Firewall settings**: Ensure Todoist API access isn't blocked
3. **Retry operation**: Many operations have built-in retry logic
4. **Check Todoist status**: Verify Todoist service is operational
5. **API token**: Ensure API token is still valid

## Getting Additional Help

### Console Debugging

1. Open Developer Console (Ctrl/Cmd + Shift + I)
2. Look for error messages in red
3. Check for API rate limit warnings
4. Monitor sync operation logs

### Diagnostic Commands

- **"Show sync statistics"**: View system health
- **"Smart journal maintenance"**: Fix common issues
- **"List journal backups"**: Check backup availability

### Reporting Issues

When reporting issues, include:
- Obsidian version
- Plugin version
- Error messages from console
- Steps to reproduce
- Sync statistics output

### Community Support

- Check [GitHub Issues](https://github.com/wenlzhang/obsidian-todoist-context-bridge/issues)
- Search existing issues before creating new ones
- Provide detailed information when reporting bugs
- Use issue templates when available
