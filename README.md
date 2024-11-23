# Obsidian Simple Todoist Sync

A lightweight, efficient plugin for Obsidian that enables seamless one-way task synchronization from Obsidian to Todoist. This plugin focuses on simplicity and reliability while maintaining a strong connection between your Obsidian notes and Todoist tasks.

## Key Features

- **One-Click Task Sync**: Instantly sync any Markdown task from Obsidian to Todoist
- **Bidirectional Links**: Each synced task maintains a link back to its original Obsidian note
- **Smart Duplicate Detection**: Intelligently prevents duplicate tasks while allowing intentional re-syncing
- **Project Integration**: Sync tasks to any Todoist project, with Inbox as default
- **Block Reference Support**: Maintains precise links to specific tasks in your notes
- **Completed Task Handling**: Configurable handling of completed tasks in both Obsidian and Todoist

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

## Support and Contribution

- [GitHub Issues](https://github.com/wenlzhang/obsidian-simple-todoist-sync/issues) for bug reports and feature requests
- [GitHub Discussions](https://github.com/wenlzhang/obsidian-simple-todoist-sync/discussions) for questions and ideas
- Pull requests are welcome!

## Support Me

<a href='https://ko-fi.com/C0C66C1TB' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
