import {
    DEFAULT_LOCALE,
    LOCALE_COOKIE,
    LOCALES,
    type Locale,
} from "./types";
import { en } from "./messages/en";
import { zh } from "./messages/zh";
import type { Messages } from "./types";

const catalogs: Record<Locale, Messages> = { en, zh };

export function isLocale(value: string | null | undefined): value is Locale {
    return value === "en" || value === "zh";
}

export function parseLocaleCookie(
    cookieHeader: string | null | undefined,
): Locale | null {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(";");
    for (const part of parts) {
        const [rawKey, ...rest] = part.trim().split("=");
        if (rawKey === LOCALE_COOKIE) {
            const val = decodeURIComponent(rest.join("=").trim());
            if (isLocale(val)) return val;
        }
    }
    return null;
}

export function localeFromAcceptLanguage(
    header: string | null | undefined,
): Locale | null {
    if (!header) return null;
    const first = header.split(",")[0]?.trim().toLowerCase();
    if (!first) return null;
    const tag = first.split(";")[0]?.trim();
    if (!tag) return null;
    if (tag === "zh" || tag.startsWith("zh-")) return "zh";
    if (tag === "en" || tag.startsWith("en-")) return "en";
    return null;
}

/**
 * Resolution: cookie → Accept-Language → default (zh for this fork).
 */
export function resolveLocale(input: {
    cookieHeader?: string | null;
    acceptLanguage?: string | null;
}): Locale {
    const fromCookie = parseLocaleCookie(input.cookieHeader);
    if (fromCookie) return fromCookie;
    const fromHeader = localeFromAcceptLanguage(input.acceptLanguage);
    if (fromHeader) return fromHeader;
    return DEFAULT_LOCALE;
}

export function getMessages(locale: Locale): Messages {
    return catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
}

export function interpolate(
    template: string,
    vars?: Record<string, string | number>,
): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, key: string) =>
        vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
    );
}

/** Dot-path lookup: "nav.dashboard" */
export function translate(
    messages: Messages,
    key: string,
    vars?: Record<string, string | number>,
): string {
    const parts = key.split(".");
    let cur: unknown = messages;
    for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as object)) {
            cur = (cur as Record<string, unknown>)[p];
        } else {
            return key;
        }
    }
    if (typeof cur !== "string") return key;
    return interpolate(cur, vars);
}

export function localeCookieHeader(locale: Locale): string {
    // 1 year; client-readable so the switcher can set without a server action
    return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function htmlLang(locale: Locale): string {
    return locale === "zh" ? "zh-CN" : "en";
}

export { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, catalogs };
export type { Locale, Messages };
