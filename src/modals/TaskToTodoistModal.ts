import { App, Modal, Notice } from 'obsidian';
import { LoggingService } from '../core/LoggingService';
import moment from 'moment';

export class TaskToTodoistModal extends Modal {
    private titleInput: string = '';
    private descriptionInput: string = '';
    private dueDateInput: string = '';
    private logger: LoggingService;
    private todoistApi: TodoistApi;
    private editor: Editor;
    private settings: any;
    private taskDetails: TodoistTaskInfo | {
        content: string;
        description: string;
        dueDate?: string;
        priority?: number;
    };
    private projects: Project[];
    private onTaskCreated: (taskUrl: string) => Promise<void>;

    constructor(
        app: App,
        todoistApi: TodoistApi,
        editor: Editor,
        settings: any,
        taskDetails: TodoistTaskInfo | {
            content: string;
            description: string;
            dueDate?: string;
            priority?: number;
        },
        projects: Project[],
        onTaskCreated: (taskUrl: string) => Promise<void>
    ) {
        super(app);
        this.logger = LoggingService.getInstance();
        
        if (!todoistApi) {
            throw new Error('Todoist API is required');
        }
        
        this.todoistApi = todoistApi;
        this.editor = editor;
        this.settings = settings;
        this.taskDetails = taskDetails;
        this.projects = projects;
        this.onTaskCreated = onTaskCreated;
        this.titleInput = taskDetails.content || '';
        this.descriptionInput = taskDetails.description || '';
        this.dueDateInput = taskDetails.dueDate || '';
        
        this.logger.debug('TaskToTodoistModal initialized', { 
            content: this.titleInput,
            hasDescription: !!this.descriptionInput,
            hasDueDate: !!this.dueDateInput,
            hasApi: !!this.todoistApi
        });
    }

