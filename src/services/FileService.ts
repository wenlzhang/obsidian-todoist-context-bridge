import { App, Editor, TFile } from 'obsidian';
import { UIService } from './UIService';
import { LoggingService } from './LoggingService';

export class FileService {
    private loggingService: LoggingService;

    constructor(
        private app: App,
        private uiService: UIService
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public getActiveFile(): TFile | null {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            this.loggingService.warning('No active file found');
        }
        return file;
    }

    public getActiveEditor(): Editor | null {
        const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        return view?.editor || null;
    }

    public isNonEmptyTextLine(lineContent: string): boolean {
        const trimmedContent = lineContent.trim();
        if (!trimmedContent) {
            this.loggingService.debug('Empty line detected');
            return false;
        }
        return true;
    }

    public isListItem(lineContent: string): boolean {
        const result = /^[\s]*[-*]\s+/.test(lineContent);
        this.loggingService.debug('List item check', { lineContent, isList: result });
        return result;
    }

    public async getFileContent(file: TFile): Promise<string> {
        try {
            const content = await this.app.vault.read(file);
            return content;
        } catch (error) {
            this.loggingService.error('Failed to read file content', error instanceof Error ? error : new Error(String(error)));
            return '';
        }
    }

    public async writeFileContent(file: TFile, content: string): Promise<void> {
        await this.app.vault.modify(file, content);
    }

    public async createFile(path: string, content: string): Promise<TFile> {
        return await this.app.vault.create(path, content);
    }

    public async deleteFile(file: TFile): Promise<void> {
        await this.app.vault.delete(file);
    }

    public async renameFile(file: TFile, newPath: string): Promise<void> {
        await this.app.vault.rename(file, newPath);
    }

    public getFilePath(file: TFile): string {
        return file.path;
    }

    public getFileName(file: TFile): string {
        return file.basename;
    }

    public getFileExtension(file: TFile): string {
        return file.extension;
    }

    public showNonEmptyLineError(editor: Editor) {
        this.loggingService.warning('Empty line selected');
        this.uiService.showError('Please select a non-empty line', editor);
    }

    public showNoActiveFileError() {
        this.loggingService.warning('No active file');
        this.uiService.showError('No active file found');
    }
}
