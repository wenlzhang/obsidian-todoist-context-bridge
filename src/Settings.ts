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
    // Priority mapping for each Todoist priority level (1 = highest, 4 = lowest)
    priorityMapping: {
        "1": 4,        // Priority 1 (highest) maps to API priority 4
        "high": 4,
        "2": 3,        // Priority 2 maps to API priority 3
        "medium": 3,
        "3": 2,        // Priority 3 maps to API priority 2
        "low": 2,
        "4": 1,        // Priority 4 (lowest) maps to API priority 1
        "none": 1
    },
    dataviewCleanupKeys: "",
    momentFormatCleanupPatterns: "",
};
