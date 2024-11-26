export interface TodoistTaskInfo {
    taskId: string;
    isCompleted: boolean;
}

export interface TaskDetails {
    cleanText: string;
    dueDate: string | null;
}
