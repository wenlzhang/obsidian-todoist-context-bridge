# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2025-08-04

### Added

- **Granular Manual Sync Commands**: Three new commands for precise sync control
  - "Sync current task completion status" - Syncs individual task at cursor position
  - "Sync all tasks in current file" - Syncs all linked tasks in active file
  - "Sync all tasks in vault" - Comprehensive vault-wide sync
- **Plugin-Level Journal Maintenance**: Intelligent journal maintenance system
  - Startup vault scan automatically discovers all linked tasks
  - Real-time file modification listeners update journal immediately
  - Periodic maintenance runs at 1/3 of sync interval (min 2, max 15 minutes)
  - Unified interval setting controls both sync and journal maintenance
- **Smart Fallback System**: Manual file sync falls back to direct discovery if journal is stale
- **Two-Step Confirmation Modal**: Enhanced safety for destructive operations
  - Custom modal class with typing confirmation requirement
  - Professional styling using Obsidian CSS variables
  - Prevents accidental data loss for sync journal reset
- **Enhanced Notification Preferences**: Granular control over notification behavior
  - Separate preferences for desktop and mobile platforms
  - Options: "All notifications", "Errors only", "No notifications"
  - Context-aware filtering for different notification types

### Improved

- **Manual Sync Architecture**: Direct bidirectional sync instead of journal-based detection
  - Immediate completion status synchronization
  - Clear logging with `[MANUAL SYNC]` prefix
  - Proper timestamp handling with user preferences
- **Current Task Sync**: Enhanced sub-item search for Todoist links
  - Searches indented sub-items beneath main task automatically
  - Improved error messages and user guidance
  - Consistent with plugin's established linking patterns
- **File Sync Optimization**: Journal-based efficiency improvements
  - Uses existing task identification modules
  - Leverages sync journal for O(1) task discovery
  - Updates journal after sync for consistency
- **Journal Maintenance**: Architectural independence from sync operations
  - Journal updates happen at plugin lifecycle level
  - Independent of both auto-sync and manual sync commands
  - Self-healing system that improves efficiency over time

### Fixed

- **Manual Sync Reliability**: Commands now work regardless of journal state
- **Timestamp Detection**: Robust detection using moment.js parsing
- **Link Pattern Matching**: Consistent Todoist link extraction across all commands
- **Build Errors**: Resolved TypeScript compilation issues and lint warnings

### Documentation

- **Updated README.md**: Comprehensive documentation for all new features
- **Enhanced ENHANCED_SYNC_GUIDE.md**: Detailed manual sync commands and architecture
- **New MANUAL_SYNC_COMMANDS.md**: Complete guide for granular sync commands
- **Performance Documentation**: Plugin-level journal maintenance and smart fallback
- **User Experience**: Clear examples and troubleshooting guidance

### Technical

- **Architectural Improvements**: Plugin-level journal maintenance system
- **Performance Optimization**: Smart fallback and unified interval management
- **Code Quality**: Consolidated logic and eliminated duplication
- **Error Handling**: Enhanced error recovery and user feedback
- **Build Verification**: All TypeScript errors resolved, clean compilation

## [1.1.0] - 2025-08-01

### Changes

- feat: add configurable notifications with mobile-specific preferences
- Improve code format

## [1.0.0] - 2025-07-20

### Changes

- Revert "1.0.0"
- Revert "Fix eslint warnings"
- Fix eslint warnings
- 1.0.0
- fix: remove unnecessary else block in task line detection logic
- refactor: streamline task matching and link insertion logic with cleaner error handling
- Improve code format
- refactor: move combined Todoist link formatting to constants module
- refactor: combine website and app links into single line format with updated regex patterns
- feat: add support for Todoist app links with configurable link format options
- refactor: remove debug console logs from Todoist sync and task processing
- Update README.md
- feat: add support for Todoist v2 task IDs and URL format conversion
- feat: add automatic tag insertion for new tasks based on user settings
- fix: improve task insertion handling within callouts and quotes
- feat: add support for task creation within callouts and block quotes
- fix: preserve indentation when syncing tasks between Obsidian and Todoist
- fix: set cursor position to actual task line after syncing from Todoist
- fix: insert task links at correct line position based on sync direction
- feat: add debug logging and fix task link insertion order
- feat: improve task syncing with cursor position preservation and consistent link formatting
- refactor: remove deprecated extractTaskId method in favor of extractAllPossibleTaskIds
- refactor: optimize task matching by fetching all tasks upfront and reducing API calls
- Debug Sync tasks from Todoist to Obsidian
- Debug Sync tasks from Todoist to Obsidian
- Debug Sync tasks from Todoist to Obsidian
- Debug Sync tasks from Todoist to Obsidian
- Sync tasks from Todoist to Obsidian
- Improve code format

