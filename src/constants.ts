export const TODOIST_CONSTANTS = {
    // Link related constants
    LINK_TEXT: "🔗 View in Todoist",
    LINK_PATTERN:
        /\[🔗 View in Todoist\]\(https:\/\/todoist\.com\/app\/task\/(\d+)\)/,

    // Metadata patterns
    METADATA: {
        ORIGINAL_TASK: "Original task in Obsidian",
        REFERENCE: "Reference in Obsidian",
        CREATED_AT: "Created",
    },

    // Full metadata patterns for matching
    METADATA_PATTERNS: {
        ORIGINAL_TASK_PATTERN: /Original task in Obsidian: obsidian:\/\//,
        REFERENCE_PATTERN: /Reference in Obsidian: obsidian:\/\//,
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
        REFERENCE: (
            uri: string,
            timestamp: string,
            useMdLinkFormat = false,
        ) =>
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
