import { describe, expect, test } from "vitest";

import { getRealtimeDashboardData } from "../realtime";

type SiteRow = {
    site_id: string;
    name: string;
    enabled: number;
    public_stats: number;
    record_ip: number;
    ip_retention_days: number;
    allowed_hosts: string | null;
    created_at: string;
    updated_at: string;
};

type VisitRow = {
    visit_id: string;
    first_seen_at: string;
    last_seen_at: string;
    entry_referrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    ip_ciphertext: string | null;
    ip_nonce: string | null;
    ip_key_version: number | null;
    ip_hmac: string | null;
    page_count: number | null;
};

function createDb(site: SiteRow, visits: VisitRow[]) {
    return {
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    if (sql.includes("FROM sites")) return site as T;
                    if (sql.includes("COUNT(*) AS count")) {
                        const since = String(binds[1]);
                        return { count: visits.filter((visit) => visit.last_seen_at >= since).length } as T;
                    }
                    return null;
                },
                async all<T>() {
                    if (sql.includes("FROM visits v")) {
                        const ids = new Set(binds.slice(1).map(String));
                        return { results: visits.filter((visit) => ids.has(visit.visit_id)) as T[] };
                    }
                    return { results: [] as T[] };
                },
            };
            return stmt;
        },
    } as unknown as D1Database;
}

function createPresence(visits: unknown[]) {
    return {
        idFromName: (name: string) => ({ name }),
        get: () => ({
            fetch: async () =>
                new Response(
                    JSON.stringify({
                        generatedAt: "2026-07-14T00:00:00.000Z",
                        online: visits,
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
        }),
    } as unknown as DurableObjectNamespace;
}

const site: SiteRow = {
    site_id: "site-a",
    name: "Site A",
    enabled: 1,
    public_stats: 1,
    record_ip: 0,
    ip_retention_days: 60,
    allowed_hosts: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
};

describe("realtime dashboard data", () => {
    test("keeps current online separate from 5/30 minute active windows", async () => {
        const db = createDb(site, [
            {
                visit_id: "visit-1",
                first_seen_at: "2026-07-14T00:00:00.000Z",
                last_seen_at: "2026-07-14T00:09:00.000Z",
                entry_referrer: "https://ref.example/",
                country: "CN",
                region: "Zhejiang",
                city: "Hangzhou",
                ip_ciphertext: null,
                ip_nonce: null,
                ip_key_version: null,
                ip_hmac: null,
                page_count: 3,
            },
            {
                visit_id: "visit-2",
                first_seen_at: "2026-07-14T00:00:00.000Z",
                last_seen_at: "2026-07-14T00:04:00.000Z",
                entry_referrer: null,
                country: "US",
                region: "CA",
                city: "San Francisco",
                ip_ciphertext: null,
                ip_nonce: null,
                ip_key_version: null,
                ip_hmac: null,
                page_count: 1,
            },
        ]);
        const env = {
            DB: db,
            PRESENCE: createPresence([
                {
                    visitId: "visit-1",
                    startedAt: "2026-07-14T00:00:00.000Z",
                    lastSeenAt: "2026-07-14T00:10:00.000Z",
                    tabs: [
                        { tabId: "tab-a", path: "/a", visibility: "visible", lastSeenAt: "2026-07-14T00:10:00.000Z" },
                        { tabId: "tab-b", path: "/b", visibility: "hidden", lastSeenAt: "2026-07-14T00:09:00.000Z" },
                    ],
                },
            ]),
        } as unknown as Env;

        const data = await getRealtimeDashboardData(env, "site-a", new Date("2026-07-14T00:10:00.000Z"));

        expect(data.currentOnline.count).toBe(1);
        expect(data.currentOnline.visits[0].tabs).toHaveLength(2);
        expect(data.currentOnline.visits[0].ipStatus).toBe("disabled");
        expect(data.currentOnline.visits[0].pageCount).toBe(3);
        expect(data.recentActive.visits5m).toBe(1);
        expect(data.recentActive.visits30m).toBe(2);
    });

    test("reports presence unavailable without faking online from recent activity", async () => {
        const db = createDb(site, []);
        const env = { DB: db } as unknown as Env;
        const data = await getRealtimeDashboardData(env, "site-a", new Date("2026-07-14T00:10:00.000Z"));

        expect(data.currentOnline.available).toBe(false);
        expect(data.currentOnline.count).toBe(0);
        expect(data.recentActive.available).toBe(true);
    });
});
