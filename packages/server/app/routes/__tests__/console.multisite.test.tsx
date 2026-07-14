// @vitest-environment jsdom
import type { LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { loader as overviewLoader } from "../console._index";
import { loader as sitesLoader } from "../console.sites";
import { requireAuth } from "~/lib/auth";
import { listSites } from "~/lib/sites";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
}));

vi.mock("~/lib/sites", async () => {
    const actual = await vi.importActual<typeof import("~/lib/sites")>(
        "~/lib/sites",
    );
    return {
        ...actual,
        listSites: vi.fn(),
    };
});

function site(siteId: string, name = siteId, enabled = true) {
    return {
        siteId,
        name,
        enabled,
        publicStats: true,
        recordIp: true,
        ipRetentionDays: 60,
        allowedHosts: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
    };
}

function context(analyticsEngine: Record<string, unknown>) {
    return {
        analyticsEngine,
        cloudflare: {
            env: {
                DB: {},
                CF_ACCOUNT_ID: "account",
                CF_BEARER_TOKEN: "token",
            },
        },
    };
}

describe("console multisite loaders", () => {
    beforeEach(() => {
        vi.mocked(requireAuth).mockResolvedValue({} as never);
        vi.mocked(listSites).mockResolvedValue([site("blog", "Blog")]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("overview uses one multisite summary query instead of per-site getCounts", async () => {
        const analyticsEngine = {
            getSiteSummariesForDateRange: vi.fn().mockResolvedValue([
                {
                    siteId: "blog",
                    views: 12,
                    visitors: 4,
                    bounces: 1,
                    lastSeenAt: "2026-07-14 02:00:00",
                },
            ]),
            getSitesOrderedByHits: vi.fn().mockResolvedValue([["blog", 12]]),
            getCounts: vi.fn().mockResolvedValue({
                views: 12,
                visitors: 4,
                bounces: 1,
            }),
        };

        const data = await overviewLoader({
            request: new Request("http://localhost/console"),
            context: context(analyticsEngine),
            params: {},
        } as unknown as LoaderFunctionArgs);

        expect(analyticsEngine.getSiteSummariesForDateRange).toHaveBeenCalledTimes(1);
        expect(analyticsEngine.getCounts).not.toHaveBeenCalled();
        expect(data).toMatchObject({
            siteCount: 1,
            totalViews: 12,
            totalVisitors: 4,
            interval: "7d",
        });
        expect(data.summaries[0]).toMatchObject({
            siteId: "blog",
            views: 12,
            visitors: 4,
            bounces: 1,
            bounceRate: 0.25,
            status: "active",
        });
    });

    test("sites loader returns metrics, latest report time, and health status", async () => {
        vi.mocked(listSites).mockResolvedValue([
            site("empty", "Empty"),
            site("off", "Off", false),
        ]);
        const analyticsEngine = {
            getSiteSummariesForDateRange: vi.fn().mockResolvedValue([
                {
                    siteId: "shop",
                    views: 20,
                    visitors: 10,
                    bounces: 3,
                    lastSeenAt: "2026-07-14 03:00:00",
                },
            ]),
            getSitesOrderedByHits: vi.fn().mockResolvedValue([["shop", 20]]),
        };

        const data = await sitesLoader({
            request: new Request("http://localhost/console/sites"),
            context: context(analyticsEngine),
            params: {},
        } as unknown as LoaderFunctionArgs);

        expect(analyticsEngine.getSiteSummariesForDateRange).toHaveBeenCalledTimes(1);
        expect(data.sites.map((s) => s.siteId)).toEqual(["shop", "off", "empty"]);
        expect(data.sites.find((s) => s.siteId === "shop")).toMatchObject({
            views: 20,
            visitors: 10,
            bounces: 3,
            bounceRate: 0.3,
            lastSeenAt: "2026-07-14 03:00:00",
            status: "active",
            inRegistry: false,
        });
        expect(data.sites.find((s) => s.siteId === "empty")).toMatchObject({
            views: 0,
            visitors: 0,
            status: "waiting",
        });
        expect(data.sites.find((s) => s.siteId === "off")?.status).toBe(
            "disabled",
        );
    });

    test("sites loader keeps registry rows when Analytics Engine summary fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const analyticsEngine = {
            getSiteSummariesForDateRange: vi.fn().mockRejectedValue(new Error("AE down")),
            getSitesOrderedByHits: vi.fn().mockResolvedValue([]),
        };

        const data = await sitesLoader({
            request: new Request("http://localhost/console/sites"),
            context: context(analyticsEngine),
            params: {},
        } as unknown as LoaderFunctionArgs);

        expect(data.sites).toHaveLength(1);
        expect(data.sites[0]).toMatchObject({
            siteId: "blog",
            views: null,
            visitors: null,
            status: "metrics-unavailable",
        });
    });
});