    onOpen() {
        try {
            this.logger.debug('Opening TaskToTodoistModal');
            const { contentEl } = this;

            contentEl.createEl("h2", { text: "Create Todoist Task" });

            // Task title input
            const titleContainer = contentEl.createDiv({ cls: "todoist-input-container" });
            titleContainer.createEl("label", { text: "Task title (required)" });
            const titleInput = titleContainer.createEl("input", {
                type: "text",
                cls: "todoist-input-field",
                placeholder: "Enter task title",
                value: this.titleInput
            });
            titleInput.style.width = "100%";
            titleInput.style.height = "40px";
            titleInput.style.marginBottom = "1em";
            titleInput.addEventListener("input", (e) => {
                this.titleInput = (e.target as HTMLInputElement).value;
            });

            // Due date input
            const dueDateContainer = contentEl.createDiv({ cls: "todoist-input-container" });
            dueDateContainer.createEl("label", { text: "Due Date (optional)" });
            const dueDateInput = dueDateContainer.createEl("input", {
                type: "text",
                cls: "todoist-input-field",
                placeholder: "YYYY-MM-DD or YYYY-MM-DDTHH:mm",
                value: this.dueDateInput ? (this.dueDateInput.includes('T') ? 
                    moment(this.dueDateInput).format('YYYY-MM-DD[T]HH:mm') : 
                    moment(this.dueDateInput).format('YYYY-MM-DD')) : ''
            });
            dueDateInput.style.width = "100%";
            dueDateInput.style.height = "40px";
            dueDateInput.style.marginBottom = "1em";
            dueDateInput.addEventListener("input", (e) => {
                this.dueDateInput = (e.target as HTMLInputElement).value;
            });

            // Task description input
            const descContainer = contentEl.createDiv({ cls: "todoist-input-container" });
            descContainer.createEl("label", { text: "Additional description (optional)" });
            const descInput = descContainer.createEl("textarea", {
                cls: "todoist-input-field",
                placeholder: "Enter additional description",
                value: this.descriptionInput
            });
            descInput.style.width = "100%";
            descInput.style.height = "100px";
            descInput.style.marginBottom = "0.5em";
            descInput.addEventListener("input", (e) => {
                this.descriptionInput = (e.target as HTMLTextAreaElement).value;
            });

            // Description info
            const descInfo = descContainer.createEl('div', { 
                cls: "todoist-description-info",
                text: 'The description will include:' 
            });
            descInfo.style.color = "var(--text-muted)";
            descInfo.style.marginBottom = "1em";

            const descList = descContainer.createEl("ul");
            descList.style.fontSize = "0.8em";
            descList.style.color = "var(--text-muted)";
            descList.style.marginLeft = "1em";
            descList.style.marginBottom = "1em";

            descList.createEl("li", { text: "Your description above" });
            descList.createEl("li", { text: "A reference link back to this note" });

            // Reminder text
            const reminderText = descContainer.createEl("div", {
                cls: "todoist-description-reminder",
                text: "Remember to review and adjust the task description in Todoist as needed."
            });
            reminderText.style.fontSize = "0.8em";
            reminderText.style.color = "var(--text-muted)";
            reminderText.style.marginBottom = "1em";

            // Buttons container
            const buttonContainer = contentEl.createDiv({ cls: "todoist-button-container" });
            buttonContainer.style.display = "flex";
            buttonContainer.style.justifyContent = "flex-end";
            buttonContainer.style.gap = "10px";
            buttonContainer.style.marginTop = "1em";

            // Cancel button
            const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
            cancelButton.addEventListener("click", () => {
                this.logger.debug('TaskToTodoistModal cancelled');
                this.close();
            });

            // Submit button
            const submitButton = buttonContainer.createEl("button", {
                cls: "mod-cta",
                text: "Create Task"
            });
            submitButton.addEventListener("click", async () => {
                try {
                    if (!this.titleInput.trim()) {
                        this.logger.warning('Attempted to submit without title');
                        new Notice('Task title is required');
                        return;
                    }

                    if (!this.todoistApi) {
                        this.logger.error('Todoist API not available');
                        new Notice('Failed to connect to Todoist API. Please try again.');
                        return;
                    }

                    this.logger.debug('Submitting task', { 
                        title: this.titleInput,
                        hasDescription: !!this.descriptionInput,
                        hasDueDate: !!this.dueDateInput,
                        hasApi: !!this.todoistApi,
                        dueDate: this.dueDateInput
                    });

                    let dueString = undefined;
                    if (this.dueDateInput) {
                        try {
                            const momentDate = moment(this.dueDateInput);
                            if (!momentDate.isValid()) {
                                throw new Error('Invalid date format');
                            }
                            // Convert the date to a format that Todoist understands
                            dueString = this.dueDateInput.includes('T') ? 
                                momentDate.format('YYYY-MM-DD[T]HH:mm:ss') : 
                                momentDate.format('YYYY-MM-DD');
                            
                            this.logger.debug('Parsed due date', { 
                                input: this.dueDateInput,
                                parsed: dueString
                            });
                        } catch (error) {
                            this.logger.error('Failed to parse due date', error instanceof Error ? error : new Error(String(error)));
                            new Notice('Invalid due date format. Please use YYYY-MM-DD or YYYY-MM-DDTHH:mm');
                            return;
                        }
                    }

                    // Create the task in Todoist
                    const task = await this.todoistApi.addTask({
                        content: this.titleInput,
                        description: this.descriptionInput,
                        dueString: dueString,
                        project_id: this.settings.defaultProjectId
                    });

                    if (task) {
                        await this.onTaskCreated(task.url);
                        this.close();
                    } else {
                        throw new Error('Failed to create task');
                    }
                } catch (error) {
                    this.logger.error('Error submitting task', error instanceof Error ? error : new Error(String(error)));
                    new Notice('Failed to create task. Please try again.');
                }
            });

            // Focus title input
            titleInput.focus();
        } catch (error) {
            this.logger.error('Error opening TaskToTodoistModal', error instanceof Error ? error : new Error(String(error)));
            new Notice('Failed to open task modal. Please try again.');
            this.close();
        }
    }

    onClose() {
        this.logger.debug('Closing TaskToTodoistModal');
        const { contentEl } = this;
        contentEl.empty();
    }
}
