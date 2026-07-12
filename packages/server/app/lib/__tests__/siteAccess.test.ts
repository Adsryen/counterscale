import { describe, expect, test, vi } from "vitest";
import { canViewSiteStats } from "../siteAccess";
import * as auth from "../auth";
import * as sites from "../sites";

vi.mock("../auth", () => ({
    isAuthEnabled: vi.fn(),
    getUser: vi.fn(),
}));

vi.mock("../sites", () => ({
    getSite: vi.fn(),
}));

describe("canViewSiteStats", () => {
    test("allows when auth disabled", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(false);
        const ok = await canViewSiteStats(
            new Request("http://localhost/"),
            {} as Env,
            "blog",
        );
        expect(ok).toBe(true);
    });

    test("allows authenticated users for private sites", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);
        vi.mocked(auth.getUser).mockResolvedValue({ authenticated: true });
        vi.mocked(sites.getSite).mockResolvedValue({
            siteId: "blog",
            name: "Blog",
            enabled: true,
            publicStats: false,
            allowedHosts: null,
            createdAt: "",
            updatedAt: "",
        });
        const ok = await canViewSiteStats(
            new Request("http://localhost/"),
            { DB: {} } as Env,
            "blog",
        );
        expect(ok).toBe(true);
    });

    test("blocks anonymous for private registry site", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);
        vi.mocked(auth.getUser).mockResolvedValue({ authenticated: false });
        vi.mocked(sites.getSite).mockResolvedValue({
            siteId: "blog",
            name: "Blog",
            enabled: true,
            publicStats: false,
            allowedHosts: null,
            createdAt: "",
            updatedAt: "",
        });
        const ok = await canViewSiteStats(
            new Request("http://localhost/"),
            { DB: {} } as Env,
            "blog",
        );
        expect(ok).toBe(false);
    });

    test("allows anonymous for public registry site", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);
        vi.mocked(auth.getUser).mockResolvedValue({ authenticated: false });
        vi.mocked(sites.getSite).mockResolvedValue({
            siteId: "blog",
            name: "Blog",
            enabled: true,
            publicStats: true,
            allowedHosts: null,
            createdAt: "",
            updatedAt: "",
        });
        const ok = await canViewSiteStats(
            new Request("http://localhost/"),
            { DB: {} } as Env,
            "blog",
        );
        expect(ok).toBe(true);
    });

    test("allows anonymous for sites not in registry", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);
        vi.mocked(auth.getUser).mockResolvedValue({ authenticated: false });
        vi.mocked(sites.getSite).mockResolvedValue(null);
        const ok = await canViewSiteStats(
            new Request("http://localhost/"),
            { DB: {} } as Env,
            "ae-only",
        );
        expect(ok).toBe(true);
    });
});
