export type VisitEngagementInput = {
    siteId: string;
    visitId: string;
    clientPageviewId: string;
    visibleMs: number;
    occurredAt?: Date;
};

export type VisitEngagementResult =
    | { updated: true; deltaMs: number }
    | { updated: false; reason: "not-found" };

export type EngagementBucket = { bucket: string; visits: number };

export type EngagementOverview = {
    available: boolean;
    reason?: "db-unavailable" | "not-covered-yet" | "no-engagement";
    coverageStartedAt: string | null;
    visits: number;
    pageviews: number;
    averageDurationMs: number | null;
    averagePageDepth: number | null;
    durationBuckets: EngagementBucket[];
    depthBuckets: EngagementBucket[];
};

export type EngagementRange = {
    startDate: Date;
    endDate: Date;
};

type PageviewEngagementRow = {
    visible_ms: number | null;
};

type EngagementVisitRow = {
    visit_id: string;
    engaged_ms: number | null;
    page_count: number | null;
    engagement_started_at: string | null;
    engagement_updated_at: string | null;
};

const DURATION_BUCKETS = ["0-10s", "10-30s", "30-60s", "1-3m", "3-10m", "10m+"] as const;
const DEPTH_BUCKETS = ["1", "2", "3-5", "6-10", "10+"] as const;

function emptyBuckets(labels: readonly string[]): EngagementBucket[] {
    return labels.map((bucket) => ({ bucket, visits: 0 }));
}

function durationBucket(ms: number): (typeof DURATION_BUCKETS)[number] {
    const seconds = ms / 1000;
    if (seconds < 10) return "0-10s";
    if (seconds < 30) return "10-30s";
    if (seconds < 60) return "30-60s";
    if (seconds < 180) return "1-3m";
    if (seconds < 600) return "3-10m";
    return "10m+";
}

function depthBucket(pageCount: number): (typeof DEPTH_BUCKETS)[number] {
    if (pageCount <= 1) return "1";
    if (pageCount === 2) return "2";
    if (pageCount <= 5) return "3-5";
    if (pageCount <= 10) return "6-10";
    return "10+";
}

function incrementBucket(buckets: EngagementBucket[], bucket: string) {
    const row = buckets.find((candidate) => candidate.bucket === bucket);
    if (row) row.visits += 1;
}

export async function recordVisitEngagement(
    db: D1Database,
    input: VisitEngagementInput,
): Promise<VisitEngagementResult> {
    const pageview = await db
        .prepare(
            `SELECT visible_ms
             FROM pageviews
             WHERE site_id = ? AND visit_id = ? AND client_pageview_id = ?`,
        )
        .bind(input.siteId, input.visitId, input.clientPageviewId)
        .first<PageviewEngagementRow>();

    if (!pageview) {
        return { updated: false, reason: "not-found" };
    }

    const now = (input.occurredAt ?? new Date()).toISOString();
    const currentVisibleMs = Math.max(0, Number(pageview.visible_ms ?? 0));
    const incomingVisibleMs = Math.max(0, Math.floor(input.visibleMs));
    const nextVisibleMs = Math.max(currentVisibleMs, incomingVisibleMs);
    const deltaMs = Math.max(0, nextVisibleMs - currentVisibleMs);

    await db
        .prepare(
            `UPDATE pageviews
             SET visible_ms = MAX(visible_ms, ?),
                 last_engaged_at = ?,
                 engagement_flushes = engagement_flushes + 1
             WHERE site_id = ? AND visit_id = ? AND client_pageview_id = ?`,
        )
        .bind(nextVisibleMs, now, input.siteId, input.visitId, input.clientPageviewId)
        .run();

    if (deltaMs > 0) {
        await db
            .prepare(
                `UPDATE visits
                 SET engaged_ms = engaged_ms + ?,
                     last_seen_at = MAX(last_seen_at, ?),
                     updated_at = ?,
                     engagement_started_at = COALESCE(engagement_started_at, ?),
                     engagement_updated_at = ?
                 WHERE site_id = ? AND visit_id = ?`,
            )
            .bind(deltaMs, now, now, now, now, input.siteId, input.visitId)
            .run();
    }

    return { updated: true, deltaMs };
}

export async function getEngagementOverview(
    db: D1Database,
    siteId: string,
    range: EngagementRange,
): Promise<EngagementOverview> {
    const result = await db
        .prepare(
            `SELECT visit_id, engaged_ms, page_count, engagement_started_at, engagement_updated_at
             FROM visits
             WHERE site_id = ? AND first_seen_at >= ? AND first_seen_at < ?
             ORDER BY first_seen_at ASC`,
        )
        .bind(siteId, range.startDate.toISOString(), range.endDate.toISOString())
        .all<EngagementVisitRow>();

    const rows = result.results ?? [];
    const durationBuckets = emptyBuckets(DURATION_BUCKETS);
    const depthBuckets = emptyBuckets(DEPTH_BUCKETS);
    let pageviews = 0;
    let durationVisitCount = 0;
    let durationTotalMs = 0;
    let depthVisitCount = 0;
    let depthTotal = 0;
    let coverageStartedAt: string | null = null;

    for (const row of rows) {
        const pageCount = Math.max(0, Number(row.page_count ?? 0));
        pageviews += pageCount;

        if (pageCount > 0) {
            depthVisitCount += 1;
            depthTotal += pageCount;
            incrementBucket(depthBuckets, depthBucket(pageCount));
        }

        if (row.engagement_updated_at) {
            const engagedMs = Math.max(0, Number(row.engaged_ms ?? 0));
            durationVisitCount += 1;
            durationTotalMs += engagedMs;
            incrementBucket(durationBuckets, durationBucket(engagedMs));
        }

        if (
            row.engagement_started_at &&
            (coverageStartedAt === null || row.engagement_started_at < coverageStartedAt)
        ) {
            coverageStartedAt = row.engagement_started_at;
        }
    }

    const hasDuration = durationVisitCount > 0;
    const hasDepth = depthVisitCount > 0;

    return {
        available: hasDuration || hasDepth,
        ...(hasDuration || hasDepth ? {} : { reason: "no-engagement" as const }),
        coverageStartedAt,
        visits: rows.length,
        pageviews,
        averageDurationMs: hasDuration ? Math.round(durationTotalMs / durationVisitCount) : null,
        averagePageDepth: hasDepth ? depthTotal / depthVisitCount : null,
        durationBuckets,
        depthBuckets,
    };
}
