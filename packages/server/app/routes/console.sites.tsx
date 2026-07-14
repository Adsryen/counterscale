import type {
    ActionFunctionArgs,
    LoaderFunctionArgs,
    MetaFunction,
} from "react-router";
import {
    Form,
    redirect,
    useActionData,
    useLoaderData,
    useNavigation,
} from "react-router";
import { useState } from "react";

import type { SiteSummaryMetricResult } from "~/analytics/query";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button, buttonVariants } from "~/components/ui/button";
import { SnippetModal } from "~/components/SnippetModal";
import { requireAuth } from "~/lib/auth";
import {
    createSite,
    deleteSite,
    listSites,
    updateSite,
} from "~/lib/sites";
import {
    buildMultisiteSummary,
    type MultisiteSummaryRow,
} from "~/lib/multisite-summary";
import { getMessages, resolveLocale, translate } from "~/i18n";
import { useLocale } from "~/i18n/LocaleContext";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Sites" },
        {
            name: "description",
            content: "Manage tracked sites",
        },
    ];
};

/** Registry site or AE-discovered siteId without D1 row yet. */
export type SiteListItem = MultisiteSummaryRow;

function localeMessages(request: Request) {
    const locale = resolveLocale({
        cookieHeader: request.headers.get("Cookie"),
        acceptLanguage: request.headers.get("Accept-Language"),
    });
    return getMessages(locale);
}

function daysAgoRange(days: number) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
}

/** Plain link that looks like a Button — avoids asChild/Slot click issues. */
function ActionLink({
    href,
    children,
    variant = "outline",
}: {
    href: string;
    children: React.ReactNode;
    variant?: "default" | "outline" | "secondary";
}) {
    return (
        <a
            href={href}
            className={cn(
                buttonVariants({ variant, size: "sm" }),
                "rounded-xl no-underline",
            )}
        >
            {children}
        </a>
    );
}

function formatCount(n: number | null | undefined) {
    if (n === null || n === undefined) return "—";
    return Intl.NumberFormat("zh-CN", { notation: "compact" }).format(n);
}

function formatBounceRate(n: number | null | undefined) {
    if (n === null || n === undefined) return "—";
    return Intl.NumberFormat("zh-CN", {
        style: "percent",
        maximumFractionDigits: 1,
    }).format(n);
}

function formatLastSeen(value: string | null | undefined) {
    if (!value) return "—";
    return value.replace("T", " ").replace(".000Z", "");
}

function MetricsCell({ site }: { site: SiteListItem }) {
    const { t } = useLocale();
    return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
            <span className="text-muted-foreground">{t("console.site.pv")}</span>
            <span className="text-right">{formatCount(site.views)}</span>
            <span className="text-muted-foreground">{t("console.site.uv")}</span>
            <span className="text-right">{formatCount(site.visitors)}</span>
            <span className="text-muted-foreground">
                {t("console.site.bounceRate")}
            </span>
            <span className="text-right">{formatBounceRate(site.bounceRate)}</span>
        </div>
    );
}

function HealthStatus({ site }: { site: SiteListItem }) {
    const { t } = useLocale();
    const tone =
        site.status === "active"
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            : site.status === "disabled"
              ? "border-border bg-muted/50 text-muted-foreground"
              : site.status === "metrics-unavailable"
                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";

    return (
        <div className="space-y-1.5">
            <span
                className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-xs",
                    tone,
                )}
            >
                {t(`console.site.health.${site.status}`)}
            </span>
            <div className="text-xs text-muted-foreground">
                {t("console.site.lastSeen")}: {formatLastSeen(site.lastSeenAt)}
            </div>
        </div>
    );
}

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);

    const db = context.cloudflare.env.DB;
    if (!db) {
        const messages = localeMessages(request);
        throw new Response(translate(messages, "admin.missingDb"), {
            status: 501,
        });
    }

    const registry = await listSites(db);
    const origin = new URL(request.url).origin;

    let metrics: SiteSummaryMetricResult[] = [];
    let metricsUnavailable = false;
    try {
        if (
            context.cloudflare.env.CF_ACCOUNT_ID &&
            context.cloudflare.env.CF_BEARER_TOKEN
        ) {
            const { startDate, endDate } = daysAgoRange(90);
            metrics = await context.analyticsEngine.getSiteSummariesForDateRange(
                startDate,
                endDate,
                "UTC",
            );
        } else {
            metricsUnavailable = true;
        }
    } catch (err) {
        metricsUnavailable = true;
        console.error("sites list AE summary failed", err);
    }

    const items = buildMultisiteSummary({
        registry,
        metrics,
        metricsUnavailable,
    });

    return {
        sites: items,
        registryCount: registry.length,
        discoveredCount: items.filter((s) => !s.inRegistry).length,
        origin,
    };
}

