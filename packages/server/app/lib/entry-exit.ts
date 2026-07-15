import type { SearchFilters } from "./types";

export const UNKNOWN_PATH_LABEL = "(unknown)";

export type EntryExitPageRow = [
    path: string,
    sessions: number,
    views: number,
];

export type EntryExitPageSummary = {
    available: boolean;
    reason: "db-unavailable" | null;
    countsByProperty: EntryExitPageRow[];
};

export type EntryExitDateRange = {
    startDate: Date;
    endDate: Date;
};

type EntryExitSqlRow = {
    path: string | null;
    sessions: number | string;
    views: number | string | null;
};

function normalizePath(path: string | null | undefined) {
    return path?.trim() || UNKNOWN_PATH_LABEL;
}

function rowToEntryExitPageRow(row: EntryExitSqlRow): EntryExitPageRow {
    return [normalizePath(row.path), Number(row.sessions), Number(row.views ?? 0)];
}

function sortRows(rows: EntryExitPageRow[]) {
    return [...rows].sort((a, b) => {
        const sessionsDelta = b[1] - a[1];
        if (sessionsDelta !== 0) return sessionsDelta;
        if (a[0] === UNKNOWN_PATH_LABEL && b[0] !== UNKNOWN_PATH_LABEL) return 1;
        if (b[0] === UNKNOWN_PATH_LABEL && a[0] !== UNKNOWN_PATH_LABEL) return -1;
        return a[0].localeCompare(b[0]);
    });
}

function rangeBinds(siteId: string, range: EntryExitDateRange, filters: SearchFilters) {
    const binds = [
        siteId,
        range.startDate.toISOString(),
        range.endDate.toISOString(),
    ];
    if (filters.path) {
        binds.push(filters.path);
    }
    return binds;
}

export async function getEntryPageSummary(
    db: D1Database,
    siteId: string,
    range: EntryExitDateRange,
    filters: SearchFilters = {},
): Promise<EntryExitPageSummary> {
    const pathFilterSql = filters.path
        ? "AND COALESCE(NULLIF(TRIM(v.entry_path), ''), ?) = ?"
        : "";
    const binds = rangeBinds(siteId, range, filters);
    const sqlBinds = filters.path
        ? [binds[0], binds[1], binds[2], UNKNOWN_PATH_LABEL, binds[3]]
        : binds;

    const result = await db
        .prepare(
            `SELECT
                COALESCE(NULLIF(TRIM(v.entry_path), ''), '${UNKNOWN_PATH_LABEL}') AS path,
                COUNT(DISTINCT v.visit_id) AS sessions,
                COUNT(p.pageview_id) AS views
             FROM visits v
             LEFT JOIN pageviews p
                ON p.site_id = v.site_id
               AND p.visit_id = v.visit_id
               AND COALESCE(NULLIF(TRIM(p.path), ''), '${UNKNOWN_PATH_LABEL}') =
                   COALESCE(NULLIF(TRIM(v.entry_path), ''), '${UNKNOWN_PATH_LABEL}')
               AND p.occurred_at >= ?
               AND p.occurred_at < ?
             WHERE v.site_id = ?
               AND v.first_seen_at >= ?
               AND v.first_seen_at < ?
               ${pathFilterSql}
             GROUP BY path
             ORDER BY sessions DESC, path ASC
             LIMIT 10`,
        )
        .bind(
            range.startDate.toISOString(),
            range.endDate.toISOString(),
            ...sqlBinds,
        )
        .all<EntryExitSqlRow>();

    return {
        available: true,
        reason: null,
        countsByProperty: sortRows(
            (result.results ?? []).map(rowToEntryExitPageRow),
        ),
    };
}

export async function getExitPageSummary(
    db: D1Database,
    siteId: string,
    range: EntryExitDateRange,
    filters: SearchFilters = {},
): Promise<EntryExitPageSummary> {
    // Qualify path as exit_path so GROUP BY / ORDER BY cannot collide with
    // pageviews.path after the LEFT JOIN (SQLite: "ambiguous column name: path").
    const pathExpr = `COALESCE(NULLIF(TRIM(f.path), ''), '${UNKNOWN_PATH_LABEL}')`;
    const pathFilterSql = filters.path
        ? `WHERE COALESCE(NULLIF(TRIM(ep.path), ''), ?) = ?`
        : "";
    const binds = rangeBinds(siteId, range, filters);
    const sqlBinds = filters.path
        ? [binds[0], binds[1], binds[2], UNKNOWN_PATH_LABEL, binds[3]]
        : binds;

    const result = await db
        .prepare(
            `WITH ranked_pageviews AS (
                SELECT
                    site_id,
                    visit_id,
                    path,
                    occurred_at,
                    created_at,
                    pageview_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY site_id, visit_id
                        ORDER BY occurred_at DESC, created_at DESC, pageview_id DESC
                    ) AS rn
                FROM pageviews
                WHERE site_id = ?
                  AND occurred_at >= ?
                  AND occurred_at < ?
             ),
             exit_pageviews AS (
                SELECT site_id, visit_id, path
                FROM ranked_pageviews
                WHERE rn = 1
             ),
             filtered_exit_pageviews AS (
                SELECT ep.site_id, ep.visit_id, ep.path
                FROM exit_pageviews ep
                ${pathFilterSql}
             )
             SELECT
                ${pathExpr} AS path,
                COUNT(DISTINCT f.visit_id) AS sessions,
                COUNT(p.pageview_id) AS views
             FROM filtered_exit_pageviews f
             LEFT JOIN pageviews p
                ON p.site_id = f.site_id
               AND p.visit_id = f.visit_id
               AND COALESCE(NULLIF(TRIM(p.path), ''), '${UNKNOWN_PATH_LABEL}') =
                   ${pathExpr}
               AND p.occurred_at >= ?
               AND p.occurred_at < ?
             GROUP BY ${pathExpr}
             ORDER BY sessions DESC, ${pathExpr} ASC
             LIMIT 10`,
        )
        .bind(
            ...sqlBinds,
            range.startDate.toISOString(),
            range.endDate.toISOString(),
        )
        .all<EntryExitSqlRow>();

    return {
        available: true,
        reason: null,
        countsByProperty: sortRows(
            (result.results ?? []).map(rowToEntryExitPageRow),
        ),
    };
}

export function unavailableEntryExitSummary(): EntryExitPageSummary {
    return {
        available: false,
        reason: "db-unavailable",
        countsByProperty: [],
    };
}