## [0.11.2] - 2025-06-27

### Changes

- Fix Todoist link indentation in callouts and quotes
- Improve code format

## [0.11.1] - 2025-06-27

### Changes

- Fix eslint warnings
- Tune Markdown link in Todoist description
- Support Markdown link in Todoist description
- Improve code format

## [0.11.0] - 2025-06-16

### Changes

- Fix sub-tasks after callout support
- Improve code formatting

## [0.10.4] - 2025-06-15

### Changes

- Merge pull request #11 from dariuskramer/allow-tasks-in-callout
- Fix support for tasks in callouts
- fixes another typo...
- fixes typo
- Allow tasks in an Obsidian callout
- Update README.md
- Merge pull request #9 from wenlzhang/dependabot/npm_and_yarn/esbuild-0.25.0
- Bump esbuild from 0.17.3 to 0.25.0
- Merge pull request #8 from wenlzhang/dependabot/npm_and_yarn/babel/runtime-7.27.1
- Bump @babel/runtime from 7.26.0 to 7.27.1
- Merge pull request #7 from wenlzhang/dependabot/npm_and_yarn/multi-d2f151b1be
- Bump axios and @doist/todoist-api-typescript
- Improve code format

## [0.10.3] - 2025-04-30

### Changes

- Update Todoist API
- Improve code format

## [0.10.2] - 2024-12-31

### Changes

- Fine tune time zone issue with moment
- Fine tune time zone issue
- Debug time info

## [0.10.1] - 2024-12-31

### Changes

- Fine tune past date warning
- Fine tune past due date warning
- Fine tune due validation
- Debug time zone comparison
- Update README.md

## [0.10.0] - 2024-12-26

### Changes

- Fix lint errors
- Fix lint errors
- Fix lint errors
- Improve release automation
- Update README.md
- Improve documentation
- Remove priority logging
- Improve priority dropdown
- Fine tune settings tab
- Fine tune Tasks cleanup patterns
- Test Tasks cleanup rule
- Fine tune settings tab
- Fine tune settings tab
- Fine-tune settings tab
- Fine tune settings tab
- Fine tune settings tab
- Fine tune Tasks plugin priority settings tab
- Fine tune Tasks priority settings tab
- Fine tune Tasks priority setting tab
- Fine tune Tasks priority settings tab
- Fine tune Tasks priority settings tab
- Fine tune Tasks priority settings tab
- Fine tune Tasks priority settings tab
- Debug Task priority
- Customize Tasks priority
- Fix Tasks priority use
- Test Tasks priority support
- Improve documentation
- Fix Tasks cleanup placeholder
- Debug Tasks cleanup rules
- Text Tasks cleanup rules
- Improve dynamic due date selection
- Add options for setting default due date format
- Fix Tasks due date
- Support Tasks due date
- Update doc links

## [0.9.1] - 2024-12-20

### Changes

- Update doc link in settings tab
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- Update video link
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- Improve docs
- Improve documentation
- Improve code format

## [0.9.0] - 2024-12-06

### Changes

- Fine tune settings tab
- Refactor tag verification code
- Define task metadata constants
- Define constants
- Fix task description sync
- Fix task indentation
- Update README.md
- Fine tune auto tagging
- Fine tune auto-tagging warning messages
- Fine tune auto-tagging toggle
- Fine tune Todoist label
- feat: Add label to Todoist
- Update README.md
- Fix modal initial settings
- Update TodoistModal.ts
- Fine tune pop-up modal
- Fine tune pop-up modal
- Fine tune pop-up modal
- Fine tune pop-up modal
- Improve due date for non-task modal
- Improve due date for non-task modal
- Fine tune metadata
- Fix non-task modal error
- Fine tune modal UI
- Allow project selection in modal
- Clean up code
- Fix Todoist link insertion without frontmatter
- Update UIDProcessing.ts
- Update URILinkProcessing.ts
- Improve code format

