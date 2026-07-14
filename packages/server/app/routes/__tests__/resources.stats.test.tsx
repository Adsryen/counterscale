// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as ReactRouter from "react-router";
import "vitest-dom/extend-expect";
import { LocaleProvider } from "~/i18n/LocaleContext";
import { loader, StatsCard } from "../resources.stats";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
    isAuthEnabled: vi.fn(() => false),
}));

vi.mock("react-router", async () => {
    const actual = await vi.importActual("react-router");
    return {
        ...actual,
        useFetcher: vi.fn(),
    };
});

function unavailableEngagement(reason: "db-unavailable" | "no-engagement") {
    return {
        available: false,
        reason,
        coverageStartedAt: null,
        visits: 0,
        pageviews: 0,
        averageDurationMs: null,
        averagePageDepth: null,
        durationBuckets: [
            { bucket: "0-10s", visits: 0 },
            { bucket: "10-30s", visits: 0 },
            { bucket: "30-60s", visits: 0 },
            { bucket: "1-3m", visits: 0 },
            { bucket: "3-10m", visits: 0 },
            { bucket: "10m+", visits: 0 },
        ],
        depthBuckets: [
            { bucket: "1", visits: 0 },
            { bucket: "2", visits: 0 },
            { bucket: "3-5", visits: 0 },
            { bucket: "6-10", visits: 0 },
            { bucket: "10+", visits: 0 },
        ],
    };
}

function createStatsEngagementD1() {
    return {
        prepare(sql: string) {
            const binds: unknown[] = [];
            const stmt = {
                bind(...args: unknown[]) {
                    binds.push(...args);
                    return stmt;
                },
                async first<T>() {
                    return null as T | null;
                },
                async all<T>() {
                    if (sql.includes("FROM visits") && binds[0] === "test-site") {
                        return {
                            results: [
                                {
                                    visit_id: "visit-1",
                                    engaged_ms: 45_000,
                                    page_count: 2,
                                    engagement_started_at:
                                        "2026-07-14T10:00:05.000Z",
                                    engagement_updated_at:
                                        "2026-07-14T10:00:45.000Z",
                                },
                                {
                                    visit_id: "visit-2",
                                    engaged_ms: 75_000,
                                    page_count: 4,
                                    engagement_started_at:
                                        "2026-07-14T10:02:05.000Z",
                                    engagement_updated_at:
                                        "2026-07-14T10:03:15.000Z",
                                },
                            ] as T[],
                        };
                    }
                    return { results: [] as T[] };
                },
                async run() {
                    return { meta: { changes: 0 } };
                },
            };
            return stmt;
        },
    } as unknown as D1Database;
}

