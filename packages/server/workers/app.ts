import type { 
    ExecutionContext,
    ExportedHandler,
    ScheduledController,
} from "@cloudflare/workers-types";
import { createRequestHandler, type ServerBuild } from "react-router";

/**
 * NOTE: Must use relative paths inside this file (no ~ shorthand), because
 * it gets packaged into Worker and special paths defined in tsconfig will not
 * resolve.
 */
import { getLoadContext } from "../app/load-context";
import * as build from "../build/server";
import { extractAsArrow } from "./lib/arrow";
import { deleteExpiredVisitDetails } from "../app/lib/visit-details";
import { getSite } from "../app/lib/sites";
import { SitePresence } from "./presence";

export { SitePresence };

const requestHandler = createRequestHandler(build as unknown as ServerBuild);

function parseAllowedHosts(value: string | null | undefined): string[] {
    return (value ?? "")
        .split(/[\s,]+/)
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
}

function requestHostAllowed(request: Request, allowedHosts: string | null | undefined): boolean {
    const hosts = parseAllowedHosts(allowedHosts);
    if (hosts.length === 0) return true;
    const source = request.headers.get("Origin") || request.headers.get("Referer") || "";
    if (!source) return false;
    try {
        const host = new URL(source).hostname.toLowerCase();
        return hosts.includes(host);
    } catch {
        return false;
    }
}

async function siteIdForPresenceRequest(request: Request): Promise<string | null> {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("sid")?.trim();
    if (fromQuery) return fromQuery;
    if (request.method === "POST") {
        try {
            const body = await request.clone().json() as { siteId?: unknown; sid?: unknown };
            const value = typeof body.siteId === "string" ? body.siteId : body.sid;
            return typeof value === "string" && value.trim() ? value.trim() : null;
        } catch {
            return null;
        }
    }
    return null;
}

async function handlePresenceRequest(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== "/presence" && url.pathname !== "/presence/heartbeat") {
        return null;
    }
    if (!env.PRESENCE) {
        return new Response("Presence is not configured", { status: 501 });
    }
    const siteId = await siteIdForPresenceRequest(request);
    if (!siteId) {
        return new Response("Missing siteId", { status: 400 });
    }

    if (env.DB) {
        const site = await getSite(env.DB, siteId);
        if (site && !site.enabled) {
            return new Response("Site disabled", { status: 403 });
        }
        if (site && !requestHostAllowed(request, site.allowedHosts)) {
            return new Response("Origin not allowed", { status: 403 });
        }
    }

    const id = env.PRESENCE.idFromName(siteId);
    return env.PRESENCE.get(id).fetch(request);
}


export default {
        async scheduled(
        _controller: ScheduledController,
        env: Env,
        ctx: ExecutionContext,
    ) {
        try {
            if (env.CF_STORAGE_ENABLED !== "false") {
                ctx.waitUntil(
                    extractAsArrow(
                        {
                            accountId: env.CF_ACCOUNT_ID,
                            bearerToken: env.CF_BEARER_TOKEN,
                        },
                        env.DAILY_ROLLUPS,
                    ),
                );
            }
            if (env.DB) {
                ctx.waitUntil(deleteExpiredVisitDetails(env.DB));
            }
        } catch (error) {
            console.error(error);
        }
    },
    // @ts-expect-error TODO figure out types here
    async fetch(request: any, env: any, ctx: any) {
        try {
            const presenceResponse = await handlePresenceRequest(request, env);
            if (presenceResponse) return presenceResponse;

            const loadContext = getLoadContext({
                request,
                context: {
                    cloudflare: {
                        ctx: {
                            waitUntil: ctx.waitUntil.bind(ctx),
                            passThroughOnException:
                                ctx.passThroughOnException.bind(ctx),
                            props: ctx.props,
                        },
                        cf: request.cf as never,
                        // @ts-expect-error TODO: figure out how to get this type to work
                        caches,
                        env,
                    },
                },
            });
            return await requestHandler(request, loadContext);
        } catch (error) {
            console.log(error);
            return new Response("An unexpected error occurred", {
                status: 500,
            });
        }
    },
} satisfies ExportedHandler<Env>;
