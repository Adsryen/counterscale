import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useParams } from "react-router";
import { useMemo, useState } from "react";
import { requireAuth } from "~/lib/auth";
import { useLocale } from "~/i18n/LocaleContext";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
    buildHtmlSnippet,
    buildModuleSnippet,
    sanitizeSiteId,
} from "~/lib/snippets";

export const meta: MetaFunction = () => {
    return [{ title: "Counterscale: Tracking code" }];
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    const origin = new URL(request.url).origin;
    const siteId = sanitizeSiteId(params.siteId || "mysite");
    return { origin, siteId };
}

export default function ConsoleSiteCode() {
    const { origin, siteId: defaultSiteId } = useLoaderData<typeof loader>();
    const params = useParams();
    const siteId = sanitizeSiteId(params.siteId || defaultSiteId);
    const { t } = useLocale();
    const [copied, setCopied] = useState<"html" | "module" | null>(null);

    const htmlSnippet = useMemo(
        () => buildHtmlSnippet(origin, siteId),
        [origin, siteId],
    );
    const moduleSnippet = useMemo(
        () => buildModuleSnippet(origin, siteId),
        [origin, siteId],
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

    return (
        <div className="max-w-3xl space-y-6">
            <div>
                <p className="text-sm text-muted-foreground mb-1">
                    <a href="/console/sites" className="underline hover:text-foreground">
                        {t("console.nav.sites")}
                    </a>
                    {" / "}
                    <a
                        href={`/console/sites/${encodeURIComponent(siteId)}`}
                        className="underline hover:text-foreground"
                    >
                        {siteId}
                    </a>
                    {" / "}
                    <span>{t("admin.snippet")}</span>
                </p>
                <h1 className="text-2xl font-bold">{t("install.title")}</h1>
                <p className="text-muted-foreground mt-1">{t("install.intro")}</p>
            </div>

            <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <CardTitle>{t("install.htmlTitle")}</CardTitle>
                        <CardDescription>{t("install.htmlDesc")}</CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => copyText(htmlSnippet, "html")}
                    >
                        {copied === "html" ? t("install.copied") : t("install.copy")}
                    </Button>
                </CardHeader>
                <CardContent>
                    <pre className="text-sm bg-muted p-4 rounded-xl overflow-x-auto whitespace-pre-wrap break-all">
                        {htmlSnippet}
                    </pre>
                </CardContent>
            </Card>

            <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <CardTitle>{t("install.moduleTitle")}</CardTitle>
                        <CardDescription>{t("install.moduleDesc")}</CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => copyText(moduleSnippet, "module")}
                    >
                        {copied === "module"
                            ? t("install.copied")
                            : t("install.copy")}
                    </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                    <pre className="text-sm bg-muted p-4 rounded-xl overflow-x-auto">
                        npm install @counterscale/tracker
                    </pre>
                    <pre className="text-sm bg-muted p-4 rounded-xl overflow-x-auto whitespace-pre-wrap">
                        {moduleSnippet}
                    </pre>
                </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-xl">
                    <a href={`/console/sites/${encodeURIComponent(siteId)}/analytics`}>
                        {t("install.openDashboardSite")}
                    </a>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                    <a href={`/console/sites/${encodeURIComponent(siteId)}`}>
                        {t("console.site.hub")}
                    </a>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                    <a href="/console/sites">{t("console.nav.sites")}</a>
                </Button>
            </div>
        </div>
    );
}
