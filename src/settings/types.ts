export interface TodoistContextBridgeSettings {
    apiToken: string;
    defaultProjectId: string;
    uidField: string;
    blockIdFormat: string;
    allowDuplicateTasks: boolean;
    allowResyncCompleted: boolean;
    includeSelectedText: boolean;
    cleanupPatterns: string[];
    useDefaultCleanupPatterns: boolean;
    dueDateKey: string;
}

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
}
