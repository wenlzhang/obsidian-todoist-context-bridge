# Obsidian Simple Todoist Sync

A lightweight, efficient plugin for Obsidian that enables seamless one-way task synchronization from Obsidian to Todoist. This plugin focuses on simplicity and reliability while maintaining a strong connection between your Obsidian notes and tasks and Todoist reminders.

## The Story Behind This Plugin

This plugin emerged from a specific need: highlighting and tracking important tasks while maintaining their rich context. As an Obsidian user who relies on Todoist for task management, I found that not every task in my notes needed to be in Todoist - only the significant ones that required focused attention and tracking.

### The Problem

While Obsidian excels at capturing tasks within their full context (in notes, projects, or thinking processes), these tasks can get lost among countless other notes and ideas. Todoist, on the other hand, excels at highlighting and tracking important tasks, but lacks the rich context in which these tasks were created.

### The Solution

This plugin bridges this gap by:

1. Allowing you to selectively sync important tasks to Todoist
2. Maintaining strong links back to the original Obsidian context
3. Creating a reliable redundancy system - tasks exist both in your notes and your task manager
4. Keeping your task management system focused on what truly matters

This approach means:

- Your notes remain your primary source of truth
- Important tasks get the spotlight they deserve in Todoist
- You always have access to the full context when needed
- Your task management system stays clean and focused

## Design Philosophy

The decision to implement one-way synchronization (Obsidian → Todoist) was deliberate and based on several key insights:

1. **Preserving Context**
   - Tasks in Obsidian often emerge from your notes and thinking process
   - The original note contains valuable context that shouldn't be lost
   - When completing tasks in Todoist, reviewing the original context in Obsidian is often beneficial
2. **Preventing Data Corruption**
   - Bidirectional sync can lead to complex conflict scenarios
   - Notes in Obsidian could be accidentally modified by automated sync
   - One-way sync ensures your notes remain exactly as you wrote them
3. **Intentional Task Completion**
   - When marking a task complete in Todoist, you should revisit the original note
   - This promotes better review and understanding of the completed work
   - Helps maintain the connection between tasks and their broader context
4. **Simplicity and Reliability**
   - One-way sync is easier to implement correctly
   - Fewer edge cases and potential failure points
   - More predictable behavior for users

This approach encourages a natural workflow where:

- Obsidian is your thinking and planning environment
- Todoist is your execution and tracking environment
- Each tool is used for what it does best

## Key Features

### One-Way Synchronization

- **Intentional Design**: Tasks flow from Obsidian to Todoist only
- **Data Integrity**: Prevents sync conflicts and data corruption
- **Clear Workflow**: Use Obsidian for planning, Todoist for execution
- **Note Context**: Tasks remain connected to their source notes

### Smart Duplicate Detection

- **Intelligent Checking**: Verifies both content and links
- **Multiple Verification Methods**:
  - Checks existing Todoist links in notes
  - Searches task descriptions in Todoist
  - Verifies block IDs and Advanced URIs
- **Configurable Behavior**: 
  - Option to allow intentional duplicates
  - Special handling for completed tasks

### Task Management

- **Status-Aware Sync**: Only syncs open tasks by default
- **Project Integration**: Sync tasks to any Todoist project, with Inbox as default
- **Error Prevention**: Comprehensive validation before sync
- **User-Friendly Messages**: Clear feedback for all operations

### Advanced Linking

- **Automatic Link Generation**: Creates Todoist task links as sub-items
- **Deep Linking**: Uses Advanced URI for precise note references
- **Block-Level Precision**: Adds unique block IDs for exact task location
- **Link Persistence**: Maintains connections even if notes are moved
- **Custom ID Management**: Configurable note and block ID formats

## What Makes This Plugin Different?

Unlike other Todoist integration plugins, Simple Todoist Sync:

1. **Focuses on One-Way Sync**: 
   - Deliberately designed for Obsidian → Todoist workflow
   - Prevents sync conflicts and maintains data integrity
   - Perfect for using Obsidian as your note-taking and task creation hub
