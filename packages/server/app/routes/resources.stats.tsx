import type { LoaderFunctionArgs } from "react-router";
import {
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { SearchFilters } from "~/lib/types";
import { useLocale } from "~/i18n/LocaleContext";
import { ChartShell } from "~/components/analytics/ChartShell";
import { MetricTile } from "~/components/analytics/MetricTile";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import {
    buildComparisonWindows,
    calculateMetricComparison,
    isWindowCovered,
    type MetricComparison,
} from "~/analytics/comparison";
import type { AnalyticsCountResult } from "~/analytics/query";

function bounceRateForCounts(counts: AnalyticsCountResult) {
    return counts.visitors > 0 ? counts.bounces / counts.visitors : undefined;
}

function hasSufficientBounceCoverage(
    earliestEvent: Date | null,
    earliestBounce: Date | null,
    windowStart: Date,
) {
    return (
        earliestBounce !== null &&
        earliestEvent !== null &&
        (earliestEvent.getTime() === earliestBounce.getTime() ||
            earliestBounce.getTime() <= windowStart.getTime())
    );
}

export async function loader({ context, request }: LoaderFunctionArgs) {
    const { analyticsEngine } = context;
    const urlForSite = new URL(request.url);
    const siteForAccess =
        urlForSite.searchParams.get("site") ||
        paramsFromUrl(request.url).site ||
        "";
    await assertCanViewSiteStats(
        request,
        context.cloudflare.env,
        siteForAccess === "@unknown" ? "" : siteForAccess,
    );
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    const windows = buildComparisonWindows(interval, tz);

    // intentionally parallelize queries by deferring await
    const earliestEvents = analyticsEngine.getEarliestEvents(site);
    const currentCountsPromise = analyticsEngine.getCountsForDateRange(
        site,
        windows.current.startDate,
        windows.current.endDate,
        tz,
        filters,
    );
    const previousCountsPromise = analyticsEngine.getCountsForDateRange(
        site,
        windows.previous.startDate,
        windows.previous.endDate,
        tz,
        filters,
    );
    const counts = await currentCountsPromise;

    const { earliestEvent, earliestBounce } = await earliestEvents;

    // FOR BACKWARDS COMPAT, ONLY SHOW BOUNCE RATE IF WE HAVE DATE FOR THE ENTIRE QUERY PERIOD
    const hasSufficientBounceData = hasSufficientBounceCoverage(
        earliestEvent,
        earliestBounce,
        windows.current.startDate,
    );
    const hasSufficientPreviousBounceData = hasSufficientBounceCoverage(
        earliestEvent,
        earliestBounce,
        windows.previous.startDate,
    );

    const bounceRate = bounceRateForCounts(counts);
    const previousCounts = await previousCountsPromise;
    const previousBounceRate = bounceRateForCounts(previousCounts);

    const previous = {
        views: calculateMetricComparison(counts.views, previousCounts.views),
        visitors: calculateMetricComparison(
            counts.visitors,
            previousCounts.visitors,
        ),
        bounceRate: calculateMetricComparison(
            bounceRate,
            previousBounceRate,
            hasSufficientBounceData && hasSufficientPreviousBounceData
                ? undefined
                : "insufficient-bounce-coverage",
        ),
    };

    const yearOverYearCovered = isWindowCovered(
        earliestEvent,
        windows.yearOverYear,
    );
    const yearOverYear = yearOverYearCovered
        ? await (async () => {
              const hasSufficientYearOverYearBounceData =
                  hasSufficientBounceCoverage(
                      earliestEvent,
                      earliestBounce,
                      windows.yearOverYear.startDate,
                  );
              const yoyCounts = await analyticsEngine.getCountsForDateRange(
                  site,
                  windows.yearOverYear.startDate,
                  windows.yearOverYear.endDate,
                  tz,
                  filters,
              );
              const yoyBounceRate = bounceRateForCounts(yoyCounts);

              return {
                  available: true,
                  views: calculateMetricComparison(counts.views, yoyCounts.views),
                  visitors: calculateMetricComparison(
                      counts.visitors,
                      yoyCounts.visitors,
                  ),
                  bounceRate: calculateMetricComparison(
                      bounceRate,
                      yoyBounceRate,
                      hasSufficientBounceData &&
                          hasSufficientYearOverYearBounceData
                          ? undefined
                          : "insufficient-bounce-coverage",
                  ),
              };
          })()
        : {
              available: false,
              reason: "insufficient-history" as const,
          };

    return {
        views: counts.views,
        visitors: counts.visitors,
        bounceRate: bounceRate,
        hasSufficientBounceData,
        comparisons: {
            previous,
            yearOverYear,
        },
    };
}

function formatComparisonDelta(
    comparison: MetricComparison | undefined,
    t: (key: string) => string,
) {
    if (!comparison) return undefined;

    if (comparison.status === "unavailable") {
        return t("console.overview.compareUnavailable");
    }

    if (comparison.status === "new") {
        return t("console.overview.compareNew");
    }

    if (comparison.status === "cleared") {
        return t("console.overview.compareCleared");
    }

    if (comparison.status === "flat") {
        return t("console.overview.compareFlat");
    }

    if (comparison.percentDelta === null) {
        return t("console.overview.compareUnavailable");
    }

    const sign = comparison.percentDelta > 0 ? "+" : "";
    return `${sign}${Math.round(comparison.percentDelta * 100)}%`;
}

export const StatsCard = ({
    siteId,
    interval,
    filters,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    timezone: string;
}) => {
    const dataFetcher = useFetcher<typeof loader>();
    const { t } = useLocale();

    const { views, visitors, bounceRate, hasSufficientBounceData, comparisons } =
        dataFetcher.data || {};
    const countFormatter = Intl.NumberFormat("zh-CN", { notation: "compact" });

    useEffect(() => {
        const params = new URLSearchParams({
            site: siteId,
            interval,
            timezone,
        });

        Object.entries(filters ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
                params.set(key, value);
            }
        });

        dataFetcher.submit(params, {
            method: "get",
            action: `/resources/stats`,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const loading = dataFetcher.state !== "idle" && !dataFetcher.data;

    return (
        <ChartShell
            eyebrow={t("console.overview.last7d")}
            title={t("console.overview.metricsSnapshot")}
            description={t("console.overview.metricsSnapshotDesc")}
            loading={dataFetcher.state !== "idle"}
            contentClassName="p-4 sm:p-5"
        >
            <div className="grid gap-3 md:grid-cols-3">
                <MetricTile
                    label={t("metrics.uv")}
                    value={visitors ? countFormatter.format(visitors) : "—"}
                    hint={t("console.overview.uniqueVisitorsHint")}
                    delta={formatComparisonDelta(
                        comparisons?.previous.visitors,
                        t,
                    )}
                    tone="live"
                    loading={loading}
                />
                <MetricTile
                    label={t("metrics.pv")}
                    value={views ? countFormatter.format(views) : "—"}
                    hint={t("console.overview.pageviewsHint")}
                    delta={formatComparisonDelta(
                        comparisons?.previous.views,
                        t,
                    )}
                    tone="primary"
                    loading={loading}
                />
                <MetricTile
                    label={t("metrics.bounce")}
                    value={
                        hasSufficientBounceData
                            ? bounceRate !== undefined
                                ? `${Math.round(bounceRate * 100)}%`
                                : "—"
                            : "n/a"
                    }
                    hint={t("console.overview.bounceHint")}
                    delta={formatComparisonDelta(
                        comparisons?.previous.bounceRate,
                        t,
                    )}
                    tone="heat"
                    loading={loading}
                />
            </div>
        </ChartShell>
    );
};
