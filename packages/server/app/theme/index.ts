export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "__counterscale_theme";
export const DEFAULT_THEME: ThemePreference = "system";

export function isThemePreference(
    value: string | null | undefined,
): value is ThemePreference {
    return value === "light" || value === "dark" || value === "system";
}

export function parseThemeCookie(
    cookieHeader: string | null | undefined,
): ThemePreference | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
        const [rawKey, ...rest] = part.trim().split("=");
        if (rawKey === THEME_COOKIE) {
            const val = decodeURIComponent(rest.join("=").trim());
            if (isThemePreference(val)) return val;
        }
    }
    return null;
}

/**
 * Resolve stored preference. "system" stays as system until client applies media query.
 */
export function resolveThemePreference(input: {
    cookieHeader?: string | null;
}): ThemePreference {
    return parseThemeCookie(input.cookieHeader) ?? DEFAULT_THEME;
}

export function themeCookieHeader(theme: ThemePreference): string {
    return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Client-side: map preference to light/dark using matchMedia when system. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
    if (preference === "light" || preference === "dark") return preference;
    if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }
    return "light";
}

export function applyThemeClass(resolved: ResolvedTheme): void {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
}

/**
 * Inline script for Layout <head> — runs before paint to avoid FOUC.
 * Must stay free of imports; string is embedded in HTML.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_COOKIE)};var m=document.cookie.match(new RegExp('(?:^|; )'+k+'=([^;]*)'));var p=m?decodeURIComponent(m[1]):'system';if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var d=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
