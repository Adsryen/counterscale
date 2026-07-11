import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { useMemo, useState } from "react";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { requireAuth } from "~/lib/auth";
import { useLocale } from "~/i18n/LocaleContext";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Install Snippet" },
        {
            name: "description",
            content: "Generate tracking snippet for your website",
        },
    ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);

    const url = new URL(request.url);
    const origin = url.origin;
    const defaultSiteId = url.searchParams.get("site") || "mysite";

    return {
        origin,
        defaultSiteId,
    };
}

/** Keep site ids URL/attr-safe; reject control chars & quotes. */
export function sanitizeSiteId(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "mysite";
    // Allow letters, digits, dash, underscore, dot — common site-id styles
    const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]/g, "");
    return cleaned || "mysite";
}

export function buildHtmlSnippet(origin: string, siteId: string) {
    const sid = sanitizeSiteId(siteId);
    return `<script
    id="counterscale-script"
    data-site-id="${sid}"
    src="${origin}/tracker.js"
    defer
></script>`;
}

export function buildModuleSnippet(origin: string, siteId: string) {
    const sid = sanitizeSiteId(siteId);
    return `import * as Counterscale from "@counterscale/tracker";

Counterscale.init({
    siteId: "${sid}",
    reporterUrl: "${origin}/collect",
});`;
}

export default function InstallSnippet() {
    const { origin, defaultSiteId } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [siteId, setSiteId] = useState(
        searchParams.get("site") || defaultSiteId || "mysite",
    );
    const [copied, setCopied] = useState<"html" | "module" | null>(null);
    const { t } = useLocale();

    const safeSiteId = sanitizeSiteId(siteId);

    const htmlSnippet = useMemo(
        () => buildHtmlSnippet(origin, safeSiteId),
        [origin, safeSiteId],
    );
    const moduleSnippet = useMemo(
        () => buildModuleSnippet(origin, safeSiteId),
        [origin, safeSiteId],
    );

    async function copyText(text: string, which: "html" | "module") {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(which);
            window.setTimeout(() => setCopied(null), 2000);
        } catch {
            setCopied(null);
        }
    }

    function onSiteIdChange(value: string) {
        setSiteId(value);
        const next = new URLSearchParams(searchParams);
        const cleaned = value.trim();
        if (cleaned) {
            next.set("site", cleaned);
        } else {
            next.delete("site");
        }
        setSearchParams(next, { replace: true });
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 mb-12">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                    {t("install.title")}
                </h1>
                <p className="text-gray-600 mt-1">{t("install.intro")}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t("install.siteIdTitle")}</CardTitle>
                    <CardDescription>{t("install.siteIdDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <label htmlFor="site-id" className="sr-only">
                        {t("install.siteIdLabel")}
                    </label>
                    <input
                        id="site-id"
                        value={siteId}
                        onChange={(e) => onSiteIdChange(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="mysite"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {siteId.trim() && siteId.trim() !== safeSiteId ? (
                        <p className="text-sm text-amber-700 mt-2">
                            {t("install.sanitizedHint")}{" "}
                            <code className="bg-muted px-1 rounded">
                                {safeSiteId}
                            </code>
                        </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground mt-2">
                        {t("install.workerOrigin")}{" "}
                        <code className="bg-muted px-1 rounded">{origin}</code>
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <CardTitle>{t("install.htmlTitle")}</CardTitle>
                        <CardDescription>
                            {t("install.htmlDesc")}
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(htmlSnippet, "html")}
                    >
                        {copied === "html"
                            ? t("install.copied")
                            : t("install.copy")}
                    </Button>
                </CardHeader>
                <CardContent>
                    <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                        {htmlSnippet}
                    </pre>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <CardTitle>{t("install.moduleTitle")}</CardTitle>
                        <CardDescription>
                            {t("install.moduleDesc")}
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(moduleSnippet, "module")}
                    >
                        {copied === "module"
                            ? t("install.copied")
                            : t("install.copy")}
                    </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                    <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                        npm install @counterscale/tracker
                    </pre>
                    <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {moduleSnippet}
                    </pre>
                </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
                <Button asChild>
                    <a
                        href={`/dashboard?site=${encodeURIComponent(safeSiteId)}`}
                    >
                        {t("install.openDashboardSite")}
                    </a>
                </Button>
                <Button asChild variant="outline">
                    <a href="/dashboard">{t("install.openDashboardAll")}</a>
                </Button>
            </div>
        </div>
    );
}
