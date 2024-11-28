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
        "1": 1, // Dataview Priority 1 → Todoist Priority 1
        "2": 2, // Dataview Priority 2 → Todoist Priority 2
        "3": 3, // Dataview Priority 3 → Todoist Priority 3
        "4": 4  // Dataview Priority 4 → Todoist Priority 4
    },
    dataviewCleanupKeys: "",
    momentFormatCleanupPatterns: "",
};
