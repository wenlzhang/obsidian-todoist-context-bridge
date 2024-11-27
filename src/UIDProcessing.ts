import { Editor, TFile, App, Notice } from "obsidian";
import { TodoistContextBridgeSettings } from "./main";
import { URILinkProcessing } from "./URILinkProcessing";
import { TextParsing } from "./TextParsing";

export class UIDProcessing {
    private app: App;
    private URILinkProcessing: URILinkProcessing;
    private TextParsing: TextParsing;

    constructor(
        private settings: TodoistContextBridgeSettings,
        app: App,
    ) {
        this.app = app;
        this.TextParsing = new TextParsing(settings);
        this.URILinkProcessing = new URILinkProcessing(
            app,
            this,
            settings,
            this.TextParsing,
        );
    }

    private async ensureUidInFrontmatter(
        file: TFile,
        editor: Editor,
    ): Promise<string | null> {
        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin(
            "obsidian-advanced-uri",
        );
        if (!advancedUriPlugin) return null;

        // Store current cursor position
        const currentCursor = editor.getCursor();

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;

        // Check for UUID field and ensure it has a value
        const existingUid = frontmatter?.[this.settings.uidField];
        if (existingUid && existingUid.trim() !== "") {
            return existingUid;
        }

        // Generate new UID
        const newUid = this.URILinkProcessing.generateUUID();

        try {
            // Add or update frontmatter using the processFrontMatter method
            await this.app.fileManager.processFrontMatter(
                file,
                (frontmatter) => {
                    frontmatter = frontmatter || {};
                    frontmatter[this.settings.uidField] = newUid;
                },
            );

            // Restore cursor position
            editor.setCursor(currentCursor);

            return newUid;
        } catch (error) {
            console.error("Error updating frontmatter:", error);
            new Notice("Failed to update frontmatter with UUID");
            return null;
        }
    }

    public async getOrCreateUid(
        file: TFile,
        editor: Editor,
    ): Promise<string | null> {
        return this.ensureUidInFrontmatter(file, editor);
    }
}
