export type Site = {
    siteId: string;
    name: string;
    enabled: boolean;
    allowedHosts: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SiteInput = {
    siteId: string;
    name: string;
    enabled?: boolean;
    allowedHosts?: string | null;
};

export type SitePatch = {
    name?: string;
    enabled?: boolean;
    allowedHosts?: string | null;
};

type SiteRow = {
    site_id: string;
    name: string;
    enabled: number;
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
        allowedHosts: row.allowed_hosts,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

export async function listSites(db: D1Database): Promise<Site[]> {
    const result = await db
        .prepare(
            `SELECT site_id, name, enabled, allowed_hosts, created_at, updated_at
             FROM sites
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
        .prepare(
            `SELECT site_id, name, enabled, allowed_hosts, created_at, updated_at
             FROM sites WHERE site_id = ?`,
        )
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
    const allowedHosts =
        input.allowedHosts === undefined || input.allowedHosts === null
            ? null
            : input.allowedHosts.trim() || null;

    await db
        .prepare(
            `INSERT INTO sites (site_id, name, enabled, allowed_hosts, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(siteId, name, enabled, allowedHosts, ts, ts)
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
             SET name = ?, enabled = ?, allowed_hosts = ?, updated_at = ?
             WHERE site_id = ?`,
        )
        .bind(name, enabled ? 1 : 0, allowedHosts, ts, siteId)
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
    const result = await db
        .prepare(`DELETE FROM sites WHERE site_id = ?`)
        .bind(siteId)
        .run();

    // D1 meta.changes may be undefined in some mocks; ignore if missing
    if (result.meta?.changes === 0) {
        throw new Error(`Site not found: ${siteId}`);
    }
}
