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

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { requireAuth } from "~/lib/auth";
import {
    createSite,
    deleteSite,
    listSites,
    updateSite,
    type Site,
} from "~/lib/sites";
import { getMessages, resolveLocale, translate } from "~/i18n";
import { useLocale } from "~/i18n/LocaleContext";

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
export type SiteListItem = {
    siteId: string;
    name: string;
    enabled: boolean;
    allowedHosts: string | null;
    createdAt: string;
    updatedAt: string;
    /** true = row in D1; false = only seen in Analytics Engine traffic */
    inRegistry: boolean;
    /** approximate hits last 90d from AE ranking (if known) */
    hits90d: number | null;
};

function localeMessages(request: Request) {
    const locale = resolveLocale({
        cookieHeader: request.headers.get("Cookie"),
        acceptLanguage: request.headers.get("Accept-Language"),
    });
    return getMessages(locale);
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

    let aeSites: [string, number][] = [];
    try {
        if (
            context.cloudflare.env.CF_ACCOUNT_ID &&
            context.cloudflare.env.CF_BEARER_TOKEN
        ) {
            // Match public dashboard retention window for discovery
            aeSites = await context.analyticsEngine.getSitesOrderedByHits("90d");
        }
    } catch (err) {
        console.error("sites list AE discovery failed", err);
    }

    const regMap = new Map(registry.map((s) => [s.siteId, s]));
    const aeMap = new Map(
        aeSites.filter(([id]) => !!id).map(([id, hits]) => [id, hits]),
    );

    const items: SiteListItem[] = [];

    // 1) All D1 registry sites first (manageable)
    for (const s of registry) {
        items.push({
            ...s,
            inRegistry: true,
            hits90d: aeMap.get(s.siteId) ?? null,
        });
    }

    // 2) AE-only siteIds (have traffic but never added to registry)
    for (const [siteId, hits] of aeMap) {
        if (regMap.has(siteId)) continue;
        items.push({
            siteId,
            name: siteId,
            enabled: true,
            allowedHosts: null,
            createdAt: "",
            updatedAt: "",
            inRegistry: false,
            hits90d: hits,
        });
    }

    // Sort: registry first, then by hits desc, then name
    items.sort((a, b) => {
        if (a.inRegistry !== b.inRegistry) return a.inRegistry ? -1 : 1;
        const ha = a.hits90d ?? -1;
        const hb = b.hits90d ?? -1;
        if (ha !== hb) return hb - ha;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return {
        sites: items,
        registryCount: registry.length,
        discoveredCount: items.filter((s) => !s.inRegistry).length,
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
            const created = await createSite(db, {
                siteId,
                name: name.trim() || siteId,
                allowedHosts: allowedHosts || null,
            });
            // Chinese PV flow: create/import → hub with CTA to install code
            throw redirect(
                `/console/sites/${encodeURIComponent(created.siteId)}?created=1`,
            );
        }

        if (intent === "update") {
            const siteId = String(form.get("siteId") || "");
            const name = String(form.get("name") || "");
            const enabled = form.get("enabled") === "on";
            const allowedHosts = String(form.get("allowedHosts") || "");
            await updateSite(db, siteId, {
                name,
                enabled,
                allowedHosts: allowedHosts || null,
            });
            return {
                ok: true,
                message: translate(messages, "admin.updated", { siteId }),
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
        // react-router redirect() throws a Response — rethrow so create flow works
        if (err instanceof Response) {
            throw err;
        }
        const message =
            err instanceof Error ? err.message : "Something went wrong";
        return { ok: false, error: message };
    }
}

function SiteRow({ site }: { site: SiteListItem }) {
    const [editing, setEditing] = useState(false);
    const navigation = useNavigation();
    const busy = navigation.state !== "idle";
    const { t } = useLocale();

    // AE-discovered only: offer import into registry
    if (!site.inRegistry) {
        return (
            <tr className="border-b bg-muted/20">
                <td className="py-3 px-2">
                    <div className="font-medium">{site.name}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <code className="text-xs bg-muted px-1 rounded">
                            {site.siteId}
                        </code>
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                            {t("console.site.discoveredBadge")}
                        </span>
                    </div>
                </td>
                <td className="py-3 px-2 text-sm text-muted-foreground">
                    {site.hits90d != null
                        ? t("console.site.hits90d", { count: site.hits90d })
                        : "—"}
                </td>
                <td className="py-3 px-2" colSpan={2}>
                    <div className="flex flex-wrap gap-2">
                        <Form method="post">
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
                                disabled={busy}
                            >
                                {t("console.site.import")}
                            </Button>
                        </Form>
                        <Button asChild size="sm" variant="outline" className="rounded-xl">
                            <a
                                href={`/console/sites/${encodeURIComponent(site.siteId)}/analytics`}
                            >
                                {t("admin.dashboard")}
                            </a>
                        </Button>
                        <Button asChild size="sm" variant="outline" className="rounded-xl">
                            <a
                                href={`/console/sites/${encodeURIComponent(site.siteId)}/code`}
                            >
                                {t("admin.snippet")}
                            </a>
                        </Button>
                    </div>
                </td>
            </tr>
        );
    }

    if (editing) {
        return (
            <tr className="border-b align-top">
                <td colSpan={4} className="py-3 px-2">
                    <Form
                        method="post"
                        className="space-y-3"
                        onSubmit={() => setEditing(false)}
                    >
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
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-md shadow-sm"
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
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-md shadow-sm"
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
                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="sm" disabled={busy}>
                                {t("admin.save")}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
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
            <td className="py-3 px-2">
                <a
                    href={`/console/sites/${encodeURIComponent(site.siteId)}`}
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
            <td className="py-3 px-2 text-sm">
                {site.enabled ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                        {t("admin.enabled")}
                    </span>
                ) : (
                    <span className="text-muted-foreground">
                        {t("admin.disabled")}
                    </span>
                )}
                {site.allowedHosts ? (
                    <div className="text-xs text-muted-foreground mt-1">
                        {site.allowedHosts}
                    </div>
                ) : null}
            </td>
            <td className="py-3 px-2">
                <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" className="rounded-xl">
                        <a
                            href={`/console/sites/${encodeURIComponent(site.siteId)}/code`}
                        >
                            {t("admin.snippet")}
                        </a>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                    >
                        <a
                            href={`/console/sites/${encodeURIComponent(site.siteId)}/analytics`}
                        >
                            {t("admin.dashboard")}
                        </a>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                    >
                        <a
                            href={`/console/sites/${encodeURIComponent(site.siteId)}`}
                        >
                            {t("console.site.hub")}
                        </a>
                    </Button>
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
            <td className="py-3 px-2 text-right">
                <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="siteId" value={site.siteId} />
                    <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        disabled={busy}
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
    const { sites, registryCount, discoveredCount } =
        useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const busy = navigation.state !== "idle";
    const { t } = useLocale();

    return (
        <div className="max-w-4xl space-y-6">
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
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-md shadow-sm"
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
                                    className="mt-1 w-full px-3 py-2 border border-input rounded-md shadow-sm"
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
                                className="mt-1 w-full px-3 py-2 border border-input rounded-md shadow-sm"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={busy}
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
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="py-2 px-2 font-medium">
                                        {t("admin.sitesTitle")}
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
                                    <SiteRow key={site.siteId} site={site} />
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
