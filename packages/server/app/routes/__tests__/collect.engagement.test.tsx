import type { ActionFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { action } from "../collect.engagement";

type VisitRow = {
    site_id: string;
    visit_id: string;
    engaged_ms: number;
    last_seen_at: string;
    engagement_started_at: string | null;
    engagement_updated_at: string | null;
};

type PageviewRow = {
    site_id: string;
    visit_id: string;
    client_pageview_id: string | null;
    visible_ms: number;
    last_engaged_at: string | null;
    engagement_flushes: number;
};

function createEngagementRouteD1() {
    const visits = new Map<string, VisitRow>();
    const pageviews: PageviewRow[] = [];

    function key(siteId: string, visitId: string) {
        return `${siteId}\u0000${visitId}`;
    }

    return {
        seedVisit(row: VisitRow) {
            visits.set(key(row.site_id, row.visit_id), row);
        },
        seedPageview(row: PageviewRow) {
            pageviews.push(row);
        },
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    if (sql.includes("FROM pageviews")) {
                        const row = pageviews.find(
                            (pageview) =>
                                pageview.site_id === binds[0] &&
                                pageview.visit_id === binds[1] &&
                                pageview.client_pageview_id === binds[2],
                        );
                        return (row as T) ?? null;
                    }
                    return null;
                },
                async all<T>() {
                    return { results: [] as T[] };
                },
                async run() {
                    if (sql.includes("UPDATE pageviews")) {
                        const [visibleMs, lastEngagedAt, siteId, visitId, clientPageviewId] =
                            binds as [number, string, string, string, string];
                        const row = pageviews.find(
                            (pageview) =>
                                pageview.site_id === siteId &&
                                pageview.visit_id === visitId &&
                                pageview.client_pageview_id === clientPageviewId,
                        );
                        if (row) {
                            row.visible_ms = Math.max(row.visible_ms, Number(visibleMs));
                            row.last_engaged_at = lastEngagedAt;
                            row.engagement_flushes += 1;
                        }
                    } else if (sql.includes("UPDATE visits")) {
                        const [delta, seenAt, , startedAt, updatedAt] = binds as [
                            number,
                            string,
                            string,
                            string,
                            string,
                        ];
                        const siteId = String(binds[binds.length - 2]);
                        const visitId = String(binds[binds.length - 1]);
                        const row = visits.get(key(siteId, visitId));
                        if (row) {
                            row.engaged_ms += Number(delta);
                            if (row.last_seen_at < seenAt) row.last_seen_at = seenAt;
                            row.engagement_started_at ??= startedAt;
                            row.engagement_updated_at = updatedAt;
                        }
                    } else if (sql.includes("INSERT INTO pageviews")) {
                        throw new Error("engagement endpoint must not append pageviews");
                    }
                    return { meta: { changes: 1 } };
                },
            };
            return stmt;
        },
        _visits: visits,
        _pageviews: pageviews,
    } as unknown as D1Database & {
        seedVisit(row: VisitRow): void;
        seedPageview(row: PageviewRow): void;
        _visits: Map<string, VisitRow>;
        _pageviews: PageviewRow[];
    };
}

describe("collect engagement endpoint", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-14T10:00:15Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("updates an existing pageview duration without writing AE or appending pageviews", async () => {
        const db = createEngagementRouteD1();
        db.seedVisit({
            site_id: "site-a",
            visit_id: "visit-1",
            engaged_ms: 0,
            last_seen_at: "2026-07-14T09:59:00.000Z",
            engagement_started_at: null,
            engagement_updated_at: null,
        });
        db.seedPageview({
            site_id: "site-a",
            visit_id: "visit-1",
            client_pageview_id: "client-pv-1",
            visible_ms: 0,
            last_engaged_at: null,
            engagement_flushes: 0,
        });
        const env = {
            DB: db,
            WEB_COUNTER_AE: { writeDataPoint: vi.fn() },
        };

        const response = await action({
            request: new Request(
                "https://example.com/collect/engagement?sid=site-a&vid=visit-1&tid=tab-1&pid=client-pv-1&ms=15000&ct=1767225600000&p=/home",
                { method: "POST" },
            ),
            context: { cloudflare: { env } },
        } as unknown as ActionFunctionArgs);

        expect(response.status).toBe(204);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
        expect(db._pageviews).toHaveLength(1);
        expect(db._pageviews[0]).toMatchObject({
            visible_ms: 15_000,
            engagement_flushes: 1,
            last_engaged_at: expect.stringContaining("2026-07-14"),
        });
        expect(db._visits.get("site-a\u0000visit-1")?.engaged_ms).toBe(15_000);
    });

    test("returns accepted no-op when the pageview is missing", async () => {
        const db = createEngagementRouteD1();
        const response = await action({
            request: new Request(
                "https://example.com/collect/engagement?sid=site-a&vid=visit-1&pid=missing&ms=15000",
                { method: "POST" },
            ),
            context: { cloudflare: { env: { DB: db } } },
        } as unknown as ActionFunctionArgs);

        expect(response.status).toBe(202);
    });

    test("rejects invalid visible duration", async () => {
        const response = await action({
            request: new Request(
                "https://example.com/collect/engagement?sid=site-a&vid=visit-1&pid=client-pv-1&ms=86400001",
                { method: "POST" },
            ),
            context: { cloudflare: { env: { DB: createEngagementRouteD1() } } },
        } as unknown as ActionFunctionArgs);

        expect(response.status).toBe(400);
        await expect(response.text()).resolves.toBe("Invalid visible duration");
    });
});
