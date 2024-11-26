import { Notice } from 'obsidian';

export enum LogLevel {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
    INFO = 'INFO',
    DEBUG = 'DEBUG'
}

export interface LogMessage {
    level: LogLevel;
    message: string;
    error?: Error;
    context?: any;
}

export class LoggingService {
    private static instance: LoggingService;
    private isDebugMode: boolean = false;

    private constructor() {}

    public static getInstance(): LoggingService {
        if (!LoggingService.instance) {
            LoggingService.instance = new LoggingService();
        }
        return LoggingService.instance;
    }

    public setDebugMode(enabled: boolean): void {
        this.isDebugMode = enabled;
    }

    public error(message: string, error?: Error, context?: any): void {
        this.log({
            level: LogLevel.ERROR,
            message,
            error,
            context
        });
    }

    public warning(message: string, context?: any): void {
        this.log({
            level: LogLevel.WARNING,
            message,
            context
        });
    }

    public info(message: string, context?: any): void {
        this.log({
            level: LogLevel.INFO,
            message,
            context
        });
    }

    public debug(message: string, context?: any): void {
        if (this.isDebugMode) {
            this.log({
                level: LogLevel.DEBUG,
                message,
                context
            });
        }
    }

    private log(logMessage: LogMessage): void {
        const { level, message, error, context } = logMessage;
        
        // Format the message
        let formattedMessage = `[${level}] ${message}`;
        
        // Show notice based on log level
        switch (level) {
            case LogLevel.ERROR:
                new Notice('Error: ' + message, 5000);
                console.error(formattedMessage, error || '', context || '');
                break;
            case LogLevel.WARNING:
                new Notice('Warning: ' + message, 4000);
                console.warn(formattedMessage, context || '');
                break;
            case LogLevel.INFO:
                new Notice(message, 3000);
                console.info(formattedMessage, context || '');
                break;
            case LogLevel.DEBUG:
                console.debug(formattedMessage, context || '');
                break;
        }
    }

    // Helper method to format error messages consistently
    public formatError(message: string, error?: Error): string {
        if (error?.message) {
            return `${message}: ${error.message}`;
        }
        return message;
    }
}
