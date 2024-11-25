import moment from 'moment';

/**
 * Generates a UUID using the same method as Advanced URI plugin
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generates a block ID using the specified format
 */
export function generateBlockId(format: string): string {
    return moment().format(format);
}

/**
 * Generates a non-task block ID with timestamp and random string
 */
export function generateNonTaskBlockId(format: string): string {
    return moment().format(format);
}
