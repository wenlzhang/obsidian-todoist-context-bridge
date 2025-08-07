# Performance Optimization

The Obsidian Todoist Context Bridge plugin includes sophisticated performance optimization features designed to minimize API usage, reduce sync latency, and provide a smooth user experience.

## Core Optimization Features

### Five-Category Task Prioritization System

The plugin uses an intelligent task categorization system to optimize sync performance:

**🔴 Category 1 & 2: HIGH PRIORITY**

- **Category 1**: Obsidian completed, Todoist open
- **Category 2**: Obsidian open, Todoist completed
- **Behavior**: Always synced immediately
- **API Impact**: Essential calls only
- **User Benefit**: Ensures data consistency

**🟡 Category 3: MEDIUM PRIORITY**

- **Description**: Both platforms have tasks open/active
- **Behavior**: Regular sync processing
- **API Impact**: Standard sync calls
- **User Benefit**: Maintains active task synchronization

**🟢 Category 4: LOW PRIORITY**

- **Description**: Both platforms have tasks completed
- **Behavior**: Configurable (can be disabled for performance)
- **API Impact**: Reduced when disabled
- **User Benefit**: Performance optimization option

**⚫ Category 5: SKIP**

- **Description**: Deleted or orphaned tasks
- **Behavior**: Completely ignored
- **API Impact**: Zero API calls
- **User Benefit**: Maximum efficiency

### Journal-Based Sync Engine

**Persistent State Tracking**:

- Maintains task states across plugin restarts
- Enables incremental synchronization
- Reduces redundant API calls by 90%+

**Smart Change Detection**:

- Checks Obsidian changes first (no API calls)
- Only queries Todoist when necessary
- Uses bulk operations when possible

**Performance Metrics**:

- **Before optimization**: 50+ API calls per sync cycle
- **After optimization**: 2-5 API calls per sync cycle
- **Improvement**: 90%+ reduction in API usage

### Intelligent API Usage

**Conservative Todoist Checking**:

- Minimum 30-minute intervals between task checks
- Stale threshold of 6 hours before forced refresh
- Due date prioritization for time-sensitive tasks

**Bulk Operations**:

- Fetches multiple tasks in single API calls
- Reduces individual task lookups
- Optimizes rate limit usage

**Rate Limit Handling**:

- Automatic exponential backoff for 429 errors
- Progressive delays for individual fetches
- Smart retry logic with increasing intervals

## Performance Settings

### Sync Interval Configuration

**Bidirectional Sync Interval**:

- **Range**: 1-60 minutes
- **Default**: 15 minutes
- **Recommendation**: 15-30 minutes for optimal balance

**Journal Maintenance Interval**:

- **Calculation**: 1/3 of sync interval (minimum 2 minutes)
- **Example**: 15-minute sync → 5-minute journal maintenance
- **Purpose**: Keeps journal current without excessive overhead

### Task Tracking Options

**Track tasks completed in both sources**:

- **Enabled**: Processes Category 4 tasks (more comprehensive)
- **Disabled**: Skips Category 4 tasks (better performance)
- **Impact**: Can reduce API calls by 20-40% when disabled
- **Recommendation**: Disable for large vaults with many completed tasks

**Completion timestamp format**:

- **Impact**: Minimal performance effect
- **Benefit**: Provides task completion history
- **Recommendation**: Enable for workflow tracking

## Optimization Strategies

### Vault Size Considerations

**Small Vaults (< 100 linked tasks)**:

- Use default settings
- Enable all tracking options
- Sync interval: 10-15 minutes

**Medium Vaults (100-500 linked tasks)**:

- Sync interval: 15-30 minutes
- Consider disabling Category 4 tracking
- Monitor API usage in console logs

**Large Vaults (500+ linked tasks)**:

- Sync interval: 30-60 minutes
- Disable Category 4 tracking
- Use manual sync commands for immediate needs
- Regular journal maintenance

### API Usage Monitoring

**Console Logging**:

The plugin provides detailed API usage logs:

