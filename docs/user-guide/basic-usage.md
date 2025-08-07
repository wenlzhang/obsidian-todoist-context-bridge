# Basic Usage Guide

This guide covers the essential workflows and features of the Todoist Context Bridge plugin to get you started quickly.

## Core Workflow

The Todoist Context Bridge plugin follows a simple philosophy: **selectively promote important tasks from Obsidian to Todoist while maintaining rich context and bidirectional synchronization**.

### 1. Create Tasks in Obsidian

Start by creating tasks in your Obsidian notes using standard markdown syntax:

```markdown
- [ ] Review project proposal
- [ ] Call client about meeting
- [ ] Research new framework
```

### 2. Promote Important Tasks to Todoist

When a task becomes important enough to track in your task manager:

1. **Place cursor** on the task line
2. **Open command palette** (Ctrl/Cmd + P)
3. **Run command**: "Sync selected task to Todoist"
4. **Result**: Task appears in Todoist with Todoist links added to Obsidian

**Before sync:**

```markdown
- [ ] Review project proposal
```

**After sync:**

```markdown
- [ ] Review project proposal
    - [🔗 View in Todoist website](https://todoist.com/task/12345) [📱 View in Todoist app](todoist://task?id=12345)
```

### 3. Work with Synchronized Tasks

Once tasks are linked:

- **Complete in either platform**: Completion status syncs automatically
- **Edit in Todoist**: Due dates, priorities, and project assignments
- **Maintain context in Obsidian**: Rich notes, links, and relationships

## Essential Features

### Task Completion Auto-Sync

**Purpose**: Automatically keeps completion status synchronized between platforms

**Setup**:

1. Go to Settings → Todoist Context Bridge
2. Enable "Task completion auto-sync"
3. Configure sync interval (recommended: 5-15 minutes)

**Behavior**:

- Complete a task in Obsidian → automatically completed in Todoist
- Complete a task in Todoist → automatically completed in Obsidian (with optional timestamp)

### Manual Sync Commands

For immediate synchronization when you can't wait for auto-sync:

#### Current Task

- **Command**: "Sync completion status of current task"
- **Usage**: Place cursor on task and run command
- **Result**: Immediate bidirectional completion sync

#### Current File

- **Command**: "Sync completion status of all tasks in current file"
- **Usage**: Run while viewing any file with linked tasks
- **Result**: Syncs all linked tasks in the current file

#### Entire Vault

- **Command**: "Sync completion status of all tasks in vault"
- **Usage**: Run from anywhere
- **Result**: Comprehensive sync of all linked tasks

### Creating Tasks from Text

Convert any text into a Todoist task:

1. **Select text** you want to convert
2. **Run command**: "Create Todoist task from selected text"
3. **Result**: Text becomes a properly formatted task with Todoist links

**Example**:

```markdown
Remember to update the documentation
```

**Becomes**:

```markdown
- [ ] Remember to update the documentation
    - [🔗 View in Todoist website](https://todoist.com/task/12345) [📱 View in Todoist app](todoist://task?id=12345)
```

### Importing Tasks from Todoist

Bring existing Todoist tasks into Obsidian:

1. **Run command**: "Sync task from Todoist to Obsidian"
2. **Enter Todoist task ID or URL** in the modal
3. **Result**: Task appears in current note with bidirectional links

## Supported Content Formats

The plugin recognizes tasks in various contexts:

### Standard Lists

```markdown
- [ ] Standard task
- [x] Completed task
```

### Callouts

```markdown
> [!todo] Project Tasks
> - [ ] Task in callout
> - [ ] Another task
```

### Quoted Sections

```markdown
> Meeting Notes:
> - [ ] Follow up on action item
> - [ ] Schedule next meeting
```

## Task Linking Patterns

### Todoist Links in Obsidian

After syncing, tasks will have sub-items with Todoist links:

