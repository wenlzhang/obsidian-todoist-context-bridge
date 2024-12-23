/**
 * Regular expression patterns used across the plugin
 */
export class RegexPatterns {
    /**
     * Create a regex pattern for matching Tasks plugin date markers
     * @param markers Comma-separated list of emoji markers
     * @returns Regex pattern that matches any of the markers followed by a date
     */
    public static createTasksDateMarkersPattern(markers: string): RegExp {
        // Escape special regex characters in emojis and join with |
        const escapedMarkers = markers
            .split(",")
            .map(marker => marker.trim())
            .filter(marker => marker.length > 0)
            .map(marker => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join("|");

        // Match any of the markers followed by a date (YYYY-MM-DD) and optional time
        // The pattern now includes:
        // 1. Any of the specified markers
        // 2. Optional whitespace
        // 3. Date in YYYY-MM-DD format
        // 4. Optional time component in various formats (T12:34, 12:34, etc.)
        return new RegExp(
            `(${escapedMarkers})\\s*(\\d{4}-\\d{2}-\\d{2}(?:(?:T|\\s+)\\d{2}:\\d{2}(?::\\d{2})?)?)`
        );
    }
}
