# Obsidian Todoist Context Bridge

[![GitHub release (Latest by date)](https://img.shields.io/github/v/release/wenlzhang/obsidian-todoist-context-bridge)](https://github.com/wenlzhang/obsidian-todoist-context-bridge/releases) ![GitHub all releases](https://img.shields.io/github/downloads/wenlzhang/obsidian-todoist-context-bridge/total?color=success)

A powerful [Obsidian](https://obsidian.md/) plugin that bridges your Obsidian notes with Todoist tasks while preserving rich context, helping you highlight important tasks and maintain seamless workflows between the two platforms.

## What Makes This Plugin Different?

Unlike traditional Todoist sync plugins that try to sync everything, Context Bridge helps you:

- ✨ **Highlight** important tasks selectively in Todoist
- 🔄 **Preserve** rich context with bidirectional links
- 🎯 **Focus** on what truly matters
- 🔒 **Maintain** system reliability through one-way sync

## Key Features

### Task Management and Context

- **Selective Task Highlighting**
    - Choose which tasks deserve attention in Todoist
    - Keep your task manager focused and relevant
    - Prevent task overload and maintain clarity
- **Rich Context Preservation**
    - Maintain strong links between tasks and their source notes
    - Access original context directly from Todoist tasks
    - Review full context before completing tasks
    - Navigate seamlessly between platforms
- **Smart Duplicate Detection**
    - Intelligent checking of content and links
    - Multiple verification methods:
        - Existing Todoist links in notes
        - Task descriptions in Todoist
        - Block IDs and Advanced URIs
    - Configurable duplicate handling
    - Special handling for completed tasks

### System Design

- **One-Way Sync**
    - Deliberate Obsidian → Todoist workflow
    - Prevents sync conflicts and data corruption
    - Maintains note integrity
    - Clear separation of planning and execution
- **Redundancy and Reliability**
    - Tasks exist safely in both systems
    - Strong linking prevents lost connections
    - Clear workflows reduce confusion
    - Easy recovery and verification

### Advanced Features

- **Project Integration**
    - Sync to any Todoist project
    - Default project selection
    - Project-specific rules
- **Block-Level Precision**
    - Exact task location tracking
    - Customizable block IDs
    - Reliable note navigation
- **Smart Text Cleanup**
    - Built-in patterns for common Markdown elements
    - Customizable regex patterns for text cleaning
    - Remove timestamps, emojis, tags, and more
    - Keep task names clean and focused in Todoist

#### Text Cleanup Patterns

The plugin provides powerful text cleanup capabilities to ensure your Todoist tasks are clean and focused:

1. **Default Cleanup Patterns**
   - Checkboxes: `^[\s-]*\[[ x?/-]\]` (e.g., "- [ ] Task")
   - Timestamps: `📝\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?` (e.g., "📝 2024-11-23T22:09")
   - Block IDs: `\^[a-zA-Z0-9-]+$` (e.g., "^abc123")
   - Tags: `#[^\s]+` (e.g., "#tag")
   - Emojis: Unicode ranges for common emoji sets
2. **Custom Patterns**
   - Add your own regex patterns in settings
   - Patterns are applied with global and unicode flags
   - Multiple patterns supported (comma-separated)
   - Example: To remove `[2024-01-01]` style timestamps, use: `\[\d{4}-\d{2}-\d{2}\]`
3. **Configuration**
   - Enable/disable default patterns
   - Add custom patterns for specific needs
   - Test patterns at [regex101.com](https://regex101.com)
   - Changes apply to all new tasks

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

## Design Philosophy

Context Bridge is built on three core principles:

1. **Context is King**
    - Tasks don't exist in isolation - they emerge from thoughts, plans, and projects
    - Original note context is crucial for effective task completion
    - Strong bidirectional links ensure context is always accessible
    - Reviewing context before completion leads to better outcomes
2. **Intentional Task Management**
    - Not every task needs to be in Todoist
    - Important tasks deserve special attention
    - Selective syncing keeps your task manager focused
    - Clear separation between planning and execution
3. **System Reliability**
    - Redundant storage provides safety and accessibility
    - One-way sync prevents conflicts and corruption
    - Clear workflows reduce confusion
    - Strong links maintain system integrity

## How It Works

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '16px', 'fontFamily': 'arial' }}}%%
graph LR
    classDef systemLabel fill:none,stroke:none,color:#666,font-style:italic,font-size:14px
    classDef bigLabel fill:none,stroke:none,color:#333,font-size:18px,font-weight:bold
    classDef boxStyle fill:#f5f5f5,stroke:#333,stroke-width:2px
    classDef featureStyle fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    
    Title["Obsidian Todoist Context Bridge"]
    class Title bigLabel

    subgraph Obsidian["Obsidian Environment"]
        direction TB
        Notes["📝 Notes & Projects"]
        Tasks["✓ Task Collection"]
        Context["🔍 Rich Context"]
        Notes --> Tasks
        Notes --> Context
        Tasks --> Context
    end
    class Obsidian systemLabel

    subgraph Bridge["Context Bridge Features"]
        direction TB
        Select["🎯 Select Important Tasks"]
        Link["🔗 Generate Context Links"]
        Store["💾 Create Redundancy"]
        Select --> Link
        Link --> Store
    end
    class Bridge systemLabel

    subgraph Todoist["Todoist Environment"]
        direction TB
        TTasks["⭐ Highlighted Tasks"]
        TContext["📎 Context Links"]
        TStatus["📊 Task Status"]
        TTasks --> TContext
        TTasks --> TStatus
    end
    class Todoist systemLabel

    Tasks -->|"Important Tasks"| Bridge
    Bridge -->|"Selected Tasks"| TTasks
    TContext -.->|"Context Review"| Context

    %% Core Features Callouts
    F1["🎯 Selective Task Highlighting"]
    F2["🔄 Context Preservation"]
    F3["🔒 System Reliability"]
    F4["📋 Task Review Workflow"]

    class F1,F2,F3,F4 featureStyle

    F1 -.->|"Choose important tasks"| Select
    F2 -.->|"Maintain context"| Link
    F3 -.->|"Ensure reliability"| Store
    F4 -.->|"Review with context"| TContext

    class Notes,Tasks,Context,Select,Link,Store,TTasks,TContext,TStatus boxStyle

    style Bridge fill:#f9f,stroke:#333,stroke-width:4px
    style Obsidian fill:#282e3e,color:#fff
    style Todoist fill:#e44332,color:#fff
```

### Core Features Explained

```mermaid
mindmap
    root["🌉 Obsidian Todoist Context Bridge"]
        ("🎯 Selective Highlighting")
            ("Choose important tasks")
            ("Prevent task overload")
            ("Focus on what matters")
        ("🔄 Context Preservation")
            ("Bidirectional links")
            ("Rich note context")
            ("Easy navigation")
        ("🔒 System Reliability")
            ("Redundant storage")
            ("Conflict prevention")
            ("Data integrity")
        ("📋 Task Review")
            ("Context-aware completion")
            ("Original note access")
            ("Better task understanding")
```

## Quick Start

1. Install the plugin from Obsidian Community Plugins
2. Add your Todoist API token in settings
3. Start highlighting tasks with the command palette or context menu

[Detailed Setup Guide](#setup-guide) | [Usage Examples](#usage-examples)

## Setup Guide

1. Get your Todoist API token:
    - Log in to Todoist → Settings → Integrations → API token
    - Copy your token
2. Configure the plugin:
    - Open Obsidian Settings → Todoist Context Bridge
    - Paste your API token
    - Select default project (optional)

## Usage Examples

### Basic Usage

1. Create tasks in your notes
2. Use the command palette to sync important tasks
3. Find tasks in Todoist with links back to notes

### Advanced Features

- Use block IDs for precise references
- Configure duplicate handling
- Set up project-specific rules

## Support

- [Report Issues](https://github.com/wenlzhang/obsidian-todoist-context-bridge/issues)
- [Ask Questions](https://github.com/wenlzhang/obsidian-todoist-context-bridge/discussions)

<a href='https://ko-fi.com/C0C66C1TB' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=3' border='0' alt='Buy Me a Coffee' /></a>
