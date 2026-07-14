import { describe, expect, test } from "vitest";

import {
    buildComparisonWindows,
    calculateMetricComparison,
    isWindowCovered,
} from "../comparison";

function iso(date: Date) {
    return date.toISOString();
}

describe("buildComparisonWindows", () => {
    test("builds today against yesterday at the same elapsed time", () => {
        const windows = buildComparisonWindows(
            "today",
            "UTC",
            new Date("2026-07-14T15:30:00Z"),
        );

        expect(iso(windows.current.startDate)).toBe(
            "2026-07-14T00:00:00.000Z",
        );
        expect(iso(windows.current.endDate)).toBe(
            "2026-07-14T15:30:00.000Z",
        );
        expect(iso(windows.previous.startDate)).toBe(
            "2026-07-13T00:00:00.000Z",
        );
        expect(iso(windows.previous.endDate)).toBe(
            "2026-07-13T15:30:00.000Z",
        );
        expect(iso(windows.yearOverYear.startDate)).toBe(
            "2025-07-14T00:00:00.000Z",
        );
        expect(iso(windows.yearOverYear.endDate)).toBe(
            "2025-07-14T15:30:00.000Z",
        );
    });

    test("builds yesterday against the previous full day", () => {
        const windows = buildComparisonWindows(
            "yesterday",
            "UTC",
            new Date("2026-07-14T15:30:00Z"),
        );

        expect(iso(windows.current.startDate)).toBe(
            "2026-07-13T00:00:00.000Z",
        );
        expect(iso(windows.current.endDate)).toBe(
            "2026-07-14T00:00:00.000Z",
        );
        expect(iso(windows.previous.startDate)).toBe(
            "2026-07-12T00:00:00.000Z",
        );
        expect(iso(windows.previous.endDate)).toBe(
            "2026-07-13T00:00:00.000Z",
        );
    });

    test("uses timezone day boundaries for rolling multi-day windows", () => {
        const windows = buildComparisonWindows(
            "7d",
            "Asia/Shanghai",
            new Date("2026-07-14T15:30:00Z"),
        );

        expect(iso(windows.current.startDate)).toBe(
            "2026-07-06T16:00:00.000Z",
        );
        expect(iso(windows.current.endDate)).toBe(
            "2026-07-14T15:30:00.000Z",
        );
        expect(iso(windows.previous.endDate)).toBe(
            "2026-07-06T16:00:00.000Z",
        );
        expect(
            windows.previous.endDate.getTime() -
                windows.previous.startDate.getTime(),
        ).toBe(
            windows.current.endDate.getTime() -
                windows.current.startDate.getTime(),
        );
    });
});

describe("isWindowCovered", () => {
    test("requires the earliest event to be at or before the comparison start", () => {
        const window = {
            startDate: new Date("2026-01-01T00:00:00Z"),
            endDate: new Date("2026-01-02T00:00:00Z"),
        };

        expect(isWindowCovered(new Date("2025-12-31T23:59:59Z"), window)).toBe(
            true,
        );
        expect(isWindowCovered(new Date("2026-01-01T00:00:00Z"), window)).toBe(
            true,
        );
        expect(isWindowCovered(new Date("2026-01-01T00:00:01Z"), window)).toBe(
            false,
        );
        expect(isWindowCovered(null, window)).toBe(false);
    });
});

describe("calculateMetricComparison", () => {
    test("calculates normal deltas", () => {
        expect(calculateMetricComparison(100, 80)).toEqual({
            current: 100,
            compare: 80,
            absoluteDelta: 20,
            percentDelta: 0.25,
            status: "up",
        });
        expect(calculateMetricComparison(80, 100)).toEqual({
            current: 80,
            compare: 100,
            absoluteDelta: -20,
            percentDelta: -0.2,
            status: "down",
        });
    });

    test("does not emit NaN or Infinity for zero baselines", () => {
        expect(calculateMetricComparison(0, 0)).toEqual({
            current: 0,
            compare: 0,
            absoluteDelta: 0,
            percentDelta: 0,
            status: "flat",
        });
        expect(calculateMetricComparison(12, 0)).toEqual({
            current: 12,
            compare: 0,
            absoluteDelta: 12,
            percentDelta: null,
            status: "new",
            reason: "zero-baseline",
        });
        expect(calculateMetricComparison(0, 12)).toEqual({
            current: 0,
            compare: 12,
            absoluteDelta: -12,
            percentDelta: -1,
            status: "cleared",
        });
    });

    test("marks unavailable comparisons with a reason", () => {
        expect(
            calculateMetricComparison(10, 8, "insufficient-history"),
        ).toEqual({
            current: 10,
            compare: 8,
            absoluteDelta: null,
            percentDelta: null,
            status: "unavailable",
            reason: "insufficient-history",
        });
    });
});
