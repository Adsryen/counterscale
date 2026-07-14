import { decryptIpAddress, type IpCryptoConfig } from "~/lib/ip-crypto";
import { getSite, type Site } from "~/lib/sites";

export type RealtimeTab = {
    tabId: string;
    path: string;
    visibility: "visible" | "hidden";
    lastSeenAt: string;
};

export type OnlineVisit = {
    visitId: string;
    startedAt: string;
    lastSeenAt: string;
    tabs: RealtimeTab[];
    ip: string | null;
    ipStatus: "available" | "disabled" | "unavailable" | "not-recorded";
    country: string | null;
    region: string | null;
    city: string | null;
    referrer: string | null;
    pageCount: number | null;
    trailHref: string | null;
};

export type RealtimeDashboardData = {
    siteId: string;
    generatedAt: string;
    currentOnline: {
        available: boolean;
        error: string | null;
        count: number;
        visits: OnlineVisit[];
    };
    recentActive: {
        available: boolean;
        error: string | null;
        visits5m: number | null;
        visits30m: number | null;
    };
};

type PresenceSnapshotVisit = {
    visitId: string;
    startedAt: string;
    lastSeenAt: string;
    tabs: RealtimeTab[];
};

type PresenceSnapshot = {
    generatedAt: string;
    online: PresenceSnapshotVisit[];
};

