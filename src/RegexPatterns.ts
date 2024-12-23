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
        return new RegExp(
            `(${escapedMarkers})\\s*(\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?)`
        );
    }
}
