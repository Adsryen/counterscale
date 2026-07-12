import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/auth";
import { listSites } from "~/lib/sites";
import { useLocale } from "~/i18n/LocaleContext";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";

export const meta: MetaFunction = () => {
    return [{ title: "Counterscale Console" }];
};

type SiteSummary = {
    siteId: string;
    name: string;
    enabled: boolean;
    views: number | null;
    visitors: number | null;
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);

    const db = context.cloudflare.env.DB;
    const registry = db ? await listSites(db) : [];

    let aeSites: [string, number][] = [];
    try {
        if (
            context.cloudflare.env.CF_ACCOUNT_ID &&
            context.cloudflare.env.CF_BEARER_TOKEN
        ) {
            aeSites = await context.analyticsEngine.getSitesOrderedByHits("7d");
        }
    } catch (err) {
        console.error("overview AE sites query failed", err);
    }

    const aeMap = new Map(aeSites.map(([id, hits]) => [id, hits]));
    const nameById = new Map(registry.map((s) => [s.siteId, s]));

    // Prefer registry order; append AE-only siteIds not in registry
    const orderedIds: string[] = [
        ...registry.map((s) => s.siteId),
        ...aeSites.map(([id]) => id).filter((id) => id && !nameById.has(id)),
    ];

    // Unique preserve order
    const seen = new Set<string>();
    const uniqueIds = orderedIds.filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    // Cap parallel AE count queries for overview
    const top = uniqueIds.slice(0, 12);
    const tz = "UTC";
    const interval = "7d";

    const summaries: SiteSummary[] = await Promise.all(
        top.map(async (siteId) => {
            const reg = nameById.get(siteId);
            let views: number | null = null;
            let visitors: number | null = null;
            try {
                if (
                    context.cloudflare.env.CF_ACCOUNT_ID &&
                    context.cloudflare.env.CF_BEARER_TOKEN
                ) {
                    const counts = await context.analyticsEngine.getCounts(
                        siteId,
                        interval,
                        tz,
                        {},
                    );
                    views = counts.views;
                    visitors = counts.visitors;
                }
            } catch {
                // fall back to AE hit ordering only
                views = aeMap.get(siteId) ?? null;
            }
            return {
                siteId,
                name: reg?.name || siteId,
                enabled: reg ? reg.enabled : true,
                views,
                visitors,
            };
        }),
    );

    // Sort by views desc when available
    summaries.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));

    const totalViews = summaries.reduce((s, x) => s + (x.views ?? 0), 0);
    const totalVisitors = summaries.reduce((s, x) => s + (x.visitors ?? 0), 0);

    return {
        siteCount: uniqueIds.length,
        registryCount: registry.length,
        summaries,
        totalViews,
        totalVisitors,
        interval,
    };
}

function formatCount(n: number | null | undefined) {
    if (n === null || n === undefined) return "—";
    return Intl.NumberFormat("zh-CN", { notation: "compact" }).format(n);
}

export default function ConsoleOverview() {
    const data = useLoaderData<typeof loader>();
    const { t } = useLocale();

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {t("console.overview.title")}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {t("console.overview.subtitle")}
                    </p>
                </div>
                <Button asChild className="rounded-xl">
                    <a href="/console/sites">{t("console.overview.gotoSites")}</a>
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>
                            {t("console.overview.metricSites")}
                        </CardDescription>
                        <CardTitle className="text-3xl tabular-nums">
                            {data.siteCount}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        {t("console.overview.metricSitesHint", {
                            count: data.registryCount,
                        })}
                    </CardContent>
                </Card>
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>
                            {t("console.overview.metricPv")}
                        </CardDescription>
                        <CardTitle className="text-3xl tabular-nums">
                            {formatCount(data.totalViews)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        {t("console.overview.last7d")}
                    </CardContent>
                </Card>
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>
                            {t("console.overview.metricUv")}
                        </CardDescription>
                        <CardTitle className="text-3xl tabular-nums">
                            {formatCount(data.totalVisitors)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        {t("console.overview.last7d")}
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {t("console.overview.sitesRanking")}
                    </CardTitle>
                    <CardDescription>
                        {t("console.overview.sitesRankingDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {data.summaries.length === 0 ? (
                        <div className="text-sm text-muted-foreground space-y-3">
                            <p>{t("console.overview.empty")}</p>
                            <Button asChild className="rounded-xl">
                                <a href="/console/sites">
                                    {t("console.overview.gotoSites")}
                                </a>
                            </Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="py-2 pr-2 font-medium">
                                            {t("admin.sitesTitle")}
                                        </th>
                                        <th className="py-2 px-2 font-medium">
                                            UV
                                        </th>
                                        <th className="py-2 px-2 font-medium">
                                            PV
                                        </th>
                                        <th className="py-2 pl-2 font-medium" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.summaries.map((s) => (
                                        <tr
                                            key={s.siteId}
                                            className="border-b last:border-0"
                                        >
                                            <td className="py-3 pr-2">
                                                <a
                                                    href={`/console/sites/${encodeURIComponent(s.siteId)}`}
                                                    className="font-medium hover:underline"
                                                >
                                                    {s.name}
                                                </a>
                                                <div>
                                                    <code className="text-xs bg-muted px-1 rounded">
                                                        {s.siteId}
                                                    </code>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 tabular-nums">
                                                {formatCount(s.visitors)}
                                            </td>
                                            <td className="py-3 px-2 tabular-nums">
                                                {formatCount(s.views)}
                                            </td>
                                            <td className="py-3 pl-2 text-right">
                                                <a
                                                    href={`/console/sites/${encodeURIComponent(s.siteId)}/analytics`}
                                                    className="text-primary text-sm underline"
                                                >
                                                    {t("admin.dashboard")}
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {t("console.overview.flowTitle")}
                    </CardTitle>
                    <CardDescription>
                        {t("console.overview.flowDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>1. {t("console.overview.step1")}</p>
                    <p>2. {t("console.overview.step2")}</p>
                    <p>3. {t("console.overview.step3")}</p>
                </CardContent>
            </Card>
        </div>
    );
}
