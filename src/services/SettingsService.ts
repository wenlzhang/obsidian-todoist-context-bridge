import { App, Plugin } from 'obsidian';
import { TodoistContextBridgeSettings, DEFAULT_SETTINGS } from '../settings/types';

export class SettingsService {
    private settings: TodoistContextBridgeSettings;

    constructor(
        private plugin: Plugin,
        initialSettings?: TodoistContextBridgeSettings
    ) {
        this.settings = initialSettings || DEFAULT_SETTINGS;
    }

    public getSettings(): TodoistContextBridgeSettings {
        return this.settings;
    }

    public async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
    }

    public async saveSettings(): Promise<void> {
        await this.plugin.saveData(this.settings);
    }

    public updateSettings(newSettings: Partial<TodoistContextBridgeSettings>): void {
        this.settings = {
            ...this.settings,
            ...newSettings
        };
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
