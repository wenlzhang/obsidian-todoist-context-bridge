import { App } from 'obsidian';
import { UIService } from './UIService';
import { LoggingService } from './LoggingService';

export class PluginService {
    private loggingService: LoggingService;

    constructor(
        private app: App,
        private uiService: UIService
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public checkAdvancedUriPlugin(): boolean {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) {
            this.loggingService.error('Advanced URI plugin not installed');
            this.uiService.showError('Advanced URI plugin is required but not installed. Please install and enable it first.');
            return false;
        }
        this.loggingService.debug('Advanced URI plugin check passed');
        return true;
    }
}
