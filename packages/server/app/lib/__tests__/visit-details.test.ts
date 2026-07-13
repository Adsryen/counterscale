import { describe, expect, test } from "vitest";

import type { EncryptedIpAddress } from "../ip-crypto";
import { recordVisitAndPageview } from "../visit-details";

type VisitRow = {
    site_id: string;
    visit_id: string;
    last_seen_at: string;
    ip_ciphertext: string | null;
    ip_hmac: string | null;
};

type PageviewRow = { site_id: string; visit_id: string; path: string | null };
type PrefixRow = { site_id: string; visit_id: string; prefix_length: number; prefix_token: string };

function createDetailD1() {
    const visits = new Map<string, VisitRow>();
    const pageviews: PageviewRow[] = [];
    const prefixes: PrefixRow[] = [];

    function key(siteId: string, visitId: string) {
        return `${siteId}\u0000${visitId}`;
    }

    return {
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    if (sql.includes("FROM visits")) {
                        return (visits.get(key(String(binds[0]), String(binds[1]))) as T) ?? null;
                    }
                    return null;
                },
                async all<T>() {
                    return { results: [] as T[] };
                },
                async run() {
                    if (sql.includes("INSERT INTO visits")) {
                        const [site_id, visit_id, , , first_seen_at, last_seen_at, , , , , , , , , , , , , ip_ciphertext, , , ip_hmac] = binds as (string | number | null)[];
                        visits.set(key(String(site_id), String(visit_id)), {
                            site_id: String(site_id),
                            visit_id: String(visit_id),
                            last_seen_at: String(last_seen_at ?? first_seen_at),
                            ip_ciphertext: ip_ciphertext == null ? null : String(ip_ciphertext),
                            ip_hmac: ip_hmac == null ? null : String(ip_hmac),
                        });
                    } else if (sql.includes("UPDATE visits")) {
                        const [last_seen_at, , site_id, visit_id] = binds as (string | null)[];
                        const existing = visits.get(key(String(site_id), String(visit_id)));
                        if (existing) existing.last_seen_at = String(last_seen_at);
                    } else if (sql.includes("INSERT INTO pageviews")) {
                        const [, site_id, visit_id, , , , , path] = binds as (string | null)[];
                        pageviews.push({ site_id: String(site_id), visit_id: String(visit_id), path });
                    } else if (sql.includes("INSERT INTO visit_ip_prefixes")) {
                        const [site_id, visit_id, prefix_length, prefix_token] = binds as (string | number)[];
                        prefixes.push({
                            site_id: String(site_id),
                            visit_id: String(visit_id),
                            prefix_length: Number(prefix_length),
                            prefix_token: String(prefix_token),
                        });
                    }
                    return { meta: { changes: 1 } };
                },
            };
            return stmt;
        },
        _visits: visits,
        _pageviews: pageviews,
        _prefixes: prefixes,
    } as unknown as D1Database & {
        _visits: Map<string, VisitRow>;
        _pageviews: PageviewRow[];
        _prefixes: PrefixRow[];
    };
}

const encryptedIp: EncryptedIpAddress = {
    normalizedIp: "203.0.113.5",
    family: 4,
    ciphertext: "cipher",
    nonce: "nonce",
    keyVersion: 3,
    ipHmac: "hmac",
    prefixes: [{ prefixLength: 24, token: "prefix" }],
};

describe("visit detail storage", () => {
    test("creates one encrypted IP record per visit and appends pageviews", async () => {
        const db = createDetailD1();

        await recordVisitAndPageview(db, {
            siteId: "site-a",
            visitId: "visit-1",
            visitorId: "visitor-1",
            tabId: "tab-1",
            identityScope: "persistent",
            occurredAt: new Date("2026-07-13T10:00:00Z"),
            retentionDays: 60,
            host: "example.com",
            path: "/first",
            referrer: "https://ref.example/",
            country: "CN",
            region: "Zhejiang",
            city: "Hangzhou",
            encryptedIp,
        });
        await recordVisitAndPageview(db, {
            siteId: "site-a",
            visitId: "visit-1",
            occurredAt: new Date("2026-07-13T10:01:00Z"),
            retentionDays: 60,
            path: "/second",
            encryptedIp: {
                ...encryptedIp,
                ciphertext: "should-not-overwrite",
                ipHmac: "should-not-overwrite",
            },
        });

        const row = db._visits.get("site-a\u0000visit-1");
        expect(row?.ip_ciphertext).toBe("cipher");
        expect(row?.ip_hmac).toBe("hmac");
        expect(db._prefixes).toHaveLength(1);
        expect(db._pageviews.map((p) => p.path)).toEqual(["/first", "/second"]);
    });

    test("records visit and pageview without IP when disabled", async () => {
        const db = createDetailD1();
        await recordVisitAndPageview(db, {
            siteId: "site-a",
            visitId: "visit-2",
            occurredAt: new Date("2026-07-13T10:00:00Z"),
            retentionDays: 60,
            path: "/privacy",
        });

        const row = db._visits.get("site-a\u0000visit-2");
        expect(row?.ip_ciphertext).toBeNull();
        expect(row?.ip_hmac).toBeNull();
        expect(db._prefixes).toHaveLength(0);
        expect(db._pageviews).toHaveLength(1);
    });
});