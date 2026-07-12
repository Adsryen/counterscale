// @vitest-environment jsdom
import { test, describe, expect } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { loader } from "../_index";

describe("home index", () => {
    test("redirects to public /dashboard", async () => {
        try {
            await loader({
                request: new Request("http://localhost/"),
                context: {},
                params: {},
            } as unknown as LoaderFunctionArgs);
            expect.unreachable("should redirect");
        } catch (err) {
            expect(err).toBeInstanceOf(Response);
            expect((err as Response).status).toBe(302);
            expect((err as Response).headers.get("Location")).toBe(
                "/dashboard",
            );
        }
    });
});