```
[CHANGE DETECTOR] 📊 API Usage: Made 3 Todoist calls for 47 total tasks (6.4% API rate)
[CHANGE DETECTOR] ⚡ Skipped 44 tasks (no compelling reason to check Todoist)
```

**Key Metrics to Monitor**:

- API call percentage (should be < 10% for optimal performance)
- Number of skipped tasks (higher is better)
- Rate limit errors (should be zero)

### Journal Health Optimization

**Smart Validation**:

- Skips validation when journal is 100% complete
- Respects minimum validation intervals (5 minutes)
- Only scans vault files when necessary

**Pre-Check System**:

```typescript
// Intelligent pre-check before expensive operations
if (journalHealth === 100 && recentlyValidated) {
    console.log("⚡ Skipping validation: Journal is 100% complete");
    return { skipped: true, skipReason: "Journal is complete" };
}
```

**Expected Performance Improvement**:

- 90%+ reduction in unnecessary validation operations
- Instant skip for healthy journals
- Maintains accuracy without false positives

## Performance Monitoring

### Built-in Diagnostics

**Journal Health Indicators**:

- Task completion percentage in settings
- Last validation timestamp
- Journal file size and task count

**Sync Performance Metrics**:

- API call frequency and success rates
- Sync operation duration
- Error rates and retry attempts

**Console Logging Levels**:

- **Info**: General sync operations and results
- **Debug**: Detailed API usage and optimization decisions
- **Error**: Failures and recovery attempts

### Performance Troubleshooting

**High API Usage**:

1. Check Category 4 tracking setting
2. Increase sync interval
3. Review task categorization in logs
4. Consider vault size optimization

**Slow Sync Operations**:

1. Run "Smart journal maintenance"
2. Check journal health percentage
3. Monitor validation frequency
4. Consider journal rebuild if corrupted

**Rate Limit Errors**:

1. Increase sync interval immediately
2. Disable Category 4 tracking temporarily
3. Check for bulk operation failures
4. Monitor retry logic effectiveness

## Best Practices

### Optimal Configuration

**Recommended Settings for Most Users**:

- Sync interval: 15 minutes
- Track completed tasks: Enabled (unless performance issues)
- Completion timestamps: Enabled
- Journal maintenance: Automatic (5 minutes)

**Performance-Focused Configuration**:

- Sync interval: 30-60 minutes
- Track completed tasks: Disabled
- Manual sync commands for immediate needs
- Regular journal maintenance

### Workflow Optimization

**Daily Usage**:

- Let automatic sync handle routine operations
- Use manual sync for immediate needs
- Monitor performance through settings feedback
- Run journal maintenance weekly

**Bulk Operations**:

- Create manual backups before major changes
- Use "Force rebuild journal" after bulk task operations
- Monitor API usage during intensive workflows
- Consider temporary sync interval increases

### Maintenance Schedule

**Weekly**:

- Check journal health percentage
- Review console logs for performance issues
- Run "Smart journal maintenance" if needed

**Monthly**:

- Evaluate sync interval effectiveness
- Review API usage patterns
- Clean up old journal backups
- Update settings based on vault growth

## Advanced Optimization

### Custom Sync Strategies

**Project-Based Workflows**:

- Use file-specific sync commands
- Organize tasks by project files
- Leverage note ID-based tracking

**Time-Sensitive Workflows**:

- Reduce sync intervals for active projects
- Use manual sync for immediate updates
- Monitor due date prioritization

### Integration Optimization

**Plugin Compatibility**:

- Coordinate with Tasks plugin sync
- Optimize Dataview query performance
- Consider Advanced URI plugin impact

**Vault Organization**:

- Group related tasks in dedicated files
- Use consistent note ID systems
- Maintain clean task formatting

## Related Documentation

- [Five-Category Task System](../features/five-category-system.md) - Detailed categorization logic
- [Journal Management](journal-management.md) - Journal optimization techniques
- [Architecture Overview](../technical/architecture.md) - Technical implementation details
- [Common Issues](../troubleshooting/common-issues.md) - Performance troubleshooting