2. **Preserves Context**:
   - Creates deep links back to your Obsidian notes
   - Maintains block-level references for precise task location
   - Integrates with Advanced URI for reliable note linking
3. **Keeps It Simple**:
   - No complex configuration required
   - Minimal interface with maximum functionality
   - Fast and lightweight operation

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins and disable Safe Mode
3. Click Browse and search for "Simple Todoist Sync"
4. Install the plugin and enable it

### Requirements

- Obsidian v0.15.0 or higher
- [Advanced URI](https://obsidian.md/plugins?id=obsidian-advanced-uri) plugin
- Todoist account and API token

## Setup

1. Get your Todoist API token:
   - Log in to Todoist
   - Go to Settings → Integrations → Developer
   - Copy your API token

2. Configure the plugin:
   - Open Obsidian Settings → Simple Todoist Sync
   - Paste your Todoist API token
   - Select your default project (optional)
   - Adjust other settings as needed

## Usage

### Basic Task Syncing

1. Create a task in Obsidian:
   ```markdown
   - [ ] Review meeting notes
   ```
2. Place your cursor on the task line
3. Use either:
   - Command palette: "Sync selected task to Todoist"
   - Hotkey: (customizable in Settings → Hotkeys)
4. The task will be synced, and a link will be added:
   ```markdown
   - [ ] Review meeting notes
       - 🔗 [View in Todoist](https://todoist.com/app/task/12345678)
   ```

### Advanced Features

#### Project Selection

- Set a default project in settings
- Tasks sync to Inbox if no project is specified

#### Duplicate Handling

- Enable/disable duplicate task creation
- Configure handling of completed tasks
- Smart detection of existing tasks

#### ID Management

- Customize note ID field in frontmatter
- Configure block ID format
- Maintains reliable links between platforms

## Tips and Best Practices

1. **Task Organization**:
   - Keep tasks in relevant note contexts
   - Use clear, actionable task descriptions
   - Consider project structure in both platforms
2. **Efficient Workflow**:
   - Set up keyboard shortcuts for quick syncing
   - Use default projects for common task types
   - Review and clean up completed tasks regularly
3. **Link Management**:
   - Keep generated links for reference
   - Use block IDs for precise navigation
   - Maintain consistent note organization

## Troubleshooting

### Common Issues

1. **Task Not Syncing**
   - Check API token validity
   - Ensure cursor is on a task line
   - Verify Advanced URI plugin is installed
2. **Link Not Working**
   - Check if note has moved
   - Verify vault name is correct
   - Ensure Advanced URI plugin is enabled
3. **Duplicate Tasks**
   - Check duplicate task settings
   - Review existing task links
   - Verify task completion status

## Development Journey

The development of this plugin has been guided by real-world usage and user feedback:

1. **Initial Concept**
   - Started with the need to highlight important tasks from notes
   - Focused on maintaining the connection between tasks and their context
   - Aimed for a clean, focused task management system
2. **Key Design Decisions**
   - Chose one-way sync to maintain note integrity
   - Implemented selective task syncing for better focus
   - Added robust linking for easy context access
   - Created redundancy through dual task storage
3. **User-Driven Improvements**
   - Enhanced project selection for better task organization
   - Added configurable duplicate handling
   - Improved error messages and validation
   - Implemented status-aware syncing

### Future Vision

While maintaining its core focus on simplicity and reliability, the plugin will continue to evolve:

1. **Planned Enhancements**
   - More flexible task selection options
   - Enhanced metadata preservation
   - Additional project management features
   - Improved error reporting and recovery
2. **Core Principles**
   - Keep the focus on important tasks
   - Maintain strong context links
   - Preserve note integrity
   - Ensure system reliability

## Support and Contribution

- [GitHub Issues](https://github.com/wenlzhang/obsidian-simple-todoist-sync/issues) for bug reports and feature requests
- [GitHub Discussions](https://github.com/wenlzhang/obsidian-simple-todoist-sync/discussions) for questions and ideas
- Pull requests are welcome!

## Support Me

<a href='https://ko-fi.com/C0C66C1TB' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
