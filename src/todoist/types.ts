export interface TodoistTaskInfo {
    taskId: string;
    id: string;
    content: string;
    description: string;
    url: string;
    isCompleted: boolean;
}

export interface TaskDetails {
    cleanText: string;
    dueDate: string | null;
}

export interface LoggingError extends Error {
    date?: string;
    pattern?: string;
    error?: Error;
}