type VisitDetailRow = {
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

type CountRow = { count: number };

function getIpCryptoConfig(env: Env, keyVersion: number): IpCryptoConfig | null {
    if (!env.CF_IP_ENCRYPTION_KEY || !env.CF_IP_HMAC_KEY) return null;
    return {
        encryptionKey: env.CF_IP_ENCRYPTION_KEY,
        hmacKey: env.CF_IP_HMAC_KEY,
        keyVersion,
    };
}

async function fetchPresenceSnapshot(env: Env, siteId: string): Promise<PresenceSnapshot> {
    if (!env.PRESENCE) {
        throw new Error("Presence Durable Object is not configured");
    }
    const id = env.PRESENCE.idFromName(siteId);
    const response = await env.PRESENCE
        .get(id)
        .fetch(`https://presence.internal/presence/snapshot?sid=${encodeURIComponent(siteId)}`);
    if (!response.ok) {
        throw new Error(`Presence snapshot failed: ${response.status}`);
    }
    return await response.json<PresenceSnapshot>();
}

async function countActiveVisits(
    db: D1Database,
    siteId: string,
    minutes: number,
    now: Date,
): Promise<number> {
    const since = new Date(now.getTime() - minutes * 60_000).toISOString();
    const row = await db
        .prepare(
            `SELECT COUNT(*) AS count
             FROM visits
             WHERE site_id = ? AND last_seen_at >= ?`,
        )
        .bind(siteId, since)
        .first<CountRow>();
    return Number(row?.count ?? 0);
}

async function loadVisitDetailRows(
    db: D1Database,
    siteId: string,
    visitIds: string[],
): Promise<Map<string, VisitDetailRow>> {
    if (visitIds.length === 0) return new Map();
    const placeholders = visitIds.map(() => "?").join(", ");
    const result = await db
        .prepare(
            `SELECT v.visit_id, v.first_seen_at, v.last_seen_at,
                    v.entry_referrer, v.country, v.region, v.city,
                    v.ip_ciphertext, v.ip_nonce, v.ip_key_version, v.ip_hmac,
                    COUNT(p.pageview_id) AS page_count
             FROM visits v
             LEFT JOIN pageviews p
               ON p.site_id = v.site_id AND p.visit_id = v.visit_id
             WHERE v.site_id = ? AND v.visit_id IN (${placeholders})
             GROUP BY v.visit_id, v.first_seen_at, v.last_seen_at,
                      v.entry_referrer, v.country, v.region, v.city,
                      v.ip_ciphertext, v.ip_nonce, v.ip_key_version, v.ip_hmac`,
        )
        .bind(siteId, ...visitIds)
        .all<VisitDetailRow>();
    return new Map((result.results ?? []).map((row) => [row.visit_id, row]));
}

async function revealIp(
    row: VisitDetailRow | undefined,
    env: Env,
    site: Site | null,
): Promise<{ ip: string | null; ipStatus: OnlineVisit["ipStatus"] }> {
    if (site && !site.recordIp) return { ip: null, ipStatus: "disabled" };
    if (!row?.ip_ciphertext || !row.ip_nonce || !row.ip_key_version) {
        return { ip: null, ipStatus: row?.ip_hmac ? "unavailable" : "not-recorded" };
    }
    const config = getIpCryptoConfig(env, row.ip_key_version);
    if (!config) return { ip: null, ipStatus: "unavailable" };
    try {
        return {
            ip: await decryptIpAddress(
                {
                    ciphertext: row.ip_ciphertext,
                    nonce: row.ip_nonce,
                    keyVersion: row.ip_key_version,
                },
                config,
            ),
            ipStatus: "available",
        };
    } catch {
        return { ip: null, ipStatus: "unavailable" };
    }
}

async function enrichOnlineVisits(
    env: Env,
    db: D1Database | undefined,
    site: Site | null,
    siteId: string,
    visits: PresenceSnapshotVisit[],
): Promise<OnlineVisit[]> {
    const visitIds = visits.map((visit) => visit.visitId).slice(0, 1000);
    const detailRows = db ? await loadVisitDetailRows(db, siteId, visitIds) : new Map<string, VisitDetailRow>();

    return Promise.all(
        visits.map(async (visit) => {
            const row = detailRows.get(visit.visitId);
            const ip = await revealIp(row, env, site);
            return {
                visitId: visit.visitId,
                startedAt: row?.first_seen_at ?? visit.startedAt,
                lastSeenAt: visit.lastSeenAt,
                tabs: visit.tabs,
                ip: ip.ip,
                ipStatus: ip.ipStatus,
                country: row?.country ?? null,
                region: row?.region ?? null,
                city: row?.city ?? null,
                referrer: row?.entry_referrer ?? null,
                pageCount: row?.page_count == null ? null : Number(row.page_count),
                trailHref: `/console/sites/${encodeURIComponent(siteId)}/visitors/${encodeURIComponent(visit.visitId)}`,
            } satisfies OnlineVisit;
        }),
    );
}

export async function getRealtimeDashboardData(
    env: Env,
    siteId: string,
    now: Date = new Date(),
): Promise<RealtimeDashboardData> {
    const site = env.DB ? await getSite(env.DB, siteId) : null;
    const generatedAt = now.toISOString();

    let currentOnline: RealtimeDashboardData["currentOnline"];
    try {
        const snapshot = await fetchPresenceSnapshot(env, siteId);
        currentOnline = {
            available: true,
            error: null,
            count: snapshot.online.length,
            visits: await enrichOnlineVisits(env, env.DB, site, siteId, snapshot.online),
        };
    } catch (error) {
        currentOnline = {
            available: false,
            error: error instanceof Error ? error.message : "Presence unavailable",
            count: 0,
            visits: [],
        };
    }

    let recentActive: RealtimeDashboardData["recentActive"];
    if (!env.DB) {
        recentActive = {
            available: false,
            error: "D1 DB is not configured",
            visits5m: null,
            visits30m: null,
        };
    } else {
        try {
            const [visits5m, visits30m] = await Promise.all([
                countActiveVisits(env.DB, siteId, 5, now),
                countActiveVisits(env.DB, siteId, 30, now),
            ]);
            recentActive = { available: true, error: null, visits5m, visits30m };
        } catch (error) {
            recentActive = {
                available: false,
                error: error instanceof Error ? error.message : "D1 active window unavailable",
                visits5m: null,
                visits30m: null,
            };
        }
    }

    return { siteId, generatedAt, currentOnline, recentActive };
}
