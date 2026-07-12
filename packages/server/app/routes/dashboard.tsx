import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import {
    isRouteErrorResponse,
    redirect,
    useLoaderData,
    useNavigation,
    useRouteError,
    useSearchParams,
    useParams,
} from "react-router";

import { ReferrerCard } from "./resources.referrer";
import { PathsCard } from "./resources.paths";
import { BrowserCard } from "./resources.browser";
import { BrowserVersionCard } from "./resources.browserversion";
import { CountryCard } from "./resources.country";
import { DeviceCard } from "./resources.device";
import { UtmSourceCard } from "./resources.utm-source";
import { UtmMediumCard } from "./resources.utm-medium";
import { UtmCampaignCard } from "./resources.utm-campaign";
import { UtmTermCard } from "./resources.utm-term";
import { UtmContentCard } from "./resources.utm-content";

import {
    getFiltersFromSearchParams,
    getIntervalType,
    getUserTimezone,
} from "~/lib/utils";
import { SearchFilters } from "~/lib/types";
import SearchFilterBadges from "~/components/SearchFilterBadges";
import { TimeSeriesCard } from "./resources.timeseries";
import { StatsCard } from "./resources.stats";
import { useLocale } from "~/i18n/LocaleContext";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Web Analytics" },
        { name: "description", content: "Counterscale: Web Analytics" },
    ];
};

const MAX_RETENTION_DAYS = 90;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
    // NOTE: probably duped from getLoadContext / need to de-duplicate
    if (!context.cloudflare?.env?.CF_ACCOUNT_ID) {
        throw new Response("Missing credentials: CF_ACCOUNT_ID is not set.", {
            status: 501,
        });
    }
    if (!context.cloudflare?.env?.CF_BEARER_TOKEN) {
        throw new Response("Missing credentials: CF_BEARER_TOKEN is not set.", {
            status: 501,
        });
    }
    const { analyticsEngine } = context;

    const url = new URL(request.url);

    let interval;
    try {
        interval = url.searchParams.get("interval") || "7d";
    } catch {
        interval = "7d";
    }

    // Public dashboard: pick busiest site when none specified (upstream behavior)
    if (url.searchParams.has("site") === false) {
        const sitesByHits =
            await analyticsEngine.getSitesOrderedByHits(interval);
        const redirectSite = sitesByHits[0]?.[0] || "";
        const redirectUrl = new URL(request.url);
        redirectUrl.searchParams.set("site", redirectSite);
        throw redirect(redirectUrl.pathname + redirectUrl.search);
    }

    const siteId = url.searchParams.get("site") || "";
    const actualSiteId = siteId === "@unknown" ? "" : siteId;

    const filters = getFiltersFromSearchParams(url.searchParams);

    // initiate requests to AE in parallel

    // sites by hits: This is to populate the "sites" dropdown. We query the full retention
    //                period (90 days) so that any site that has been active in the past 90 days
    //                will show up in the dropdown.
    const sitesByHits = analyticsEngine.getSitesOrderedByHits(
        `${MAX_RETENTION_DAYS}d`,
    );

    const intervalType = getIntervalType(interval);

    // await all requests to AE then return the results

    let out;
    try {
        out = {
            siteId: actualSiteId,
            sites: (await sitesByHits).map(
                ([site, _]: [string, number]) => site,
            ),
            intervalType,
            interval,
            filters,
        };
    } catch (err) {
        console.error(err);
        throw new Error("Failed to fetch data from Analytics Engine");
    }

    return out;
};

