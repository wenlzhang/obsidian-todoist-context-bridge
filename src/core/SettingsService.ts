import { App, Plugin } from 'obsidian';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from '../settings/types';
import { LoggingService } from '../core/LoggingService';

export class SettingsService {
    private loggingService: LoggingService;
    private settings: TodoistContextBridgeSettings;

    constructor(
        private plugin: Plugin,
        initialSettings?: TodoistContextBridgeSettings
    ) {
        this.loggingService = LoggingService.getInstance();
        this.settings = initialSettings || Object.assign({}, DEFAULT_SETTINGS);
    }

    public getSettings(): TodoistContextBridgeSettings {
        return this.settings;
    }

    public async loadSettings(): Promise<void> {
        try {
            this.loggingService.debug('Loading settings');
            const data = await this.plugin.loadData();
            this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
            this.loggingService.info('Settings loaded successfully');
            this.loggingService.debug('Current settings', { settings: this.settings });
        } catch (error) {
            this.loggingService.error('Failed to load settings', error instanceof Error ? error : new Error(String(error)));
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    public async saveSettings(): Promise<void> {
        try {
            this.loggingService.debug('Saving settings', { settings: this.settings });
            await this.plugin.saveData(this.settings);
            this.loggingService.info('Settings saved successfully');
        } catch (error) {
            this.loggingService.error('Failed to save settings', error instanceof Error ? error : new Error(String(error)));
        }
    }

    public updateSettings(newSettings: Partial<TodoistContextBridgeSettings>): void {
        try {
            this.loggingService.debug('Updating settings', { 
                currentSettings: this.settings,
                newSettings 
            });
            this.settings = {
                ...this.settings,
                ...newSettings
            };
            this.loggingService.info('Settings updated successfully');
        } catch (error) {
            this.loggingService.error('Failed to update settings', error instanceof Error ? error : new Error(String(error)));
        }
    }

    public getApiToken(): string {
        return this.settings.apiToken;
    }

    public getDefaultProjectId(): string {
        return this.settings.defaultProjectId;
    }

    public getUidField(): string {
        return this.settings.uidField;
    }

    public getIncludeSelectedText(): boolean {
        return this.settings.includeSelectedText;
    }
}
