import type { LoaderFunctionArgs } from "react-router";
import {
    getFiltersFromSearchParams,
    paramsFromUrl,
    getIntervalType,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import TimeSeriesChart from "~/components/TimeSeriesChart";
import { SearchFilters } from "~/lib/types";
import type { ViewsGroupedByInterval } from "~/analytics/query";
import { assertCanViewSiteStats } from "~/lib/siteAccess";
import { ChartShell } from "~/components/analytics/ChartShell";
import { useLocale } from "~/i18n/LocaleContext";
import { buildComparisonWindows } from "~/analytics/comparison";

type TrendChartPoint = {
    date: string;
    views: number;
    visitors: number;
    bounceRate: number;
    previousViews?: number;
    previousVisitors?: number;
    previousBounceRate?: number;
};

function countsToBounceRate({
    visitors,
    bounces,
}: {
    visitors: number;
    bounces: number;
}) {
    return Math.floor((visitors > 0 ? bounces / visitors : 0) * 100);
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

export async function loader({
    context,
    request,
}: LoaderFunctionArgs) {

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

    const intervalType = getIntervalType(interval);
    const windows = buildComparisonWindows(interval, tz);

    const currentRowsPromise: Promise<ViewsGroupedByInterval> =
        analyticsEngine.getViewsGroupedByInterval(
            site,
            intervalType,
            windows.current.startDate,
            windows.current.endDate,
            tz,
            filters,
        );
    const previousRowsPromise: Promise<ViewsGroupedByInterval> =
        analyticsEngine.getViewsGroupedByInterval(
            site,
            intervalType,
            windows.previous.startDate,
            windows.previous.endDate,
            tz,
            filters,
        );
    const earliestEventsPromise = analyticsEngine.getEarliestEvents(site);

    const [
        viewsGroupedByInterval,
        previousGroupedByInterval,
        { earliestEvent, earliestBounce },
    ] = await Promise.all([
        currentRowsPromise,
        previousRowsPromise,
        earliestEventsPromise,
    ]);
    const hasSufficientPreviousBounceData = hasSufficientBounceCoverage(
        earliestEvent,
        earliestBounce,
        windows.previous.startDate,
    );

    const chartData: TrendChartPoint[] = [];
    viewsGroupedByInterval.forEach((row, index) => {
        const { views, visitors, bounces } = row[1];
        const previousCounts = previousGroupedByInterval[index]?.[1];

        const point: TrendChartPoint = {
            date: row[0],
            views,
            visitors,
            bounceRate: countsToBounceRate({ visitors, bounces }),
        };

        if (previousCounts) {
            point.previousViews = previousCounts.views;
            point.previousVisitors = previousCounts.visitors;
            if (hasSufficientPreviousBounceData) {
                point.previousBounceRate = countsToBounceRate(previousCounts);
            }
        }

        chartData.push(point);
    });

    return {
        chartData: chartData,
        intervalType: intervalType,
    };
}

export const TimeSeriesCard = ({
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
    const { chartData, intervalType } = dataFetcher.data || {};

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
            action: `/resources/timeseries`,
        });
        // NOTE: dataFetcher is intentionally omitted from the useEffect dependency array
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    const { t } = useLocale();

    return (
        <ChartShell
            eyebrow={t("console.overview.trendEyebrow")}
            title={t("console.overview.trendTitle")}
            description={t("console.overview.trendDesc")}
            loading={dataFetcher.state !== "idle"}
            contentClassName="overflow-hidden p-0"
        >
            <div className="h-80 px-1 py-5 pr-8 sm:px-3 sm:pr-10">
                {chartData && (
                    <TimeSeriesChart
                        data={chartData}
                        intervalType={intervalType}
                    />
                )}
            </div>
        </ChartShell>
    );
};
