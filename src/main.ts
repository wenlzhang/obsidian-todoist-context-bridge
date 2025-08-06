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
import { BidirectionalSyncService } from "./BidirectionalSyncService"; // Import bidirectional sync service
import { EnhancedBidirectionalSyncService } from "./EnhancedBidirectionalSyncService"; // Import enhanced sync service
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

                    // Search for Todoist ID in sub-items using existing logic
                    let todoistId: string | null = null;

                    // Use the same logic as ChangeDetector.findTodoistIdInSubItems
                    const taskIndentation =
                        currentLine.match(/^(\s*)/)?.[1] || "";

                    // Check subsequent lines with deeper indentation for Todoist links
                    for (let i = cursor.line + 1; i < allLines.length; i++) {
                        const line = allLines[i];
                        const lineIndentation = line.match(/^(\s*)/)?.[1] || "";

                        // Stop if we've reached a line with same or less indentation
                        if (lineIndentation.length <= taskIndentation.length) {
                            break;
                        }

                        // Look for Todoist task link using the shared constant pattern
                        const taskIdMatch = line.match(
                            TODOIST_CONSTANTS.LINK_PATTERN,
                        );
                        if (taskIdMatch) {
                            todoistId = taskIdMatch[1];
                            break;
                        }
                    }

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
                                console.log(
                                    "[SYNC JOURNAL] Journal reset completed",
                                );
                            } catch (error) {
                                new Notice(
                                    `❌ Failed to reset sync journal: ${error.message}`,
                                );
                                console.error("Journal reset error:", error);
                            }
                        },
                        onCancel: () => {
                            console.log(
                                "[SYNC JOURNAL] Reset cancelled by user",
                            );
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

        // Add journal validation and healing command
        this.addCommand({
            id: "validate-sync-journal",
            name: "Validate and heal sync journal",
            callback: async () => {
                if (this.enhancedSyncService) {
                    try {
                        new Notice("🔍 Validating journal completeness...");

                        const validation =
                            await this.enhancedSyncService.changeDetector.validateJournalCompleteness();

                        if (validation.missing.length === 0) {
                            new Notice(
                                `✅ Journal is complete! All ${validation.total} linked tasks are tracked.`,
                            );
                        } else {
                            new Notice(
                                `⚠️ Journal incomplete: ${validation.missing.length} tasks missing (${validation.completeness}% complete). Attempting to heal...`,
                                8000,
                            );

                            const healing =
                                await this.enhancedSyncService.changeDetector.healJournal();

                            if (healing.healed > 0) {
                                new Notice(
                                    `🏥 Journal healed! Added ${healing.healed} missing tasks. ${healing.failed > 0 ? `${healing.failed} tasks failed to heal.` : ""}`,
                                    8000,
                                );
                            } else if (healing.failed > 0) {
                                new Notice(
                                    `❌ Journal healing failed: Could not add ${healing.failed} tasks. Check console for details.`,
                                    8000,
                                );
                            }
                        }
                    } catch (error) {
                        new Notice(
                            `❌ Journal validation failed: ${error.message}`,
                        );
                        console.error("Journal validation error:", error);
                    }
                } else {
                    new Notice(
                        "Journal validation is only available with enhanced sync enabled",
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
            );
        }

        // Update sync service settings
        if (this.bidirectionalSyncService) {
            this.bidirectionalSyncService.updateSettings(this.settings);
        }
        if (this.enhancedSyncService) {
            this.enhancedSyncService.updateSettings(this.settings);
        }

        // If sync service type changed, reinitialize services
        if (this.todoistApi) {
            const shouldUseEnhanced = this.settings.enableEnhancedSync;
            const hasEnhanced = this.enhancedSyncService !== null;
            const hasRegular = this.bidirectionalSyncService !== null;

            if (shouldUseEnhanced && !hasEnhanced) {
                // Switch to enhanced sync
                if (this.bidirectionalSyncService) {
                    this.bidirectionalSyncService.stop();
                    this.bidirectionalSyncService = null;
                }
                await this.initializeTodoistServices();
            } else if (!shouldUseEnhanced && !hasRegular) {
                // Switch to regular sync
                if (this.enhancedSyncService) {
                    this.enhancedSyncService.stop();
                    this.enhancedSyncService = null;
                }
                await this.initializeTodoistServices();
            }
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
            );

            // Initialize sync service based on settings
            if (this.settings.enableEnhancedSync) {
                // Initialize enhanced sync service
                const notificationHelper = new NotificationHelper(
                    this.settings,
                );
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
            } else {
                // Initialize regular bidirectional sync service
                this.bidirectionalSyncService = new BidirectionalSyncService(
                    this.app,
                    this.settings,
                    this.todoistApi,
                    this.TodoistTaskSync,
                );

                // Start bidirectional sync if enabled
                if (this.settings.enableTaskCompletionAutoSync) {
                    this.bidirectionalSyncService.start();
                }
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
            console.log(
                "[JOURNAL MAINTENANCE] Initializing journal maintenance system...",
            );

            // Load and initialize journal
            await this.enhancedSyncService.journalManager.loadJournal();

            // Perform initial vault scan to populate journal with any new linked tasks
            console.log(
                "[JOURNAL MAINTENANCE] Performing initial vault scan...",
            );
            await this.scanVaultForLinkedTasks();

            // Validate journal health after initial scan
            setTimeout(async () => {
                await this.validateJournalHealth();
            }, 5000); // Wait 5 seconds for initialization to complete

            // Set up file modification listeners for real-time journal updates
            this.setupFileModificationListeners();

            // Set up periodic journal maintenance (independent of sync interval)
            this.setupPeriodicJournalMaintenance();

            console.log(
                "[JOURNAL MAINTENANCE] ✅ Journal maintenance system initialized",
            );
        } catch (error) {
            console.error(
                "[JOURNAL MAINTENANCE] ❌ Error initializing journal maintenance:",
                error,
            );
        }
    }

    /**
     * Scan entire vault for linked tasks and update journal
     */
    private async scanVaultForLinkedTasks(): Promise<void> {
        if (!this.enhancedSyncService) {
            return;
        }

        const files = this.app.vault.getMarkdownFiles();
        let newTasksFound = 0;

        for (const file of files) {
            try {
                const discoveredTasks =
                    await this.enhancedSyncService.changeDetector.discoverTasksInFile(
                        file,
                    );

                for (const task of discoveredTasks) {
                    // Check if task is already in journal
                    const existingTask =
                        this.enhancedSyncService.journalManager.getTaskByTodoistId(
                            task.todoistId,
                        );
                    if (!existingTask) {
                        await this.enhancedSyncService.journalManager.addTask(
                            task,
                        );
                        newTasksFound++;
                    }
                }
            } catch (error) {
                console.warn(
                    `[JOURNAL MAINTENANCE] Error scanning file ${file.path}:`,
                    error,
                );
            }
        }

        if (newTasksFound > 0) {
            await this.enhancedSyncService.journalManager.saveJournal();
            console.log(
                `[JOURNAL MAINTENANCE] Added ${newTasksFound} new linked tasks to journal`,
            );
        } else {
            console.log(
                `[JOURNAL MAINTENANCE] Journal is up-to-date, no new tasks found`,
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

        console.log("[JOURNAL MAINTENANCE] File modification listeners set up");
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
     * Set up periodic journal maintenance (unified with sync interval)
     */
    private setupPeriodicJournalMaintenance(): void {
        // Calculate journal maintenance interval based on sync interval
        // Run at 1/3 of sync interval, with minimum of 1 minute
        const syncIntervalMinutes = this.settings.syncIntervalMinutes || 1;
        const journalIntervalMinutes = Math.max(
            1,
            Math.round(syncIntervalMinutes / 3),
        );
        const journalMaintenanceInterval = journalIntervalMinutes * 60 * 1000;

        setInterval(async () => {
            if (this.enhancedSyncService) {
                console.log(
                    `[JOURNAL MAINTENANCE] Running periodic journal maintenance (every ${journalIntervalMinutes}min)...`,
                );
                await this.scanVaultForLinkedTasks();

                // Periodic health check (every hour or on long intervals)
                if (journalIntervalMinutes >= 60 || Math.random() < 0.1) {
                    await this.validateJournalHealth();
                }
            }
        }, journalMaintenanceInterval);

        console.log(
            `[JOURNAL MAINTENANCE] Periodic maintenance scheduled every ${journalIntervalMinutes} minutes (based on ${syncIntervalMinutes}min sync interval)`,
        );
    }

    /**
     * Validate journal health with user notifications for critical issues
     */
    private async validateJournalHealth(): Promise<void> {
        if (!this.enhancedSyncService) {
            return;
        }

        try {
            console.log("[JOURNAL HEALTH] Running journal health check...");
            const validation =
                await this.enhancedSyncService.changeDetector.validateJournalCompleteness();

            if (validation.missing.length === 0) {
                console.log(
                    `[JOURNAL HEALTH] ✅ Journal healthy: All ${validation.total} linked tasks tracked (100%)`,
                );
            } else {
                const isSerious = validation.completeness < 80;
                const message = `⚠️ Sync journal incomplete: ${validation.missing.length}/${validation.total} tasks missing (${validation.completeness}% tracked)`;

                console.warn(`[JOURNAL HEALTH] ${message}`);

                if (isSerious) {
                    // Show user notification for serious issues
                    new Notice(
                        `🚨 Sync Journal Issue: Only ${validation.completeness}% of your linked tasks are being tracked. This may cause sync failures. Run "Validate and heal sync journal" command to fix.`,
                        8000,
                    );
                    console.error(
                        `[JOURNAL HEALTH] 🚨 Journal severely incomplete! User notified.`,
                    );
                } else if (validation.missing.length > 10) {
                    // Show lighter notification for moderate issues
                    new Notice(
                        `ℹ️ FYI: ${validation.missing.length} linked tasks aren't being tracked yet. Sync will discover them gradually, or run "Validate and heal sync journal" to speed up the process.`,
                        6000,
                    );
                }
            }
        } catch (error) {
            console.error("[JOURNAL HEALTH] ❌ Health check failed:", error);
            // Only notify user of health check failures if they're severe
            if (
                error.message?.includes("vault") ||
                error.message?.includes("file")
            ) {
                new Notice(
                    "⚠️ Sync health check failed - check console for details",
                    5000,
                );
            }
        }
    }

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
