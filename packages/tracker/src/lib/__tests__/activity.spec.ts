import { describe, expect, test, vi } from "vitest";
import { ActivityManager } from "../activity";
import type { IdentityContext } from "../identity";

function identityContext(overrides: Partial<IdentityContext> = {}): IdentityContext {
    return {
        visitorId: "visitor-1",
        visitId: "visit-1",
        tabId: "tab-1",
        identityScope: "persistent",
        isNewVisit: false,
        clientTime: 1767225600000,
        ...overrides,
    };
}

describe("ActivityManager", () => {
    test("marks activity on browser lifecycle events and removes handlers on cleanup", () => {
        const getContext = vi.fn(() => identityContext());
        const manager = new ActivityManager({
            siteId: "site-a",
            getContext,
            windowRef: window,
            documentRef: document,
            createBroadcastChannel: () => {
                throw new Error("BroadcastChannel unavailable");
            },
        });

        window.dispatchEvent(new Event("online"));
        document.dispatchEvent(new Event("visibilitychange"));
        expect(getContext).toHaveBeenCalledTimes(2);

        manager.cleanup();
        window.dispatchEvent(new Event("offline"));
        document.dispatchEvent(new Event("visibilitychange"));
        expect(getContext).toHaveBeenCalledTimes(2);
    });

    test("broadcasts visit and tab state for same-site activity", () => {
        const postMessage = vi.fn();
        const close = vi.fn();
        const channel = {
            postMessage,
            close,
            onmessage: null as ((event: MessageEvent) => void) | null,
        };
        const getContext = vi.fn(() =>
            identityContext({
                visitId: "visit-broadcast",
                tabId: "tab-broadcast",
                clientTime: 1767225600123,
            }),
        );
        const manager = new ActivityManager({
            siteId: "site-a",
            getContext,
            createBroadcastChannel: (name) => {
                expect(name).toBe("counterscale:activity:site-a");
                return channel;
            },
        });

        manager.markActivity();

        expect(postMessage).toHaveBeenCalledWith({
            type: "counterscale:activity",
            messageType: "activity",
            siteId: "site-a",
            visitId: "visit-broadcast",
            tabId: "tab-broadcast",
            clientTime: 1767225600123,
        });

        manager.cleanup();
        expect(close).toHaveBeenCalledTimes(1);
    });

    test("refreshes local identity state when receiving same-site broadcast messages", () => {
        const channel = {
            postMessage: vi.fn(),
            close: vi.fn(),
            onmessage: null as ((event: MessageEvent) => void) | null,
        };
        const getContext = vi.fn(() => identityContext());
        new ActivityManager({
            siteId: "site-a",
            getContext,
            createBroadcastChannel: () => channel,
        });

        channel.onmessage?.({
            data: {
                type: "counterscale:activity",
                messageType: "activity",
                siteId: "other-site",
            },
        } as MessageEvent);
        expect(getContext).not.toHaveBeenCalled();

        channel.onmessage?.({
            data: {
                type: "counterscale:activity",
                messageType: "activity",
                siteId: "site-a",
            },
        } as MessageEvent);
        expect(getContext).toHaveBeenCalledTimes(1);
    });
});
