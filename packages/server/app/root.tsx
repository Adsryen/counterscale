/// <reference types="vite/client" />
import styles from "./globals.css?url";
import { LoaderFunctionArgs, type LinksFunction } from "react-router";

import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
} from "react-router";
import { getUser, isAuthEnabled } from "~/lib/auth";
import {
    htmlLang,
    resolveLocale,
    type Locale,
} from "~/i18n";
import { LocaleProvider, useLocale } from "~/i18n/LocaleContext";
import {
    resolveThemePreference,
    THEME_BOOT_SCRIPT,
    type ThemePreference,
} from "~/theme";
import { ThemeProvider } from "~/theme/ThemeContext";
import { ThemeSwitcher } from "~/components/ThemeSwitcher";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

/**
 * Generate GitHub information based on the version format
 * @param version - Version string (semver or git SHA)
 * @returns Object with GitHub URL and display version
 */
function getVersionMeta(version: string | null | undefined): {
    url: string | null;
    name: string | null;
} {
    if (!version) return { url: null, name: null };

    // Check if it's a semver (e.g., 1.2.3) or a git SHA
    const isSemver = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version);
    const repo = "https://github.com/Adsryen/counterscale";

    if (isSemver) {
        // Link to release page for semver
        return {
            url: `${repo}/releases/tag/v${version}`,
            name: version,
        };
    } else {
        // Link to commit for git SHA - show only first 7 characters
        return {
            url: `${repo}/commit/${version}`,
            name: version.slice(0, 7),
        };
    }
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
    // specified during deploy via wrangler --var VERSION:value
    const version = context.cloudflare?.env?.VERSION;
    const user = await getUser(request, context.cloudflare.env);
    const cookieHeader = request.headers.get("Cookie");
    const locale = resolveLocale({
        cookieHeader,
        acceptLanguage: request.headers.get("Accept-Language"),
    });
    const theme = resolveThemePreference({ cookieHeader });

    return {
        version: {
            ...getVersionMeta(version),
        },
        origin: new URL(request.url).origin,
        url: request.url,
        user,
        isAuthEnabled: isAuthEnabled(context.cloudflare.env),
        locale,
        theme,
    };
};

function LanguageSwitcher() {
    const { locale, setLocale, t } = useLocale();

    return (
        <div
            className="inline-flex items-center text-sm border border-input rounded-full overflow-hidden"
            role="group"
            aria-label="Language"
        >
            <button
                type="button"
                className={
                    locale === "zh"
                        ? "px-2 py-0.5 bg-muted font-semibold"
                        : "px-2 py-0.5 hover:bg-muted/60"
                }
                onClick={() => setLocale("zh")}
                aria-pressed={locale === "zh"}
            >
                {t("common.langZh")}
            </button>
            <button
                type="button"
                className={
                    locale === "en"
                        ? "px-2 py-0.5 bg-muted font-semibold"
                        : "px-2 py-0.5 hover:bg-muted/60"
                }
                onClick={() => setLocale("en")}
                aria-pressed={locale === "en"}
            >
                {t("common.langEn")}
            </button>
        </div>
    );
}

