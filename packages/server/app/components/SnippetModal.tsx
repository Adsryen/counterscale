import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { buildHtmlSnippet, buildModuleSnippet } from "~/lib/snippets";
import { useLocale } from "~/i18n/LocaleContext";
import { cn } from "~/lib/utils";

type Props = {
    open: boolean;
    onClose: () => void;
    siteId: string;
    origin: string;
};

export function SnippetModal({ open, onClose, siteId, origin }: Props) {
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

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

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
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="snippet-modal-title"
        >
            <button
                type="button"
                className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
                aria-label={t("admin.cancel")}
                onClick={onClose}
            />
            <div
                className={cn(
                    "relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto",
                    "rounded-2xl border border-border bg-card text-card-foreground shadow-xl",
                )}
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 backdrop-blur px-5 py-4">
                    <div className="min-w-0">
                        <h2
                            id="snippet-modal-title"
                            className="text-lg font-semibold tracking-tight"
                        >
                            {t("install.title")}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                {siteId}
                            </code>
                            <span className="mx-1.5">·</span>
                            {t("install.htmlDesc")}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl shrink-0"
                        onClick={onClose}
                    >
                        {t("admin.cancel")}
                    </Button>
                </div>

                <div className="space-y-5 p-5">
                    <p className="text-sm text-muted-foreground">
                        {t("console.site.snippetDelayHint")}
                    </p>

                    <section className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-medium">
                                    {t("install.htmlTitle")}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {t("install.htmlDesc")}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => copyText(htmlSnippet, "html")}
                            >
                                {copied === "html"
                                    ? t("install.copied")
                                    : t("install.copy")}
                            </Button>
                        </div>
                        <pre className="text-xs sm:text-sm bg-muted p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all">
                            {htmlSnippet}
                        </pre>
                    </section>

                    <section className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-medium">
                                    {t("install.moduleTitle")}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {t("install.moduleDesc")}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={() =>
                                    copyText(moduleSnippet, "module")
                                }
                            >
                                {copied === "module"
                                    ? t("install.copied")
                                    : t("install.copy")}
                            </Button>
                        </div>
                        <pre className="text-xs sm:text-sm bg-muted p-3 rounded-xl overflow-x-auto">
                            npm install @counterscale/tracker
                        </pre>
                        <pre className="text-xs sm:text-sm bg-muted p-3 rounded-xl overflow-x-auto whitespace-pre-wrap">
                            {moduleSnippet}
                        </pre>
                    </section>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <a
                            href={`/dashboard?site=${encodeURIComponent(siteId)}`}
                            className="inline-flex items-center justify-center rounded-xl text-sm font-medium h-9 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {t("admin.dashboard")}
                        </a>
                        <a
                            href={`/console/sites/${encodeURIComponent(siteId)}/code`}
                            className="inline-flex items-center justify-center rounded-xl text-sm font-medium h-9 px-3 border border-input bg-background hover:bg-accent"
                        >
                            {t("console.site.openFullCode")}
                        </a>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-xl"
                            onClick={onClose}
                        >
                            {t("console.site.closeSnippet")}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
