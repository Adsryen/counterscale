import type { LoaderFunctionArgs } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { loader } from "../resources.realtime";
import { requireAuth } from "~/lib/auth";
import { getRealtimeDashboardData } from "~/lib/realtime";

vi.mock("~/lib/auth", () => ({
    requireAuth: vi.fn(),
}));

vi.mock("~/lib/realtime", () => ({
    getRealtimeDashboardData: vi.fn(),
}));

describe("resources.realtime loader", () => {
    afterEach(() => {
        vi.resetAllMocks();
    });

    test("requires auth and returns realtime data for the requested site", async () => {
        vi.mocked(getRealtimeDashboardData).mockResolvedValue({
            siteId: "site-a",
            generatedAt: "2026-07-14T00:00:00.000Z",
            currentOnline: { available: true, error: null, count: 0, visits: [] },
            recentActive: { available: true, error: null, visits5m: 1, visits30m: 2 },
        });

        const context = { cloudflare: { env: { DB: {} } } };
        const request = new Request("https://example.com/resources/realtime?site=site-a");
        const data = await loader({ request, context } as unknown as LoaderFunctionArgs);

        expect(requireAuth).toHaveBeenCalledWith(request, context.cloudflare.env);
        expect(getRealtimeDashboardData).toHaveBeenCalledWith(context.cloudflare.env, "site-a");
        expect(data.recentActive.visits5m).toBe(1);
    });

    test("rejects missing site", async () => {
        await expect(
            loader({
                request: new Request("https://example.com/resources/realtime"),
                context: { cloudflare: { env: {} } },
            } as unknown as LoaderFunctionArgs),
        ).rejects.toMatchObject({ status: 400 });
    });
});
