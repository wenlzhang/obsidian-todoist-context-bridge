import { Editor, TFile, App } from 'obsidian';
import { TodoistContextBridgeSettings } from '../main';
import { URILinkProcessing } from './URILinkProcessing';
import { TextParsing } from './TextParsing';

export class FrontmatterService {
    private app: App;
    private linkService: URILinkProcessing;
    private textParsingService: TextParsing;

    constructor(private settings: TodoistContextBridgeSettings, app: App) {
        this.app = app;
        this.textParsingService = new TextParsing(settings);
        this.linkService = new URILinkProcessing(app, this, settings, this.textParsingService);
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
        const newUid = this.linkService.generateUUID();

        // Add or update frontmatter
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        let newContent: string;
        let lineOffset = 0;

        if (hasExistingFrontmatter) {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                // Get existing frontmatter content
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                let newFrontmatter: string;

                if (frontmatterContent.includes(`${this.settings.uidField}:`)) {
                    // UUID field exists but is empty, replace the empty field
                    newFrontmatter = frontmatterContent.replace(
                        new RegExp(`${this.settings.uidField}:[ ]*(\n|$)`),
                        `${this.settings.uidField}: ${newUid}\n`
                    );
                } else {
                    // No UUID field, add it to existing frontmatter
                    newFrontmatter = frontmatterContent.trim() + `\n${this.settings.uidField}: ${newUid}\n`;
                }

                newContent = '---\n' + newFrontmatter + '---' + content.slice(endOfFrontmatter + 3);
                
                // Calculate line offset
                const oldLines = frontmatterContent.split('\n').length;
                const newLines = newFrontmatter.split('\n').length;
                lineOffset = newLines - oldLines;
            } else {
                // Malformed frontmatter, create new one
                newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n${content.slice(4)}`;
                lineOffset = 3;
            }
        } else {
            // No frontmatter, create new one with an empty line after
            newContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n${content}`;
            lineOffset = 4;
        }

        // Calculate if cursor is after frontmatter
        const cursorLine = currentCursor.line;
        const isCursorAfterFrontmatter = hasExistingFrontmatter ? 
            cursorLine > (content.slice(0, content.indexOf('---\n', 4) + 4).split('\n').length - 1) :
            true;

        // Store current scroll position
        const scrollInfo = editor.getScrollInfo();

        await this.app.vault.modify(file, newContent);

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
