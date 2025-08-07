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

    // Full metadata patterns for matching (supports both markdown and plain text formats)
    METADATA_PATTERNS: {
        ORIGINAL_TASK:
            /(?:\[Original task in Obsidian\]\([^)]+\)|Original task in Obsidian:?\s+[^\s]+)(?:\s+\(Created: .*\))?/,
        REFERENCE:
            /(?:\[Reference in Obsidian\]\([^)]+\)|Reference in Obsidian:?\s+[^\s]+)(?:\s+\(Created: .*\))?/,
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
        COMBINED_TODOIST_LINK: (
            indentation: string,
            websiteUrl: string,
            appUrl: string,
            timestamp: string,
        ) =>
            `\n${indentation}- [${TODOIST_CONSTANTS.WEBSITE_LINK_TEXT}](${websiteUrl}) [${TODOIST_CONSTANTS.APP_LINK_TEXT}](${appUrl}) (Created: ${timestamp})`,
    },
} as const;

// Backup system constants
export const BACKUP_CONSTANTS = {
    // Backup operation type names (used in filenames)
    OPERATION_TYPES: {
        // Autosave-type operations (frequent, auto-cleaned)
        AUTO_SAVE: "auto-save",
        JOURNAL_LOAD: "journal-load",
        PRE_SAVE: "pre-save",

        // Legacy single-word names (for backward compatibility)
        AUTOSAVE: "autosave",

        // Critical operation backups (important, manually managed)
        RESET: "reset",
        PRE_RESTORE: "pre-restore",
        MIGRATION: "migration",

        // Manual backups (user-initiated, preserved longest)
        MANUAL: "manual",
        USER_BACKUP: "user-backup",

        // Default for unknown types
        DEFAULT: "default",
    } as const,

    // Backup retention policies (max files to keep per type)
    RETENTION_LIMITS: {
        // Autosave-type backups (frequent, low importance)
        AUTO_SAVE: 5,
        JOURNAL_LOAD: 3,
        PRE_SAVE: 3,
        AUTOSAVE: 5, // Legacy compatibility

        // Critical operation backups (important, keep more)
        RESET: 5,
        PRE_RESTORE: 3,
        MIGRATION: 3,

        // Manual backups (user-initiated, keep longest)
        MANUAL: 5,
        USER_BACKUP: 5,

        // Default for unknown types
        DEFAULT: 3,
    } as const,

    // Auto-cleanup policies (which types are automatically cleaned up)
    AUTO_CLEANUP_ENABLED: {
        // Autosave-type backups (cleaned automatically)
        AUTO_SAVE: true,
        JOURNAL_LOAD: true,
        PRE_SAVE: true,
        AUTOSAVE: true, // Legacy compatibility

        // Critical and manual backups (not auto-cleaned)
        RESET: false,
        PRE_RESTORE: false,
        MIGRATION: false,
        MANUAL: false,
        USER_BACKUP: false,
        DEFAULT: false,
    } as const,

    // Backup system configuration
    CONFIG: {
        // Throttling: minimum time between routine backups (1 hour)
        BACKUP_THROTTLE_MS: 60 * 60 * 1000,

        // Default manual cleanup retention count
        DEFAULT_MANUAL_CLEANUP_COUNT: 5,

        // Backup filename patterns
        BACKUP_EXTENSION: ".backup",
        LEGACY_BACKUP_SUFFIX: ".backup",
        TIMESTAMPED_BACKUP_PATTERN: ".backup-{operation}-{timestamp}",

        // Timestamp format for backup filenames (ISO with hyphens)
        TIMESTAMP_FORMAT_REGEX:
            /([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z)$/,

        // Backup detection patterns
        BACKUP_FILE_PATTERN:
            /\.backup-(.+?)-([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z)$/,
        LEGACY_BACKUP_DETECTION: /\.backup$/,
    } as const,

    // Helper functions for backup operations
    HELPERS: {
        // Generate backup filename
        generateBackupFilename: (
            basePath: string,
            operation: string,
            timestamp: string,
        ) => `${basePath}.backup-${operation}-${timestamp}`,

        // Generate timestamp for backup filename
        generateTimestamp: () => new Date().toISOString().replace(/[:.]/g, "-"),

        // Check if backup type should be auto-cleaned
        shouldAutoCleanup: (operationType: string) =>
            BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED[
                operationType as keyof typeof BACKUP_CONSTANTS.AUTO_CLEANUP_ENABLED
            ] ?? false,

        // Get retention limit for backup type
        getRetentionLimit: (operationType: string) =>
            BACKUP_CONSTANTS.RETENTION_LIMITS[
                operationType as keyof typeof BACKUP_CONSTANTS.RETENTION_LIMITS
            ] ?? BACKUP_CONSTANTS.RETENTION_LIMITS.DEFAULT,
    },
} as const;

// We can add other constant categories here if needed in the future
