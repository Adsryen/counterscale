import type { Site } from "~/lib/sites";

export type MultisiteMetricInput = {
    siteId: string;
    views: number;
    visitors: number;
    bounces: number;
    lastSeenAt: string | null;
};

export type MultisiteSummaryStatus =
    | "active"
    | "waiting"
    | "disabled"
    | "metrics-unavailable";

export type MultisiteSummaryRow = {
    siteId: string;
    name: string;
    enabled: boolean;
    publicStats: boolean;
    recordIp: boolean;
    ipRetentionDays: number;
    allowedHosts: string | null;
    createdAt: string;
    updatedAt: string;
    inRegistry: boolean;
    views: number | null;
    visitors: number | null;
    bounces: number | null;
    bounceRate: number | null;
    lastSeenAt: string | null;
    status: MultisiteSummaryStatus;
};

export type BuildMultisiteSummaryInput = {
    registry: Site[];
    metrics: MultisiteMetricInput[];
    metricsUnavailable?: boolean;
    visibleSiteIds?: Set<string>;
    limit?: number;
};

const AE_ONLY_DEFAULTS = {
    enabled: true,
    publicStats: true,
    recordIp: true,
    ipRetentionDays: 60,
    allowedHosts: null,
    createdAt: "",
    updatedAt: "",
};

function calculateBounceRate(
    bounces: number | null,
    visitors: number | null,
): number | null {
    if (bounces === null || visitors === null || visitors <= 0) {
        return null;
    }
    return bounces / visitors;
}

function statusFor(input: {
    enabled: boolean;
    metricsUnavailable: boolean;
    views: number | null;
    lastSeenAt: string | null;
}): MultisiteSummaryStatus {
    if (!input.enabled) {
        return "disabled";
    }
    if (input.metricsUnavailable) {
        return "metrics-unavailable";
    }
    if ((input.views ?? 0) > 0 || input.lastSeenAt) {
        return "active";
    }
    return "waiting";
}

function statusSort(status: MultisiteSummaryStatus): number {
    switch (status) {
        case "active":
            return 0;
        case "disabled":
            return 1;
        case "waiting":
            return 2;
        case "metrics-unavailable":
            return 3;
    }
}

export function buildMultisiteSummary({
    registry,
    metrics,
    metricsUnavailable = false,
    visibleSiteIds,
    limit,
}: BuildMultisiteSummaryInput): MultisiteSummaryRow[] {
    const registryById = new Map(registry.map((site) => [site.siteId, site]));
    const metricsById = new Map(
        metrics
            .filter((row) => row.siteId)
            .map((row) => [row.siteId, row] as const),
    );
    const ids = new Set<string>([
        ...registry.map((site) => site.siteId),
        ...metrics.map((row) => row.siteId).filter(Boolean),
    ]);

    const rows = Array.from(ids)
        .filter((siteId) => !visibleSiteIds || visibleSiteIds.has(siteId))
        .map((siteId): MultisiteSummaryRow => {
            const site = registryById.get(siteId);
            const metric = metricsById.get(siteId);
            const base = site ?? {
                siteId,
                name: siteId,
                ...AE_ONLY_DEFAULTS,
            };
            const views = metricsUnavailable ? null : (metric?.views ?? 0);
            const visitors = metricsUnavailable ? null : (metric?.visitors ?? 0);
            const bounces = metricsUnavailable ? null : (metric?.bounces ?? 0);
            const lastSeenAt = metricsUnavailable
                ? null
                : (metric?.lastSeenAt ?? null);
            const status = statusFor({
                enabled: base.enabled,
                metricsUnavailable,
                views,
                lastSeenAt,
            });

            return {
                siteId,
                name: base.name,
                enabled: base.enabled,
                publicStats: base.publicStats,
                recordIp: base.recordIp,
                ipRetentionDays: base.ipRetentionDays,
                allowedHosts: base.allowedHosts,
                createdAt: base.createdAt,
                updatedAt: base.updatedAt,
                inRegistry: Boolean(site),
                views,
                visitors,
                bounces,
                bounceRate: calculateBounceRate(bounces, visitors),
                lastSeenAt,
                status,
            };
        });

    rows.sort((a, b) => {
        const aHasData = (a.views ?? 0) > 0;
        const bHasData = (b.views ?? 0) > 0;
        if (aHasData !== bHasData) {
            return aHasData ? -1 : 1;
        }
        if (aHasData && bHasData && a.views !== b.views) {
            return (b.views ?? 0) - (a.views ?? 0);
        }
        const statusDelta = statusSort(a.status) - statusSort(b.status);
        if (statusDelta !== 0) {
            return statusDelta;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return typeof limit === "number" ? rows.slice(0, limit) : rows;
}
