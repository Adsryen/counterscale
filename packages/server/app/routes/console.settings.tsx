import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useLocale } from "~/i18n/LocaleContext";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { ThemeSwitcher } from "~/components/ThemeSwitcher";
import { useTheme } from "~/theme/ThemeContext";

export const meta: MetaFunction = () => {
    return [{ title: "Counterscale Settings" }];
};

export async function loader({ context }: LoaderFunctionArgs) {
    const version = context.cloudflare?.env?.VERSION || null;
    return { version };
}

export default function ConsoleSettings() {
    const { t, locale, setLocale } = useLocale();
    const { preference, resolved } = useTheme();
    const { version } = useLoaderData<typeof loader>();

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    {t("console.settings.title")}
                </h1>
                <p className="text-muted-foreground mt-1">
                    {t("console.settings.subtitle")}
                </p>
            </div>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {t("console.settings.themeTitle")}
                    </CardTitle>
                    <CardDescription>
                        {t("console.settings.themeDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ThemeSwitcher size="md" />
                    <p className="text-xs text-muted-foreground">
                        {preference === "system"
                            ? `${t("theme.system")} → ${resolved === "dark" ? t("theme.dark") : t("theme.light")}`
                            : preference === "dark"
                              ? t("theme.dark")
                              : t("theme.light")}
                    </p>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {t("console.settings.langTitle")}
                    </CardTitle>
                    <CardDescription>
                        {t("console.settings.langDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div
                        className="inline-flex items-center text-sm border border-input rounded-full overflow-hidden"
                        role="group"
                        aria-label="Language"
                    >
                        <button
                            type="button"
                            className={
                                locale === "zh"
                                    ? "px-3 py-1 bg-muted font-semibold"
                                    : "px-3 py-1 hover:bg-muted/60"
                            }
                            onClick={() => setLocale("zh")}
                        >
                            {t("common.langZh")}
                        </button>
                        <button
                            type="button"
                            className={
                                locale === "en"
                                    ? "px-3 py-1 bg-muted font-semibold"
                                    : "px-3 py-1 hover:bg-muted/60"
                            }
                            onClick={() => setLocale("en")}
                        >
                            {t("common.langEn")}
                        </button>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {t("console.settings.aboutTitle")}
                    </CardTitle>
                    <CardDescription>
                        {t("console.settings.aboutDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        {t("footer.version")}{" "}
                        <code className="bg-muted px-1 rounded">
                            {version
                                ? version.length > 12
                                    ? version.slice(0, 7)
                                    : version
                                : "—"}
                        </code>
                    </p>
                    <p>
                        <a
                            href="https://pv.we-together.club"
                            className="text-primary underline"
                        >
                            pv.we-together.club
                        </a>
                    </p>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {t("console.settings.cfTitle")}
                    </CardTitle>
                    <CardDescription>
                        {t("console.settings.cfDesc")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <a
                        href="/admin-redirect"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline"
                    >
                        {t("admin.cfConsole")}
                    </a>
                </CardContent>
            </Card>
        </div>
    );
}