type ActionData =
    | { ok: true; message: string }
    | { ok: false; error: string };

export async function action({
    request,
    context,
}: ActionFunctionArgs): Promise<ActionData> {
    await requireAuth(request, context.cloudflare.env);
    const messages = localeMessages(request);

    const db = context.cloudflare.env.DB;
    if (!db) {
        return {
            ok: false,
            error: translate(messages, "admin.missingDbShort"),
        };
    }

    const form = await request.formData();
    const intent = String(form.get("intent") || "");

    try {
        if (intent === "create" || intent === "import") {
            const siteId = String(form.get("siteId") || "");
            const name = String(form.get("name") || siteId || "");
            const allowedHosts = String(form.get("allowedHosts") || "");
            const recordIp =
                intent === "import" ? true : form.get("recordIp") === "on";
            const ipRetentionDays = Number(form.get("ipRetentionDays") || "60");
            const isPublic =
                intent === "import"
                    ? true
                    : form.has("publicStats")
                      ? form.get("publicStats") === "on"
                      : true;
            const created = await createSite(db, {
                siteId,
                name: name.trim() || siteId,
                allowedHosts: allowedHosts || null,
                publicStats: isPublic,
                recordIp,
                ipRetentionDays,
            });
            throw redirect(
                `/console/sites/${encodeURIComponent(created.siteId)}?created=1`,
            );
        }

        if (intent === "update") {
            const siteId = String(form.get("siteId") || "");
            const name = String(form.get("name") || "");
            const enabled = form.get("enabled") === "on";
            const publicStats = form.get("publicStats") === "on";
            const recordIp = form.get("recordIp") === "on";
            const ipRetentionDays = Number(form.get("ipRetentionDays") || "60");
            const allowedHosts = String(form.get("allowedHosts") || "");
            await updateSite(db, siteId, {
                name,
                enabled,
                publicStats,
                recordIp,
                ipRetentionDays,
                allowedHosts: allowedHosts || null,
            });
            return {
                ok: true,
                message: translate(messages, "admin.updated", { siteId }),
            };
        }

        if (intent === "togglePublic") {
            const siteId = String(form.get("siteId") || "");
            const next = form.get("publicStats") === "1";
            await updateSite(db, siteId, { publicStats: next });
            return {
                ok: true,
                message: next
                    ? translate(messages, "admin.publicToggledOn", { siteId })
                    : translate(messages, "admin.publicToggledOff", { siteId }),
            };
        }

        if (intent === "delete") {
            const siteId = String(form.get("siteId") || "");
            await deleteSite(db, siteId);
            return {
                ok: true,
                message: translate(messages, "admin.deleted", { siteId }),
            };
        }

        return {
            ok: false,
            error: translate(messages, "admin.unknownIntent", { intent }),
        };
    } catch (err) {
        if (err instanceof Response) {
            throw err;
        }
        const message =
            err instanceof Error ? err.message : "Something went wrong";
        return { ok: false, error: message };
    }
}

