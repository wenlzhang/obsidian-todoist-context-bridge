import { TodoistContextBridgeSettings } from "./main";

export const DEFAULT_SETTINGS: TodoistContextBridgeSettings = {
    todoistAPIToken: "",
    todoistDefaultProject: "",
    uidField: "uuid",
    blockIDFormat: "YYYY-MM-DDTHH-mm-ss",
    allowSyncDuplicateTask: false,
    allowResyncCompletedTask: true,
    includeSelectedTextInDescription: true,
    taskTextCleanupPatterns: [],
    useDefaultTaskTextCleanupPatterns: true,
    dataviewDueDateKey: "due",
    dataviewPriorityKey: "p",
    priorityMapping: {
        "1": 4, // Highest priority in Todoist
        "2": 3,
        "3": 2,
        "4": 1  // Lowest priority in Todoist
    },
    dataviewCleanupKeys: "",
    momentFormatCleanupPatterns: "",
};
