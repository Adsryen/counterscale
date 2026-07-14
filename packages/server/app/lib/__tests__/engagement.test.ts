import { describe, expect, test } from "vitest";

import { getEngagementOverview, recordVisitEngagement } from "../engagement";

type VisitRow = {
    site_id: string;
    visit_id: string;
    first_seen_at?: string;
    last_seen_at: string;
    engaged_ms: number;
    page_count?: number;
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

function createEngagementD1() {
    const visits = new Map<string, VisitRow>();
    const pageviews: PageviewRow[] = [];

    function key(siteId: string, visitId: string) {
        return `${siteId}\u0000${visitId}`;
    }

    function seedVisit(row: VisitRow) {
        visits.set(key(row.site_id, row.visit_id), row);
    }

    function seedPageview(row: PageviewRow) {
        pageviews.push(row);
    }

    return {
        seedVisit,
        seedPageview,
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
                    if (sql.includes("FROM visits")) {
                        const [siteId, startDate, endDate] = binds as [string, string, string];
                        const results = Array.from(visits.values()).filter((visit) => {
                            const firstSeenAt = visit.first_seen_at ?? visit.last_seen_at;
                            return (
                                visit.site_id === siteId &&
                                firstSeenAt >= startDate &&
                                firstSeenAt < endDate
                            );
                        });
                        return { results: results as T[] };
                    }
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
                            if (row.last_seen_at < seenAt) {
                                row.last_seen_at = seenAt;
                            }
                            row.engagement_started_at ??= startedAt;
                            row.engagement_updated_at = updatedAt;
                        }
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

describe("visit engagement storage", () => {
    test("records visible duration monotonically and accumulates only positive deltas", async () => {
        const db = createEngagementD1();
        db.seedVisit({
            site_id: "site-a",
            visit_id: "visit-1",
            last_seen_at: "2026-07-14T09:59:00.000Z",
            engaged_ms: 0,
            page_count: 1,
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

        await expect(
            recordVisitEngagement(db, {
                siteId: "site-a",
                visitId: "visit-1",
                clientPageviewId: "client-pv-1",
                visibleMs: 15_000,
                occurredAt: new Date("2026-07-14T10:00:15Z"),
            }),
        ).resolves.toEqual({ updated: true, deltaMs: 15_000 });

        await recordVisitEngagement(db, {
            siteId: "site-a",
            visitId: "visit-1",
            clientPageviewId: "client-pv-1",
            visibleMs: 10_000,
            occurredAt: new Date("2026-07-14T10:00:20Z"),
        });
        await expect(
            recordVisitEngagement(db, {
                siteId: "site-a",
                visitId: "visit-1",
                clientPageviewId: "client-pv-1",
                visibleMs: 18_000,
                occurredAt: new Date("2026-07-14T10:00:25Z"),
            }),
        ).resolves.toEqual({ updated: true, deltaMs: 3_000 });

        const visit = db._visits.get("site-a\u0000visit-1");
        expect(visit?.engaged_ms).toBe(18_000);
        expect(visit?.engagement_started_at).toBe("2026-07-14T10:00:15.000Z");
        expect(visit?.engagement_updated_at).toBe("2026-07-14T10:00:25.000Z");
        expect(db._pageviews[0]).toMatchObject({
            visible_ms: 18_000,
            engagement_flushes: 3,
            last_engaged_at: "2026-07-14T10:00:25.000Z",
        });
    });

    test("returns no-op when the client pageview id is unknown", async () => {
        const db = createEngagementD1();

        await expect(
            recordVisitEngagement(db, {
                siteId: "site-a",
                visitId: "visit-missing",
                clientPageviewId: "client-pv-missing",
                visibleMs: 5_000,
                occurredAt: new Date("2026-07-14T10:00:05Z"),
            }),
        ).resolves.toEqual({ updated: false, reason: "not-found" });
    });

    test("summarizes average duration, depth, buckets, and coverage from visits", async () => {
        const db = createEngagementD1();
        db.seedVisit({
            site_id: "site-a",
            visit_id: "visit-1",
            first_seen_at: "2026-07-14T10:00:00.000Z",
            last_seen_at: "2026-07-14T10:00:45.000Z",
            engaged_ms: 45_000,
            page_count: 1,
            engagement_started_at: "2026-07-14T10:00:10.000Z",
            engagement_updated_at: "2026-07-14T10:00:45.000Z",
        });
        db.seedVisit({
            site_id: "site-a",
            visit_id: "visit-2",
            first_seen_at: "2026-07-14T10:02:00.000Z",
            last_seen_at: "2026-07-14T10:04:00.000Z",
            engaged_ms: 120_000,
            page_count: 4,
            engagement_started_at: "2026-07-14T10:02:10.000Z",
            engagement_updated_at: "2026-07-14T10:04:00.000Z",
        });
        db.seedVisit({
            site_id: "site-a",
            visit_id: "visit-3",
            first_seen_at: "2026-07-14T10:05:00.000Z",
            last_seen_at: "2026-07-14T10:16:00.000Z",
            engaged_ms: 650_000,
            page_count: 11,
            engagement_started_at: "2026-07-14T10:05:15.000Z",
            engagement_updated_at: "2026-07-14T10:16:00.000Z",
        });
        db.seedVisit({
            site_id: "site-a",
            visit_id: "outside-range",
            first_seen_at: "2026-07-13T10:00:00.000Z",
            last_seen_at: "2026-07-13T10:01:00.000Z",
            engaged_ms: 60_000,
            page_count: 2,
            engagement_started_at: "2026-07-13T10:00:10.000Z",
            engagement_updated_at: "2026-07-13T10:01:00.000Z",
        });

        await expect(
            getEngagementOverview(db, "site-a", {
                startDate: new Date("2026-07-14T00:00:00Z"),
                endDate: new Date("2026-07-15T00:00:00Z"),
            }),
        ).resolves.toEqual({
            available: true,
            coverageStartedAt: "2026-07-14T10:00:10.000Z",
            visits: 3,
            pageviews: 16,
            averageDurationMs: 271_667,
            averagePageDepth: 16 / 3,
            durationBuckets: [
                { bucket: "0-10s", visits: 0 },
                { bucket: "10-30s", visits: 0 },
                { bucket: "30-60s", visits: 1 },
                { bucket: "1-3m", visits: 1 },
                { bucket: "3-10m", visits: 0 },
                { bucket: "10m+", visits: 1 },
            ],
            depthBuckets: [
                { bucket: "1", visits: 1 },
                { bucket: "2", visits: 0 },
                { bucket: "3-5", visits: 1 },
                { bucket: "6-10", visits: 0 },
                { bucket: "10+", visits: 1 },
            ],
        });
    });

    test("marks engagement unavailable instead of reporting zeroes for uncovered old data", async () => {
        const db = createEngagementD1();
        db.seedVisit({
            site_id: "site-a",
            visit_id: "legacy-visit",
            first_seen_at: "2026-07-14T10:00:00.000Z",
            last_seen_at: "2026-07-14T10:00:00.000Z",
            engaged_ms: 0,
            page_count: 0,
            engagement_started_at: null,
            engagement_updated_at: null,
        });

        await expect(
            getEngagementOverview(db, "site-a", {
                startDate: new Date("2026-07-14T00:00:00Z"),
                endDate: new Date("2026-07-15T00:00:00Z"),
            }),
        ).resolves.toMatchObject({
            available: false,
            reason: "no-engagement",
            coverageStartedAt: null,
            visits: 1,
            pageviews: 0,
            averageDurationMs: null,
            averagePageDepth: null,
        });
    });
});