function SiteRow({
    site,
    onOpenSnippet,
}: {
    site: SiteListItem;
    onOpenSnippet: (siteId: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const navigation = useNavigation();
    // Only disable the form that is submitting, not every button on the page
    const submitting = navigation.state === "submitting";
    const { t } = useLocale();

    const analyticsHref = `/console/sites/${encodeURIComponent(site.siteId)}/analytics`;
    const hubHref = `/console/sites/${encodeURIComponent(site.siteId)}`;
    const publicDashHref = `/dashboard?site=${encodeURIComponent(site.siteId)}`;

    // AE-discovered only
    if (!site.inRegistry) {
        return (
            <tr className="border-b bg-muted/20">
                <td className="py-3 px-2 align-top">
                    <div className="font-medium break-all">{site.name}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <code className="text-xs bg-muted px-1 rounded">
                            {site.siteId}
                        </code>
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                            {t("console.site.discoveredBadge")}
                        </span>
                    </div>
                </td>
                <td className="py-3 px-2 align-top">
                    <MetricsCell site={site} />
                </td>
                <td className="py-3 px-2 align-top text-sm text-muted-foreground">
                    <HealthStatus site={site} />
                    <div className="mt-1">{t("admin.publicStatsOn")}</div>
                </td>
                <td className="py-3 px-2 align-top" colSpan={2}>
                    <div className="flex flex-wrap gap-2">
                        <Form method="post" className="inline">
                            <input type="hidden" name="intent" value="import" />
                            <input
                                type="hidden"
                                name="siteId"
                                value={site.siteId}
                            />
                            <input
                                type="hidden"
                                name="name"
                                value={site.siteId}
                            />
                            <Button
                                type="submit"
                                size="sm"
                                className="rounded-xl"
                                disabled={submitting}
                            >
                                {t("console.site.import")}
                            </Button>
                        </Form>
                        <Button
                            type="button"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => onOpenSnippet(site.siteId)}
                        >
                            {t("admin.snippet")}
                        </Button>
                        <ActionLink href={publicDashHref}>
                            {t("admin.dashboard")}
                        </ActionLink>
                        <ActionLink href={analyticsHref}>
                            {t("console.site.consoleAnalytics")}
                        </ActionLink>
                    </div>
                </td>
            </tr>
        );
    }

    if (editing) {
        return (
            <tr className="border-b align-top">
                <td colSpan={5} className="py-3 px-2">
                    <Form method="post" className="space-y-3">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="siteId" value={site.siteId} />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium">
                                    {t("admin.displayName")}
                                </label>
                                <input
                                    name="name"
                                    defaultValue={site.name}
                                    required
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">
                                    {t("admin.allowedHosts")}
                                </label>
                                <input
                                    name="allowedHosts"
                                    defaultValue={site.allowedHosts ?? ""}
                                    placeholder="example.com, www.example.com"
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                name="enabled"
                                defaultChecked={site.enabled}
                            />
                            {t("admin.enabled")}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                name="publicStats"
                                defaultChecked={site.publicStats}
                            />
                            {t("admin.publicStats")}
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    name="recordIp"
                                    defaultChecked={site.recordIp}
                                />
                                {t("admin.recordIp")}
                            </label>
                            <label className="text-sm font-medium">
                                {t("admin.ipRetentionDays")}
                                <input
                                    type="number"
                                    name="ipRetentionDays"
                                    min={1}
                                    max={365}
                                    defaultValue={site.ipRetentionDays}
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                                />
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t("admin.publicStatsHelp")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t("admin.recordIpHelp")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                className="rounded-xl"
                                disabled={submitting}
                            >
                                {t("admin.save")}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => setEditing(false)}
                            >
                                {t("admin.cancel")}
                            </Button>
                        </div>
                    </Form>
                </td>
            </tr>
        );
    }

    return (
        <tr className="border-b">
            <td className="py-3 px-2 align-top">
                <a
                    href={hubHref}
                    className="font-medium text-foreground hover:underline"
                >
                    {site.name}
                </a>
                <div>
                    <code className="text-xs bg-muted px-1 rounded">
                        {site.siteId}
                    </code>
                </div>
            </td>
            <td className="py-3 px-2 align-top">
                <MetricsCell site={site} />
            </td>
            <td className="py-3 px-2 align-top text-sm">
                <div className="flex flex-col gap-1.5">
                    <HealthStatus site={site} />
                    {site.enabled ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                            {t("admin.enabled")}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">
                            {t("admin.disabled")}
                        </span>
                    )}
                    <Form method="post" className="inline">
                        <input
                            type="hidden"
                            name="intent"
                            value="togglePublic"
                        />
                        <input
                            type="hidden"
                            name="siteId"
                            value={site.siteId}
                        />
                        <input
                            type="hidden"
                            name="publicStats"
                            value={site.publicStats ? "0" : "1"}
                        />
                        <button
                            type="submit"
                            disabled={submitting}
                            title={t("admin.publicStatsHelp")}
                            className={
                                site.publicStats
                                    ? "text-left text-xs rounded-lg px-2 py-1 border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 hover:opacity-90"
                                    : "text-left text-xs rounded-lg px-2 py-1 border border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                            }
                        >
                            {site.publicStats
                                ? t("admin.publicStatsOn")
                                : t("admin.publicStatsOff")}
                            <span className="ml-1 opacity-70">
                                · {t("admin.publicToggleHint")}
                            </span>
                        </button>
                    </Form>
                </div>
                {site.allowedHosts ? (
                    <div className="text-xs text-muted-foreground mt-1">
                        {site.allowedHosts}
                    </div>
                ) : null}
            </td>
            <td className="py-3 px-2 align-top">
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => onOpenSnippet(site.siteId)}
                    >
                        {t("admin.snippet")}
                    </Button>
                    <ActionLink href={publicDashHref}>
                        {t("admin.dashboard")}
                    </ActionLink>
                    <ActionLink href={analyticsHref}>
                        {t("console.site.consoleAnalytics")}
                    </ActionLink>
                    <ActionLink href={hubHref} variant="secondary">
                        {t("console.site.hub")}
                    </ActionLink>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="rounded-xl"
                        onClick={() => setEditing(true)}
                    >
                        {t("admin.edit")}
                    </Button>
                </div>
            </td>
            <td className="py-3 px-2 align-top text-right">
                <Form method="post" className="inline">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="siteId" value={site.siteId} />
                    <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        className="rounded-xl"
                        disabled={submitting}
                        onClick={(e) => {
                            if (
                                !window.confirm(
                                    t("admin.deleteConfirm", {
                                        siteId: site.siteId,
                                    }),
                                )
                            ) {
                                e.preventDefault();
                            }
                        }}
                    >
                        {t("admin.delete")}
                    </Button>
                </Form>
            </td>
        </tr>
    );
}

