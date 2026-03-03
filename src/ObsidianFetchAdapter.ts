import { RequestUrlParam, RequestUrlResponse, requestUrl } from "obsidian";

/**
 * Custom fetch adapter for Obsidian's requestUrl API.
 *
 * Bridges the gap between Obsidian's requestUrl interface and the
 * standard fetch-like interface expected by the Todoist API SDK v6+.
 *
 * Key differences handled:
 * - Obsidian returns response data as properties (response.json, response.text)
 *   while the SDK expects methods (response.json(), response.text())
 * - Obsidian's requestUrl bypasses CORS restrictions that would block standard fetch
 * - Obsidian throws on HTTP errors by default; we set throw: false to handle manually
 * - Obsidian doesn't provide statusText; we default to empty string
 */
export function obsidianFetch(
    url: string,
    options?: RequestInit & { timeout?: number },
) {
    return obsidianFetchAdapter(url, options);
}

async function obsidianFetchAdapter(
    url: string,
    options?: RequestInit & { timeout?: number },
) {
    const requestParams: RequestUrlParam = {
        url,
        method: options?.method || "GET",
        headers: options?.headers as Record<string, string>,
        body: options?.body as string,
        throw: false, // Don't throw on HTTP errors; let the SDK handle status codes
    };

    const response: RequestUrlResponse = await requestUrl(requestParams);

    return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: "", // Obsidian doesn't provide statusText
        headers: response.headers,
        text: () => Promise.resolve(response.text),
        json: () => Promise.resolve(response.json),
    };
}