describe("resources.stats loader", () => {
    let mockGetCounts: any;
    let mockGetCountsForDateRange: any;
    beforeEach(() => {
        vi.useFakeTimers();
        mockGetCounts = vi.fn().mockResolvedValue({
            views: 1000,
            visitors: 250,
            bounces: 125,
        });
        mockGetCountsForDateRange = vi
            .fn()
            .mockResolvedValueOnce({
                views: 1000,
                visitors: 250,
                bounces: 125,
            })
            .mockResolvedValueOnce({
                views: 800,
                visitors: 200,
                bounces: 100,
            });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
        cleanup();
    });

    test("returns formatted stats from analytics engine", async () => {
        vi.setSystemTime(new Date("2023-01-01T06:00:00").getTime());

        const mockGetEarliestEvents = vi.fn().mockResolvedValue({
            // earliest event and earliest bounce are the same
            earliestEvent: new Date("2023-01-01T00:00:00Z"),
            earliestBounce: new Date("2023-01-01T00:00:00Z"),
        });

        const context = {
            analyticsEngine: {
                getCounts: mockGetCounts,
                getCountsForDateRange: mockGetCountsForDateRange,
                getEarliestEvents: mockGetEarliestEvents,
            },
            cloudflare: {
                env: {
                    CF_PASSWORD_HASH: "$2b$12$test.hash.value",
                    CF_JWT_SECRET: "test-secret",
                },
            },
        };

        const request = new Request(
            "https://example.com/resources/stats?site=test-site&interval=24h&timezone=UTC",
        );

        const response = await loader({ context, request } as any);
        const data = await response;

        expect(mockGetCountsForDateRange).toHaveBeenNthCalledWith(
            1,
            "test-site",
            expect.any(Date),
            expect.any(Date),
            "UTC",
            expect.any(Object),
        );
        expect(mockGetCountsForDateRange).toHaveBeenNthCalledWith(
            2,
            "test-site",
            expect.any(Date),
            expect.any(Date),
            "UTC",
            expect.any(Object),
        );

        expect(data).toEqual({
            views: 1000,
            visitors: 250,
            bounceRate: 0.5,
            hasSufficientBounceData: true,
            comparisons: {
                previous: {
                    views: {
                        current: 1000,
                        compare: 800,
                        absoluteDelta: 200,
                        percentDelta: 0.25,
                        status: "up",
                    },
                    visitors: {
                        current: 250,
                        compare: 200,
                        absoluteDelta: 50,
                        percentDelta: 0.25,
                        status: "up",
                    },
                    bounceRate: {
                        current: 0.5,
                        compare: 0.5,
                        absoluteDelta: 0,
                        percentDelta: 0,
                        status: "flat",
                    },
                },
                yearOverYear: {
                    available: false,
                    reason: "insufficient-history",
                },
            },
            engagement: unavailableEngagement("db-unavailable"),
        });
    });

    test("includes D1 engagement overview when DB is available", async () => {
        vi.setSystemTime(new Date("2026-07-14T12:00:00Z").getTime());

        const mockGetEarliestEvents = vi.fn().mockResolvedValue({
            earliestEvent: new Date("2026-07-01T00:00:00Z"),
            earliestBounce: new Date("2026-07-01T00:00:00Z"),
        });

        const context = {
            analyticsEngine: {
                getCounts: mockGetCounts,
                getCountsForDateRange: mockGetCountsForDateRange,
                getEarliestEvents: mockGetEarliestEvents,
            },
            cloudflare: {
                env: {
                    DB: createStatsEngagementD1(),
                    CF_PASSWORD_HASH: "$2b$12$test.hash.value",
                    CF_JWT_SECRET: "test-secret",
                },
            },
        };

        const request = new Request(
            "https://example.com/resources/stats?site=test-site&interval=1d&timezone=UTC",
        );

        const data = await loader({ context, request } as any);

        expect(data.engagement).toMatchObject({
            available: true,
            visits: 2,
            pageviews: 6,
            averageDurationMs: 60_000,
            averagePageDepth: 3,
            coverageStartedAt: "2026-07-14T10:00:05.000Z",
        });
    });

    test("if bounce data isn't complete for the given interval, hasSufficientBounceData is false", async () => {
        // set system time as jan 8th
        vi.setSystemTime(new Date("2023-01-08T00:00:00").getTime());

        const mockGetEarliestEvents = vi.fn().mockResolvedValue({
            earliestEvent: new Date("2023-01-01T00:00:00Z"),
            earliestBounce: new Date("2023-01-04T00:00:00Z"), // Jan 4
        });

        const context = {
            analyticsEngine: {
                getCounts: mockGetCounts,
                getCountsForDateRange: mockGetCountsForDateRange,
                getEarliestEvents: mockGetEarliestEvents,
            },
            cloudflare: {
                env: {
                    CF_PASSWORD_HASH: "$2b$12$test.hash.value",
                    CF_JWT_SECRET: "test-secret",
                },
            },
        };

        const request = new Request(
            // 7 day interval (specified in query string)
            "https://example.com/resources/stats?site=test-site&interval=7d&timezone=UTC",
        );

        const response = await loader({ context, request } as any);
        const data = await response;

        expect(data).toMatchObject({
            views: 1000,
            visitors: 250,
            bounceRate: 0.5,
            hasSufficientBounceData: false,
            comparisons: {
                previous: {
                    bounceRate: {
                        current: 0.5,
                        compare: 0.5,
                        absoluteDelta: null,
                        percentDelta: null,
                        status: "unavailable",
                        reason: "insufficient-bounce-coverage",
                    },
                },
            },
        });
    });

    test("marks previous bounce comparison unavailable when previous window predates bounce coverage", async () => {
        vi.setSystemTime(new Date("2023-01-08T12:00:00Z").getTime());

        const mockGetEarliestEvents = vi.fn().mockResolvedValue({
            earliestEvent: new Date("2023-01-01T00:00:00Z"),
            earliestBounce: new Date("2023-01-07T12:00:00Z"),
        });

        const context = {
            analyticsEngine: {
                getCounts: mockGetCounts,
                getCountsForDateRange: mockGetCountsForDateRange,
                getEarliestEvents: mockGetEarliestEvents,
            },
            cloudflare: {
                env: {
                    CF_PASSWORD_HASH: "$2b$12$test.hash.value",
                    CF_JWT_SECRET: "test-secret",
                },
            },
        };

        const request = new Request(
            "https://example.com/resources/stats?site=test-site&interval=today&timezone=UTC",
        );

        const response = await loader({ context, request } as any);
        const data = await response;

        expect(data).toMatchObject({
            hasSufficientBounceData: true,
            comparisons: {
                previous: {
                    bounceRate: {
                        status: "unavailable",
                        reason: "insufficient-bounce-coverage",
                    },
                },
            },
        });
    });

    test("if bounce data *IS* complete for the given interval, show it", async () => {
        // set system time as jan 8th
        vi.setSystemTime(new Date("2023-01-08T00:00:00").getTime());

        const mockGetEarliestEvents = vi.fn().mockResolvedValue({
            earliestEvent: new Date("2023-01-01T00:00:00Z"),
            earliestBounce: new Date("2023-01-04T00:00:00Z"), // Jan 4 -- well before Jan 8th minus 1 day interval
        });

        const context = {
            analyticsEngine: {
                getCounts: mockGetCounts,
                getCountsForDateRange: mockGetCountsForDateRange,
                getEarliestEvents: mockGetEarliestEvents,
            },
            cloudflare: {
                env: {
                    CF_PASSWORD_HASH: "$2b$12$test.hash.value",
                    CF_JWT_SECRET: "test-secret",
                },
            },
        };

        const request = new Request(
            // 1 day interval (specified in query string)
            "https://example.com/resources/stats?site=test-site&interval=1d&timezone=UTC",
        );

        const response = await loader({ context, request } as any);
        const data = await response;

        expect(data).toMatchObject({
            views: 1000,
            visitors: 250,
            bounceRate: 0.5,
            hasSufficientBounceData: true,
            comparisons: {
                previous: {
                    views: {
                        current: 1000,
                        compare: 800,
                        absoluteDelta: 200,
                        percentDelta: 0.25,
                        status: "up",
                    },
                },
            },
        });
    });
});

