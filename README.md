# Todoist Context Bridge

[![GitHub release (Latest by date)](https://img.shields.io/github/v/release/wenlzhang/obsidian-todoist-context-bridge)](https://github.com/wenlzhang/obsidian-todoist-context-bridge/releases) ![GitHub all releases](https://img.shields.io/github/downloads/wenlzhang/obsidian-todoist-context-bridge/total?color=success)

A powerful [Obsidian](https://obsidian.md/) plugin that seamlessly bridges your Obsidian notes with [Todoist](https://todoist.com/) tasks, providing intelligent bidirectional synchronization, advanced task management, and comprehensive linking capabilities. Seamlessly integrate with [Dataview](https://github.com/blacksmithgu/obsidian-dataview) and [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugins.

![demo](/docs/attachment/demo.gif)

## 🌟 Key Features

- **📋 Task Creation & Linking**: Create Todoist tasks from Obsidian with automatic bidirectional linking
- **🔄 Intelligent Bidirectional Sync**: Automatic completion status synchronization between platforms
- **⚡ Five-Category Performance System**: Optimized sync with 90-95% reduction in API calls
- **📊 Advanced Journal Tracking**: Persistent state management with backup and recovery
- **🎯 Flexible Manual Controls**: Granular sync commands for immediate control
- **⏰ Smart Completion Timestamps**: Configurable timestamp integration with multiple sources
- **🔧 Comprehensive Settings**: Extensive customization for every workflow
- **📱 Cross-Platform Support**: Works seamlessly on desktop and mobile

## 📚 Documentation

### Quick Start

- **[Installation Guide](docs/setup/installation.md)** - Get up and running in minutes
- **[Basic Setup](docs/setup/basic-setup.md)** - Essential configuration steps
- **[Basic Usage Guide](docs/user-guide/basic-usage.md)** - Common workflows and examples

### User Guides

- **[Task Completion Auto-Sync](docs/features/task-completion-auto-sync.md)** - Bidirectional sync system
- **[Manual Sync Commands](docs/features/manual-sync-commands.md)** - Immediate control options
- **[Journal & Log Management](docs/features/journal-log-management.md)** - State tracking and maintenance
- **[Settings Guide](docs/reference/settings-guide.md)** - Complete settings reference

### Advanced Features

- **[Five-Category Task System](docs/advanced/five-category-task-system.md)** - Performance optimization
- **[Journal Backup & Recovery](docs/advanced/journal-backup-recovery.md)** - Data protection
- **[Plugin Integration](docs/advanced/plugin-integration.md)** - Work with other plugins

### Technical Documentation

- **[Architecture Overview](docs/technical/architecture.md)** - System design and components
- **[API Reference](docs/reference/api-reference.md)** - Internal APIs and interfaces
- **[Troubleshooting Guide](docs/troubleshooting/common-issues.md)** - Solutions and diagnostics

### Support & Contributing

- **[FAQ](docs/troubleshooting/faq.md)** - Frequently asked questions
- **[Contributing Guide](docs/contributing/contributing.md)** - How to contribute
- **[Complete Documentation Index](docs/README.md)** - All documentation files

## 🚀 Quick Start

### 1. Installation

Install from the Obsidian Community Plugins store or manually download from releases.

### 2. Basic Setup

1. Get your [Todoist API token](https://todoist.com/prefs/integrations)
2. Open plugin settings and enter your API token
3. Configure your default project and preferences
4. Enable task completion auto-sync if desired

### 3. Create Your First Task

```markdown
- [ ] Review project proposal #work
  - [🔗 View in Todoist](https://todoist.com/task/123456)
```

Run the "Create Todoist task from selection" command to promote any task to Todoist with automatic linking.

## ⚡ Performance Highlights

### Five-Category Task System

Our intelligent task prioritization system dramatically improves performance:

- **90-95% reduction** in Todoist API calls
- **Smart categorization** based on completion states
- **User-configurable** tracking preferences
- **Rate limit protection** with exponential backoff

### Journal-Based Efficiency

- **Persistent state tracking** for all linked tasks
- **Incremental file scanning** with modification detection
- **Bulk operations** where possible
- **Conservative API usage** patterns

## 🔄 Sync Capabilities

### Bidirectional Completion Sync

- **Obsidian → Todoist**: Mark tasks complete in Todoist when completed in Obsidian
- **Todoist → Obsidian**: Mark tasks complete in Obsidian when completed in Todoist
- **Smart timestamps**: Add completion timestamps with configurable formats
- **Configurable intervals**: Set sync frequency from 1-60 minutes

### Manual Sync Commands

- **Current task**: Sync the task under your cursor immediately
- **Current file**: Sync all linked tasks in the active file
- **Entire vault**: Comprehensive sync across all files
- **Journal maintenance**: Validate and heal sync data

### Supported Task Formats

- Standard markdown tasks (`- [ ]` / `- [x]`)
- Tasks in callouts and quotes
- Various completion markers (x, X, custom symbols)

## 🔧 Key Settings

### Essential Configuration

- **API Token**: Your Todoist API authentication
- **Default Project**: Where new tasks are created
- **Link Format**: Website, app, or both link types
- **Sync Interval**: How often to check for changes (1-60 minutes)

### Advanced Options

- **Completion Timestamps**: Add timestamps when tasks are completed
- **Five-Category System**: Configure task prioritization and tracking
- **Notification Preferences**: Control success/error notifications
- **UID Field**: Note ID-based file tracking for reliability

## 🛠️ Manual Commands

Access these commands via the Command Palette (Ctrl/Cmd + P):

### Task Management

- **Create Todoist task from selection** - Promote selected text to Todoist
- **Import Todoist tasks to Obsidian** - Browse and import existing tasks

### Sync Operations

- **Sync current task** - Immediate bidirectional sync for cursor task
- **Sync all tasks in current file** - Sync all linked tasks in active file
- **Manual sync (entire vault)** - Comprehensive vault-wide sync

### Journal Maintenance

- **Smart journal maintenance** - Intelligent validation and healing
- **Force rebuild journal** - Complete journal reconstruction
- **Backup sync journal** - Create timestamped backup
- **Reset sync journal** - Reset with two-step confirmation

## 🔗 Integration with Other Plugins

### Recommended Combinations

- **[Dataview](https://github.com/blacksmithgu/obsidian-dataview)**: Query and display sync data
- **[Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)**: Enhanced task management
- **[Task Marker](https://github.com/wenlzhang/obsidian-task-marker)**: Comprehensive timestamp tracking
- **[Advanced URI](https://github.com/Vinzent03/obsidian-advanced-uri)**: Block-level linking

### Plugin-Specific Features

- **Block references**: Link to specific task lines in notes
- **Timestamp integration**: Compatible with existing timestamp workflows
- **Query support**: Access sync data through Dataview queries
- **Theme compatibility**: Respects Obsidian themes and CSS customizations

## 📊 Monitoring & Maintenance

### Journal Health

The plugin maintains a comprehensive sync journal that tracks:
- Task completion states and sync history
- File paths and note ID associations
- Deleted and orphaned task handling
- Performance metrics and error tracking

### Backup & Recovery

- **Automatic backups** before destructive operations
- **Manual backup creation** with timestamped files
- **Journal validation** with healing capabilities
- **Recovery procedures** for data protection

### Performance Monitoring

- **Sync operation tracking** with detailed logging
- **API call optimization** with rate limit protection
- **Memory usage monitoring** for large vaults
- **Error handling** with graceful degradation

## 🐛 Troubleshooting

### Common Issues

- **API token validation**: Verify token in Todoist integrations
- **Rate limiting**: Automatic handling with exponential backoff
- **File synchronization**: Journal-based state tracking
- **Performance optimization**: Five-category task system

### Getting Help

1. Check the [Troubleshooting Guide](docs/troubleshooting/common-issues.md)
2. Search existing [GitHub Issues](https://github.com/wenlzhang/obsidian-todoist-context-bridge/issues)
3. Create a new issue with detailed information

### Development

```bash
# Clone the repository
git clone https://github.com/wenlzhang/obsidian-todoist-context-bridge.git

# Install dependencies
npm install

# Build the plugin
npm run build

# Development with hot reload
npm run dev
```

## 🙏 Acknowledgments

- **Obsidian team** for the excellent plugin API
- **Todoist** for their comprehensive REST API
- **Community contributors** for feedback and improvements
- **Plugin ecosystem** for inspiration and integration opportunities
