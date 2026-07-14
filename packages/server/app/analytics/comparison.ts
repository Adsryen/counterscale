import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export type ComparisonStatus =
    | "up"
    | "down"
    | "flat"
    | "new"
    | "cleared"
    | "unavailable";

export type ComparisonReason =
    | "zero-baseline"
    | "insufficient-history"
    | "insufficient-bounce-coverage";

export interface DateRangeWindow {
    startDate: Date;
    endDate: Date;
}

export interface ComparisonWindows {
    current: DateRangeWindow;
    previous: DateRangeWindow;
    yearOverYear: DateRangeWindow;
}

export interface MetricComparison {
    current: number | null;
    compare: number | null;
    absoluteDelta: number | null;
    percentDelta: number | null;
    status: ComparisonStatus;
    reason?: ComparisonReason;
}

function intervalDays(interval: string) {
    const match = /^(\d+)d$/.exec(interval);
    return match ? Number(match[1]) : 1;
}

function shiftWindow(
    window: DateRangeWindow,
    amount: number,
    unit: dayjs.ManipulateType,
    tz: string,
): DateRangeWindow {
    return {
        startDate: dayjs(window.startDate).tz(tz).add(amount, unit).toDate(),
        endDate: dayjs(window.endDate).tz(tz).add(amount, unit).toDate(),
    };
}

export function buildComparisonWindows(
    interval: string,
    tz: string,
    now: Date = new Date(),
): ComparisonWindows {
    const localNow = dayjs(now).tz(tz);
    let currentStart = localNow.subtract(intervalDays(interval), "day");
    let currentEnd = localNow;
    let previousStart: dayjs.Dayjs | undefined;
    let previousEnd: dayjs.Dayjs | undefined;

    if (interval === "today") {
        currentStart = localNow.startOf("day");
        const elapsedMs = currentEnd.valueOf() - currentStart.valueOf();
        previousStart = currentStart.subtract(1, "day");
        previousEnd = previousStart.add(elapsedMs, "millisecond");
    } else if (interval === "yesterday") {
        currentStart = localNow.startOf("day").subtract(1, "day");
        currentEnd = currentStart.add(1, "day");
    } else if (/^(7|30|90)d$/.test(interval)) {
        currentStart = localNow.subtract(intervalDays(interval), "day").startOf("day");
    } else {
        currentStart = localNow.subtract(intervalDays(interval), "day").startOf("hour");
    }

    const current = {
        startDate: currentStart.toDate(),
        endDate: currentEnd.toDate(),
    };

    const durationMs = current.endDate.getTime() - current.startDate.getTime();
    const previous = {
        startDate: previousStart
            ? previousStart.toDate()
            : new Date(current.startDate.getTime() - durationMs),
        endDate: previousEnd ? previousEnd.toDate() : current.startDate,
    };

    return {
        current,
        previous,
        yearOverYear: shiftWindow(current, -1, "year", tz),
    };
}

export function isWindowCovered(
    earliestEvent: Date | null,
    window: DateRangeWindow,
) {
    return (
        earliestEvent !== null &&
        earliestEvent.getTime() <= window.startDate.getTime()
    );
}

export function calculateMetricComparison(
    current: number | null | undefined,
    compare: number | null | undefined,
    unavailableReason?: ComparisonReason,
): MetricComparison {
    if (
        unavailableReason ||
        current === null ||
        current === undefined ||
        compare === null ||
        compare === undefined
    ) {
        return {
            current: current ?? null,
            compare: compare ?? null,
            absoluteDelta: null,
            percentDelta: null,
            status: "unavailable",
            ...(unavailableReason ? { reason: unavailableReason } : {}),
        };
    }

    const absoluteDelta = current - compare;

    if (absoluteDelta === 0) {
        return {
            current,
            compare,
            absoluteDelta,
            percentDelta: 0,
            status: "flat",
        };
    }

    if (compare === 0) {
        return {
            current,
            compare,
            absoluteDelta,
            percentDelta: null,
            status: current > 0 ? "new" : "cleared",
            reason: "zero-baseline",
        };
    }

    if (current === 0) {
        return {
            current,
            compare,
            absoluteDelta,
            percentDelta: -1,
            status: "cleared",
        };
    }

    return {
        current,
        compare,
        absoluteDelta,
        percentDelta: absoluteDelta / Math.abs(compare),
        status: absoluteDelta > 0 ? "up" : "down",
    };
}
