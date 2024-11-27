import { Editor, TFile, App } from 'obsidian';
import { TodoistContextBridgeSettings } from './main';
import { URILinkProcessing } from './URILinkProcessing';
import { TextParsing } from './TextParsing';

export class UIDProcessing {
    private app: App;
    private URILinkProcessing: URILinkProcessing;
    private TextParsing: TextParsing;

    constructor(private settings: TodoistContextBridgeSettings, app: App) {
        this.app = app;
        this.TextParsing = new TextParsing(settings);
        this.URILinkProcessing = new URILinkProcessing(app, this, settings, this.TextParsing);
    }

    private async ensureUidInFrontmatter(file: any, editor: Editor): Promise<string | null> {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return null;

        // Store current cursor position
        const currentCursor = editor.getCursor();

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        
        // Check for UUID field and ensure it has a value
        const existingUid = frontmatter?.[this.settings.uidField];
        if (existingUid && existingUid.trim() !== '') {
            return existingUid;
        }

        // Generate new UID
        const newUid = this.URILinkProcessing.generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        let newContent: string;
        let lineOffset = 0;

        const processFrontMatter = this.app.fileManager.processFrontMatter;
        await processFrontMatter(file, (frontmatter) => {
            if (!frontmatter) {
                frontmatter = {};
            }
            frontmatter[this.settings.uidField] = newUid;
        });

        // Recalculate content and frontmatter after modification
        const updatedContent = await this.app.vault.read(file);
        const updatedFileCache = this.app.metadataCache.getFileCache(file);
        const updatedFrontmatter = updatedFileCache?.frontmatter;

        // Calculate line offset
        const oldLines = content.split('\n').length;
        const newLines = updatedContent.split('\n').length;
        lineOffset = newLines - oldLines;

        // Calculate if cursor is after frontmatter
        const frontmatterEndLine = updatedFileCache?.frontmatterPosition?.end?.line ?? -1;
        const isCursorAfterFrontmatter = currentCursor.line > frontmatterEndLine;

        // Store current scroll position
        const scrollInfo = editor.getScrollInfo();

        // Restore cursor position
        if (isCursorAfterFrontmatter) {
            editor.setCursor({
                line: currentCursor.line + lineOffset,
                ch: currentCursor.ch
            });
        } else {
            editor.setCursor(currentCursor);
        }

        // Restore scroll position
        editor.scrollTo(scrollInfo.left, scrollInfo.top);

        return newUid;
    }  

    public async getOrCreateUid(file: TFile, editor: Editor): Promise<string | null> {
        return this.ensureUidInFrontmatter(file, editor);
    }
}