```markdown
- [ ] Main task content
    - [🔗 View in Todoist website](https://todoist.com/task/12345) [📱 View in Todoist app](todoist://task?id=12345)
```

### Link Formats

You can configure the link format in settings:

- **Website only**: Only web links
- **App only**: Only app protocol links  
- **Combined**: Both web and app links (default)

### Advanced URI Integration

If you have the Advanced URI plugin installed, tasks will also include block references:

```markdown
- [ ] Task with block reference ^task-block-id
    - [🔗 View in Todoist website](https://todoist.com/task/12345) [📱 View in Todoist app](todoist://task?id=12345)
```

## Completion Timestamps

### Automatic Timestamps

When tasks are completed in Todoist and synced to Obsidian, completion timestamps can be automatically added:

**Example**:

```markdown
- [x] Completed task completion::2024-01-15T14:30
```

### Configuration

- **Enable**: "Add completion timestamp" in settings
- **Source**: Choose between Todoist completion time or sync time
- **Format**: Customize using moment.js syntax

### Popular Formats

```markdown
# Default format

- [x] Task completion::2024-01-15T14:30

# Simple date

- [x] Task ✅ 2024-01-15

# Descriptive

- [x] Task completed on January 15th, 2024
```

## Performance Features

### Five-Category System

The plugin automatically categorizes tasks for optimal performance:

- **🔴 High Priority**: Completion status mismatches (synced immediately)
- **🟡 Medium Priority**: Both active (synced at intervals)
- **🟢 Low Priority**: Both completed (user configurable)
- **⚫ Skip Category**: Deleted tasks (ignored)

### Smart API Usage

- **Rate limit protection** prevents Todoist API errors
- **Intelligent caching** avoids redundant processing

## Daily Workflows

### Morning Planning

1. Review tasks in Todoist for the day
2. Complete tasks as you work
3. Auto-sync keeps both platforms updated

### Note-Taking Sessions

1. Create tasks naturally in your notes
2. Promote important tasks to Todoist as needed
3. Maintain rich context in Obsidian

### End-of-Day Review

1. Review completed tasks in both platforms
2. Use completion timestamps for time tracking
3. Plan next day's priorities in Todoist

## Integration with Other Plugins

### Dataview
Query tasks with completion data:

```dataview
TASK
FROM "Projects"
WHERE completion
SORT completion DESC
```

### Tasks Plugin

Enhanced task management with sync integration:

- Use Tasks plugin queries
- Maintain sync with Todoist
- Rich task metadata

### Task Marker

Comprehensive timestamp tracking:

- Install Task Marker for complete Obsidian timestamp tracking
- Use Context Bridge for Todoist integration
- Get timestamps for all task state changes

## Best Practices

### Task Content

- **Keep content consistent** between platforms
- **Use descriptive task names** that make sense in both contexts
- **Avoid editing Todoist links** manually in Obsidian

### Sync Management

- **Enable auto-sync** for seamless workflow
- **Use manual commands** for immediate needs
- **Monitor performance** and adjust settings as needed

### Organization

- **Use Todoist projects** for organization
- **Maintain context in Obsidian** with rich notes
- **Link related tasks** within notes for context

### Performance

- **Disable both-completed tracking** for large vaults
- **Use appropriate sync intervals** (5-15 minutes)
- **Run periodic maintenance** with journal commands

## Common Workflows

### Project Management

1. Create project note in Obsidian
2. Add tasks throughout the note
3. Promote key milestones to Todoist
4. Track progress in both platforms

### Meeting Notes

1. Take notes during meetings
2. Extract action items as tasks
3. Sync important actions to Todoist
4. Complete and track follow-ups

### Research and Learning

1. Create learning notes in Obsidian
2. Add research tasks and reading lists
3. Promote time-sensitive items to Todoist
4. Maintain comprehensive notes with task context

The basic workflow is designed to be intuitive and non-intrusive, allowing you to work naturally in both platforms while maintaining seamless synchronization where it matters most.
