# Installation & Setup

## Prerequisites

- **Obsidian**: Version 0.15.0 or higher
- **Todoist Account**: Active Todoist account (free or premium)
- **Todoist API Token**: Required for plugin functionality

## Installation

### Method 1: Community Plugin Store (Recommended)

1. Open Obsidian Settings
2. Navigate to **Community plugins**
3. Click **Browse** and search for "Todoist Context Bridge"
4. Click **Install** and then **Enable**

### Method 2: Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/wenlzhang/obsidian-todoist-context-bridge/releases)
2. Extract the files to your vault's `.obsidian/plugins/todoist-context-bridge/` folder
3. Restart Obsidian
4. Enable the plugin in Settings → Community plugins

## Initial Configuration

### 1. Get Your Todoist API Token

1. Open [Todoist](https://todoist.com) in your web browser
2. Go to **Settings** → **Integrations** → **Developer**
3. Copy your **API token**

### 2. Configure the Plugin

1. Open Obsidian Settings
2. Navigate to **Community plugins** → **Todoist Context Bridge**
3. Paste your API token in the **Todoist API token** field
4. Select your **Default Todoist project** from the dropdown
5. Configure other settings as needed (see [Settings Guide](../user-guide/settings-guide.md))

### 3. Verify Installation

1. Create a test task in Obsidian: `- [ ] Test task`
2. Use the command palette (Ctrl/Cmd + P) to run "Sync selected task to Todoist"
3. Check that the task appears in your Todoist project

## Quick Start

Once installed and configured, you can:

- **Sync tasks to Todoist**: Select a task and use "Sync selected task to Todoist"
- **Enable auto-sync**: Turn on "Task completion auto-sync" in settings
- **Manual sync**: Use various sync commands for immediate synchronization

## Next Steps

- Read the [Basic Usage Guide](../user-guide/basic-usage.md)
- Explore [Task Completion Auto-Sync](../features/task-completion-sync.md)
- Learn about [Manual Sync Commands](../features/manual-sync-commands.md)

## Troubleshooting

If you encounter issues during installation:

- Ensure your Todoist API token is correct
- Check that you have an active internet connection
- Verify Obsidian is version 0.15.0 or higher
- See [Common Issues](../troubleshooting/common-issues.md) for more help
