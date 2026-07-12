import type { LoaderFunctionArgs } from "react-router";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Card } from "~/components/ui/card";
import { SearchFilters } from "~/lib/types";
import { requireAuth } from "~/lib/auth";
import { useLocale } from "~/i18n/LocaleContext";

export async function loader({ context, request }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const { analyticsEngine } = context;
    const { interval, site } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);

    // intentionally parallelize queries by deferring await
    const earliestEvents = analyticsEngine.getEarliestEvents(site);
    const counts = await analyticsEngine.getCounts(site, interval, tz, filters);

    const { earliestEvent, earliestBounce } = await earliestEvents;
    const { startDate } = getDateTimeRange(interval, tz);

    // FOR BACKWARDS COMPAT, ONLY SHOW BOUNCE RATE IF WE HAVE DATE FOR THE ENTIRE QUERY PERIOD
    const hasSufficientBounceData =
        earliestBounce !== null &&
        earliestEvent !== null &&
        (earliestEvent.getTime() == earliestBounce.getTime() ||
            earliestBounce < startDate);

    const bounceRate =
        counts.visitors > 0 ? counts.bounces / counts.visitors : undefined;

    return {
        views: counts.views,
        visitors: counts.visitors,
        bounceRate: bounceRate,
        hasSufficientBounceData,
    };
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

    const { views, visitors, bounceRate, hasSufficientBounceData } =
        dataFetcher.data || {};
    const countFormatter = Intl.NumberFormat("zh-CN", { notation: "compact" });

    useEffect(() => {
        const params = {
            site: siteId,
            interval,
            timezone,
            ...filters,
        };

        dataFetcher.submit(params, {
            method: "get",
            action: `/resources/stats`,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId, interval, filters, timezone]);

    return (
        <Card className="rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 pl-6 sm:p-6">
                <div className="grid grid-cols-3 gap-6 sm:gap-10 items-end">
                    <div>
                        <div className="text-sm sm:text-base text-muted-foreground">
                            {t("metrics.uv")}
                        </div>
                        <div className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight">
                            {visitors ? countFormatter.format(visitors) : "—"}
                        </div>
                    </div>

                    <div>
                        <div className="text-sm sm:text-base text-muted-foreground">
                            {t("metrics.pv")}
                        </div>
                        <div className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight">
                            {views ? countFormatter.format(views) : "—"}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm sm:text-base text-muted-foreground">
                            {t("metrics.bounce")}
                        </div>
                        <div className="text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight">
                            {hasSufficientBounceData
                                ? bounceRate !== undefined
                                    ? `${Math.round(bounceRate * 100)}%`
                                    : "—"
                                : "n/a"}
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};
