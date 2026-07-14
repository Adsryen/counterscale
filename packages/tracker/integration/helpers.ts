import type { Request } from "@playwright/test";

/**
 * Match pageview collect requests only.
 * Engagement beacons hit `/collect/engagement` and must not be counted.
 */
export function isPageviewCollectRequest(request: Request): boolean {
    if (request.method() !== "GET") {
        return false;
    }

    try {
        const { pathname } = new URL(request.url());
        return /\/collect\/?$/.test(pathname);
    } catch {
        return false;
    }
}
