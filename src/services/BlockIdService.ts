import { Editor } from 'obsidian';
import { generateBlockId } from '../utils/helpers';

export class BlockIdService {
    constructor() {}

    public getBlockId(editor: Editor): string {
        const lineText = editor.getLine(editor.getCursor().line);
        
        // Check for existing block ID
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            return match[1];
        }

        // Generate a new block ID using the configured format
        const newBlockId = generateBlockId();
        
        // Calculate the new cursor position
        const currentCursor = editor.getCursor();
        const newLineText = `${lineText} ^${newBlockId}`;
        editor.setLine(currentCursor.line, newLineText);
        
        // Restore cursor position
        editor.setCursor(currentCursor);
        
        return newBlockId;
    }

    public getOrCreateBlockId(editor: Editor, line: number): string {
        // Store current cursor
        const currentCursor = editor.getCursor();

        const lineText = editor.getLine(line);
        
        // Check for existing block ID
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        
        if (match) {
            // Restore cursor position before returning
            editor.setCursor(currentCursor);
            return match[1];
        }

        // Generate a new block ID using the configured format from settings
        const newBlockId = generateBlockId();
        
        // Add block ID to the line, ensuring proper block reference format
        // If the line doesn't end with whitespace, add a space before the block ID
        const newLineText = lineText.trimEnd() + (lineText.endsWith(' ') ? '' : ' ') + `^${newBlockId}`;
        editor.setLine(line, newLineText);
        
        // Force Obsidian to recognize the block reference by adding a newline if one doesn't exist
        const nextLine = editor.getLine(line + 1);
        if (nextLine === undefined) {
            editor.replaceRange('\n', { line: line + 1, ch: 0 });
        }
        
        // Restore cursor position
        editor.setCursor(currentCursor);
        return newBlockId;
    }

    public getExistingBlockId(lineText: string): string | null {
        const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
        const match = lineText.match(blockIdRegex);
        return match ? match[1] : null;
    }

    public addBlockIdToLine(editor: Editor, line: number, blockId: string): void {
        const currentCursor = editor.getCursor();
        const lineText = editor.getLine(line);
        
        // Add block ID to the line, ensuring proper block reference format
        const newLineText = lineText.trimEnd() + (lineText.endsWith(' ') ? '' : ' ') + `^${blockId}`;
        editor.setLine(line, newLineText);
        
        // Force Obsidian to recognize the block reference by adding a newline if one doesn't exist
        const nextLine = editor.getLine(line + 1);
        if (nextLine === undefined) {
            editor.replaceRange('\n', { line: line + 1, ch: 0 });
        }
        
        // Restore cursor position
        editor.setCursor(currentCursor);
    }
}
