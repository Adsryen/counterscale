import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { requireAuth } from "~/lib/auth";
import { getSite } from "~/lib/sites";
import { useLocale } from "~/i18n/LocaleContext";
import { buttonVariants } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
    const name = data?.site?.name || data?.siteId || "Site";
    return [{ title: `Counterscale: ${name}` }];
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const siteId = (params.siteId || "").trim();
    if (!siteId) {
        throw new Response("Not Found", { status: 404 });
    }

    const url = new URL(request.url);
    const created = url.searchParams.get("created") === "1";

    const db = context.cloudflare.env.DB;
    const site = db ? await getSite(db, siteId) : null;

    return {
        siteId,
        site,
        created,
    };
}

export default function ConsoleSiteHub() {
    const { siteId, site, created } = useLoaderData<typeof loader>();
    const { t } = useLocale();
    const name = site?.name || siteId;
    const enabled = site ? site.enabled : true;
    const publicStats = site ? site.publicStats : true;
    const recordIp = site ? site.recordIp : true;
    const ipRetentionDays = site ? site.ipRetentionDays : 60;

    const codeHref = `/console/sites/${encodeURIComponent(siteId)}/code`;
    const analyticsHref = `/console/sites/${encodeURIComponent(siteId)}/analytics`;
    const publicDashHref = `/dashboard?site=${encodeURIComponent(siteId)}`;

    return (
        <div className="max-w-3xl space-y-6">
            <div>
                <p className="text-sm text-muted-foreground mb-1">
                    <a
                        href="/console/sites"
                        className="underline hover:text-foreground"
                    >
                        {t("console.nav.sites")}
                    </a>
                    {" / "}
                    <span>{name}</span>
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {name}
                </h1>
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm">
                        {siteId}
                    </code>
                    {site ? (
                        <>
                            <span
                                className={
                                    enabled
                                        ? "text-sm text-emerald-600 dark:text-emerald-400"
                                        : "text-sm text-muted-foreground"
                                }
                            >
                                {enabled
                                    ? t("admin.enabled")
                                    : t("admin.disabled")}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {publicStats
                                    ? t("admin.publicStatsOn")
                                    : t("admin.publicStatsOff")}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {recordIp
                                    ? t("admin.recordIpOn")
                                    : t("admin.recordIpOff")}
                                {" / "}
                                {t("admin.ipRetentionDaysShort", { days: ipRetentionDays })}
                            </span>
                        </>
                    ) : (
                        <span className="text-sm text-amber-700 dark:text-amber-400">
                            {t("console.site.notInRegistry")}
                        </span>
                    )}
                </p>
            </div>

            {created ? (
                <div
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 px-4 py-3 text-sm"
                    role="status"
                >
                    {t("console.site.createdHint")}
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {t("console.site.codeTitle")}
                        </CardTitle>
                        <CardDescription>
                            {t("console.site.codeDesc")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <a
                            href={codeHref}
                            className={cn(
                                buttonVariants({ variant: "default" }),
                                "rounded-xl",
                            )}
                        >
                            {t("admin.snippet")}
                        </a>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {t("console.site.analyticsTitle")}
                        </CardTitle>
                        <CardDescription>
                            {t("console.site.analyticsDesc")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <a
                            href={publicDashHref}
                            className={cn(
                                buttonVariants({ variant: "default" }),
                                "rounded-xl",
                            )}
                        >
                            {t("admin.dashboard")}
                        </a>
                        <a
                            href={analyticsHref}
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "rounded-xl",
                            )}
                        >
                            {t("console.site.consoleAnalytics")}
                        </a>
                        <a
                            href={`/console/sites/${encodeURIComponent(siteId)}/realtime`}
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "rounded-xl",
                            )}
                        >
                            实时访客
                        </a>
                        <a
                            href={`/console/sites/${encodeURIComponent(siteId)}/visitors`}
                            className={cn(
                                buttonVariants({ variant: "outline" }),
                                "rounded-xl",
                            )}
                        >
                            {t("console.site.visitors")}
                        </a>
                    </CardContent>
                </Card>
            </div>

            {site?.allowedHosts ? (
                <Card className="rounded-2xl shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {t("admin.allowedHosts")}
                        </CardTitle>
                        <CardDescription>{site.allowedHosts}</CardDescription>
                    </CardHeader>
                </Card>
            ) : null}

            <div className="flex flex-wrap gap-2">
                <a
                    href="/console/sites"
                    className={cn(
                        buttonVariants({ variant: "outline" }),
                        "rounded-xl",
                    )}
                >
                    {t("console.site.backList")}
                </a>
            </div>
        </div>
    );
}
