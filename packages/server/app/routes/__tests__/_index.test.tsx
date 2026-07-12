// @vitest-environment jsdom
import { test, describe, expect, vi, beforeEach, afterEach } from "vitest";
import "vitest-dom/extend-expect";

import { createRoutesStub } from "react-router";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

import Index, { loader } from "../_index";
import * as auth from "~/lib/auth";
import { LocaleProvider } from "~/i18n/LocaleContext";

vi.mock("~/lib/auth", async () => {
    const actual = await vi.importActual("~/lib/auth");
    return {
        ...actual,
        isAuthEnabled: vi.fn().mockReturnValue(true),
    };
});

function wrap(ui: React.ReactNode) {
    return <LocaleProvider initialLocale="en">{ui}</LocaleProvider>;
}

describe("Home (public front)", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    test("renders public home without password field", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);

        const RemixStub = createRoutesStub([
            {
                path: "/",
                Component: Index,
                loader: () => ({
                    user: { authenticated: false },
                    authEnabled: true,
                }),
            },
        ]);

        render(wrap(<RemixStub />));

        await waitFor(() => {
            expect(
                screen.getByText("Self-hosted web analytics"),
            ).toBeInTheDocument();
        });

        expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
            "href",
            "/login",
        );
    });

    test("signed-in user sees open console", async () => {
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);

        const RemixStub = createRoutesStub([
            {
                path: "/",
                Component: Index,
                loader: () => ({
                    user: { authenticated: true },
                    authEnabled: true,
                }),
            },
        ]);

        render(wrap(<RemixStub />));

        await waitFor(() => {
            expect(
                screen.getByRole("link", { name: "Open console" }),
            ).toHaveAttribute("href", "/console");
        });
    });
});

describe("home loader", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("does not redirect guests", async () => {
        vi.spyOn(auth, "getUser").mockResolvedValue({ authenticated: false });
        vi.mocked(auth.isAuthEnabled).mockReturnValue(true);

        const result = await loader({
            request: new Request("http://localhost/"),
            context: {
                cloudflare: {
                    env: {
                        CF_PASSWORD_HASH: "$2b$12$test.hash.value",
                        CF_JWT_SECRET: "test-secret",
                    },
                },
            },
            params: {},
        } as any);

        expect(result).toEqual({
            user: { authenticated: false },
            authEnabled: true,
        });
    });
});
