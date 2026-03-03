import { TodoistApi } from "@doist/todoist-api-typescript";

/**
 * Helper to fetch all results from paginated Todoist API endpoints.
 *
 * The Todoist API v1 uses cursor-based pagination. This helper
 * handles the pagination loop transparently.
 */

type PaginatedResponse<T> = {
    results: T[];
    nextCursor: string | null;
};

type PaginatedFetcher<T, A> = (args?: A) => Promise<PaginatedResponse<T>>;

/**
 * Fetch all pages of results from a paginated API method.
 * @param fetcher - The paginated API method to call
 * @param args - Optional arguments to pass to the fetcher
 * @returns All results concatenated from all pages
 */
export async function fetchAllPages<T, A extends { cursor?: string | null }>(
    fetcher: PaginatedFetcher<T, A>,
    args?: Omit<A, "cursor">,
): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | null = null;

    do {
        const fetchArgs = { ...args, cursor } as A;
        const response = await fetcher(fetchArgs);
        allResults.push(...response.results);
        cursor = response.nextCursor;
    } while (cursor);

    return allResults;
}
