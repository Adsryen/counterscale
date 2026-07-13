/*eslint @typescript-eslint/no-explicit-any: 0 */
import { Mock, describe, expect, test, vi, beforeEach } from "vitest";
import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";
import httpMocks from "node-mocks-http";

import { collectRequestHandler } from "../collect";

const defaultRequestParams = generateRequestParams({
    "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
});

function generateRequestParams(headers: Record<string, string>) {
    return {
        method: "GET",
        url:
            "https://example.com/user/42?" +
            new URLSearchParams({
                sid: "example",
                h: "example.com",
                p: "/post/123",
                r: "https://google.com",
                nv: "1",
                ns: "1",
                us: "google",
                um: "search",
                uc: "summer_sale",
                ut: "running_shoes",
                uco: "ad1",
            }).toString(),
        headers: {
            get: (_header: string) => {
                return headers[_header];
            },
        },
        // Cloudflare-specific request properties
        cf: {
            country: "US",
        },
    };
}

describe("collectRequestHandler", () => {
    test("returns 400 when siteId is missing", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        request.url =
            "https://example.com/user/42?" +
            new URLSearchParams({
                h: "example.com",
                p: "/post/123",
                r: "https://google.com",
                nv: "1",
                ns: "1",
            }).toString();

        const response = await collectRequestHandler(request as any, env);
        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("returns 400 when siteId is empty string", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        request.url =
            "https://example.com/user/42?" +
            new URLSearchParams({
                sid: "",
                h: "example.com",
                p: "/post/123",
                r: "https://google.com",
                nv: "1",
                ns: "1",
            }).toString();

        const response = await collectRequestHandler(request as any, env);
        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    beforeEach(() => {
        // default time is just middle of the day
        vi.setSystemTime(new Date("2024-01-18T09:33:02").getTime());
    });

    test("invokes writeDataPoint with transformed params", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        // @ts-expect-error - we're mocking the request object
        const request = httpMocks.createRequest(defaultRequestParams);

        await collectRequestHandler(request as any, env, {
            country: "US",
            region: "California",
            city: "San Francisco",
            regionCode: "CA",
            latitude: "37.7749",
            longitude: "-122.4194",
        });

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();

        // verify data shows up in the right place
        expect((writeDataPoint as Mock).mock.calls[0][0]).toEqual({
            blobs: [
                "example.com", // host
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36", // ua string
                "/post/123", // url
                "US", // country
                "https://google.com", // referrer
                "Chrome", // browser name
                "",
                "example", // site id
                "51.x.x.x", // browser version
                "desktop", // device type
                "google", // utm_source
                "search", // utm_medium
                "summer_sale", // utm_campaign
                "running_shoes", // utm_term
                "ad1", // utm_content
                "California", // region
                "San Francisco", // city
                "CA", // regionCode
            ],
            doubles: [
                1, // new visitor
                0, // DEAD COLUMN (was session)
                1, // new visit, so bounce
                37.7749, // latitude
                -122.4194, // longitude
            ],
            indexes: [
                "example", // site id is index
            ],
        });
    });

    test("if-modified-since is absent", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        // @ts-expect-error - we're mocking the request object
        const request = httpMocks.createRequest(generateRequestParams({}));

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor
                0, // DEAD COLUMN (was session)
                1, // new visit, so bounce,
                0,
                0,
            ],
        );
    });

    test("if-modified-since is within 30 minutes", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 5 * 60 * 1000, // 5 mins ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                0, // NOT a new visitor
                0, // DEAD COLUMN (was session)
                0, // NOT first or second visit,
                0,
                0,
            ],
        );
    });

    test("if-modified since is within 30 minutes but over day boundary", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        // intentionally set system time as 00:15:00
        // if the user last visited ~30 minutes ago, that occurred during
        // the prior day, so this should be considered a new visit
        vi.setSystemTime(new Date("2024-01-18T00:15:00").getTime());

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 25 * 60 * 1000, // 25 minutes ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor because a new day began
                0, // DEAD COLUMN (was session)
                1, // new visitor so bounce counted,
                0,
                0,
            ],
        );
    });

    test("if-modified-since is over 30 days ago", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor because > 30 days passed
                0, // DEAD COLUMN (was session)
                1, // new visitor so bounce
                0,
                0,
            ],
        );
    });

    test("if-modified-since was yesterday", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": new Date(
                    Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
                ).toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                1, // new visitor because > 24 hours passed
                0, // DEAD COLUMN (was session)
                1, // new visitor so bounce
                0,
                0,
            ],
        );
    });

    test("if-modified-since is one second after midnight", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        vi.setSystemTime(midnight.getTime());

        const midnightPlusOneSecond = new Date(midnight.getTime());
        midnightPlusOneSecond.setSeconds(
            midnightPlusOneSecond.getSeconds() + 1,
        );

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": midnightPlusOneSecond.toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                0, // NOT a new visitor
                0, // DEAD COLUMN (was session)
                -1, // First visit after the initial visit so decrement bounce,
                0,
                0,
            ],
        );
    });

    test("if-modified-since is two seconds after midnight", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const midnightPlusOneSecond = new Date();
        midnightPlusOneSecond.setHours(0, 0, 1, 0);

        vi.setSystemTime(midnightPlusOneSecond.getTime());

        const midnightPlusTwoSeconds = new Date(
            midnightPlusOneSecond.getTime(),
        );
        midnightPlusTwoSeconds.setSeconds(
            midnightPlusTwoSeconds.getSeconds() + 1,
        );

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "if-modified-since": midnightPlusTwoSeconds.toUTCString(),
            }),
        );

        await collectRequestHandler(request as any, env);

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect((writeDataPoint as Mock).mock.calls[0][0]).toHaveProperty(
            "doubles",
            [
                0, // NOT a new visitor
                0, // DEAD COLUMN (was session)
                0, // After the second visit so no bounce,
                0,
                0,
            ],
        );
    });

    test("handles UTM parameters correctly", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });

        await collectRequestHandler(request as any, env, {
            country: "US",
        });

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();

        const blobs = (writeDataPoint as Mock).mock.calls[0][0].blobs;
        expect(blobs[10]).toBe("google"); // utm_source
        expect(blobs[11]).toBe("search"); // utm_medium
        expect(blobs[12]).toBe("summer_sale"); // utm_campaign
        expect(blobs[13]).toBe("running_shoes"); // utm_term
        expect(blobs[14]).toBe("ad1"); // utm_content
    });

    test("handles missing UTM parameters gracefully", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = generateRequestParams({
            "user-agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        });
        // Remove UTM parameters from URL
        request.url = request.url
            .replace(/&us=[^&]*/, "")
            .replace(/&um=[^&]*/, "")
            .replace(/&uc=[^&]*/, "")
            .replace(/&ut=[^&]*/, "")
            .replace(/&uco=[^&]*/, "");

        await collectRequestHandler(request as any, env, {
            country: "US",
        });

        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();

        const blobs = (writeDataPoint as Mock).mock.calls[0][0].blobs;
        expect(blobs[10]).toBe(""); // utm_source (empty)
        expect(blobs[11]).toBe(""); // utm_medium (empty)
        expect(blobs[12]).toBe(""); // utm_campaign (empty)
        expect(blobs[13]).toBe(""); // utm_term (empty)
        expect(blobs[14]).toBe(""); // utm_content (empty)
    });

    test("accepts optional identity params without changing AE schema or trusting self-reported IP", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({
                "user-agent":
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
            }),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "visitor-123");
        url.searchParams.set("vid", "visit-123");
        url.searchParams.set("tid", "tab-123");
        url.searchParams.set("isc", "persistent");
        url.searchParams.set("ct", "1767225600000");
        url.searchParams.set("ip", "203.0.113.10");
        url.searchParams.set("client_ip", "198.51.100.20");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env, {
            country: "US",
        });

        expect(response.status).toBe(200);
        const writeDataPoint = env.WEB_COUNTER_AE.writeDataPoint;
        expect(writeDataPoint).toHaveBeenCalled();
        const datapoint = (writeDataPoint as Mock).mock.calls[0][0];
        expect(datapoint.blobs).toHaveLength(18);
        expect(datapoint.doubles).toHaveLength(5);
        expect(datapoint.blobs).not.toContain("203.0.113.10");
        expect(datapoint.blobs).not.toContain("198.51.100.20");
    });

    test("returns 400 for overlong identity ids", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "x".repeat(129));
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env);

        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("returns 400 for invalid identity scope", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;

        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("isc", "device");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env);

        expect(response.status).toBe(400);
        expect(env.WEB_COUNTER_AE.writeDataPoint).not.toHaveBeenCalled();
    });

    test("ignores abnormal client time and keeps server time as the cache header source", async () => {
        const env = {
            WEB_COUNTER_AE: {
                writeDataPoint: vi.fn(),
            } as AnalyticsEngineDataset,
        } as Env;
        const request = httpMocks.createRequest(
            // @ts-expect-error - we're mocking the request object
            generateRequestParams({}),
        );
        const url = new URL(request.url);
        url.searchParams.set("cid", "visitor-123");
        url.searchParams.set("vid", "visit-123");
        url.searchParams.set("tid", "tab-123");
        url.searchParams.set("isc", "persistent");
        url.searchParams.set("ct", "999999999999999999999999999999999999");
        request.url = url.toString();

        const response = await collectRequestHandler(request as any, env);
        const expectedLastModified = new Date(Date.now());
        expectedLastModified.setHours(0, 0, 1, 0);

        expect(response.status).toBe(200);
        expect(response.headers.get("Last-Modified")).toBe(
            expectedLastModified.toUTCString(),
        );
        expect(env.WEB_COUNTER_AE.writeDataPoint).toHaveBeenCalled();
    });

});
