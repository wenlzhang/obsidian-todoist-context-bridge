import { Plugin, Notice } from 'obsidian';

interface FormatStyle {
    width?: number;
    height?: number;
    backgroundColor?: string;
    color?: string;
}

export default class CanvasFormatPainter extends Plugin {
    private copiedFormat: FormatStyle | null = null;
    private statusBarItem: HTMLElement;

    async onload() {
        console.log('Loading Canvas Format Painter plugin');

        // Add status bar item to show when format is copied
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.setText('');

        // Add command to copy format
        this.addCommand({
            id: 'copy-canvas-format',
            name: 'Copy Format',
            checkCallback: (checking: boolean) => {
                const canvas = this.getActiveCanvas();
                if (canvas) {
                    if (!checking) {
                        this.copyFormat();
                    }
                    return true;
                }
                return false;
            }
        });

        // Add command to paste format
        this.addCommand({
            id: 'paste-canvas-format',
            name: 'Paste Format',
            checkCallback: (checking: boolean) => {
                const canvas = this.getActiveCanvas();
                if (canvas && this.copiedFormat) {
                    if (!checking) {
                        this.pasteFormat();
                    }
                    return true;
                }
                return false;
            }
        });
    }

    private getActiveCanvas(): any {
        const leaf = this.app.workspace.activeLeaf;
        if (leaf?.view?.getViewType() === 'canvas') {
            return leaf.view;
        }
        return null;
    }

    private copyFormat() {
        const canvas = this.getActiveCanvas();
        if (!canvas) return;

        const selectedNodes = canvas.canvas.selection;
        if (selectedNodes.size !== 1) {
            new Notice('Please select exactly one element to copy format from');
            return;
        }

        const selectedNode = Array.from(selectedNodes)[0];
        console.log('Selected node:', selectedNode);

        // Get the node's data object
        const nodeData = {
            width: selectedNode.width,
            height: selectedNode.height,
            backgroundColor: selectedNode.backgroundColor,
            color: selectedNode.color
        };

        // Log the node's available methods and properties
        console.log('Node methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(selectedNode)));
        console.log('Node properties:', Object.keys(selectedNode));
        console.log('Copied format:', nodeData);

        this.copiedFormat = nodeData;
        this.statusBarItem.setText('Format copied ✓');
        new Notice('Format copied');
    }

    private pasteFormat() {
        if (!this.copiedFormat) {
            new Notice('No format copied yet');
            return;
        }

        const canvas = this.getActiveCanvas();
        if (!canvas) return;

        const selectedNodes = canvas.canvas.selection;
        if (selectedNodes.size === 0) {
            new Notice('Please select at least one element to apply format to');
            return;
        }

        console.log('Applying format:', this.copiedFormat);

        for (const node of selectedNodes) {
            // Store original values for logging
            const originalValues = {
                width: node.width,
                height: node.height,
                backgroundColor: node.backgroundColor,
                color: node.color
            };

            // Create an update object with only the properties we want to change
            const updateData: any = {};
            
            if (this.copiedFormat.width !== undefined) {
                updateData.width = this.copiedFormat.width;
            }
            if (this.copiedFormat.height !== undefined) {
                updateData.height = this.copiedFormat.height;
            }
            if (this.copiedFormat.backgroundColor !== undefined) {
                updateData.backgroundColor = this.copiedFormat.backgroundColor;
            }
            if (this.copiedFormat.color !== undefined) {
                updateData.color = this.copiedFormat.color;
            }

            // Try different ways to update the node
            try {
                // Method 1: Try to update through the node's data property
                if (node.data) {
                    Object.assign(node.data, updateData);
                }
                
                // Method 2: Try to update directly
                Object.assign(node, updateData);
                
                // Method 3: Try to call update if it exists
                if (typeof node.update === 'function') {
                    node.update(updateData);
                }
                
                // Method 4: Try to call render if it exists
                if (typeof node.render === 'function') {
                    node.render();
                }
            } catch (e) {
                console.error('Error updating node:', e);
            }

            console.log('Node before:', originalValues);
            console.log('Node after attempt:', {
                width: node.width,
                height: node.height,
                backgroundColor: node.backgroundColor,
                color: node.color
            });
        }

        // Force a canvas update
        canvas.canvas.requestFrame();

        new Notice('Format applied');
    }

    onunload() {
        console.log('Unloading Canvas Format Painter plugin');
    }
}
