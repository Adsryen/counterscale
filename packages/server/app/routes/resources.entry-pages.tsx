import { useFetcher } from "react-router";

import type { LoaderFunctionArgs } from "react-router";

import PaginatedTableCard from "~/components/PaginatedTableCard";
import {
    getEntryPageSummary,
    unavailableEntryExitSummary,
    UNKNOWN_PATH_LABEL,
} from "~/lib/entry-exit";
import type { SearchFilters } from "~/lib/types";
import {
    getDateTimeRange,
    getFiltersFromSearchParams,
    paramsFromUrl,
} from "~/lib/utils";
import { assertCanViewSiteStats } from "~/lib/siteAccess";

export async function loader({ context, request }: LoaderFunctionArgs) {
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

    const { interval = "7d", site, page = 1 } = paramsFromUrl(request.url);
    const url = new URL(request.url);
    const tz = url.searchParams.get("timezone") || "UTC";
    const filters = getFiltersFromSearchParams(url.searchParams);
    let summary = unavailableEntryExitSummary();
    if (context.cloudflare.env.DB) {
        try {
            summary = await getEntryPageSummary(
                context.cloudflare.env.DB,
                site,
                getDateTimeRange(interval, tz),
                filters,
            );
        } catch (err) {
            // Keep the dashboard usable if entry-page SQL fails (e.g. schema drift).
            console.error("getEntryPageSummary failed", err);
            summary = unavailableEntryExitSummary();
        }
    }

    return {
        countsByProperty: summary.countsByProperty,
        coverage: { available: summary.available, reason: summary.reason },
        page: Number(page),
    };
}

export const EntryPagesCard = ({
    siteId,
    interval,
    filters,
    onFilterChange,
    timezone,
}: {
    siteId: string;
    interval: string;
    filters: SearchFilters;
    onFilterChange: (filters: SearchFilters) => void;
    timezone: string;
}) => {
    return (
        <PaginatedTableCard
            siteId={siteId}
            interval={interval}
            columnHeaders={["Entry Page", "Sessions", "Views"]}
            dataFetcher={useFetcher<typeof loader>()}
            filters={filters}
            loaderUrl="/resources/entry-pages"
            onClick={(path) => {
                if (path !== UNKNOWN_PATH_LABEL) {
                    onFilterChange({ ...filters, path });
                }
            }}
            timezone={timezone}
        />
    );
};
