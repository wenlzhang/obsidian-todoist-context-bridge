import { App } from 'obsidian';
import { UIService } from './UIService';

export class PluginService {
    constructor(
        private app: App,
        private uiService: UIService
    ) {}

    public checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            this.uiService.showError('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        return true;
    }
}
