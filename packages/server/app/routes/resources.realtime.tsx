import type { LoaderFunctionArgs } from "react-router";

import { requireAuth } from "~/lib/auth";
import { getRealtimeDashboardData } from "~/lib/realtime";

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const url = new URL(request.url);
    const siteId = (url.searchParams.get("site") || "").trim();
    if (!siteId) {
        throw new Response("Missing site", { status: 400 });
    }
    return getRealtimeDashboardData(context.cloudflare.env, siteId);
}
