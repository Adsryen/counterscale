import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { loader } from "../resources.stats";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
    isAuthEnabled: vi.fn(() => false),
}));

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
