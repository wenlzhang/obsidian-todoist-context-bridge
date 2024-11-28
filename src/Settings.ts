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
    dataviewCleanupKeys: "",
};
