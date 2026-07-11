import type {
    ActionFunctionArgs,
    LoaderFunctionArgs,
    MetaFunction,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
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
        { title: "Counterscale: Admin" },
        {
            name: "description",
            content: "Manage tracked sites",
        },
    ];
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

    const sites = await listSites(db);
    return { sites };
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
        if (intent === "create") {
            const siteId = String(form.get("siteId") || "");
            const name = String(form.get("name") || "");
            const allowedHosts = String(form.get("allowedHosts") || "");
            await createSite(db, {
                siteId,
                name,
                allowedHosts: allowedHosts || null,
            });
            return {
                ok: true,
                message: translate(messages, "admin.created", {
                    siteId: siteId.trim(),
                }),
            };
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
        const message =
            err instanceof Error ? err.message : "Something went wrong";
        return { ok: false, error: message };
    }
}

function SiteRow({ site }: { site: Site }) {
    const [editing, setEditing] = useState(false);
    const navigation = useNavigation();
    const busy = navigation.state !== "idle";
    const { t } = useLocale();

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
                <div className="font-medium">{site.name}</div>
                <code className="text-xs bg-muted px-1 rounded">
                    {site.siteId}
                </code>
            </td>
            <td className="py-3 px-2 text-sm">
                {site.enabled ? (
                    <span className="text-green-700">{t("admin.enabled")}</span>
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
                    <Button asChild size="sm" variant="outline">
                        <a
                            href={`/install?site=${encodeURIComponent(site.siteId)}`}
                        >
                            {t("admin.snippet")}
                        </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                        <a
                            href={`/dashboard?site=${encodeURIComponent(site.siteId)}`}
                        >
                            {t("admin.dashboard")}
                        </a>
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
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
    const { sites } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const busy = navigation.state !== "idle";
    const { t } = useLocale();

    return (
        <div className="max-w-4xl mx-auto space-y-6 mb-12">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                    {t("admin.title")}
                </h1>
                <p className="text-gray-600 mt-1">{t("admin.intro")}</p>
            </div>

            {actionData ? (
                <div
                    className={
                        actionData.ok
                            ? "rounded-md border border-green-200 bg-green-50 text-green-900 px-4 py-3 text-sm"
                            : "rounded-md border border-red-200 bg-red-50 text-red-900 px-4 py-3 text-sm"
                    }
                    role="status"
                >
                    {actionData.ok ? actionData.message : actionData.error}
                </div>
            ) : null}

            <Card>
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
                        <Button type="submit" disabled={busy}>
                            {t("admin.create")}
                        </Button>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t("admin.sitesTitle")}</CardTitle>
                    <CardDescription>
                        {sites.length === 0
                            ? t("admin.sitesEmpty")
                            : t("admin.sitesCount", { count: sites.length })}
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {sites.length === 0 ? null : (
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

            <div className="text-sm text-muted-foreground">
                <a
                    href="/admin-redirect"
                    className="underline hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                >
                    {t("admin.cfConsole")}
                </a>
            </div>
        </div>
    );
}
