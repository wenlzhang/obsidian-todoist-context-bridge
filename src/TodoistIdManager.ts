import { TodoistContextBridgeSettings } from "./Settings";
import { TodoistV2IDs } from "./TodoistV2IDs";

/**
 * Enhanced Todoist ID Manager
 * Centralizes all V1/V2 ID handling, caching, and conversion logic
 * Provides a unified interface for robust ID operations across the entire codebase
 */
export class TodoistIdManager {
    private todoistV2IDs: TodoistV2IDs;
    private idCache: Map<string, string> = new Map(); // V1 -> V2 mapping cache
    private reverseIdCache: Map<string, string> = new Map(); // V2 -> V1 mapping cache
    private cacheExpiry: Map<string, number> = new Map(); // Cache expiry timestamps
    private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    constructor(private settings: TodoistContextBridgeSettings) {
        this.todoistV2IDs = new TodoistV2IDs(settings);
    }

    /**
     * Get the canonical V2 ID for any Todoist ID (V1 or V2)
     * This is the primary method for standardizing IDs throughout the codebase
     */
    async getCanonicalId(todoistId: string): Promise<string> {
        if (!todoistId) return "";

        // If it's already a V2 ID (contains letters), return as-is
        if (this.isV2Id(todoistId)) {
            return todoistId;
        }

        // Check cache first
        const cached = this.getCachedV2Id(todoistId);
        if (cached) {
            return cached;
        }

        // Convert V1 to V2 and cache the result
        try {
            const v2Id = await this.todoistV2IDs.getV2Id(todoistId);
            this.cacheIdMapping(todoistId, v2Id);
            return v2Id;
        } catch (error) {
            console.warn(
                `[ID MANAGER] Failed to convert V1 ID ${todoistId} to V2:`,
                error,
            );
            return todoistId; // Fallback to original ID
        }
    }

    /**
     * Get the canonical V2 ID synchronously (cache-only, no API calls)
     * Returns the original ID if not in cache
     */
    getCanonicalIdSync(todoistId: string): string {
        if (!todoistId) return "";

        // If it's already a V2 ID (contains letters), return as-is
        if (this.isV2Id(todoistId)) {
            return todoistId;
        }

        // Check cache only - no async operations
        const cached = this.getCachedV2Id(todoistId);
        return cached || todoistId; // Return cached or original
    }

    /**
     * Check if two Todoist IDs match (handles V1/V2 conversion)
     */
    async idsMatch(id1: string, id2: string): Promise<boolean> {
        const canonical1 = await this.getCanonicalId(id1);
        const canonical2 = await this.getCanonicalId(id2);
        return canonical1 === canonical2;
    }

    /**
     * Batch convert multiple IDs to canonical format
     */
    async batchGetCanonicalIds(ids: string[]): Promise<Record<string, string>> {
        const results: Record<string, string> = {};

        // Process all IDs in parallel for better performance
        const promises = ids.map(async (id) => {
            const canonical = await this.getCanonicalId(id);
            return { original: id, canonical };
        });

        const conversions = await Promise.all(promises);

        for (const { original, canonical } of conversions) {
            results[original] = canonical;
        }

        return results;
    }

    /**
     * Batch convert multiple IDs to canonical V2 format
     * Optimized for bulk operations to minimize API calls
     */
    async getCanonicalIds(todoistIds: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const uncachedV1Ids: string[] = [];

        // First pass: handle V2 IDs and check cache for V1 IDs
        for (const id of todoistIds) {
            if (!id) continue;

            if (this.isV2Id(id)) {
                result.set(id, id);
            } else {
                const cached = this.getCachedV2Id(id);
                if (cached) {
                    result.set(id, cached);
                } else {
                    uncachedV1Ids.push(id);
                }
            }
        }

        // Second pass: batch convert uncached V1 IDs
        if (uncachedV1Ids.length > 0) {
            console.log(
                `[ID MANAGER] Converting ${uncachedV1Ids.length} V1 IDs to V2 format...`,
            );

            for (const v1Id of uncachedV1Ids) {
                try {
                    const v2Id = await this.todoistV2IDs.getV2Id(v1Id);
                    this.cacheIdMapping(v1Id, v2Id);
                    result.set(v1Id, v2Id);
                } catch (error) {
                    console.warn(
                        `[ID MANAGER] Failed to convert ${v1Id}:`,
                        error,
                    );
                    result.set(v1Id, v1Id); // Fallback to original
                }
            }
        }

        return result;
    }

