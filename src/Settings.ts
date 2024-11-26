import { TodoistContextBridgeSettings } from "main";

export const DEFAULT_SETTINGS: TodoistContextBridgeSettings = {
    apiToken: '',
    defaultProjectId: '',
    uidField: 'uuid',
    blockIdFormat: 'YYYY-MM-DDTHH-mm-ss',
    allowDuplicateTasks: false,
    allowResyncCompleted: true,
    includeSelectedText: true,
    cleanupPatterns: [],
    useDefaultCleanupPatterns: true,
    dueDateKey: 'due'
};
