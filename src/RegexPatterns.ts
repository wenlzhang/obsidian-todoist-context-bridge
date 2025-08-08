/**
 * Regular expression patterns used across the plugin
 */
export class RegexPatterns {
    /**
     * Block ID patterns for Obsidian block references
     */
    public static readonly BLOCK_ID_PATTERN = /\^([a-zA-Z0-9-T:]+)/;
    public static readonly BLOCK_ID_END_OF_LINE_PATTERN = /\^([a-zA-Z0-9-T:]+)$/;
    /**
     * Create a regex pattern for matching Tasks plugin date markers
     * @param markers Comma-separated list of emoji markers
     * @returns Regex pattern that matches any of the markers followed by a date
     */
    public static createTasksDateMarkersPattern(markers: string): RegExp {
        // Escape special regex characters in emojis and join with |
        const escapedMarkers = markers
            .split(",")
            .map((marker) => marker.trim())
            .filter((marker) => marker.length > 0)
            .map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|");

        // Match any of the markers followed by a date (YYYY-MM-DD) and optional time
        // The pattern now includes:
        // 1. Any of the specified markers
        // 2. Optional whitespace
        // 3. Date in YYYY-MM-DD format
        // 4. Optional time component in various formats (T12:34, 12:34, etc.)
        return new RegExp(
            `(${escapedMarkers})\\s*(\\d{4}-\\d{2}-\\d{2}(?:(?:T|\\s+)\\d{2}:\\d{2}(?::\\d{2})?)?)`,
        );
    }

    /**
     * Create a regex pattern for cleaning up emoji and following text until the next emoji or end
     * @param emoji The emoji to match
     * @returns Regex pattern that matches the emoji and following text until next emoji or end
     */
    public static createEmojiCleanupPattern(emoji: string): RegExp {
        // Escape special regex characters in emoji
        const escapedEmoji = emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // Match:
        // 1. The specified emoji
        // 2. Optional whitespace
        // 3. Any text until either:
        //    - Another emoji (using Unicode ranges)
        //    - End of line
        return new RegExp(
            `${escapedEmoji}\\s*[^\\u{1F300}-\\u{1F9FF}\\u{1F600}-\\u{1F64F}\\u{1F680}-\\u{1F6FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]*(?=[\\u{1F300}-\\u{1F9FF}\\u{1F600}-\\u{1F64F}\\u{1F680}-\\u{1F6FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]|$)`,
            "gu",
        );
    }
}
