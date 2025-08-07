# Todoist Context Bridge

[![GitHub release (Latest by date)](https://img.shields.io/github/v/release/wenlzhang/obsidian-todoist-context-bridge)](https://github.com/wenlzhang/obsidian-todoist-context-bridge/releases) ![GitHub all releases](https://img.shields.io/github/downloads/wenlzhang/obsidian-todoist-context-bridge/total?color=success)

A powerful [Obsidian](https://obsidian.md/) plugin that bridges your Obsidian notes with Todoist tasks while preserving rich context, helping you highlight important tasks and maintain seamless workflows between the two platforms. Seamlessly integrate with [Dataview](https://github.com/blacksmithgu/obsidian-dataview) and [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugins.

![demo](/docs/attachment/demo.gif)

## 🌟 Key Features

- **📋 Task Creation & Linking**: Create Todoist tasks from Obsidian with automatic bidirectional linking
- **🔄 Intelligent Bidirectional Sync**: Automatic completion status synchronization between platforms
- **📊 Advanced Journal Tracking**: Persistent state management with backup and recovery
- **🎯 Flexible Manual Controls**: Granular sync commands for immediate control
- **⏰ Smart Completion Timestamps**: Configurable timestamp integration with multiple sources
- **🔧 Comprehensive Settings**: Extensive customization for every workflow
- **📱 Cross-Platform Support**: Works seamlessly on desktop and mobile

## What Makes This Plugin Different

Unlike traditional Todoist sync plugins that try to sync everything, Context Bridge helps you:

- 🔌 **Integrate** with [Dataview](https://ptkm.net/obsidian-todoist-context-bridge-dataview-integration) and [Tasks](https://ptkm.net/obsidian-todoist-context-bridge-tasks-integration) plugins
- ✨ **Highlight** important tasks selectively in Todoist
- 🔄 **Sync** tasks bidirectionally between Obsidian and Todoist
- ⏱️ **Maintain** temporal context
- 🎯 **Focus** on what truly matters
- 📝 **Support** various content formats (lists, tasks, callouts, quotes)

## Videos and Articles

### Videos

<a href="https://youtu.be/2cpQCrP_pqs" target="_blank">
  <img src="./docs/attachment/thumbnail-demo.png" width="800" alt="Enhance Your Productivity: Integrating Obsidian and Todoist with the PTKM Method" />
</a>

<a href="https://youtu.be/O1lvrMh3FG4?si=SXD6Msyu0WJUjsvW" target="_blank">
  <img src="./docs/attachment/thumbnail-demo-dev.png" width="800" alt="AI Prompt Engineering for Obsidian Plugin Dev (MacWhisper & WindSurf): 2h No Code, Ask Critically!" />
</a>

### Articles

To learn more about PTKM and how to use this plugin, check out the following articles:

- [The Importance of Context in Task and Knowledge Management: Leveraging the Obsidian Todoist Context Bridge Plugin - PTKM](https://ptkm.net/blog-context-importance-todoist-context-bridge)
- [Bridging Tasks and Knowledge in Obsidian: Introducing the Todoist Context Bridge Plugin - PTKM](https://ptkm.net/blog-introducing-todoist-context-bridge)

## Why You Need Todoist Context Bridge

[Todoist Context Bridge](https://ptkm.net/obsidian-todoist-context-bridge) was crafted with five [PTKM Core Principles](https://ptkm.net/ptkm-core-principles) that shape its functionality:

- **Task-Centered Workflow**: Prioritizing efficient task management and natural workflow integration
- **Context Preservation**: Ensuring no valuable information is lost in the task management process
- **Linking Everything**: Bridging the gap between Obsidian and Todoist
- **Focus on Priority**: Helping users concentrate on what truly matters
- **Reliable Redundancy**: Maintaining data integrity through smart synchronization

**Todoist Context Bridge** was born from a real-world challenge: the need to effectively highlight and track important tasks while preserving their complete context. As both an Obsidian enthusiast and Todoist power user, I discovered that while not every note-taking task warranted a place in my task manager, the crucial ones deserved focused attention and reliable tracking.

### The Challenge

Modern knowledge workers face a common dilemma: Obsidian excels at capturing tasks with rich context - embedding them within notes, projects, and thought processes. However, these important tasks can easily become buried in an ocean of notes and ideas. Todoist shines at task tracking and highlighting, but traditionally lacks the deep context that birthed these tasks.

### The Bridge

**Todoist Context Bridge** elegantly solves this challenge through four key mechanisms:

1. **Selective Sync**: Thoughtfully choose which tasks deserve promotion to your Todoist workflow
2. **Contextual Links**: Maintain robust bidirectional connections to your original Obsidian notes
3. **Reliable Redundancy**: Ensure task security through strategic presence in both systems
4. **Focused Management**: Keep your task system lean and relevant by promoting only what matters

## 📚 Documentation

📚 **[View Full Documentation](https://ptkm.net/obsidian-todoist-context-bridge)**

Visit the documentation site to learn how to make the most of Todoist Context Bridge in your Obsidian workflow.

For comprehensive guides, tutorials, and technical documentation, also visit our **[Documentation Hub](docs/README.md)**.

### 🚀 Core Features

- **[Task Completion Auto-Sync](features/task-completion-sync.md)** - Bidirectional task completion synchronization
- **[Manual Sync Commands](features/manual-sync-commands.md)** - On-demand sync operations

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

Run the "Sync selected task to Todoist" command to promote any task to Todoist with automatic linking.

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

## Support & Community

This plugin is a labor of love, developed and maintained during my free time after work and on weekends. A lot of thought, energy, and care goes into making it reliable, user-friendly, and aligned with PTKM principles.

If you find this plugin valuable in your daily workflow:

- If it helps you manage tasks more effectively
- If it saves you time and mental energy
- If it makes your work between Obsidian and Todoist smoother

Please consider supporting my work. Your support would mean the world to me and would help me dedicate more time and energy to:

- Developing new features
- Maintaining code quality
- Providing support and documentation
- Making the plugin even better for everyone

### Ways to Support

You can support this project in several ways:

- ⭐ Star the project on GitHub
- 💝 <a href='https://ko-fi.com/C0C66C1TB' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=3' border='0' alt='Buy Me a Coffee' /></a>
- [Sponsor](https://github.com/sponsors/wenlzhang) my work on GitHub
- 💌 Share your success stories and feedback
- 📢 Spread the word about the plugin
- 🐛 [Report issues](https://github.com/wenlzhang/obsidian-todoist-context-bridge/issues) to help improve the plugin

Thank you for being part of this journey! 🙏
