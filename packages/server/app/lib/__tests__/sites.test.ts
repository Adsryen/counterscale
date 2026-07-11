import { describe, expect, test, vi, beforeEach } from "vitest";
import {
    createSite,
    deleteSite,
    getSite,
    isValidSiteId,
    listSites,
    sanitizeSiteId,
    updateSite,
} from "../sites";

type Row = {
    site_id: string;
    name: string;
    enabled: number;
    allowed_hosts: string | null;
    created_at: string;
    updated_at: string;
};

function createMemoryD1(initial: Row[] = []) {
    const rows = new Map<string, Row>(initial.map((r) => [r.site_id, { ...r }]));

    function prepare(sql: string) {
        const binds: unknown[] = [];
        const stmt = {
            bind(...args: unknown[]) {
                binds.push(...args);
                return stmt;
            },
            async first<T>() {
                if (sql.includes("WHERE site_id = ?")) {
                    const id = String(binds[0]);
                    return (rows.get(id) as T) ?? null;
                }
                return null;
            },
            async all<T>() {
                if (sql.includes("FROM sites")) {
                    const list = Array.from(rows.values()).sort((a, b) =>
                        a.name.localeCompare(b.name, undefined, {
                            sensitivity: "base",
                        }),
                    );
                    return { results: list as T[] };
                }
                return { results: [] as T[] };
            },
            async run() {
                if (sql.startsWith("INSERT")) {
                    const [site_id, name, enabled, allowed_hosts, created_at, updated_at] =
                        binds as [
                            string,
                            string,
                            number,
                            string | null,
                            string,
                            string,
                        ];
                    if (rows.has(site_id)) {
                        throw new Error("UNIQUE constraint failed");
                    }
                    rows.set(site_id, {
                        site_id,
                        name,
                        enabled,
                        allowed_hosts,
                        created_at,
                        updated_at,
                    });
                    return { meta: { changes: 1 } };
                }
                if (sql.startsWith("UPDATE")) {
                    const [name, enabled, allowed_hosts, updated_at, site_id] =
                        binds as [
                            string,
                            number,
                            string | null,
                            string,
                            string,
                        ];
                    const cur = rows.get(site_id);
                    if (!cur) return { meta: { changes: 0 } };
                    rows.set(site_id, {
                        ...cur,
                        name,
                        enabled,
                        allowed_hosts,
                        updated_at,
                    });
                    return { meta: { changes: 1 } };
                }
                if (sql.startsWith("DELETE")) {
                    const site_id = String(binds[0]);
                    const had = rows.delete(site_id);
                    return { meta: { changes: had ? 1 : 0 } };
                }
                return { meta: { changes: 0 } };
            },
        };
        return stmt;
    }

    return {
        prepare,
        _rows: rows,
    } as unknown as D1Database & { _rows: Map<string, Row> };
}

describe("sites helpers", () => {
    test("isValidSiteId / sanitizeSiteId", () => {
        expect(isValidSiteId("blog")).toBe(true);
        expect(isValidSiteId("my-site_1.0")).toBe(true);
        expect(isValidSiteId("bad id")).toBe(false);
        expect(sanitizeSiteId("  x y  ")).toBe("xy");
        expect(sanitizeSiteId("")).toBe("");
    });

    test("create, list, get, update, delete", async () => {
        const db = createMemoryD1();

        const created = await createSite(db, {
            siteId: "blog",
            name: " My Blog ",
            allowedHosts: " blog.example.com ",
        });
        expect(created.siteId).toBe("blog");
        expect(created.name).toBe("My Blog");
        expect(created.enabled).toBe(true);
        expect(created.allowedHosts).toBe("blog.example.com");

        const listed = await listSites(db);
        expect(listed).toHaveLength(1);

        const got = await getSite(db, "blog");
        expect(got?.name).toBe("My Blog");

        const updated = await updateSite(db, "blog", {
            name: "Blog 2",
            enabled: false,
            allowedHosts: null,
        });
        expect(updated.name).toBe("Blog 2");
        expect(updated.enabled).toBe(false);
        expect(updated.allowedHosts).toBeNull();

        await deleteSite(db, "blog");
        expect(await getSite(db, "blog")).toBeNull();
    });

    test("rejects invalid and duplicate siteId", async () => {
        const db = createMemoryD1();
        await expect(
            createSite(db, { siteId: "bad id!", name: "X" }),
        ).rejects.toThrow(/Invalid siteId/);

        await createSite(db, { siteId: "shop", name: "Shop" });
        await expect(
            createSite(db, { siteId: "shop", name: "Shop 2" }),
        ).rejects.toThrow(/already exists/);
    });

    test("delete missing site throws", async () => {
        const db = createMemoryD1();
        await expect(deleteSite(db, "nope")).rejects.toThrow(/not found/);
    });
});
