export const TODOIST_CONSTANTS = {
    // Link related constants
    WEBSITE_LINK_TEXT: "🔗 View in Todoist website",
    APP_LINK_TEXT: "📱 View in Todoist app",
    COMBINED_LINK_TEXT: (websiteUrl: string, appUrl: string) => 
        `[🔗 View in Todoist website](${websiteUrl}) [📱 View in Todoist app](${appUrl})`,
    // Link patterns for different formats
    WEBSITE_LINK_PATTERN:
        /\[🔗 View in Todoist website\]\(https:\/\/(?:app\.)?todoist\.com(?:\/app)?(?:\/task|\/t)\/([\w-]+)\)/,
    APP_LINK_PATTERN:
        /\[📱 View in Todoist app\]\(todoist:\/\/task\?id=([\w-]+)\)/,
    COMBINED_LINK_PATTERN:
        /\[🔗 View in Todoist website\]\(https:\/\/(?:app\.)?todoist\.com(?:\/app)?(?:\/task|\/t)\/([\w-]+)\) \[📱 View in Todoist app\]\(todoist:\/\/task\?id=([\w-]+)\)/,
    // General link pattern that matches any format
    LINK_PATTERN:
        /(?:\[🔗 View in Todoist website\]|\[📱 View in Todoist app\]|\[🔗 View in Todoist website\].*\[📱 View in Todoist app\]).*?(?:https:\/\/(?:app\.)?todoist\.com(?:\/app)?(?:\/task|\/t)\/|todoist:\/\/task\?id=)([\w-]+)/,

    // Metadata patterns
    METADATA: {
        ORIGINAL_TASK: "Original task in Obsidian",
        REFERENCE: "Reference in Obsidian",
        CREATED_AT: "Created",
    },

    // Full metadata patterns for matching
    METADATA_PATTERNS: {
        ORIGINAL_TASK: /Original task in Obsidian(?:: | \()(.+?)(?:\)| \(Created: .*\))/,
        REFERENCE: /Reference in Obsidian(?:: | \()(.+?)(?:\)| \(Created: .*\))/,
    },

    // Metadata format strings
    FORMAT_STRINGS: {
        ORIGINAL_TASK: (
            uri: string,
            timestamp: string,
            useMdLinkFormat = false,
        ) =>
            useMdLinkFormat
                ? `[Original task in Obsidian](${uri}) (Created: ${timestamp})`
                : `Original task in Obsidian: ${uri} (Created: ${timestamp})`,
        REFERENCE: (uri: string, timestamp: string, useMdLinkFormat = false) =>
            useMdLinkFormat
                ? `[Reference in Obsidian](${uri}) (Created: ${timestamp})`
                : `Reference in Obsidian: ${uri} (Created: ${timestamp})`,
        TODOIST_LINK: (
            indentation: string,
            linkText: string,
            url: string,
            timestamp: string,
        ) => `\n${indentation}- [${linkText}](${url}) (Created: ${timestamp})`,
    },
} as const;

// We can add other constant categories here if needed in the future
