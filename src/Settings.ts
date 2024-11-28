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
    // Priority mapping for Dataview values to Todoist priorities
    // In Todoist UI: p1 = highest (maps to API 4), p4 = lowest (maps to API 1)
    priorityMapping: {
        "1": 1,        // Priority 1 (highest) in Dataview maps to Todoist p1 (API 4)
        "high": 1,
        "p1": 1,
        "2": 2,        // Priority 2 in Dataview maps to Todoist p2 (API 3)
        "medium": 2,
        "p2": 2,
        "3": 3,        // Priority 3 in Dataview maps to Todoist p3 (API 2)
        "low": 3,
        "p3": 3,
        "4": 4,        // Priority 4 (lowest) in Dataview maps to Todoist p4 (API 1)
        "none": 4,
        "p4":4
    },
    dataviewCleanupKeys: "",
    momentFormatCleanupPatterns: "",
};
