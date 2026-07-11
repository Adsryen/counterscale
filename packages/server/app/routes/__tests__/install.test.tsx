// @vitest-environment jsdom
import type { LoaderFunctionArgs } from "react-router";
import {
    vi,
    test,
    describe,
    beforeEach,
    afterEach,
    expect,
} from "vitest";
import "vitest-dom/extend-expect";

import { createRoutesStub } from "react-router";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

import InstallSnippet, {
    loader,
    buildHtmlSnippet,
    buildModuleSnippet,
    sanitizeSiteId,
} from "../install";
import { requireAuth } from "~/lib/auth";
import { LocaleProvider } from "~/i18n/LocaleContext";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
}));

function wrap(ui: React.ReactNode) {
    return <LocaleProvider initialLocale="en">{ui}</LocaleProvider>;
}

describe("install route helpers", () => {
    test("sanitizeSiteId strips unsafe characters", () => {
        expect(sanitizeSiteId("")).toBe("mysite");
        expect(sanitizeSiteId("  blog  ")).toBe("blog");
        expect(sanitizeSiteId('"><script>')).toBe("script");
        expect(sanitizeSiteId("my-site_1.0")).toBe("my-site_1.0");
    });

    test("buildHtmlSnippet embeds origin and site id", () => {
        const html = buildHtmlSnippet("https://example.workers.dev", "blog");
        expect(html).toContain('data-site-id="blog"');
        expect(html).toContain('src="https://example.workers.dev/tracker.js"');
        expect(html).toContain("defer");
    });

    test("buildModuleSnippet uses reporterUrl /collect", () => {
        const snip = buildModuleSnippet("https://example.workers.dev", "shop");
        expect(snip).toContain('siteId: "shop"');
        expect(snip).toContain(
            'reporterUrl: "https://example.workers.dev/collect"',
        );
    });
});

describe("install route", () => {
    beforeEach(() => {
        vi.mocked(requireAuth).mockResolvedValue({ authenticated: true } as any);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    describe("loader", () => {
        test("calls requireAuth and returns origin + defaultSiteId", async () => {
            const args = {
                context: {
                    cloudflare: {
                        env: {},
                    },
                },
                request: new Request(
                    "http://localhost:3000/install?site=from-query",
                ),
            } as unknown as LoaderFunctionArgs;

            const result = await loader(args);
            expect(requireAuth).toHaveBeenCalled();
            expect(result.origin).toBe("http://localhost:3000");
            expect(result.defaultSiteId).toBe("from-query");
        });

        test("defaults site id when query missing", async () => {
            const args = {
                context: {
                    cloudflare: {
                        env: {},
                    },
                },
                request: new Request("http://localhost:3000/install"),
            } as unknown as LoaderFunctionArgs;

            const result = await loader(args);
            expect(result.defaultSiteId).toBe("mysite");
        });
    });

    test("renders snippet generator UI", async () => {
        const RemixStub = createRoutesStub([
            {
                path: "/install",
                Component: InstallSnippet,
                loader: () => ({
                    origin: "https://counterscale.prl.workers.dev",
                    defaultSiteId: "mysite",
                }),
            },
        ]);

        render(
            wrap(<RemixStub initialEntries={["/install"]} />),
        );

        await waitFor(() => {
            expect(screen.getByText("Install tracking")).toBeInTheDocument();
        });

        expect(screen.getByText("HTML script (CDN)")).toBeInTheDocument();
        expect(screen.getByText("JavaScript module")).toBeInTheDocument();
        expect(
            screen.getByText("https://counterscale.prl.workers.dev"),
        ).toBeInTheDocument();

        // default snippet visible
        expect(
            screen.getByText(/data-site-id="mysite"/),
        ).toBeInTheDocument();
    });

    test("updates snippets when site id changes", async () => {
        const RemixStub = createRoutesStub([
            {
                path: "/install",
                Component: InstallSnippet,
                loader: () => ({
                    origin: "https://counterscale.prl.workers.dev",
                    defaultSiteId: "mysite",
                }),
            },
        ]);

        render(
            wrap(<RemixStub initialEntries={["/install"]} />),
        );

        await waitFor(() => {
            expect(screen.getByLabelText("Site ID")).toBeInTheDocument();
        });

        const input = screen.getByLabelText("Site ID");
        fireEvent.change(input, { target: { value: "myblog" } });

        await waitFor(() => {
            expect(
                screen.getByText(/data-site-id="myblog"/),
            ).toBeInTheDocument();
        });

        expect(screen.getByText(/siteId: "myblog"/)).toBeInTheDocument();
    });
});
