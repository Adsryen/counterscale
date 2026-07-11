// @vitest-environment jsdom
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
    vi,
    test,
    describe,
    beforeEach,
    afterEach,
    expect,
} from "vitest";
import "vitest-dom/extend-expect";

import { createRoutesStub } from "react-router";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

import AdminSites, { action, loader } from "../admin";
import { requireAuth } from "~/lib/auth";
import * as sites from "~/lib/sites";

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
        createSite: vi.fn(),
        updateSite: vi.fn(),
        deleteSite: vi.fn(),
    };
});

describe("admin route", () => {
    beforeEach(() => {
        vi.mocked(requireAuth).mockResolvedValue({ authenticated: true } as any);
        vi.mocked(sites.listSites).mockResolvedValue([
            {
                siteId: "blog",
                name: "Blog",
                enabled: true,
                allowedHosts: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        ]);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    test("loader requires auth and lists sites", async () => {
        const fakeDb = {} as D1Database;
        const result = await loader({
            request: new Request("http://localhost/admin"),
            context: {
                cloudflare: {
                    env: { DB: fakeDb },
                },
            },
        } as unknown as LoaderFunctionArgs);

        expect(requireAuth).toHaveBeenCalled();
        expect(sites.listSites).toHaveBeenCalledWith(fakeDb);
        expect(result.sites).toHaveLength(1);
    });

    test("loader 501 when DB missing", async () => {
        try {
            await loader({
                request: new Request("http://localhost/admin"),
                context: {
                    cloudflare: {
                        env: {},
                    },
                },
            } as unknown as LoaderFunctionArgs);
            expect.unreachable("should throw");
        } catch (err) {
            expect(err).toBeInstanceOf(Response);
            expect((err as Response).status).toBe(501);
        }
    });

    test("action create calls createSite", async () => {
        const fakeDb = {} as D1Database;
        vi.mocked(sites.createSite).mockResolvedValue({
            siteId: "shop",
            name: "Shop",
            enabled: true,
            allowedHosts: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        });

        const form = new FormData();
        form.set("intent", "create");
        form.set("siteId", "shop");
        form.set("name", "Shop");

        const result = await action({
            request: new Request("http://localhost/admin", {
                method: "POST",
                body: form,
            }),
            context: {
                cloudflare: {
                    env: { DB: fakeDb },
                },
            },
        } as unknown as ActionFunctionArgs);

        expect(result.ok).toBe(true);
        expect(sites.createSite).toHaveBeenCalled();
    });

    test("renders site list", async () => {
        const RemixStub = createRoutesStub([
            {
                path: "/admin",
                Component: AdminSites,
                loader: () => ({
                    sites: [
                        {
                            siteId: "blog",
                            name: "Blog",
                            enabled: true,
                            allowedHosts: null,
                            createdAt: "2026-01-01T00:00:00.000Z",
                            updatedAt: "2026-01-01T00:00:00.000Z",
                        },
                    ],
                }),
            },
        ]);

        render(<RemixStub initialEntries={["/admin"]} />);

        await waitFor(() => {
            expect(screen.getByText("Admin")).toBeInTheDocument();
        });
        expect(screen.getByText("Blog")).toBeInTheDocument();
        expect(screen.getByText("blog")).toBeInTheDocument();
        expect(screen.getByText("Add site")).toBeInTheDocument();
    });
});
