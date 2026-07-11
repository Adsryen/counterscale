import { useTheme } from "~/theme/ThemeContext";
import type { ThemePreference } from "~/theme";
import { useLocale } from "~/i18n/LocaleContext";
import { cn } from "~/lib/utils";

const OPTIONS: ThemePreference[] = ["system", "light", "dark"];

export function ThemeSwitcher({
    className,
    size = "sm",
}: {
    className?: string;
    size?: "sm" | "md";
}) {
    const { preference, setPreference } = useTheme();
    const { t } = useLocale();

    const label = (p: ThemePreference) => {
        if (p === "system") return t("theme.system");
        if (p === "light") return t("theme.light");
        return t("theme.dark");
    };

    return (
        <div
            className={cn(
                "inline-flex items-center border border-input rounded-full overflow-hidden",
                size === "sm" ? "text-xs" : "text-sm",
                className,
            )}
            role="group"
            aria-label={t("theme.label")}
        >
            {OPTIONS.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    className={cn(
                        size === "sm" ? "px-2 py-0.5" : "px-3 py-1",
                        preference === opt
                            ? "bg-muted font-semibold"
                            : "hover:bg-muted/60",
                    )}
                    onClick={() => setPreference(opt)}
                    aria-pressed={preference === opt}
                >
                    {label(opt)}
                </button>
            ))}
        </div>
    );
}
