import { LoaderFunctionArgs, Outlet, useLoaderData, useLocation, useNavigation } from "react-router";
import { requireAuth } from "~/lib/auth";
import { useLocale } from "~/i18n/LocaleContext";
import { cn } from "~/lib/utils";
import { ThemeSwitcher } from "~/components/ThemeSwitcher";

export async function loader({ request, context }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);
    return {
        // reserved for future user/menu data
        ok: true as const,
    };
}

const navItems = [
    { to: "/console", end: true, key: "console.nav.overview" as const },
    { to: "/console/sites", end: false, key: "console.nav.sites" as const },
    { to: "/console/settings", end: false, key: "console.nav.settings" as const },
];

export default function ConsoleLayout() {
    useLoaderData<typeof loader>();
    const { t, locale, setLocale } = useLocale();
    const location = useLocation();
    const navigation = useNavigation();
    const busy = navigation.state !== "idle";

    return (
        <div className="min-h-[70vh] flex flex-col md:flex-row gap-4 md:gap-6 -mt-2">
            <aside className="md:w-56 shrink-0">
                <div className="rounded-2xl border border-border/60 bg-card/80 shadow-sm p-3 sticky top-4">
                    <div className="px-2 py-2 mb-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Console
                        </div>
                        <div className="text-lg font-semibold text-foreground">
                            Counterscale
                        </div>
                    </div>
                    <nav className="flex md:flex-col gap-1 overflow-x-auto">
                        {navItems.map((item) => {
                            const active = item.end
                                ? location.pathname === item.to
                                : location.pathname === item.to ||
                                  location.pathname.startsWith(item.to + "/");
                            return (
                                <a
                                    key={item.to}
                                    href={item.to}
                                    className={cn(
                                        "rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors",
                                        active
                                            ? "bg-primary text-primary-foreground font-medium shadow-sm"
                                            : "text-foreground/80 hover:bg-muted",
                                    )}
                                >
                                    {t(item.key)}
                                </a>
                            );
                        })}
                    </nav>
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col">
                <header className="rounded-2xl border border-border/60 bg-card/80 shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                        {busy ? "…" : t("console.topbar.ready")}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <ThemeSwitcher />
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
                        <a
                            href="/logout"
                            className="text-sm rounded-full px-3 py-1 border border-input hover:bg-muted"
                        >
                            {t("nav.logout")}
                        </a>
                    </div>
                </header>

                <main
                    role="main"
                    className={cn(
                        "flex-1 transition-opacity",
                        busy && "opacity-70",
                    )}
                >
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
