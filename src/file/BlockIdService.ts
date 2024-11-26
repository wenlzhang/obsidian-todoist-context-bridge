import { Editor } from 'obsidian';
import { generateBlockId } from '../utils/helpers';
import { LoggingService } from '../core/LoggingService';
import { TodoistContextBridgeSettings } from '../settings/types';

export class BlockIdService {
    private loggingService: LoggingService;

    constructor(
        private settings: TodoistContextBridgeSettings
    ) {
        this.loggingService = LoggingService.getInstance();
    }

    public getBlockId(editor: Editor): string {
        try {
            this.loggingService.debug('Getting block ID');
            const lineText = editor.getLine(editor.getCursor().line);
            
            // Check for existing block ID
            const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
            const match = lineText.match(blockIdRegex);
            
            if (match) {
                this.loggingService.debug('Found existing block ID', { blockId: match[1] });
                return match[1];
            }

            // Generate a new block ID using the configured format
            const newBlockId = generateBlockId(this.settings.blockIdFormat);
            this.loggingService.debug('Generated new block ID', { blockId: newBlockId });
            
            // Calculate the new cursor position
            const currentCursor = editor.getCursor();
            const newLineText = `${lineText} ^${newBlockId}`;
            editor.setLine(currentCursor.line, newLineText);
            
            // Restore cursor position
            editor.setCursor(currentCursor);
            
            this.loggingService.info('Successfully added new block ID');
            return newBlockId;
        } catch (error) {
            this.loggingService.error('Error getting block ID', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    public getOrCreateBlockId(editor: Editor, line?: number): string {
        try {
            this.loggingService.debug('Getting or creating block ID', { line });
            
            // Store current cursor
            const currentCursor = editor.getCursor();
            const targetLine = line !== undefined ? line : currentCursor.line;

            // Validate editor and line
            if (!editor || targetLine === undefined) {
                throw new Error('Invalid editor or line number');
            }

            const lineText = editor.getLine(targetLine);
            if (lineText === undefined) {
                throw new Error(`Invalid line number: ${targetLine}`);
            }
            
            // Check for existing block ID
            const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
            const match = lineText.match(blockIdRegex);
            
            if (match) {
                this.loggingService.debug('Found existing block ID', { blockId: match[1] });
                // Restore cursor position before returning
                editor.setCursor(currentCursor);
                return match[1];
            }

            // Generate a new block ID using the configured format from settings
            const newBlockId = generateBlockId(this.settings.blockIdFormat);
            this.loggingService.debug('Generated new block ID', { blockId: newBlockId });
            
            // Add block ID to the line, ensuring proper block reference format
            // If the line doesn't end with whitespace, add a space before the block ID
            const newLineText = lineText.trimEnd() + (lineText.endsWith(' ') ? '' : ' ') + `^${newBlockId}`;
            editor.setLine(targetLine, newLineText);
            
            // Force Obsidian to recognize the block reference by adding a newline if one doesn't exist
            if (targetLine + 1 >= editor.lineCount()) {
                this.loggingService.debug('Adding newline after block ID');
                editor.replaceRange('\n', { line: targetLine + 1, ch: 0 });
            }
            
            // Restore cursor position
            editor.setCursor(currentCursor);
            this.loggingService.info('Successfully added new block ID');
            return newBlockId;
        } catch (error) {
            this.loggingService.error('Error getting or creating block ID', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    public getExistingBlockId(lineText: string): string | null {
        try {
            this.loggingService.debug('Getting existing block ID from line', { lineText });
            const blockIdRegex = /\^([a-zA-Z0-9-]+)$/;
            const match = lineText.match(blockIdRegex);
            if (match) {
                this.loggingService.debug('Found existing block ID', { blockId: match[1] });
                return match[1];
            }
            this.loggingService.debug('No existing block ID found');
            return null;
        } catch (error) {
            this.loggingService.error('Error getting existing block ID', error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }

    public addBlockIdToLine(editor: Editor, line: number, blockId: string): void {
        try {
            this.loggingService.debug('Adding block ID to line', { line, blockId });
            const currentCursor = editor.getCursor();
            const lineText = editor.getLine(line);
            
            // Add block ID to the line, ensuring proper block reference format
            const newLineText = lineText.trimEnd() + (lineText.endsWith(' ') ? '' : ' ') + `^${blockId}`;
            editor.setLine(line, newLineText);
            
            // Force Obsidian to recognize the block reference by adding a newline if one doesn't exist
            const nextLine = editor.getLine(line + 1);
            if (nextLine === undefined) {
                this.loggingService.debug('Adding newline after block ID');
                editor.replaceRange('\n', { line: line + 1, ch: 0 });
            }
            
            // Restore cursor position
            editor.setCursor(currentCursor);
            this.loggingService.info('Successfully added block ID to line');
        } catch (error) {
            this.loggingService.error('Error adding block ID to line', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }
}
