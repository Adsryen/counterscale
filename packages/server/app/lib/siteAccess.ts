import { getUser, isAuthEnabled } from "~/lib/auth";
import { getSite } from "~/lib/sites";

/**
 * Whether anonymous visitors may open this site's stats on the public dashboard.
 *
 * Rules:
 * - Logged-in operators always may view.
 * - Site not in D1 registry → treat as public (AE traffic / upstream-compatible).
 * - Site in registry → honor `publicStats` (default true).
 */
export async function canViewSiteStats(
    request: Request,
    env: Env,
    siteId: string,
): Promise<boolean> {
    if (!siteId || siteId === "@unknown") {
        return true;
    }

    if (!isAuthEnabled(env)) {
        return true;
    }

    const user = await getUser(request, env);
    if (user.authenticated) {
        return true;
    }

    if (!env.DB) {
        // No registry → cannot lock sites; keep public
        return true;
    }

    const site = await getSite(env.DB, siteId);
    if (!site) {
        // Discovered-only traffic: public until added and marked private
        return true;
    }

    return site.publicStats;
}

export async function assertCanViewSiteStats(
    request: Request,
    env: Env,
    siteId: string,
): Promise<void> {
    const ok = await canViewSiteStats(request, env, siteId);
    if (!ok) {
        throw new Response("This site's analytics are private. Please sign in.", {
            status: 401,
            statusText: "Unauthorized",
        });
    }
}