    /**
     * Get the V1 (numeric) ID for a V2 (alphanumeric) ID
     * Useful for API operations that require V1 IDs
     */
    async getV1Id(v2Id: string): Promise<string> {
        if (!v2Id) return "";

        // If it's already a V1 ID (numeric), return as-is
        if (this.isV1Id(v2Id)) {
            return v2Id;
        }

        // Check reverse cache
        const cached = this.reverseIdCache.get(v2Id);
        if (cached && this.isCacheValid(v2Id)) {
            return cached;
        }

        // For V2 -> V1 conversion, we need to search through our cache
        // or make API calls to find the corresponding V1 ID
        for (const [v1Id, cachedV2Id] of this.idCache.entries()) {
            if (cachedV2Id === v2Id && this.isCacheValid(v1Id)) {
                this.reverseIdCache.set(v2Id, v1Id);
                return v1Id;
            }
        }

        // If not found in cache, we can't easily convert V2 -> V1 without extensive API calls
        // This is typically not needed since most API operations accept V2 IDs
        console.warn(
            `[ID MANAGER] V2 -> V1 conversion not available for ${v2Id}`,
        );
        return v2Id; // Return as-is
    }

    /**
     * Check if an ID is in V1 format (numeric)
     */
    isV1Id(id: string): boolean {
        return /^\d+$/.test(id);
    }

    /**
     * Check if an ID is in V2 format (alphanumeric)
     */
    isV2Id(id: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(id) && !this.isV1Id(id);
    }

    /**
     * Clear the ID cache (useful for testing or memory management)
     */
    clearCache(): void {
        this.idCache.clear();
        this.reverseIdCache.clear();
        this.cacheExpiry.clear();
        console.log("[ID MANAGER] ID cache cleared");
    }

    /**
     * Get cache statistics for monitoring and debugging
     */
    getCacheStats(): { size: number; hitRate: number; expiredEntries: number } {
        const now = Date.now();
        let expiredEntries = 0;

        for (const [id, expiry] of this.cacheExpiry.entries()) {
            if (expiry < now) {
                expiredEntries++;
            }
        }

        return {
            size: this.idCache.size,
            hitRate: 0, // Would need to track hits/misses to calculate
            expiredEntries,
        };
    }

    /**
     * Clean up expired cache entries
     */
    cleanupExpiredCache(): void {
        const now = Date.now();
        const expiredIds: string[] = [];

        for (const [id, expiry] of this.cacheExpiry.entries()) {
            if (expiry < now) {
                expiredIds.push(id);
            }
        }

        for (const id of expiredIds) {
            const v2Id = this.idCache.get(id);
            this.idCache.delete(id);
            this.cacheExpiry.delete(id);
            if (v2Id) {
                this.reverseIdCache.delete(v2Id);
            }
        }

        if (expiredIds.length > 0) {
            console.log(
                `[ID MANAGER] Cleaned up ${expiredIds.length} expired cache entries`,
            );
        }
    }

    /**
     * Private helper: Get cached V2 ID if valid
     */
    private getCachedV2Id(v1Id: string): string | null {
        const cached = this.idCache.get(v1Id);
        if (cached && this.isCacheValid(v1Id)) {
            return cached;
        }
        return null;
    }

    /**
     * Private helper: Cache ID mapping with expiry
     */
    private cacheIdMapping(v1Id: string, v2Id: string): void {
        const expiry = Date.now() + this.CACHE_TTL;
        this.idCache.set(v1Id, v2Id);
        this.reverseIdCache.set(v2Id, v1Id);
        this.cacheExpiry.set(v1Id, expiry);
        this.cacheExpiry.set(v2Id, expiry);
    }

    /**
     * Private helper: Check if cache entry is still valid
     */
    private isCacheValid(id: string): boolean {
        const expiry = this.cacheExpiry.get(id);
        return expiry ? expiry > Date.now() : false;
    }
}