export default function Dashboard() {
    const [, setSearchParams] = useSearchParams();

    const data = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const loading = navigation.state === "loading";
    const { t } = useLocale();

    function changeSite(site: string) {
        setSearchParams({
            site,
            interval: data.interval,
        });
    }

    function changeInterval(interval: string) {
        setSearchParams((prev) => {
            prev.set("interval", interval);
            return prev;
        });
    }

    const handleFilterChange = (filters: SearchFilters) => {
        setSearchParams((prev) => {
            for (const key in filters) {
                if (Object.hasOwnProperty.call(filters, key)) {
                    prev.set(
                        key,
                        filters[key as keyof SearchFilters] as string,
                    );
                }
            }
            return prev;
        });
    };

    const handleFilterDelete = (key: string) => {
        setSearchParams((prev) => {
            prev.delete(key);
            return prev;
        });
    };

    const userTimezone = getUserTimezone();

    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {t("home.dashboardTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {t("home.dashboardHint")}
                </p>
            </div>
            <div className="w-full mb-2 flex gap-4 flex-wrap items-center">
                <div className="lg:basis-1/5-gap-4 sm:basis-1/4-gap-4 basis-1/2-gap-4">
                    <Select
                        defaultValue={data.siteId}
                        onValueChange={(site) => changeSite(site)}
                    >
                        <SelectTrigger className="rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {/* SelectItem explodes if given an empty string for `value` so coerce to @unknown */}
                            {data.sites.map((siteId: string) => (
                                <SelectItem
                                    key={`k-${siteId}`}
                                    value={siteId || "@unknown"}
                                >
                                    {siteId || t("dashboard.unknownSite")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="lg:basis-1/6-gap-4 sm:basis-1/5-gap-4 basis-1/3-gap-4">
                    <Select
                        defaultValue={data.interval}
                        onValueChange={(interval) => changeInterval(interval)}
                    >
                        <SelectTrigger className="rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">
                                {t("dashboard.today")}
                            </SelectItem>
                            <SelectItem value="yesterday">
                                {t("dashboard.yesterday")}
                            </SelectItem>
                            <SelectItem value="1d">
                                {t("dashboard.hours24")}
                            </SelectItem>
                            <SelectItem value="7d">
                                {t("dashboard.days7")}
                            </SelectItem>
                            <SelectItem value="30d">
                                {t("dashboard.days30")}
                            </SelectItem>
                            <SelectItem value="90d">
                                {t("dashboard.days90")}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="basis-auto flex">
                    <div className="m-auto">
                        <SearchFilterBadges
                            filters={data.filters}
                            onFilterDelete={handleFilterDelete}
                        />
                    </div>
                </div>
            </div>

            <div className="transition" style={{ opacity: loading ? 0.6 : 1 }}>
                <div className="w-full mb-4">
                    <StatsCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        timezone={userTimezone}
                    />
                </div>
                <div className="w-full mb-4">
                    <TimeSeriesCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        timezone={userTimezone}
                    />
                </div>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <PathsCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                    <ReferrerCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                </div>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                    {data.filters && data.filters.browserName ? (
                        <BrowserVersionCard
                            siteId={data.siteId}
                            interval={data.interval}
                            filters={data.filters}
                            onFilterChange={handleFilterChange}
                            timezone={userTimezone}
                        />
                    ) : (
                        <BrowserCard
                            siteId={data.siteId}
                            interval={data.interval}
                            filters={data.filters}
                            onFilterChange={handleFilterChange}
                            timezone={userTimezone}
                        />
                    )}

                    <CountryCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />

                    <DeviceCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                </div>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <UtmSourceCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />

                    <UtmMediumCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />

                    <UtmCampaignCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                </div>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <UtmTermCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />

                    <UtmContentCard
                        siteId={data.siteId}
                        interval={data.interval}
                        filters={data.filters}
                        onFilterChange={handleFilterChange}
                        timezone={userTimezone}
                    />
                </div>
            </div>
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    const [searchParams] = useSearchParams();
    const { t } = useLocale();

    const siteId = searchParams.get("site");
    const interval = searchParams.get("interval") || "7d";

    let errorInfo = {
        title: t("dashboard.errorTitle"),
        message: t("dashboard.errorMessage"),
        suggestion: t("dashboard.errorSuggestion"),
        actionable: true,
        showRetry: true,
        showContext: true,
    };

    if (isRouteErrorResponse(error)) {
        switch (error.status) {
            case 501:
                if (error.data?.includes("CF_ACCOUNT_ID")) {
                    errorInfo = {
                        title: t("dashboard.configError"),
                        message: t("dashboard.missingAccountId"),
                        suggestion: t("dashboard.missingAccountIdHint"),
                        actionable: false,
                        showRetry: false,
                        showContext: false,
                    };
                } else if (error.data?.includes("CF_BEARER_TOKEN")) {
                    errorInfo = {
                        title: t("dashboard.configError"),
                        message: t("dashboard.missingToken"),
                        suggestion: t("dashboard.missingTokenHint"),
                        actionable: false,
                        showRetry: false,
                        showContext: false,
                    };
                } else {
                    errorInfo = {
                        title: `${t("dashboard.configError")} (${error.status})`,
                        message:
                            error.data || t("dashboard.configIncomplete"),
                        suggestion: t("dashboard.checkAeConfig"),
                        actionable: false,
                        showRetry: false,
                        showContext: false,
                    };
                }
                break;
            case 500:
                errorInfo = {
                    title: t("dashboard.serverError"),
                    message: t("dashboard.serverErrorMsg"),
                    suggestion: t("dashboard.serverErrorHint"),
                    actionable: true,
                    showRetry: true,
                    showContext: true,
                };
                break;
            default:
                errorInfo = {
                    title: `Error ${error.status}`,
                    message:
                        error.data ||
                        error.statusText ||
                        t("dashboard.httpError"),
                    suggestion: t("dashboard.errorSuggestion"),
                    actionable: true,
                    showRetry: true,
                    showContext: true,
                };
        }
    } else if (error instanceof Error) {
        if (error.message?.includes("Analytics Engine")) {
            errorInfo = {
                title: t("dashboard.aeError"),
                message: t("dashboard.aeErrorMsg"),
                suggestion: t("dashboard.aeErrorHint"),
                actionable: true,
                showRetry: true,
                showContext: true,
            };
        } else if (error.message?.includes("Authentication")) {
            errorInfo = {
                title: t("dashboard.authError"),
                message: error.message,
                suggestion: t("dashboard.authErrorHint"),
                actionable: true,
                showRetry: false,
                showContext: false,
            };
        } else if (error.message?.includes("Invalid interval")) {
            errorInfo = {
                title: t("dashboard.invalidRange"),
                message: t("dashboard.invalidRangeMsg"),
                suggestion: t("dashboard.invalidRangeHint"),
                actionable: true,
                showRetry: false,
                showContext: true,
            };
        } else {
            errorInfo = {
                title: t("dashboard.appError"),
                message: error.message || t("dashboard.appErrorMsg"),
                suggestion: t("dashboard.errorSuggestion"),
                actionable: true,
                showRetry: true,
                showContext: true,
            };
        }
    }

    const handleRetry = () => {
        window.location.reload();
    };

    const handleGoHome = () => {
        window.location.href = "/";
    };

    console.error("Dashboard Error:", error);

    return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
            <Card className="max-w-2xl w-full">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span className="text-2xl">⚠️</span>
                        {errorInfo.title}
                    </CardTitle>
                    <CardDescription className="text-base">
                        {errorInfo.message}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                            <strong>{t("dashboard.suggestion")}</strong>{" "}
                            {errorInfo.suggestion}
                        </p>
                    </div>

                    {errorInfo.showContext && (siteId || interval !== "7d") && (
                        <div className="bg-muted p-4 rounded-lg">
                            <p className="text-sm text-muted-foreground mb-2">
                                <strong>{t("dashboard.context")}</strong>
                            </p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                {siteId && (
                                    <li>
                                        • {t("dashboard.site")}{" "}
                                        <code className="bg-background px-1 rounded">
                                            {siteId}
                                        </code>
                                    </li>
                                )}
                                <li>
                                    • {t("dashboard.timeRange")}{" "}
                                    <code className="bg-background px-1 rounded">
                                        {interval}
                                    </code>
                                </li>
                            </ul>
                        </div>
                    )}

                    {errorInfo.actionable && (
                        <CardFooter className="flex gap-2 px-0 pb-0">
                            {errorInfo.showRetry && (
                                <Button
                                    onClick={handleRetry}
                                    className="flex-1"
                                >
                                    {t("dashboard.tryAgain")}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={handleGoHome}
                                className="flex-1"
                            >
                                {t("dashboard.backDashboard")}
                            </Button>
                        </CardFooter>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