export default function AdminSites() {
    const { sites, registryCount, discoveredCount, origin } =
        useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const submitting = navigation.state === "submitting";
    const { t } = useLocale();
    const [snippetSiteId, setSnippetSiteId] = useState<string | null>(null);

    return (
        <div className="max-w-5xl space-y-6">
            <SnippetModal
                open={!!snippetSiteId}
                siteId={snippetSiteId || ""}
                origin={origin}
                onClose={() => setSnippetSiteId(null)}
            />
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {t("admin.title")}
                </h1>
                <p className="text-muted-foreground mt-1">{t("admin.intro")}</p>
            </div>

            {actionData ? (
                <div
                    className={
                        actionData.ok
                            ? "rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 px-4 py-3 text-sm"
                            : "rounded-2xl border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100 px-4 py-3 text-sm"
                    }
                    role="status"
                >
                    {actionData.ok ? actionData.message : actionData.error}
                </div>
            ) : null}

            {discoveredCount > 0 ? (
                <div
                    className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 px-4 py-3 text-sm"
                    role="status"
                >
                    {t("console.site.discoveredHint", {
                        count: discoveredCount,
                    })}
                </div>
            ) : null}

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle>{t("admin.addTitle")}</CardTitle>
                    <CardDescription>{t("admin.addDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form method="post" className="space-y-3">
                        <input type="hidden" name="intent" value="create" />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="create-name"
                                    className="text-sm font-medium"
                                >
                                    {t("admin.displayName")}
                                </label>
                                <input
                                    id="create-name"
                                    name="name"
                                    required
                                    placeholder="My Blog"
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="create-site-id"
                                    className="text-sm font-medium"
                                >
                                    {t("admin.siteId")}
                                </label>
                                <input
                                    id="create-site-id"
                                    name="siteId"
                                    required
                                    placeholder="blog"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                                />
                            </div>
                        </div>
                        <div>
                            <label
                                htmlFor="create-hosts"
                                className="text-sm font-medium"
                            >
                                {t("admin.allowedHostsOptional")}
                            </label>
                            <input
                                id="create-hosts"
                                name="allowedHosts"
                                placeholder={t(
                                    "admin.allowedHostsPlaceholder",
                                )}
                                className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                name="publicStats"
                                defaultChecked
                            />
                            {t("admin.publicStats")}
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    name="recordIp"
                                    defaultChecked
                                />
                                {t("admin.recordIp")}
                            </label>
                            <label className="text-sm font-medium">
                                {t("admin.ipRetentionDays")}
                                <input
                                    type="number"
                                    name="ipRetentionDays"
                                    min={1}
                                    max={365}
                                    defaultValue={60}
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-xl shadow-sm bg-background"
                                />
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t("admin.publicStatsHelp")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t("admin.recordIpHelp")}
                        </p>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="rounded-xl"
                        >
                            {t("admin.create")}
                        </Button>
                    </Form>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle>{t("admin.sitesTitle")}</CardTitle>
                    <CardDescription>
                        {sites.length === 0
                            ? t("admin.sitesEmpty")
                            : t("console.site.listSummary", {
                                  total: sites.length,
                                  registry: registryCount,
                                  discovered: discoveredCount,
                              })}
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {sites.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                            {t("console.site.emptyHint")}
                        </p>
                    ) : (
                        <table className="w-full text-left text-sm min-w-[640px]">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="py-2 px-2 font-medium">
                                        {t("admin.sitesTitle")}
                                    </th>
                                    <th className="py-2 px-2 font-medium">
                                        {t("console.site.metrics")}
                                    </th>
                                    <th className="py-2 px-2 font-medium">
                                        {t("admin.status")}
                                    </th>
                                    <th className="py-2 px-2 font-medium">
                                        {t("admin.actions")}
                                    </th>
                                    <th className="py-2 px-2 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {sites.map((site) => (
                                    <SiteRow
                                        key={site.siteId}
                                        site={site}
                                        onOpenSnippet={setSnippetSiteId}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
