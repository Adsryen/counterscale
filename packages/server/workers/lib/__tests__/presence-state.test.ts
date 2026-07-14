import { describe, expect, test } from "vitest";

import {
    PRESENCE_ONLINE_GRACE_MS,
    buildPresenceSnapshot,
    compactPresenceTabs,
    parsePresenceEvent,
    recordFromEvent,
    type PresenceTabRecord,
} from "../presence-state";

describe("presence state", () => {
    test("validates and normalizes websocket payloads", () => {
        const parsed = parsePresenceEvent(
            {
                type: "page",
                visitId: " visit-1 ",
                tabId: "tab-1",
                path: "".padEnd(600, "x"),
                visibility: "hidden",
            },
            1_000,
        );

        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.event.visitId).toBe("visit-1");
            expect(parsed.event.path).toHaveLength(512);
            expect(parsed.event.visibility).toBe("hidden");
        }
    });

    test("deduplicates multiple tabs by visit and expires stale tabs", () => {
        const now = Date.parse("2026-07-14T00:00:00Z");
        const records: PresenceTabRecord[] = [
            recordFromEvent(
                { type: "hello", visitId: "visit-1", tabId: "tab-a", path: "/a", visibility: "visible", now },
                undefined,
                "websocket",
            ),
            recordFromEvent(
                { type: "page", visitId: "visit-1", tabId: "tab-b", path: "/b", visibility: "hidden", now: now + 5_000 },
                undefined,
                "http",
            ),
            {
                visitId: "visit-2",
                tabId: "old",
                path: "/old",
                visibility: "visible",
                connectedAt: now - 120_000,
                lastSeenAt: now - 120_000,
                transport: "grace",
                expiresAt: now - 1,
            },
        ];

        const snapshot = buildPresenceSnapshot(records, now + 10_000);
        expect(snapshot.online).toHaveLength(1);
        expect(snapshot.online[0].visitId).toBe("visit-1");
        expect(snapshot.online[0].tabs.map((tab) => tab.path)).toEqual(["/b", "/a"]);
    });

    test("keeps an abnormal close in the grace window", () => {
        const now = 10_000;
        const closed = recordFromEvent(
            { type: "closing", visitId: "visit-1", tabId: "tab-a", path: "/", visibility: "hidden", now },
            undefined,
            "grace",
        );

        expect(compactPresenceTabs([closed], now + PRESENCE_ONLINE_GRACE_MS - 1)).toHaveLength(1);
        expect(compactPresenceTabs([closed], now + PRESENCE_ONLINE_GRACE_MS + 1)).toHaveLength(0);
    });

    test("rejects missing IDs", () => {
        const parsed = parsePresenceEvent({ visitId: "v" });
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) expect(parsed.status).toBe(400);
    });
});
