import type { MetaFunction } from "react-router";
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

export default function ConsoleSettings() {
    const { t } = useLocale();
    const { preference, resolved } = useTheme();

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
