import { App, Editor, TFile } from 'obsidian';
import { UIService } from './UIService';

export class FileService {
    constructor(
        private app: App,
        private uiService: UIService
    ) {}

    public getActiveFile(): TFile | null {
        return this.app.workspace.getActiveFile();
    }

    public getActiveEditor(): Editor | null {
        const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        return view?.editor || null;
    }

    public isNonEmptyTextLine(lineContent: string): boolean {
        return lineContent && lineContent.trim().length > 0;
    }

    public isListItem(lineContent: string): boolean {
        return /^[\s]*[-*+]/.test(lineContent);
    }

    public async getFileContent(file: TFile): Promise<string> {
        return await this.app.vault.read(file);
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
}
