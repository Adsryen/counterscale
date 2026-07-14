// @vitest-environment jsdom

import { ReactNode } from "react";
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { loader, TimeSeriesCard } from "../resources.timeseries";
import * as RemixReact from "react-router";
import "vitest-dom/extend-expect";
import { getDefaultContext } from "./testutils";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
    isAuthEnabled: vi.fn(() => false),
}));

// Mock the useFetcher hook
vi.mock("react-router", async () => {
    const actual = await vi.importActual("react-router");
    return {
        ...actual,
        useFetcher: vi.fn(),
    };
});

describe("resources.timeseries loader", () => {
    const { context } = getDefaultContext();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-14T12:00:00Z"));
        vi.spyOn(
            context.analyticsEngine,
            "getViewsGroupedByInterval",
        )
            .mockResolvedValueOnce([
                [
                    "2024-01-15T00:00:00Z",
                    { views: 100, visitors: 10, bounces: 2 },
                ],
                [
                    "2024-01-16T00:00:00Z",
                    { views: 200, visitors: 20, bounces: 5 },
                ],
            ])
            .mockResolvedValueOnce([
                [
                    "2024-01-08T00:00:00Z",
                    { views: 80, visitors: 8, bounces: 1 },
                ],
                [
                    "2024-01-09T00:00:00Z",
                    { views: 120, visitors: 12, bounces: 3 },
                ],
            ]);
        vi.spyOn(context.analyticsEngine, "getEarliestEvents").mockResolvedValue(
            {
                earliestEvent: new Date("2020-01-01T00:00:00Z"),
                earliestBounce: new Date("2020-01-01T00:00:00Z"),
            },
        );

        // mock out responsive container to just return a standard div, otherwise
        // recharts doesnt render underneath
        vi.mock("recharts", async () => {
            const OriginalModule = await vi.importActual("recharts");
            return {
                ...OriginalModule,
                ResponsiveContainer: ({
                    children,
                }: {
                    children: ReactNode;
                }) => <div>{children}</div>,
            };
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("processes data correctly", async () => {
        const request = new Request(
            "http://test.com?interval=7d&site=test-site&timezone=UTC",
        );
        // @ts-expect-error we don't need to provide all the properties of the context object
        const result = await loader({
            context,
            request,
        });

        const data = await result;
        expect(data.chartData).toEqual([
            {
                date: "2024-01-15T00:00:00Z",
                views: 100,
                visitors: 10,
                bounceRate: 20,
                previousViews: 80,
                previousVisitors: 8,
                previousBounceRate: 12,
            },
            {
                date: "2024-01-16T00:00:00Z",
                views: 200,
                visitors: 20,
                bounceRate: 25,
                previousViews: 120,
                previousVisitors: 12,
                previousBounceRate: 25,
            },
        ]);
        expect(data.intervalType).toBe("DAY");

        expect(context.analyticsEngine.getViewsGroupedByInterval).toHaveBeenNthCalledWith(
            1,
            "test-site",
            "DAY",
            expect.any(Date),
            expect.any(Date),
            "UTC",
            {},
        );
        expect(context.analyticsEngine.getViewsGroupedByInterval).toHaveBeenNthCalledWith(
            2,
            "test-site",
            "DAY",
            expect.any(Date),
            expect.any(Date),
            "UTC",
            {},
        );
    });

    test("omits previous bounce rate when previous window predates bounce coverage", async () => {
        vi.mocked(context.analyticsEngine.getEarliestEvents).mockResolvedValue({
            earliestEvent: new Date("2020-01-01T00:00:00Z"),
            earliestBounce: new Date("2026-07-05T00:00:00Z"),
        });

        const request = new Request(
            "http://test.com?interval=7d&site=test-site&timezone=UTC",
        );

        const result = await loader({
            context,
            request,
        } as any);
        const data = await result;

        expect(data.chartData[0]).toMatchObject({
            previousViews: 80,
            previousVisitors: 8,
        });
        expect(data.chartData[0]).not.toHaveProperty("previousBounceRate");
    });
});

describe("TimeSeriesCard", () => {
    const mockFetcher = {
        submit: vi.fn(),
        data: {
            chartData: [
                { date: "2024-01-15T00:00:00Z", views: 100 },
                { date: "2024-01-16T00:00:00Z", views: 200 },
            ],
            intervalType: "DAY",
        },
    };

    beforeEach(() => {
        // Clear mock call counts before each test
        mockFetcher.submit.mockClear();

        // @ts-expect-error we don't need to provide all the properties of the mockFetcher
        vi.mocked(RemixReact.useFetcher).mockReturnValue(mockFetcher);

        // Mock ResizeObserver for recharts
        global.ResizeObserver = vi.fn().mockImplementation(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("fetches data on mount", () => {
        const props = {
            siteId: "test-site",
            interval: "7d",
            filters: {},
            timezone: "UTC",
        };

        render(<TimeSeriesCard {...props} />);

        expect(mockFetcher.submit).toHaveBeenCalledWith(
            expect.any(URLSearchParams),
            {
                method: "get",
                action: "/resources/timeseries",
            },
        );
        const params = mockFetcher.submit.mock.calls[0][0] as URLSearchParams;
        expect(params.toString()).toBe(
            new URLSearchParams({
                site: "test-site",
                interval: "7d",
                timezone: "UTC",
            }).toString(),
        );
    });

    test("renders TimeSeriesChart when data is available", async () => {
        const props = {
            siteId: "test-site",
            interval: "7d",
            filters: {},
            timezone: "UTC",
        };

        render(<TimeSeriesCard {...props} />);

        // Wait for the chart to be rendered
        await waitFor(() => screen.getAllByText("Mon, Jan 15").length > 0);
    });

    test("refetches when props change", () => {
        expect(mockFetcher.submit).toHaveBeenCalledTimes(0);

        const props = {
            siteId: "test-site",
            interval: "7d",
            filters: {},
            timezone: "UTC",
        };

        const { rerender } = render(<TimeSeriesCard {...props} />);

        // Change interval
        rerender(<TimeSeriesCard {...props} interval="1d" />);

        expect(mockFetcher.submit).toHaveBeenCalledTimes(2);
        expect(mockFetcher.submit).toHaveBeenLastCalledWith(
            expect.any(URLSearchParams),
            {
                method: "get",
                action: "/resources/timeseries",
            },
        );
        const params = mockFetcher.submit.mock.calls[1][0] as URLSearchParams;
        expect(params.get("interval")).toBe("1d");
    });
});