describe("StatsCard engagement metrics", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    test("renders average visit duration and page depth when engagement is available", () => {
        vi.mocked(ReactRouter.useFetcher).mockReturnValue({
            state: "idle",
            submit: vi.fn(),
            data: {
                views: 100,
                visitors: 20,
                bounceRate: 0.25,
                hasSufficientBounceData: true,
                comparisons: {
                    previous: {},
                    yearOverYear: { available: false, reason: "insufficient-history" },
                },
                engagement: {
                    available: true,
                    coverageStartedAt: "2026-07-14T10:00:00.000Z",
                    visits: 2,
                    pageviews: 6,
                    averageDurationMs: 75_000,
                    averagePageDepth: 3,
                    durationBuckets: [],
                    depthBuckets: [],
                },
            },
        } as unknown as ReturnType<typeof ReactRouter.useFetcher>);

        render(
            <LocaleProvider initialLocale="zh">
                <StatsCard siteId="site-a" interval="1d" filters={{}} timezone="UTC" />
            </LocaleProvider>,
        );

        expect(screen.getByText("平均访问时长")).toBeInTheDocument();
        expect(screen.getByText("1分15秒")).toBeInTheDocument();
        expect(screen.getByText("平均访问页数")).toBeInTheDocument();
        expect(screen.getByText("3.0 页/次")).toBeInTheDocument();
    });

    test("renders n/a for engagement metrics when detail is unavailable", () => {
        vi.mocked(ReactRouter.useFetcher).mockReturnValue({
            state: "idle",
            submit: vi.fn(),
            data: {
                views: 100,
                visitors: 20,
                bounceRate: 0.25,
                hasSufficientBounceData: true,
                comparisons: {
                    previous: {},
                    yearOverYear: { available: false, reason: "insufficient-history" },
                },
                engagement: unavailableEngagement("db-unavailable"),
            },
        } as unknown as ReturnType<typeof ReactRouter.useFetcher>);

        render(
            <LocaleProvider initialLocale="zh">
                <StatsCard siteId="site-a" interval="1d" filters={{}} timezone="UTC" />
            </LocaleProvider>,
        );

        expect(screen.getByText("平均访问时长")).toBeInTheDocument();
        expect(screen.getAllByText("n/a").length).toBeGreaterThanOrEqual(2);
    });
});
