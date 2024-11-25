import { App, Editor } from 'obsidian';
import { generateUUID } from '../utils/helpers';

export class UrlService {
    constructor(
        private app: App,
        private settings: any
    ) {}

    public async generateAdvancedUri(blockId: string, editor: Editor): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) return '';

        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return '';

        // @ts-ignore
        const useUid = advancedUriPlugin.settings?.useUID || false;
        
        const vaultName = this.app.vault.getName();
        
        if (useUid) {
            // Ensure UID exists in frontmatter
            const uid = await this.ensureUidInFrontmatter(file, editor);
            if (!uid) {
                return '';
            }

            // Build the URI with proper encoding
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('uid', uid);
            params.set('block', blockId);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        } else {
            // If not using UID, use file path (with a warning)
            console.warn('Advanced URI plugin is configured to use file paths instead of UIDs. This may cause issues if file paths change.');
            
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('filepath', file.path);
            params.set('block', blockId);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        }
    }

    public async generateFileUri(): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file found');
            return '';
        }

        // @ts-ignore
        const advancedUriPlugin = this.app.plugins?.getPlugin('obsidian-advanced-uri');
        if (!advancedUriPlugin) return '';

        // @ts-ignore
        const useUid = advancedUriPlugin.settings?.useUID || false;
        
        const vaultName = this.app.vault.getName();
        
        if (useUid) {
            // Get or create UID in frontmatter
            const fileCache = this.app.metadataCache.getFileCache(file);
            const frontmatter = fileCache?.frontmatter;
            const existingUid = frontmatter?.[this.settings.uidField];

            let uid: string;
            if (existingUid) {
                uid = existingUid;
            } else {
                // If no UID exists, create one and add it to frontmatter
                uid = generateUUID();
                const content = await this.app.vault.read(file);
                const hasExistingFrontmatter = content.startsWith('---\n');
                let newContent: string;

                if (hasExistingFrontmatter) {
                    const endOfFrontmatter = content.indexOf('---\n', 4);
                    if (endOfFrontmatter !== -1) {
                        newContent = content.slice(0, endOfFrontmatter) + 
                                   `${this.settings.uidField}: ${uid}\n` +
                                   content.slice(endOfFrontmatter);
                    } else {
                        newContent = `---\n${this.settings.uidField}: ${uid}\n---\n${content}`;
                        lineOffset = 3; // Adding three lines for new frontmatter
                    }
                } else {
                    newContent = `---\n${this.settings.uidField}: ${uid}\n---\n\n${content}`;
                }

                await this.app.vault.modify(file, newContent);
            }

            // Build the URI with proper encoding
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('uid', uid);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
        } else {
            // If not using UID, use file path (with a warning)
            console.warn('Advanced URI plugin is configured to use file paths instead of UIDs. This may cause issues if file paths change.');
            
            const params = new URLSearchParams();
            params.set('vault', vaultName);
            params.set('filepath', file.path);

            // Convert + to %20 in the final URL
            const queryString = params.toString().replace(/\+/g, '%20');
            return `obsidian://adv-uri?${queryString}`;
            console.error('Failed to create Todoist task:', error);
            new Notice('Failed to create Todoist task. Please check your settings and try again.');
        }
    }

    public async insertTodoistLink(editor: Editor, line: number, taskUrl: string, isListItem: boolean) {
        // Store current cursor
        const currentCursor = editor.getCursor();
        
        const lineText = editor.getLine(line);
        const currentIndent = this.getLineIndentation(lineText);
        
        let linkText: string;
        let insertPrefix: string = '';
        
        if (isListItem) {
            // For list items, add as a sub-item with one more level of indentation
            const subItemIndent = currentIndent + '\t';
            linkText = `${subItemIndent}- 🔗 [View in Todoist](${taskUrl})`;
        } else {
            // For plain text, add an empty line before and use the same indentation
            insertPrefix = '\n';
            linkText = `${currentIndent}- 🔗 [View in Todoist](${taskUrl})`;
        }

        // Get file and metadata
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const content = await this.app.vault.read(file);
        const hasExistingFrontmatter = content.startsWith('---\n');
        
        let insertionLine = line;

        if (!hasExistingFrontmatter) {
            // Case 2: No front matter exists
            // Create front matter with UUID and adjust insertion line
            const newUid = generateUUID();
            const frontMatterContent = `---\n${this.settings.uidField}: ${newUid}\n---\n\n`;
            
            // Insert front matter at the beginning of the file
            editor.replaceRange(frontMatterContent, { line: 0, ch: 0 });
            
            // Adjust insertion line to account for new front matter (4 lines)
            insertionLine += 4;
        } else {
            const endOfFrontmatter = content.indexOf('---\n', 4);
            if (endOfFrontmatter !== -1) {
                const frontmatterContent = content.slice(4, endOfFrontmatter);
                
                if (!frontmatter?.[this.settings.uidField]) {
                    // Case 3: Front matter exists but no UUID
                    const newUid = generateUUID();
                    const updatedFrontmatter = frontmatterContent.trim() + `\n${this.settings.uidField}: ${newUid}\n`;
                    
                    // Replace existing frontmatter
                    editor.replaceRange(
                        updatedFrontmatter,
                        { line: 1, ch: 0 },
                        { line: frontmatterContent.split('\n').length, ch: 0 }
                    );
                    
                    // Adjust insertion line by 1 for the new UUID line
                    insertionLine += 1;
                } else {
                    // Case 1: Front matter and UUID exist
                    // Just add 1 line for normal insertion
                    insertionLine += 1;
                }
            }
        }
        
        // Insert the link at the calculated position
        editor.replaceRange(
            `${insertPrefix}${linkText}\n`,
            { line: insertionLine, ch: 0 },
            { line: insertionLine, ch: 0 }
        );
        
        // Restore cursor position, adjusting for added front matter if necessary
        if (!hasExistingFrontmatter && currentCursor.line >= 0) {
            editor.setCursor({
                line: currentCursor.line + 4,
                ch: currentCursor.ch
            });
        } else {
            editor.setCursor(currentCursor);
        }
    }

    private async ensureUidInFrontmatter(file: any, editor: Editor | null): Promise<string | null> {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        
        // Check for UUID field and ensure it has a value
        const existingUid = frontmatter?.[this.settings.uidField];
        if (existingUid && existingUid.trim() !== '') {
            return existingUid;
        }

        // Generate new UID
        const newUid = generateUUID();

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

        // Store current cursor position if editor is provided
        let currentCursor = null;
        if (editor) {
            currentCursor = editor.getCursor();
        }

        // Calculate if cursor is after frontmatter
        const isCursorAfterFrontmatter = currentCursor ? 
            (hasExistingFrontmatter ? 
                currentCursor.line > (content.slice(0, content.indexOf('---\n', 4) + 4).split('\n').length - 1) :
                true) :
            false;

        // Store current scroll position if editor is provided
        let scrollInfo = null;
        if (editor) {
            scrollInfo = editor.getScrollInfo();
        }

        await this.app.vault.modify(file, newContent);

        // Restore cursor position if editor is provided
        if (editor && currentCursor) {
            if (isCursorAfterFrontmatter) {
                editor.setCursor({
                    line: currentCursor.line + lineOffset,
                    ch: currentCursor.ch
                });
            } else {
                editor.setCursor(currentCursor);
            }

            // Restore scroll position
            if (scrollInfo) {
                editor.scrollTo(scrollInfo.left, scrollInfo.top);
            }
        }

        return newUid;
    }

    private getLineIndentation(line: string): string {
        const match = line.match(/^(\s*)/);
        return match ? match[1] : '';
    }
}
