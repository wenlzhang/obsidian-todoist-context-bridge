import { Editor, Notice, Plugin } from "obsidian";
import { TodoistApi, Project, Task } from "@doist/todoist-api-typescript";
import { DEFAULT_SETTINGS, TodoistContextBridgeSettings } from "./Settings";
import { TodoistContextBridgeSettingTab } from "./SettingTab";
import { UIDProcessing } from "./UIDProcessing";
import { TodoistTaskSync } from "./TodoistTaskSync";
import { URILinkProcessing } from "./URILinkProcessing";
import { TextParsing } from "./TextParsing";
import { DateProcessing } from "./DateProcessing"; // Import DateProcessing
import { TodoistToObsidianModal } from "./TodoistToObsidianModal"; // Import the new modal
import { TodoistV2IDs } from "./TodoistV2IDs"; // Import the v2 ID helper
import { TodoistIdManager } from "./TodoistIdManager"; // Import enhanced ID manager
import { BidirectionalSyncService } from "./BidirectionalSyncService"; // Import bidirectional sync service
import { EnhancedBidirectionalSyncService } from "./EnhancedBidirectionalSyncService"; // Import enhanced sync service
import { TaskLocationUtils } from "./TaskLocationUtils"; // Import TaskLocationUtils
import { NotificationHelper } from "./NotificationHelper"; // Import notification helper
import { ConfirmationModal } from "./ConfirmationModal"; // Import confirmation modal
import { TODOIST_CONSTANTS } from "./constants"; // Import Todoist constants

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];

    private UIDProcessing: UIDProcessing;
    private TodoistTaskSync: TodoistTaskSync;
    private URILinkProcessing: URILinkProcessing;
    private TodoistV2IDs: TodoistV2IDs;
    private textParsing: TextParsing;
    private taskLocationUtils: TaskLocationUtils;
    public bidirectionalSyncService: BidirectionalSyncService | null = null;
    public enhancedSyncService: EnhancedBidirectionalSyncService | null = null;

    async onload() {
        await this.loadSettings();

        // Initialize DateProcessing with settings
        DateProcessing.initialize(this.settings);

        // Add settings tab first, so it's always available
        this.addSettingTab(new TodoistContextBridgeSettingTab(this.app, this));

        // Add commands - these should be available even if Todoist initialization fails
        this.addCommands();

        // Initialize core services that don't depend on Todoist
        this.UIDProcessing = new UIDProcessing(this.settings, this.app);
        this.textParsing = new TextParsing(this.settings);
        // Create TodoistIdManager for enhanced ID handling
        const idManager = new TodoistIdManager(this.settings);
        this.taskLocationUtils = new TaskLocationUtils(
            this.textParsing,
            idManager,
        );
        this.URILinkProcessing = new URILinkProcessing(
            this.app,
            this.UIDProcessing,
            this.settings,
            this.textParsing,
        );

        // Initialize v2 ID helper
        this.TodoistV2IDs = new TodoistV2IDs(this.settings);

        // Try to initialize Todoist if we have a token
        if (this.settings.todoistAPIToken) {
            await this.initializeTodoistServices();
        }
    }

    onunload() {
        // Stop sync services when plugin is unloaded
        if (this.bidirectionalSyncService) {
            this.bidirectionalSyncService.stop();
        }
        if (this.enhancedSyncService) {
            this.enhancedSyncService.stop();
        }
    }

    private addCommands() {
        // Add command to sync selected task to Todoist
        this.addCommand({
            id: "sync-to-todoist",
            name: "Sync selected task to Todoist",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.syncSelectedTaskToTodoist(editor);
            },
        });

        // Add new command for syncing task from Todoist to Obsidian
        this.addCommand({
            id: "sync-from-todoist",
            name: "Sync task from Todoist to Obsidian",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }

                // Open modal to get Todoist task ID or link
                new TodoistToObsidianModal(
                    this.app,
                    this,
                    async (task: Task) => {
                        await this.TodoistTaskSync.syncTaskFromTodoist(
                            editor,
                            task,
                        );
                    },
                    this.TodoistV2IDs,
                ).open();
            },
        });

        // Add new command for creating tasks from non-task text
        this.addCommand({
            id: "create-todoist-from-text",
            name: "Create Todoist task from selected text",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.createTodoistTaskFromSelectedText(
                    editor,
                );
            },
        });

        // Add new command for creating tasks linked to the current file
        this.addCommand({
            id: "create-todoist-from-file",
            name: "Create Todoist task linked to current note",
            callback: async () => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.createTodoistTaskFromSelectedFile();
            },
        });

        // Add command to sync description without metadata
        this.addCommand({
            id: "sync-todoist-description",
            name: "Sync description from Todoist task",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.syncTodoistDescriptionToObsidian(
                    editor,
                );
            },
        });

        // Add command to sync full description including metadata
        this.addCommand({
            id: "sync-full-todoist-description",
            name: "Sync full description from Todoist task (including metadata)",
            editorCallback: async (editor: Editor) => {
                if (!this.todoistApi || !this.TodoistTaskSync) {
                    new Notice(
                        "Please configure your Todoist API token in settings first",
                    );
                    return;
                }
                await this.TodoistTaskSync.syncFullTodoistDescriptionToObsidian(
                    editor,
                );
            },
        });

        // Enhanced sync system commands
        this.addCommand({
            id: "trigger-manual-sync",
            name: "Sync completion status of all tasks in vault",
            callback: async () => {
                if (this.enhancedSyncService) {
                    new Notice("Starting full vault sync...");
                    try {
                        await this.enhancedSyncService.triggerManualSync();
                        new Notice("✅ Full vault sync completed successfully");
                    } catch (error) {
                        new Notice(
                            `❌ Full vault sync failed: ${error.message}`,
                        );
                        console.error("Manual sync error:", error);
                    }
                } else if (this.bidirectionalSyncService) {
                    new Notice(
                        "Manual sync not available with regular sync service. Enable enhanced sync for this feature.",
                    );
                } else {
                    new Notice(
                        "Please configure your Todoist API token and enable sync first",
                    );
                }
            },
        });

        // Add command to sync current task completion status
        this.addCommand({
            id: "sync-current-task",
            name: "Sync completion status of current task",
            editorCallback: async (editor: Editor) => {
                if (
                    !this.enhancedSyncService &&
                    !this.bidirectionalSyncService
                ) {
                    new Notice(
                        "Please configure your Todoist API token and enable sync first",
                    );
                    return;
                }

                try {
                    const cursor = editor.getCursor();
                    const currentLine = editor.getLine(cursor.line);

                    // Check if current line is a task line using existing module
                    if (!this.textParsing.isTaskLine(currentLine)) {
                        new Notice(
                            "❌ Please place cursor on a task line to sync",
                        );
                        return;
                    }

                    // Get all lines to search for Todoist link in sub-items
                    const allLines = editor.getValue().split("\n");

                    // Use unified TaskLocationUtils for consistent task location logic
                    const todoistId =
                        this.taskLocationUtils.findTodoistIdInSubItems(
                            allLines,
                            cursor.line,
                        );

                    if (!todoistId) {
                        new Notice(
                            "❌ No Todoist task found linked to the current task",
                        );
                        return;
                    }
                    new Notice("🔄 Syncing current task completion status...");

                    if (this.enhancedSyncService) {
                        await this.enhancedSyncService.syncSingleTask(
                            todoistId,
                            cursor.line,
                        );
                    } else {
                        throw new Error(
                            "Enhanced sync service is required for manual sync commands. Please enable enhanced sync in settings.",
                        );
                    }

                    new Notice(
                        "✅ Current task completion status synced successfully",
                    );
                } catch (error) {
                    new Notice(
                        `❌ Failed to sync current task: ${error.message}`,
                    );
                    console.error("Current task sync error:", error);
                }
            },
        });

        // Add command to sync all tasks in current file
        this.addCommand({
            id: "sync-current-file-tasks",
            name: "Sync completion status of all tasks in current file",
            callback: async () => {
                if (
                    !this.enhancedSyncService &&
                    !this.bidirectionalSyncService
                ) {
                    new Notice(
                        "Please configure your Todoist API token and enable sync first",
                    );
                    return;
                }

                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    new Notice("❌ No active file found");
                    return;
                }

                try {
                    new Notice(`🔄 Syncing all tasks in ${activeFile.name}...`);

                    if (this.enhancedSyncService) {
                        await this.enhancedSyncService.syncFileTasksCompletion(
                            activeFile,
                        );
                    } else {
                        throw new Error(
                            "Enhanced sync service is required for manual sync commands. Please enable enhanced sync in settings.",
                        );
                    }

                    new Notice(
                        `✅ All tasks in ${activeFile.name} synced successfully`,
                    );
                } catch (error) {
                    new Notice(
                        `❌ Failed to sync file tasks: ${error.message}`,
                    );
                    console.error("File tasks sync error:", error);
                }
            },
        });

        this.addCommand({
            id: "reset-sync-journal",
            name: "Reset sync journal",
            callback: async () => {
                if (this.enhancedSyncService) {
                    // Show two-step confirmation modal for this destructive action
                    new ConfirmationModal(this.app, {
                        title: "Reset Sync Journal",
                        message: `
                            <p><strong>⚠️ Warning: This is a destructive action!</strong></p>
                            <p>This will permanently clear all sync history and tracking data from the journal file:</p>
                            <p><code>.obsidian/plugins/todoist-context-bridge/sync-journal.json</code></p>
                            <p><strong>Consequences:</strong></p>
                            <ul>
                                <li>All task sync history will be lost</li>
                                <li>File tracking data will be cleared</li>
                                <li>Next sync will perform a complete rescan</li>
                                <li>This action cannot be undone</li>
                            </ul>
                            <p>Only proceed if you're experiencing sync issues or want to start fresh.</p>
                        `,
                        confirmText: "Reset Journal",
                        cancelText: "Cancel",
                        isDangerous: true,
                        requiresTyping: true,
                        confirmationPhrase: "RESET",
                        onConfirm: async () => {
                            if (!this.enhancedSyncService) {
                                new Notice(
                                    "❌ Enhanced sync service not available",
                                );
                                return;
                            }
                            try {
                                await this.enhancedSyncService.resetSyncJournal();
                                new Notice(
                                    "✅ Sync journal has been reset successfully",
                                );
                            } catch (error) {
                                new Notice(
                                    `❌ Failed to reset sync journal: ${error.message}`,
                                );
                                console.error("Journal reset error:", error);
                            }
                        },
                    }).open();
                } else {
                    new Notice(
                        "Sync journal reset is only available with enhanced sync enabled",
                    );
                }
            },
        });

        this.addCommand({
            id: "show-sync-stats",
            name: "Show sync statistics",
            callback: () => {
                if (this.enhancedSyncService) {
                    try {
                        const stats = this.enhancedSyncService.getSyncStats();
                        const journalPath =
                            this.enhancedSyncService.getJournalPath();

                        const message = [
                            `📊 Enhanced Sync Statistics`,
                            ``,
                            `📝 Total tasks tracked: ${stats.totalTasks}`,
                            `✅ Successful operations: ${stats.successfulOperations}`,
                            `❌ Failed operations: ${stats.failedOperations}`,
                            `🔄 Last sync: ${stats.lastSyncTimestamp ? new Date(stats.lastSyncTimestamp).toLocaleString() : "Never"}`,
                            ``,
                            `📁 Journal location: ${journalPath}`,
                            ``,
                            `💡 Tip: Use 'Validate journal' or 'Reset sync journal' commands for sync issues`,
                        ].join("\n");

                        new Notice(message, 10000);
                        console.log("Enhanced Sync Statistics:", stats);
                    } catch (error) {
                        new Notice(
                            `Failed to retrieve sync statistics: ${error.message}`,
                        );
                        console.error("Stats retrieval error:", error);
                    }
                } else {
                    new Notice(
                        "Sync statistics are only available with enhanced sync enabled",
                    );
                }
            },
        });

        // Add smart journal maintenance command
        this.addCommand({
            id: "validate-sync-journal",
            name: "Smart journal maintenance",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        const validationNotice = new Notice(
                            "🔍 Smart journal maintenance: Checking journal health...",
                            0,
                        );

                        const validation =
                            await this.enhancedSyncService.changeDetector.validateJournalCompleteness();

                        validationNotice.hide();

                        if (validation.missing.length === 0) {
                            new Notice(
                                `✅ Journal is complete! All ${validation.total} linked tasks are tracked (100%).`,
                                5000,
                            );
                        } else {
                            const completenessPercent = Math.round(
                                validation.completeness,
                            );
                            const message = `📊 Journal Status: ${validation.total - validation.missing.length}/${validation.total} tasks tracked (${completenessPercent}%). ${validation.missing.length} missing tasks will be healed.`;

                            new Notice(message, 8000);

                            console.log(`[SMART MAINTENANCE] ${message}`);
                            console.log(
                                `[SMART MAINTENANCE] Missing task IDs: ${validation.missing.slice(0, 10).join(", ")}${validation.missing.length > 10 ? ` and ${validation.missing.length - 10} more...` : ""}`,
                            );

                            // Start healing process
                            const healing =
                                await this.enhancedSyncService.changeDetector.healJournal();

                            // The healing process now handles its own user notifications
                            // Just log the final result
                            console.log(
                                `[SMART MAINTENANCE] Healing completed: ${healing.healed} healed, ${healing.failed} failed`,
                            );
                        }
                    } catch (error) {
                        new Notice(
                            `❌ Smart journal maintenance failed: ${error.message}`,
                            8000,
                        );
                        console.error(
                            "Smart journal maintenance error:",
                            error,
                        );
                    }
                } else {
                    new Notice(
                        "Smart journal maintenance is only available with enhanced sync enabled",
                        6000,
                    );
                }
            },
        });

        // Add force rebuild journal command for power users
        this.addCommand({
            id: "heal-journal-only",
            name: "Force rebuild journal",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        // ✅ FIXED: Force healing to bypass all pre-checks
                        const healing =
                            await this.enhancedSyncService.changeDetector.healJournal(
                                true,
                            );

                        console.log(
                            `[FORCE REBUILD] Force rebuild completed: ${healing.healed} healed, ${healing.failed} failed`,
                        );
                    } catch (error) {
                        new Notice(
                            `❌ Force rebuild journal failed: ${error.message}`,
                            8000,
                        );
                        console.error("Force rebuild journal error:", error);
                    }
                } else {
                    new Notice(
                        "Force rebuild journal is only available with enhanced sync enabled",
                        6000,
                    );
                }
            },
        });

        // Add backup management commands
        this.addCommand({
            id: "create-journal-backup",
            name: "Create journal backup",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        const backupPath =
                            await this.enhancedSyncService.journalManager.createBackupForOperation(
                                "manual",
                            );
                        if (backupPath) {
                            new Notice(
                                `✅ Backup created: ${backupPath}`,
                                6000,
                            );
                        } else {
                            new Notice("❌ Failed to create backup", 4000);
                        }
                    } catch (error) {
                        new Notice(`❌ Backup failed: ${error.message}`, 6000);
                    }
                } else {
                    new Notice(
                        "Journal backup is only available with enhanced sync enabled",
                        6000,
                    );
                }
            },
        });

        this.addCommand({
            id: "list-journal-backups",
            name: "List available journal backups",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        const backups =
                            await this.enhancedSyncService.journalManager.listAvailableBackups();

                        if (backups.length === 0) {
                            new Notice("No journal backups found", 4000);
                            return;
                        }

                        const backupList = backups
                            .map(
                                (backup, i) =>
                                    `${i + 1}. ${backup.operation || "unknown"} - ${backup.created.toLocaleString()}`,
                            )
                            .join("\n");

                        const message = `📦 Available backups (${backups.length} total):\n\n${backupList}\n\nUse console for full list or restore commands.`;
                        new Notice(message, 15000);

                        console.log(
                            "📦 All available journal backups:",
                            backups,
                        );
                    } catch (error) {
                        new Notice(
                            `❌ Failed to list backups: ${error.message}`,
                            6000,
                        );
                    }
                } else {
                    new Notice(
                        "Journal backup listing is only available with enhanced sync enabled",
                        6000,
                    );
                }
            },
        });

        this.addCommand({
            id: "recover-journal",
            name: "Attempt journal recovery",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        new Notice(
                            "🔄 Attempting automatic journal recovery...",
                            5000,
                        );
                        const success =
                            await this.enhancedSyncService.journalManager.attemptManualRecovery();

                        if (success) {
                            new Notice(
                                "✅ Journal recovery successful! Restart plugin to see restored data.",
                                8000,
                            );
                        } else {
                            new Notice(
                                "⚠️ Journal recovery failed. No valid backups found or all backups are empty.",
                                8000,
                            );
                        }
                    } catch (error) {
                        new Notice(
                            `❌ Journal recovery failed: ${error.message}`,
                            8000,
                        );
                        console.error("Journal recovery error:", error);
                    }
                } else {
                    new Notice(
                        "Journal recovery is only available with enhanced sync enabled",
                        6000,
                    );
                }
            },
        });

        this.addCommand({
            id: "cleanup-journal-backups",
            name: "Clean up old journal backups",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        const deleted =
                            await this.enhancedSyncService.journalManager.performBackupCleanup(
                                5,
                            );

                        if (deleted > 0) {
                            new Notice(
                                `🧹 Cleaned up ${deleted} old journal backups, kept 5 most recent`,
                                6000,
                            );
                        } else {
                            new Notice("✅ No old backups to clean up", 4000);
                        }
                    } catch (error) {
                        new Notice(
                            `❌ Backup cleanup failed: ${error.message}`,
                            6000,
                        );
                    }
                } else {
                    new Notice(
                        "Backup cleanup is only available with enhanced sync enabled",
                        6000,
                    );
                }
            },
        });
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Reinitialize TodoistTaskSync to pick up new settings
        if (this.todoistApi) {
            this.TodoistTaskSync = new TodoistTaskSync(
                this.app,
                this.settings,
                this.todoistApi,
                this.checkAdvancedUriPlugin.bind(this),
                this.URILinkProcessing,
                this.UIDProcessing,
                this,
                this.TodoistV2IDs,
                this.taskLocationUtils,
            );
        }

        // Update sync service settings
        if (this.bidirectionalSyncService) {
            this.bidirectionalSyncService.updateSettings(this.settings);
        }
        if (this.enhancedSyncService) {
            this.enhancedSyncService.updateSettings(this.settings);
        }

        // Reinitialize services if Todoist API is available
        if (this.todoistApi) {
            // Always use enhanced sync service (journal-based sync is the only method)
            await this.initializeTodoistServices();
        }
    }

    async loadProjects() {
        try {
            const projects = await this.todoistApi?.getProjects();
            if (projects) {
                // Store projects or update UI as needed
            }
        } catch (error) {
            console.error("Failed to load Todoist projects:", error);
            new Notice(
                "Failed to load Todoist projects. Please check your API token.",
            );
        }
    }

    public initializeTodoistApi() {
        if (this.settings.todoistAPIToken) {
            this.todoistApi = new TodoistApi(this.settings.todoistAPIToken);
        } else {
            this.todoistApi = null;
        }
    }

    async initializeTodoistServices(): Promise<boolean> {
        try {
            this.initializeTodoistApi();
            if (!this.todoistApi) {
                return false;
            }

            this.TodoistTaskSync = new TodoistTaskSync(
                this.app,
                this.settings,
                this.todoistApi,
                this.checkAdvancedUriPlugin.bind(this),
                this.URILinkProcessing,
                this.UIDProcessing,
                this,
                this.TodoistV2IDs,
                this.taskLocationUtils,
            );

            // Initialize enhanced sync service (journal-based sync is the only method)
            const notificationHelper = new NotificationHelper(this.settings);
            this.enhancedSyncService = new EnhancedBidirectionalSyncService(
                this.app,
                this.settings,
                this.textParsing,
                this.todoistApi,
                this.TodoistV2IDs,
                notificationHelper,
            );

            // Initialize journal maintenance system (independent of sync)
            await this.initializeJournalMaintenance();

            // Start enhanced sync if bidirectional sync is enabled
            if (this.settings.enableTaskCompletionAutoSync) {
                await this.enhancedSyncService.start();
            }

            await this.loadProjects();
            return true;
        } catch (error) {
            console.error("Todoist initialization failed:", error);
            return false;
        }
    }

    async verifyTodoistToken(
        token: string,
    ): Promise<{ success: boolean; projects?: Project[] }> {
        try {
            const tempApi = new TodoistApi(token);
            const projects = await tempApi.getProjects();
            return { success: true, projects };
        } catch (error) {
            console.error("Token verification failed:", error);
            return { success: false };
        }
    }

    /**
     * Initialize journal maintenance system - independent of sync intervals
     * This ensures the journal is always up-to-date with linked tasks
     */
    private async initializeJournalMaintenance(): Promise<void> {
        if (!this.enhancedSyncService) {
            return;
        }

        try {
            // Initializing journal maintenance system...

            // Load and initialize journal
            await this.enhancedSyncService.journalManager.loadJournal();

            // ✅ UNIFIED APPROACH: No separate vault scanning needed
            // The enhanced sync service will handle task discovery and validation
            // through its deferred initialization and regular sync cycles
            // Journal initialization delegated to enhanced sync service

            // Note: Task discovery and validation now handled by:
            // 1. Enhanced sync service deferred initialization
            // 2. Regular sync cycles with intelligent change detection
            // 3. Manual validation commands when needed by user

            // Set up file modification listeners for real-time journal updates
            this.setupFileModificationListeners();

            // Set up periodic journal maintenance (independent of sync interval)
            this.setupPeriodicJournalMaintenance();

            // Journal maintenance system initialized
        } catch (error) {
            console.error(
                "[JOURNAL MAINTENANCE] ❌ Error initializing journal maintenance:",
                error,
            );
        }
    }

    /**
     * Set up file modification listeners for real-time journal updates
     */
    private setupFileModificationListeners(): void {
        // Listen for file modifications
        this.registerEvent(
            this.app.vault.on("modify", async (file) => {
                if (file.path.endsWith(".md") && this.enhancedSyncService) {
                    // Debounce file modifications to avoid excessive processing
                    if (this.fileModificationTimeout) {
                        clearTimeout(this.fileModificationTimeout);
                    }
                    this.fileModificationTimeout = window.setTimeout(
                        async () => {
                            await this.updateJournalForFile(file);
                        },
                        1000,
                    ); // 1 second debounce
                }
            }),
        );

        // File modification listeners set up - reduced logging
    }

    private fileModificationTimeout: number | null = null;

    /**
     * Update journal for a specific file that was modified
     */
    private async updateJournalForFile(file: any): Promise<void> {
        if (!this.enhancedSyncService) {
            return;
        }

        try {
            const discoveredTasks =
                await this.enhancedSyncService.changeDetector.discoverTasksInFile(
                    file,
                );
            let journalUpdated = false;

            for (const task of discoveredTasks) {
                const existingTask =
                    this.enhancedSyncService.journalManager.getTaskByTodoistId(
                        task.todoistId,
                    );
                if (!existingTask) {
                    await this.enhancedSyncService.journalManager.addTask(task);
                    journalUpdated = true;
                    console.log(
                        `[JOURNAL MAINTENANCE] Added new linked task ${task.todoistId} from ${file.path}`,
                    );
                }
            }

            if (journalUpdated) {
                await this.enhancedSyncService.journalManager.saveJournal();
            }
        } catch (error) {
            console.warn(
                `[JOURNAL MAINTENANCE] Error updating journal for file ${file.path}:`,
                error,
            );
        }
    }

    /**
     * ✅ UNIFIED JOURNAL COORDINATOR - Eliminates Duplication
     * Coordinates all journal operations to prevent overlap and redundant scanning
     */
    private setupPeriodicJournalMaintenance(): void {
        const syncIntervalMinutes = this.settings.syncIntervalMinutes || 1;
        const syncIntervalMs = syncIntervalMinutes * 60 * 1000;

        // Setting up unified journal management

        // ✅ UNIFIED APPROACH: Single interval that coordinates ALL journal operations
        // This replaces separate maintenance, validation, and scanning intervals
        setInterval(async () => {
            if (!this.enhancedSyncService) return;

            try {
                // Running coordinated journal maintenance...
                // ✅ SMART COORDINATION: Let the enhanced sync service handle everything
                // This eliminates duplicate vault scanning and validation
                // The enhanced sync service already:
                // 1. Detects changes (includes new task discovery)
                // 2. Updates journal with new tasks
                // 3. Validates journal health via intelligent pre-check
                // 4. Processes sync operations
                // So we DON'T need separate:
                // - scanVaultForLinkedTasks() ❌ (duplicate of change detection)
                // - validateJournalHealth() ❌ (duplicate of validation pre-check)
                // Journal coordination delegated to enhanced sync service
            } catch (error) {
                console.error(
                    "[JOURNAL COORDINATOR] ❌ Error in coordinated maintenance:",
                    error,
                );
            }
        }, syncIntervalMs); // ✅ ALIGNED: Same interval as sync, no separate maintenance

        // Unified journal coordination active
    }

    /**
     * ❌ REMOVED: scanVaultForLinkedTasks() - Redundant with enhanced sync service
     *
     * This method duplicated the functionality of:
     * - changeDetector.detectChanges() (discovers new tasks)
     * - performSync() (updates journal with new tasks)
     *
     * The enhanced sync service already handles task discovery and journal updates
     * more efficiently through its change detection system.
     */

    /**
     * ❌ REMOVED: validateJournalHealth() - Redundant with enhanced sync service
     *
     * This method duplicated the functionality of:
     * - changeDetector.validateJournalCompleteness() (with intelligent pre-check)
     * - changeDetector.shouldSkipJournalValidation() (prevents redundant validation)
     *
     * The enhanced sync service already handles journal validation more efficiently
     * through its intelligent pre-check system that avoids redundant operations.
     *
     * User notifications for journal health issues are now handled by:
     * - Manual "Smart journal maintenance" commands
     * - Critical error detection during sync operations
     */

    checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin(
            "obsidian-advanced-uri",
        );
        if (!advancedUriPlugin) {
            new Notice(
                "Advanced URI plugin is required but not installed. Please install and enable it first.",
            );
            return false;
        }
        return true;
    }
}
