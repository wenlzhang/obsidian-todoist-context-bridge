# Installation and Usage

## Installation Methods

There are several ways to install the Todoist Context Bridge plugin:

1. **Community Plugin Store** (Recommended)
   - Open Obsidian Settings → Community plugins
   - Click "Browse" and search for "Todoist Context Bridge"
   - Click "Install" and "Enable"
2. **Using BRAT** (Beta Reviewer's Auto-update Tool)
   - Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugin Store
   - Open BRAT settings
   - Click "Add Beta plugin"
   - Enter repository URL: `wenlzhang/obsidian-todoist-context-bridge`
   - Enable the plugin in Community plugins
3. **Manual Installation**
   - Download the latest release from the [releases page](https://github.com/wenlzhang/obsidian-todoist-context-bridge/releases)
   - Extract the files into your `.obsidian/plugins/todoist-context-bridge` folder
   - If the folder doesn't exist, create it
   - Enable the plugin in Obsidian Settings → Community plugins

## Initial Setup

1. **Get your Todoist API token**:
   - Log in to [Todoist](https://todoist.com)
   - Go to Settings → Integrations → Developer
   - Copy your API token
2. **Configure the plugin**:
   - Open Obsidian Settings → Todoist Context Bridge
   - Paste your Todoist API token
   - Configure other settings as needed:
      - Default project for new tasks
      - Priority mapping
      - Date formats
      - Text cleanup patterns
3. **Required Dependencies**:
   - Install the [Advanced URI](https://github.com/Vinzent03/obsidian-advanced-uri) plugin
   - Enable it in Community plugins
4. **Verify Installation**:
   - Open Command Palette (Cmd/Ctrl + P)
   - Search for "Todoist"
   - You should see the plugin's commands listed

Now you're ready to start using the plugin! Check the [Available Commands](#available-commands) section to learn about the different ways to interact with your tasks.

## Available Commands

The plugin provides 5 commands that can be accessed through the Command Palette (Cmd/Ctrl + P):

1. **Sync selected task to Todoist**
   - Syncs a task from your Obsidian note to Todoist
   - Place cursor on a task line (e.g., `- [ ] Task`)
   - Supports due dates, priorities, and other metadata
   - Creates a link back to your note in Todoist
2. **Create Todoist task from selected text**
   - Creates a new Todoist task from any selected text
   - Works with non-task text (e.g., regular paragraphs or list items)
   - Useful for quickly converting notes into tasks
   - Maintains link to the source note
3. **Create Todoist task linked to current note**
   - Creates a new Todoist task linked to your current note
   - No text selection needed
   - Perfect for creating reference tasks
4. **Sync description from Todoist task**
   - Retrieves task description from Todoist
   - Excludes metadata and reference links
   - Place cursor on a task with Todoist link
   - Maintains proper formatting and indentation
5. **Sync full description from Todoist task**
   - Retrieves complete task description including metadata
   - Includes original task references and links
   - Place cursor on a task with Todoist link
   - Perfect for full context review

**Note**: All commands (except "Create task linked to current note") require text selection or cursor placement on the relevant text. Make sure you have configured your Todoist API token in settings before using any command.
