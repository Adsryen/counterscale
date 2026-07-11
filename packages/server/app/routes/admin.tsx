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

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Admin" },
        {
            name: "description",
            content: "Manage tracked sites",
        },
    ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);

    const db = context.cloudflare.env.DB;
    if (!db) {
        throw new Response(
            "Missing D1 binding: DB is not configured. Create a D1 database and add it to wrangler.json.",
            { status: 501 },
        );
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

    const db = context.cloudflare.env.DB;
    if (!db) {
        return {
            ok: false,
            error: "Missing D1 binding: DB is not configured.",
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
            return { ok: true, message: `Created site “${siteId.trim()}”` };
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
            return { ok: true, message: `Updated “${siteId}”` };
        }

        if (intent === "delete") {
            const siteId = String(form.get("siteId") || "");
            await deleteSite(db, siteId);
            return { ok: true, message: `Deleted “${siteId}”` };
        }

        return { ok: false, error: `Unknown intent: ${intent}` };
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
                                    Display name
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
                                    Allowed hosts (optional)
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
                            Enabled
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="sm" disabled={busy}>
                                Save
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(false)}
                            >
                                Cancel
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
                    <span className="text-green-700">Enabled</span>
                ) : (
                    <span className="text-muted-foreground">Disabled</span>
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
                            Snippet
                        </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                        <a
                            href={`/dashboard?site=${encodeURIComponent(site.siteId)}`}
                        >
                            Dashboard
                        </a>
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing(true)}
                    >
                        Edit
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
                                    `Delete site “${site.siteId}”? Analytics data in AE is kept.`,
                                )
                            ) {
                                e.preventDefault();
                            }
                        }}
                    >
                        Delete
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

    return (
        <div className="max-w-4xl mx-auto space-y-6 mb-12">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
                <p className="text-gray-600 mt-1">
                    Manage site metadata. Pageviews still live in Analytics
                    Engine; unknown site IDs can still report via{" "}
                    <code className="bg-muted px-1 rounded">/collect</code>.
                </p>
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
                    <CardTitle>Add site</CardTitle>
                    <CardDescription>
                        siteId becomes{" "}
                        <code className="bg-muted px-1 rounded">
                            data-site-id
                        </code>{" "}
                        in the embed snippet.
                    </CardDescription>
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
                                    Display name
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
                                    Site ID
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
                                Allowed hosts (optional, informational)
                            </label>
                            <input
                                id="create-hosts"
                                name="allowedHosts"
                                placeholder="blog.example.com"
                                className="mt-1 w-full px-3 py-2 border border-input rounded-md shadow-sm"
                            />
                        </div>
                        <Button type="submit" disabled={busy}>
                            Create site
                        </Button>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Sites</CardTitle>
                    <CardDescription>
                        {sites.length === 0
                            ? "No sites yet — create one above."
                            : `${sites.length} site(s)`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {sites.length === 0 ? null : (
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="py-2 px-2 font-medium">
                                        Site
                                    </th>
                                    <th className="py-2 px-2 font-medium">
                                        Status
                                    </th>
                                    <th className="py-2 px-2 font-medium">
                                        Actions
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
                    Open Cloudflare Worker console
                </a>
            </div>
        </div>
    );
}
