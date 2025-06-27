/**
 * Interface for Todoist Context Bridge settings.
 */
export interface TodoistContextBridgeSettings {
    /**
     * Todoist API token.
     */
    todoistAPIToken: string;
    /**
     * Default project for tasks without a specified project.
     */
    todoistDefaultProject: string;
    /**
     * Default priority for tasks without a specified priority.
     */
    todoistDefaultPriority: number;
    /**
     * Field to use as the unique identifier for tasks.
     */
    uidField: string;
    /**
     * Format for block IDs.
     */
    blockIDFormat: string;
    /**
     * Format for creation timestamp in task description metadata.
     * This timestamp appears in the task description's metadata section
     * to indicate when the task was synced to Todoist.
     */
    timestampFormat: string;
    /**
     * Format for creation timestamp after Todoist link.
     * This timestamp appears after the Todoist link in Obsidian
     * to indicate when the task was synced to Todoist.
     */
    todoistLinkTimestampFormat: string;
    /**
     * Allow syncing of duplicate tasks.
     */
    allowSyncDuplicateTask: boolean;
    /**
     * Allow resyncing of completed tasks.
     */
    allowResyncCompletedTask: boolean;
    /**
     * Include selected text in task descriptions.
     */
    includeSelectedTextInDescription: boolean;
    /**
     * Patterns to clean up task text.
     */
    taskTextCleanupPatterns: string[];
    /**
     * Use default task text cleanup patterns.
     */
    useDefaultTaskTextCleanupPatterns: boolean;
    /**
     * Key for due dates in Dataview.
     */
    dataviewDueDateKey: string;
    /**
     * Key for priority in Dataview.
     */
    dataviewPriorityKey: string;
    /**
     * Keys to clean up in Dataview.
     */
    dataviewCleanupKeys: string;
    /**
     * Patterns to clean up moment formats.
     */
    momentFormatCleanupPatterns: string;
    /**
     * Mapping of priority values to Todoist priorities.
     */
    priorityMapping: { [key: string]: number };
    /**
     * Set today as due date for tasks without one.
     */
    setTodayAsDefaultDueDate: boolean;
    /**
     * Skip weekends when calculating relative dates.
     */
    skipWeekends: boolean;
    /**
     * Show warning for past due dates.
     */
    warnPastDueDate: boolean;
    /**
     * Enable automatic tag insertion when syncing tasks.
     */
    enableAutoTagInsertion: boolean;
    /**
     * Custom tag to insert when syncing tasks.
     */
    autoTagName: string;
    /**
     * Default to today's date for non-task case.
     */
    defaultTodayForNonTask: boolean;
    /**
     * Enable adding label to tasks in Todoist
     */
    enableTodoistLabel: boolean;
    /**
     * Label to add to tasks synced from Obsidian to Todoist.
     */
    todoistSyncLabel: string;
    /**
     * Enable Tasks plugin priority support
     */
    enableTasksPluginPriority: boolean;
    /**
     * Priority Settings
     */
    preferredPriorityFormat: "tasks" | "dataview";
    tasksPluginPriorityMapping: { [key: string]: number };
    /**
     * Due Date Settings
     */
    enableTasksPluginDueDate: boolean;
    preferredDueDateFormat: "tasks" | "dataview";
    /**
     * Tasks plugin emoji cleanup patterns.
     *
     * Date markers:
     * - 📅 Due date
     * - ➕ Creation date
     * - ⏳ Scheduled date
     * - 🛫 Start date
     * - ✅ Done date
     * - ❌ Cancelled date
     *
     * Priority markers:
     * - 🔺 Highest priority
     * - ⏫ High priority
     * - 🔼 Medium priority
     * - 🔽 Low priority
     * - ⏬ Lowest priority
     *
     * Other markers:
     * - 🔁 Recurrence
     * - 🏁 Task completion behavior
     * - 🆔 Task ID
     * - ⛔ Task blocking
     */
    tasksPluginEmojiCleanupPatterns: string;

    /**
     * Use Markdown format for Obsidian links in Todoist task descriptions.
     * If true, links will be formatted as [Original task in Obsidian](obsidian://url).
     * If false, links will be formatted as Original task in Obsidian: obsidian://url.
     */
    useMdLinkFormat: boolean;
}

/**
 * Default settings for Todoist Context Bridge.
 */
export const DEFAULT_SETTINGS: TodoistContextBridgeSettings = {
    todoistAPIToken: "",
    todoistDefaultProject: "",
    todoistDefaultPriority: 4,
    uidField: "uuid",
    blockIDFormat: "YYYY-MM-DDTHH-mm-ss",
    timestampFormat: "[📝 ]YYYY-MM-DDTHH:mm",
    todoistLinkTimestampFormat: "[📝 ]YYYY-MM-DDTHH:mm",
    allowSyncDuplicateTask: false,
    allowResyncCompletedTask: false,
    includeSelectedTextInDescription: false,
    taskTextCleanupPatterns: [],
    useDefaultTaskTextCleanupPatterns: true,
    dataviewDueDateKey: "due",
    dataviewPriorityKey: "p",
    // Priority mapping for Dataview values to Todoist priorities
    // In Todoist UI: p1 = highest (maps to API 4), p4 = lowest (maps to API 1)
    priorityMapping: {
        "1": 1, // Priority 1 (highest) in Dataview maps to Todoist p1 (API 4)
        high: 1,
        p1: 1,
        "2": 2, // Priority 2 in Dataview maps to Todoist p2 (API 3)
        medium: 2,
        p2: 2,
        "3": 3, // Priority 3 in Dataview maps to Todoist p3 (API 2)
        low: 3,
        p3: 3,
        "4": 4, // Priority 4 (lowest) in Dataview maps to Todoist p4 (API 1)
        none: 4,
        p4: 4,
    },
    dataviewCleanupKeys: "",
    momentFormatCleanupPatterns: "",
    setTodayAsDefaultDueDate: false,
    skipWeekends: false,
    warnPastDueDate: true,
    enableAutoTagInsertion: false,
    autoTagName: "ToDoTodoist",
    defaultTodayForNonTask: false,
    enableTodoistLabel: false,
    todoistSyncLabel: "ToDoObsidian",
    enableTasksPluginPriority: false,
    preferredPriorityFormat: "dataview",
    tasksPluginPriorityMapping: {
        // Emoji-based priorities
        "🔺": 1, // RED TRIANGLE POINTED UP
        "⏫": 1, // BLACK UP-POINTING DOUBLE TRIANGLE
        "🔼": 2, // UP-POINTING SMALL RED TRIANGLE
        "🔽": 3, // DOWN-POINTING SMALL RED TRIANGLE
        "⏬": 4, // BLACK DOWN-POINTING DOUBLE TRIANGLE
    },
    enableTasksPluginDueDate: false,
    preferredDueDateFormat: "dataview",
    tasksPluginEmojiCleanupPatterns:
        "📅,➕,⏳,🛫,✅,❌,🔺,⏫,🔼,🔽,⏬,🔁,🏁,🆔,⛔",
    useMdLinkFormat: false,
};
