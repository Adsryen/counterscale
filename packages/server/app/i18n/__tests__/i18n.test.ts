import { describe, expect, test } from "vitest";
import {
    DEFAULT_LOCALE,
    getMessages,
    htmlLang,
    localeFromAcceptLanguage,
    parseLocaleCookie,
    resolveLocale,
    translate,
} from "../index";

describe("i18n resolveLocale", () => {
    test("cookie wins over Accept-Language", () => {
        expect(
            resolveLocale({
                cookieHeader: "__counterscale_locale=en; other=1",
                acceptLanguage: "zh-CN,zh;q=0.9",
            }),
        ).toBe("en");
    });

    test("Accept-Language zh* → zh", () => {
        expect(
            resolveLocale({
                cookieHeader: null,
                acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
            }),
        ).toBe("zh");
    });

    test("Accept-Language en → en", () => {
        expect(
            resolveLocale({
                acceptLanguage: "en-US,en;q=0.9",
            }),
        ).toBe("en");
    });

    test("default is zh for this fork", () => {
        expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
        expect(DEFAULT_LOCALE).toBe("zh");
    });

    test("parseLocaleCookie ignores invalid", () => {
        expect(parseLocaleCookie("__counterscale_locale=fr")).toBeNull();
        expect(parseLocaleCookie("__counterscale_locale=zh")).toBe("zh");
    });

    test("localeFromAcceptLanguage", () => {
        expect(localeFromAcceptLanguage("zh-TW")).toBe("zh");
        expect(localeFromAcceptLanguage("en-GB")).toBe("en");
        expect(localeFromAcceptLanguage("fr-FR")).toBeNull();
    });
});

describe("i18n messages", () => {
    test("zh and en share nav.dashboard", () => {
        expect(getMessages("zh").nav.dashboard).toBe("仪表盘");
        expect(getMessages("en").nav.dashboard).toBe("Dashboard");
    });

    test("translate interpolates", () => {
        const m = getMessages("en");
        expect(translate(m, "admin.created", { siteId: "blog" })).toContain(
            "blog",
        );
        expect(translate(m, "missing.key")).toBe("missing.key");
    });

    test("htmlLang", () => {
        expect(htmlLang("zh")).toBe("zh-CN");
        expect(htmlLang("en")).toBe("en");
    });
});