## [0.8.2] - 2024-12-04

### Changes

- Update README.md
- Improve docs
- Add timestamp to Todoist link
- Fine tune timestamp to metadata
- Add timestamp to metadata
- Fine tune task description
- Improve code format

## [0.8.1] - 2024-11-30

### Changes

- Update README.md
- Improve auto tagging docs
- Update README.md
- Update README.md
- Update README.md
- Improve docs
- Improve docs
- Update README.md
- Clarify descriptions in settings tab
- Update TodoistModal.ts
- Fine tune task modal
- Debug Todoist link insertion
- Debug Todoist link insertion
- Improve code format

## [0.8.0] - 2024-11-29

### Changes

- Retain cursor position when auto tagging
- Fine tune automatic tagging
- Fine tune automatic tagging
- Fine tune automatic tagging
- feat: Allow auto tag insertion when syncing tasks
- Revert "feat: Allow auto tag insertion when syncing tasks"
- feat: Allow auto tag insertion when syncing tasks

## [0.7.0] - 2024-11-29

### Changes

- Fix build errors
- Fix build errors
- Update doc for installation methods
- Update doc for available commands
- Update task description reterival doc
- Fine tune Retrieve task description
- Fine tune Retrieve task description
- Fine tune Retrieve full task description
- feat: Retrieve full task description
- Fine tune task description retrieval
- Add an option to sync everything in description
- Fix non-task link insertion
- Debug task indentation link insertion
- Fix description indentation
- Fine tune sync Todoist task description to Obsidian
- Fine tune sync Todoist task description to Obsidian
- feat: Sync Todoist task description to Obsidian

## [0.6.0] - 2024-11-29

### Changes

- Update documentation
- Improve code format
- Update README.md
- Update documentation
- feat: Add skipping weekends for relative dates
- Fine tune settings tab
- Debug relative due date
- Debug relative due date
- Debug relative due date
- feat: Add relative due date
- Update package.json
- Improve code format

## [Unreleased]

### Added

- Enhanced date handling features:
    - Improved relative date processing (e.g., `1d`, `+1d`, `20d`)
    - Contextual weekend skipping for relative dates
    - Smart date validation with clear error messages
    - Past date confirmation dialog
- Improved user experience:
    - Dynamic weekend skip toggle (only shows for relative dates)
    - Clear date format hints in task modal
    - Better date validation feedback

### Changed

- Refined task modal UI for better date input experience
- Enhanced date format documentation
- Improved date processing error messages

## [0.5.0] - 2024-11-28

### Changes

- Update priority documentation
- Fine tune task creating modal UI
- Fine tune settings tab UI
- Remove default cleanup patterns from settings tab
- Update settings tab
- Update settings tab
- Update settings tab
- Add default priority option
- Fix priority mapping
- Fine tune priority settings
- Fine tune priority settings
- Fine tune priority settings
- Fix priority mapping
- Debug priority mapping
- Fine tune priority feature
- Fine tune priority feature
- Add priority modal
- feat: Add priority syncing

## [0.4.1] - 2024-11-28

### Changes

- Improve code format
- Fine tune Dataview and moment.js input boxes
- feat: Add momentjs cleanup pattern
- Fine tune Dataview cleanup pattern
- Add Dataview cleanup patten

## [0.4.0] - 2024-11-27

### Changes

- Update package-lock.json
- Fix build errors
- Update packages
- Update TodoistModal.ts
- Update SettingTab.ts
- Fix buid errors
- Update packages
- Address plugin review comments
- Address plugin review comments
- Update package.json
- Update esbuild.config.mjs
- Update package.json
- Update package.json
- Improve code format
- Update packages
- Update README.md
- Update README.md
- Update README.md
- Update README.md
- Update manifest.json
- Merge branch 'main' into dev
- Update FUNDING.yml
- Add changelog to release automation
