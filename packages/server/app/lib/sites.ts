export type Site = {
    siteId: string;
    name: string;
    enabled: boolean;
    /** When true, anonymous users may view this site on /dashboard */
    publicStats: boolean;
    /** When true, store encrypted raw IP detail for new visits. */
    recordIp: boolean;
    /** Raw IP/detail retention window in days. */
    ipRetentionDays: number;
    allowedHosts: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SiteInput = {
    siteId: string;
    name: string;
    enabled?: boolean;
    publicStats?: boolean;
    recordIp?: boolean;
    ipRetentionDays?: number;
    allowedHosts?: string | null;
};

export type SitePatch = {
    name?: string;
    enabled?: boolean;
    publicStats?: boolean;
    recordIp?: boolean;
    ipRetentionDays?: number;
    allowedHosts?: string | null;
};

type SiteRow = {
    site_id: string;
    name: string;
    enabled: number;
    public_stats?: number | null;
    record_ip?: number | null;
    ip_retention_days?: number | null;
    allowed_hosts: string | null;
    created_at: string;
    updated_at: string;
};

/** Same rules as install snippet generator: letters, digits, . _ - */
export function isValidSiteId(raw: string): boolean {
    return /^[a-zA-Z0-9._-]+$/.test(raw.trim());
}

export function sanitizeSiteId(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    return trimmed.replace(/[^a-zA-Z0-9._-]/g, "");
}

function rowToSite(row: SiteRow): Site {
    return {
        siteId: row.site_id,
        name: row.name,
        enabled: row.enabled === 1,
        // Default public when column missing (pre-migration rows)
        publicStats: row.public_stats === undefined || row.public_stats === null
            ? true
            : row.public_stats === 1,
        // Default enabled for pre-0003 rows so existing sites start collecting IP detail.
        recordIp: row.record_ip === undefined || row.record_ip === null
            ? true
            : row.record_ip === 1,
        ipRetentionDays: normalizeIpRetentionDays(row.ip_retention_days),
        allowedHosts: row.allowed_hosts,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

export const DEFAULT_IP_RETENTION_DAYS = 60;
export const MIN_IP_RETENTION_DAYS = 1;
export const MAX_IP_RETENTION_DAYS = 365;

export function normalizeIpRetentionDays(value: unknown): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_IP_RETENTION_DAYS;
    }
    const n = typeof value === "number" ? value : Number(value);
    if (
        !Number.isInteger(n) ||
        n < MIN_IP_RETENTION_DAYS ||
        n > MAX_IP_RETENTION_DAYS
    ) {
        throw new Error(
            `IP retention days must be an integer between ${MIN_IP_RETENTION_DAYS} and ${MAX_IP_RETENTION_DAYS}`,
        );
    }
    return n;
}

const SITE_SELECT = `SELECT site_id, name, enabled, public_stats, record_ip, ip_retention_days, allowed_hosts, created_at, updated_at
             FROM sites`;

export async function listSites(db: D1Database): Promise<Site[]> {
    const result = await db
        .prepare(
            `${SITE_SELECT}
             ORDER BY name COLLATE NOCASE ASC`,
        )
        .all<SiteRow>();

    return (result.results ?? []).map(rowToSite);
}

export async function listPublicSites(db: D1Database): Promise<Site[]> {
    const result = await db
        .prepare(
            `${SITE_SELECT}
             WHERE public_stats = 1 AND enabled = 1
             ORDER BY name COLLATE NOCASE ASC`,
        )
        .all<SiteRow>();

    return (result.results ?? []).map(rowToSite);
}

export async function getSite(
    db: D1Database,
    siteId: string,
): Promise<Site | null> {
    const row = await db
        .prepare(`${SITE_SELECT} WHERE site_id = ?`)
        .bind(siteId)
        .first<SiteRow>();

    return row ? rowToSite(row) : null;
}

export async function createSite(
    db: D1Database,
    input: SiteInput,
): Promise<Site> {
    const rawId = input.siteId.trim();
    const name = input.name.trim();

    if (!rawId || !isValidSiteId(rawId)) {
        throw new Error(
            "Invalid siteId: use letters, numbers, '.', '_' or '-' only",
        );
    }
    if (!name) {
        throw new Error("Name is required");
    }

    const siteId = sanitizeSiteId(rawId);
    const existing = await getSite(db, siteId);
    if (existing) {
        throw new Error(`Site already exists: ${siteId}`);
    }

    const ts = nowIso();
    const enabled = input.enabled === false ? 0 : 1;
    // Default: public (anonymous dashboard), matching upstream open analytics
    const publicStats = input.publicStats === false ? 0 : 1;
    // Default: enabled because this single-admin analytics product is expected to collect detail unless explicitly disabled.
    const recordIp = input.recordIp === false ? 0 : 1;
    const ipRetentionDays = normalizeIpRetentionDays(input.ipRetentionDays);
    const allowedHosts =
        input.allowedHosts === undefined || input.allowedHosts === null
            ? null
            : input.allowedHosts.trim() || null;

    await db
        .prepare(
            `INSERT INTO sites (site_id, name, enabled, public_stats, record_ip, ip_retention_days, allowed_hosts, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            siteId,
            name,
            enabled,
            publicStats,
            recordIp,
            ipRetentionDays,
            allowedHosts,
            ts,
            ts,
        )
        .run();

    const created = await getSite(db, siteId);
    if (!created) {
        throw new Error("Failed to read site after create");
    }
    return created;
}

export async function updateSite(
    db: D1Database,
    siteId: string,
    patch: SitePatch,
): Promise<Site> {
    const current = await getSite(db, siteId);
    if (!current) {
        throw new Error(`Site not found: ${siteId}`);
    }

    const name =
        patch.name !== undefined ? patch.name.trim() : current.name;
    if (!name) {
        throw new Error("Name is required");
    }

    const enabled =
        patch.enabled !== undefined ? patch.enabled : current.enabled;
    const publicStats =
        patch.publicStats !== undefined
            ? patch.publicStats
            : current.publicStats;
    const recordIp =
        patch.recordIp !== undefined ? patch.recordIp : current.recordIp;
    const ipRetentionDays =
        patch.ipRetentionDays !== undefined
            ? normalizeIpRetentionDays(patch.ipRetentionDays)
            : current.ipRetentionDays;
    const allowedHosts =
        patch.allowedHosts !== undefined
            ? patch.allowedHosts === null
                ? null
                : patch.allowedHosts.trim() || null
            : current.allowedHosts;

    const ts = nowIso();
    await db
        .prepare(
            `UPDATE sites
             SET name = ?, enabled = ?, public_stats = ?, record_ip = ?, ip_retention_days = ?, allowed_hosts = ?, updated_at = ?
             WHERE site_id = ?`,
        )
        .bind(
            name,
            enabled ? 1 : 0,
            publicStats ? 1 : 0,
            recordIp ? 1 : 0,
            ipRetentionDays,
            allowedHosts,
            ts,
            siteId,
        )
        .run();

    const updated = await getSite(db, siteId);
    if (!updated) {
        throw new Error("Failed to read site after update");
    }
    return updated;
}

export async function deleteSite(
    db: D1Database,
    siteId: string,
): Promise<void> {
    // Visit details intentionally allow AE-discovered sites without a registry row;
    // clean them explicitly when a registry site is removed.
    try {
        await db.prepare(`DELETE FROM visits WHERE site_id = ?`).bind(siteId).run();
    } catch {
        // Pre-0003 databases may not have visit details yet.
    }

    const result = await db
        .prepare(`DELETE FROM sites WHERE site_id = ?`)
        .bind(siteId)
        .run();

    // D1 meta.changes may be undefined in some mocks; ignore if missing
    if (result.meta?.changes === 0) {
        throw new Error(`Site not found: ${siteId}`);
    }
}
