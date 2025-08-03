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

export default class TodoistContextBridgePlugin extends Plugin {
    settings: TodoistContextBridgeSettings;
    todoistApi: TodoistApi | null = null;
    projects: Project[] = [];

    private UIDProcessing: UIDProcessing;
    private TodoistTaskSync: TodoistTaskSync;
    private URILinkProcessing: URILinkProcessing;
    private TodoistV2IDs: TodoistV2IDs;
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
        const textParsing: TextParsing = new TextParsing(this.settings);
        this.URILinkProcessing = new URILinkProcessing(
            this.app,
            this.UIDProcessing,
            this.settings,
            textParsing,
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
            name: "Trigger manual sync",
            callback: async () => {
                if (this.enhancedSyncService) {
                    new Notice("Starting manual sync...");
                    try {
                        await this.enhancedSyncService.triggerManualSync();
                        new Notice("Manual sync completed successfully");
                    } catch (error) {
                        new Notice(`Manual sync failed: ${error.message}`);
                        console.error("Manual sync error:", error);
                    }
                } else if (this.bidirectionalSyncService) {
                    new Notice("Manual sync not available with regular sync service. Enable enhanced sync for this feature.");
                } else {
                    new Notice("Please configure your Todoist API token and enable sync first");
                }
            },
        });

        this.addCommand({
            id: "reset-sync-journal",
            name: "Reset sync journal",
            callback: async () => {
                if (this.enhancedSyncService) {
                    const confirmed = confirm(
                        "Are you sure you want to reset the sync journal? This will clear all sync history and force a complete resync on the next sync cycle."
                    );
                    if (confirmed) {
                        try {
                            await this.enhancedSyncService.resetSyncJournal();
                            new Notice("Sync journal has been reset");
                        } catch (error) {
                            new Notice(`Failed to reset sync journal: ${error.message}`);
                            console.error("Journal reset error:", error);
                        }
                    }
                } else {
                    new Notice("Sync journal reset is only available with enhanced sync enabled");
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
                        const journalPath = this.enhancedSyncService.getJournalPath();
                        
                        const message = [
                            `📊 Enhanced Sync Statistics`,
                            ``,
                            `📝 Total tasks tracked: ${stats.totalTasks}`,
                            `✅ Successful operations: ${stats.successfulOperations}`,
                            `❌ Failed operations: ${stats.failedOperations}`,
                            `🔄 Last sync: ${stats.lastSyncTimestamp ? new Date(stats.lastSyncTimestamp).toLocaleString() : 'Never'}`,
                            ``,
                            `📁 Journal location: ${journalPath}`,
                            ``,
                            `💡 Tip: Use 'Reset sync journal' command if you encounter sync issues`
                        ].join('\n');
                        
                        new Notice(message, 10000);
                        console.log("Enhanced Sync Statistics:", stats);
                    } catch (error) {
                        new Notice(`Failed to retrieve sync statistics: ${error.message}`);
                        console.error("Stats retrieval error:", error);
                    }
                } else {
                    new Notice("Sync statistics are only available with enhanced sync enabled");
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
                const textParsing = new TextParsing(this.settings);
                const notificationHelper = new NotificationHelper(this.settings);
                this.enhancedSyncService = new EnhancedBidirectionalSyncService(
                    this.app,
                    this.settings,
                    textParsing,
                    this.todoistApi,
                    this.TodoistV2IDs,
                    notificationHelper,
                );

                // Start enhanced sync if bidirectional sync is enabled
                if (this.settings.enableBidirectionalSync) {
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
                if (this.settings.enableBidirectionalSync) {
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
