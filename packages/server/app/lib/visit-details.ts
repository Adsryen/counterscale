import type { CollectIdentityScope } from "../analytics/collect";
import type { EncryptedIpAddress } from "./ip-crypto";
import { DEFAULT_IP_RETENTION_DAYS } from "./sites";

export type VisitGeoInput = {
    country?: string;
    region?: string;
    city?: string;
    regionCode?: string;
    latitude?: number;
    longitude?: number;
};

export type VisitPageviewInput = VisitGeoInput & {
    siteId: string;
    visitId: string;
    visitorId?: string;
    tabId?: string;
    identityScope?: CollectIdentityScope;
    clientTime?: number;
    occurredAt?: Date;
    retentionDays?: number;
    host?: string;
    path?: string;
    referrer?: string;
    userAgent?: string;
    encryptedIp?: EncryptedIpAddress;
};

type VisitExistsRow = { visit_id: string };

function addDays(date: Date, days: number): Date {
    const copy = new Date(date.getTime());
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
}

function randomId(prefix: string): string {
    if (typeof crypto.randomUUID === "function") {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `${prefix}_${Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;
}

export function createSyntheticVisitId(): string {
    return randomId("legacy_visit");
}

export async function visitExists(
    db: D1Database,
    siteId: string,
    visitId: string,
): Promise<boolean> {
    const existing = await db
        .prepare(
            `SELECT visit_id
             FROM visits
             WHERE site_id = ? AND visit_id = ?`,
        )
        .bind(siteId, visitId)
        .first<VisitExistsRow>();
    return !!existing;
}

export async function recordVisitAndPageview(
    db: D1Database,
    input: VisitPageviewInput,
): Promise<{ visitCreated: boolean; pageviewId: string }> {
    const occurredAt = input.occurredAt ?? new Date();
    const now = occurredAt.toISOString();
    const retentionDays = input.retentionDays ?? DEFAULT_IP_RETENTION_DAYS;
    const expiresAt = addDays(occurredAt, retentionDays).toISOString();

    const visitCreated = !(await visitExists(db, input.siteId, input.visitId));

    if (visitCreated) {
        const ip = input.encryptedIp;
        await db
            .prepare(
                `INSERT INTO visits (
                    site_id, visit_id, visitor_id, identity_scope,
                    first_seen_at, last_seen_at, expires_at,
                    entry_host, entry_path, entry_referrer,
                    country, region, city, region_code, latitude, longitude,
                    user_agent,
                    ip_family, ip_ciphertext, ip_nonce, ip_key_version, ip_hmac,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                input.siteId,
                input.visitId,
                input.visitorId ?? null,
                input.identityScope ?? null,
                now,
                now,
                expiresAt,
                input.host ?? null,
                input.path ?? null,
                input.referrer ?? null,
                input.country ?? null,
                input.region ?? null,
                input.city ?? null,
                input.regionCode ?? null,
                input.latitude ?? null,
                input.longitude ?? null,
                input.userAgent ?? null,
                ip?.family ?? null,
                ip?.ciphertext ?? null,
                ip?.nonce ?? null,
                ip?.keyVersion ?? null,
                ip?.ipHmac ?? null,
                now,
                now,
            )
            .run();

        if (ip) {
            for (const prefix of ip.prefixes) {
                await db
                    .prepare(
                        `INSERT INTO visit_ip_prefixes (
                            site_id, visit_id, prefix_length, prefix_token, created_at
                        ) VALUES (?, ?, ?, ?, ?)`,
                    )
                    .bind(
                        input.siteId,
                        input.visitId,
                        prefix.prefixLength,
                        prefix.token,
                        now,
                    )
                    .run();
            }
        }
    } else {
        await db
            .prepare(
                `UPDATE visits
                 SET last_seen_at = ?, updated_at = ?
                 WHERE site_id = ? AND visit_id = ?`,
            )
            .bind(now, now, input.siteId, input.visitId)
            .run();
    }

    const pageviewId = randomId("pv");
    await db
        .prepare(
            `INSERT INTO pageviews (
                pageview_id, site_id, visit_id, tab_id,
                occurred_at, client_time, host, path, referrer,
                country, region, city, region_code, latitude, longitude,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            pageviewId,
            input.siteId,
            input.visitId,
            input.tabId ?? null,
            now,
            input.clientTime ?? null,
            input.host ?? null,
            input.path ?? null,
            input.referrer ?? null,
            input.country ?? null,
            input.region ?? null,
            input.city ?? null,
            input.regionCode ?? null,
            input.latitude ?? null,
            input.longitude ?? null,
            now,
        )
        .run();

    return { visitCreated, pageviewId };
}

export async function deleteExpiredVisitDetails(
    db: D1Database,
    now: Date = new Date(),
    limit = 500,
): Promise<number> {
    const result = await db
        .prepare(
            `DELETE FROM visits
             WHERE rowid IN (
                 SELECT rowid
                 FROM visits
                 WHERE expires_at <= ?
                 ORDER BY expires_at ASC
                 LIMIT ?
             )`,
        )
        .bind(now.toISOString(), limit)
        .run();
    return result.meta?.changes ?? 0;
}

type VisitSummaryRow = {
    site_id: string;
    visit_id: string;
    visitor_id: string | null;
    first_seen_at: string;
    last_seen_at: string;
    entry_host: string | null;
    entry_path: string | null;
    entry_referrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    ip_family: number | null;
    ip_ciphertext: string | null;
    ip_nonce: string | null;
    ip_key_version: number | null;
    ip_hmac: string | null;
};

export type VisitSummary = {
    siteId: string;
    visitId: string;
    visitorId: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    entryHost: string | null;
    entryPath: string | null;
    entryReferrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    ipFamily: number | null;
    ipCiphertext: string | null;
    ipNonce: string | null;
    ipKeyVersion: number | null;
    ipHmac: string | null;
};

function rowToVisitSummary(row: VisitSummaryRow): VisitSummary {
    return {
        siteId: row.site_id,
        visitId: row.visit_id,
        visitorId: row.visitor_id,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        entryHost: row.entry_host,
        entryPath: row.entry_path,
        entryReferrer: row.entry_referrer,
        country: row.country,
        region: row.region,
        city: row.city,
        ipFamily: row.ip_family,
        ipCiphertext: row.ip_ciphertext,
        ipNonce: row.ip_nonce,
        ipKeyVersion: row.ip_key_version,
        ipHmac: row.ip_hmac,
    };
}

export async function listVisitSummaries(
    db: D1Database,
    siteId: string,
    limit = 50,
    offset = 0,
): Promise<VisitSummary[]> {
    const result = await db
        .prepare(
            `SELECT site_id, visit_id, visitor_id, first_seen_at, last_seen_at,
                    entry_host, entry_path, entry_referrer,
                    country, region, city,
                    ip_family, ip_ciphertext, ip_nonce, ip_key_version, ip_hmac
             FROM visits
             WHERE site_id = ?
             ORDER BY last_seen_at DESC
             LIMIT ? OFFSET ?`,
        )
        .bind(siteId, limit, offset)
        .all<VisitSummaryRow>();
    return (result.results ?? []).map(rowToVisitSummary);
}

type PageviewRow = {
    pageview_id: string;
    tab_id: string | null;
    occurred_at: string;
    client_time: number | null;
    host: string | null;
    path: string | null;
    referrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
};

export type VisitPageview = {
    pageviewId: string;
    tabId: string | null;
    occurredAt: string;
    clientTime: number | null;
    host: string | null;
    path: string | null;
    referrer: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
};

function rowToPageview(row: PageviewRow): VisitPageview {
    return {
        pageviewId: row.pageview_id,
        tabId: row.tab_id,
        occurredAt: row.occurred_at,
        clientTime: row.client_time,
        host: row.host,
        path: row.path,
        referrer: row.referrer,
        country: row.country,
        region: row.region,
        city: row.city,
    };
}

export async function getVisitSummary(
    db: D1Database,
    siteId: string,
    visitId: string,
): Promise<VisitSummary | null> {
    const row = await db
        .prepare(
            `SELECT site_id, visit_id, visitor_id, first_seen_at, last_seen_at,
                    entry_host, entry_path, entry_referrer,
                    country, region, city,
                    ip_family, ip_ciphertext, ip_nonce, ip_key_version, ip_hmac
             FROM visits
             WHERE site_id = ? AND visit_id = ?`,
        )
        .bind(siteId, visitId)
        .first<VisitSummaryRow>();
    return row ? rowToVisitSummary(row) : null;
}

export async function listVisitPageviews(
    db: D1Database,
    siteId: string,
    visitId: string,
): Promise<VisitPageview[]> {
    const result = await db
        .prepare(
            `SELECT pageview_id, tab_id, occurred_at, client_time, host, path,
                    referrer, country, region, city
             FROM pageviews
             WHERE site_id = ? AND visit_id = ?
             ORDER BY occurred_at ASC`,
        )
        .bind(siteId, visitId)
        .all<PageviewRow>();
    return (result.results ?? []).map(rowToPageview);
}
