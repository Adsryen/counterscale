import { describe, expect, test } from "vitest";

import { IdentityManager } from "../identity";

class MemoryStorage implements Storage {
    private values = new Map<string, string>();

    get length() {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return Array.from(this.values.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

class ThrowingStorage extends MemoryStorage {
    override getItem(): string | null {
        throw new Error("storage disabled");
    }

    override setItem(): void {
        throw new Error("storage disabled");
    }
}

function createManager(opts: {
    siteId?: string;
    now?: number;
    ids?: string[];
    localStorage?: Storage;
    sessionStorage?: Storage;
}) {
    const ids = [...(opts.ids ?? ["visitor-1", "visit-1", "tab-1"] )];
    return new IdentityManager({
        siteId: opts.siteId ?? "site-a",
        now: () => opts.now ?? Date.UTC(2026, 0, 1, 0, 0, 0),
        createId: () => {
            const id = ids.shift();
            if (!id) {
                throw new Error("test id queue exhausted");
            }
            return id;
        },
        localStorage: opts.localStorage ?? new MemoryStorage(),
        sessionStorage: opts.sessionStorage ?? new MemoryStorage(),
    });
}

describe("IdentityManager", () => {
    test("creates and reuses persistent visitor, visit, and tab ids inside the 30 minute window", () => {
        const localStorage = new MemoryStorage();
        const sessionStorage = new MemoryStorage();
        const manager = createManager({
            ids: ["visitor-1", "visit-1", "tab-1"],
            localStorage,
            sessionStorage,
        });

        const first = manager.getContext();
        const second = manager.getContext();

        expect(first).toMatchObject({
            visitorId: "visitor-1",
            visitId: "visit-1",
            tabId: "tab-1",
            identityScope: "persistent",
            isNewVisit: true,
        });
        expect(second).toMatchObject({
            visitorId: "visitor-1",
            visitId: "visit-1",
            tabId: "tab-1",
            identityScope: "persistent",
            isNewVisit: false,
        });
        expect(localStorage.length).toBe(1);
        expect(sessionStorage.length).toBe(1);
    });

    test("starts a new visit after 30 minutes of inactivity while keeping the visitor id", () => {
        const localStorage = new MemoryStorage();
        const sessionStorage = new MemoryStorage();
        const base = Date.UTC(2026, 0, 1, 0, 0, 0);

        const firstManager = createManager({
            now: base,
            ids: ["visitor-1", "visit-1", "tab-1"],
            localStorage,
            sessionStorage,
        });
        firstManager.getContext();

        const laterManager = createManager({
            now: base + 31 * 60 * 1000,
            ids: ["visit-2"],
            localStorage,
            sessionStorage,
        });

        expect(laterManager.getContext()).toMatchObject({
            visitorId: "visitor-1",
            visitId: "visit-2",
            tabId: "tab-1",
            identityScope: "persistent",
            isNewVisit: true,
        });
    });

    test("rolls the visitor id after the 365 day visitor window expires", () => {
        const localStorage = new MemoryStorage();
        const sessionStorage = new MemoryStorage();
        const base = Date.UTC(2026, 0, 1, 0, 0, 0);

        createManager({
            now: base,
            ids: ["visitor-1", "visit-1", "tab-1"],
            localStorage,
            sessionStorage,
        }).getContext();

        const expired = createManager({
            now: base + 366 * 24 * 60 * 60 * 1000,
            ids: ["visitor-2", "visit-2"],
            localStorage,
            sessionStorage,
        }).getContext();

        expect(expired).toMatchObject({
            visitorId: "visitor-2",
            visitId: "visit-2",
            tabId: "tab-1",
            identityScope: "persistent",
            isNewVisit: true,
        });
    });

    test("shares visitor and visit across tabs but keeps tab ids separate", () => {
        const localStorage = new MemoryStorage();
        const tabOneStorage = new MemoryStorage();
        const tabTwoStorage = new MemoryStorage();

        const tabOne = createManager({
            ids: ["visitor-1", "visit-1", "tab-1"],
            localStorage,
            sessionStorage: tabOneStorage,
        }).getContext();

        const tabTwo = createManager({
            ids: ["tab-2"],
            localStorage,
            sessionStorage: tabTwoStorage,
        }).getContext();

        expect(tabTwo).toMatchObject({
            visitorId: tabOne.visitorId,
            visitId: tabOne.visitId,
            tabId: "tab-2",
            identityScope: "persistent",
            isNewVisit: false,
        });
    });

    test("falls back to page scoped ids without throwing when storage is disabled", () => {
        const manager = createManager({
            ids: ["visitor-page", "visit-page", "tab-page"],
            localStorage: new ThrowingStorage(),
            sessionStorage: new ThrowingStorage(),
        });

        expect(manager.getContext()).toMatchObject({
            visitorId: "visitor-page",
            visitId: "visit-page",
            tabId: "tab-page",
            identityScope: "page",
            isNewVisit: true,
        });
        expect(manager.getContext()).toMatchObject({
            visitorId: "visitor-page",
            visitId: "visit-page",
            tabId: "tab-page",
            identityScope: "page",
            isNewVisit: false,
        });
    });
});
