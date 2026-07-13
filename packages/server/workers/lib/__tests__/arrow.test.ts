import { afterEach, describe, expect, test, vi } from "vitest";

import { AnalyticsEngineAPI } from "../../../app/analytics/query";
import {
    extractAsArrow,
    METRICS_V1_ROLLUP_SPECS,
} from "../arrow";

describe("metrics v1 R2 rollup", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("uses explicit dimension specs instead of every ColumnMappings key", () => {
        expect(METRICS_V1_ROLLUP_SPECS.map((spec) => spec.id)).toEqual([
            "core-daily",
            "content-source-top",
            "geo-device-top",
        ]);

        const allDimensions = METRICS_V1_ROLLUP_SPECS.flatMap((spec) =>
            Array.from(spec.dimensions),
        );
        expect(allDimensions).not.toContain("siteId");
        expect(allDimensions).not.toContain("newVisitor");
        expect(allDimensions).not.toContain("newSession");
        expect(allDimensions).not.toContain("bounce");
        expect(allDimensions).not.toContain("userAgent");
        expect(allDimensions).not.toContain("deviceModel");
    });

    test("writes one versioned Arrow file per rollup spec", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-13T08:00:00Z"));

        const getAllCounts = vi
            .spyOn(
                AnalyticsEngineAPI.prototype,
                "getAllCountsByAllColumnsForAllSites",
            )
            .mockImplementation(async (columns) => {
                const values = columns.map((column) => `${column}-value`);
                return new Map([
                    [
                        ["2026-07-12T00:00:00.000Z", "site-a", ...values],
                        { views: 10, visitors: 3, bounces: 1 },
                    ],
                ]);
            });

        const put = vi.fn(async (_filename: string, _data: Uint8Array) => null);
        const bucket = { put } as unknown as R2Bucket;

        const result = await extractAsArrow(
            { accountId: "account", bearerToken: "token" },
            bucket,
        );

        expect(getAllCounts).toHaveBeenCalledTimes(METRICS_V1_ROLLUP_SPECS.length);
        METRICS_V1_ROLLUP_SPECS.forEach((spec, index) => {
            expect(getAllCounts.mock.calls[index][0]).toEqual(spec.dimensions);
        });
        expect(put.mock.calls.map((call) => call[0])).toEqual([
            "analytics/v1/core-daily/2026-07-12.arrow",
            "analytics/v1/content-source-top/2026-07-12.arrow",
            "analytics/v1/geo-device-top/2026-07-12.arrow",
        ]);
        expect(result.files.map((file) => file.specId)).toEqual(
            METRICS_V1_ROLLUP_SPECS.map((spec) => spec.id),
        );
        expect(result.recordCount).toBe(3);
        expect(result.filename).toBe("analytics/v1/core-daily/2026-07-12.arrow");
    });
});
