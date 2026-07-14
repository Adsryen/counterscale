import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { recordVisitEngagement } from "~/lib/engagement";

const MAX_ID_LENGTH = 128;
const MAX_VISIBLE_MS = 86_400_000;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function corsResponse(body: BodyInit | null, init: ResponseInit = {}) {
    return new Response(body, {
        ...init,
        headers: {
            ...CORS_HEADERS,
            ...(init.headers ?? {}),
        },
    });
}

function optionalId(params: URLSearchParams, name: string): string | null {
    const value = params.get(name)?.trim();
    if (!value) return null;
    if (value.length > MAX_ID_LENGTH) return null;
    return value;
}

function parseVisibleMs(params: URLSearchParams): number | null {
    const raw = params.get("ms")?.trim();
    if (!raw || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > MAX_VISIBLE_MS) {
        return null;
    }
    return value;
}

export async function loader({ request }: LoaderFunctionArgs) {
    if (request.method === "OPTIONS") {
        return corsResponse(null, { status: 204 });
    }
    return corsResponse("Method Not Allowed", { status: 405 });
}

export async function action({ request, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return corsResponse("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const siteId = optionalId(url.searchParams, "sid");
    const visitId = optionalId(url.searchParams, "vid");
    const clientPageviewId = optionalId(url.searchParams, "pid");
    const visibleMs = parseVisibleMs(url.searchParams);

    if (!siteId) return corsResponse("Missing siteId", { status: 400 });
    if (!visitId) return corsResponse("Missing visitId", { status: 400 });
    if (!clientPageviewId) {
        return corsResponse("Missing pageview id", { status: 400 });
    }
    if (visibleMs === null) {
        return corsResponse("Invalid visible duration", { status: 400 });
    }

    const db = context.cloudflare.env.DB;
    if (!db) {
        return corsResponse(null, { status: 202 });
    }

    const result = await recordVisitEngagement(db, {
        siteId,
        visitId,
        clientPageviewId,
        visibleMs,
        occurredAt: new Date(),
    });

    return corsResponse(null, { status: result.updated ? 204 : 202 });
}