export const Layout = ({ children = [] }: { children: React.ReactNode }) => {
    const data = useLoaderData<typeof loader>() ?? {
        version: {
            url: "https://example.com/",
            name: "0.0.1",
        },
        origin: "counterscale.dev",
        url: "https://counterscale.dev/",
        locale: "zh" as Locale,
        theme: "system" as ThemePreference,
    };

    const locale = (data as { locale?: Locale }).locale ?? "zh";

    return (
        <html lang={htmlLang(locale)} suppressHydrationWarning>
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <link rel="icon" type="image/x-icon" href="/favicon.png" />
                <meta name="robots" content="noindex" />
                <script
                    dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
                />

                <meta property="og:url" content={data.url} />
                <meta property="og:type" content="website" />
                <meta property="og:title" content="Counterscale" />
                <meta
                    property="og:description"
                    content="Scalable web analytics you run yourself on Cloudflare"
                />
                <meta
                    property="og:image"
                    content={data.origin + "/counterscale-og-large.webp"}
                />

                <meta name="twitter:card" content="summary_large_image" />
                <meta property="twitter:domain" content="counterscale.dev" />
                <meta property="twitter:url" content={data.url} />
                <meta name="twitter:title" content="Counterscale" />
                <meta
                    name="twitter:description"
                    content="Scalable web analytics you run yourself on Cloudflare"
                />
                <meta
                    name="twitter:image"
                    content={data.origin + "/counterscale-og-large.webp"}
                />
                <Meta />
                <Links />
            </head>
            <body>
                <div className="container mx-auto pl-2 pr-2 sm:pl-8 sm:pr-8">
                    {children}
                </div>
                <ScrollRestoration />
                <Scripts />
                <script
                    id="counterscale-script"
                    data-site-id="counterscale-dev"
                    src="/tracker.js"
                ></script>
            </body>
        </html>
    );
};

export default function App() {
    const data = useLoaderData<typeof loader>();

    // Check if current domain is a subdomain of counterscale.dev
    const currentOrigin = new URL(data.url).hostname;
    const isCounterscaleSubdomain = currentOrigin.endsWith(".counterscale.dev");
    const homeUrl = isCounterscaleSubdomain ? "https://counterscale.dev" : "/";

    return (
        <LocaleProvider initialLocale={data.locale}>
            <ThemeProvider initialPreference={data.theme}>
                <AppShell homeUrl={homeUrl} data={data} />
            </ThemeProvider>
        </LocaleProvider>
    );
}

function AppShell({
    homeUrl,
    data,
}: {
    homeUrl: string;
    data: ReturnType<typeof useLoaderData<typeof loader>>;
}) {
    const { t } = useLocale();
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    // Prefer URL from loader (SSR-safe)
    let pathname = "/";
    try {
        pathname = new URL(data.url).pathname;
    } catch {
        pathname = path || "/";
    }
    const isConsole = pathname.startsWith("/console");

    if (isConsole) {
        // Console routes render their own chrome; keep only content + providers.
        return (
            <div className="mt-0 sm:mt-4">
                <main role="main" className="w-full">
                    <Outlet />
                </main>
                <footer className="py-4 flex justify-end text-s text-muted-foreground">
                    <div>
                        {t("footer.version")}{" "}
                        {data.version ? (
                            <a
                                href={data.version.url as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                            >
                                {data.version.name}
                            </a>
                        ) : (
                            "unknown"
                        )}
                    </div>
                </footer>
            </div>
        );
    }

    // Public / login shell — minimal chrome
    return (
        <div className="mt-0 sm:mt-4">
            <header className="border-b border-border/60 mb-8 py-3">
                <nav className="flex justify-between items-center">
                    <div className="flex items-center">
                        <a href={homeUrl} className="text-lg font-bold">
                            Counterscale
                        </a>
                        <img
                            className="w-6 ml-1"
                            src="/img/arrow.svg"
                            alt="Counterscale Icon"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeSwitcher />
                        <LanguageSwitcher />
                        {data.user?.authenticated && data.isAuthEnabled ? (
                            <a
                                href="/console"
                                className="text-sm font-medium ml-1"
                            >
                                {t("console.nav.overview")}
                            </a>
                        ) : null}
                    </div>
                </nav>
            </header>
            <main role="main" className="w-full">
                <Outlet />
            </main>
            <footer className="py-4 flex justify-end text-s text-muted-foreground">
                <div>
                    {t("footer.version")}{" "}
                    {data.version ? (
                        <a
                            href={data.version.url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                        >
                            {data.version.name}
                        </a>
                    ) : (
                        "unknown"
                    )}
                </div>
            </footer>
        </div>
    );
}
