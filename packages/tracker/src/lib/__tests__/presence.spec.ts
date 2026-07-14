import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PresenceManager, PRESENCE_HEARTBEAT_INTERVAL_MS } from "../presence";
import type { IdentityContext } from "../identity";

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    readyState = 0;
    sent: string[] = [];
    closed = false;
    onopen: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
    }
    send(message: string) {
        this.sent.push(message);
    }
    close() {
        this.closed = true;
    }
    open() {
        this.readyState = 1;
        this.onopen?.(new Event("open"));
    }
    fail() {
        this.onerror?.(new Event("error"));
    }
}

class FakeXHR {
    static requests: Array<{ method: string; url: string; body?: string }> = [];
    timeout = 0;
    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }
    setRequestHeader() {}
    send(body?: string) {
        FakeXHR.requests.push({ method: this.method, url: this.url, body });
    }
    private method = "";
    private url = "";
}

function identity(): IdentityContext {
    return {
        visitorId: "visitor-1",
        visitId: "visit-1",
        tabId: "tab-1",
        identityScope: "persistent",
        isNewVisit: false,
        clientTime: Date.now(),
    };
}

describe("PresenceManager", () => {
    const OriginalXHR = globalThis.XMLHttpRequest;

    beforeEach(() => {
        vi.useFakeTimers();
        FakeWebSocket.instances = [];
        FakeXHR.requests = [];
        globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.XMLHttpRequest = OriginalXHR;
    });

    test("opens websocket and sends page updates with visit/tab identity", () => {
        const manager = new PresenceManager({
            siteId: "site-a",
            reporterUrl: "https://pv.example/collect",
            reportOnLocalhost: true,
            getContext: identity,
            createWebSocket: FakeWebSocket as unknown as new (url: string) => WebSocket,
        });
        manager.start();
        const socket = FakeWebSocket.instances[0];
        expect(socket.url).toContain("/presence");
        expect(socket.url).toContain("sid=site-a");

        socket.open();
        manager.updatePage("/next");

        const messages = socket.sent.map((raw) => JSON.parse(raw) as { type: string; visitId: string; tabId: string; path: string });
        expect(messages.map((message) => message.type)).toEqual(["hello", "page"]);
        expect(messages[1]).toMatchObject({ visitId: "visit-1", tabId: "tab-1", path: "/next" });
        manager.cleanup();
    });

    test("falls back to one HTTP heartbeat loop when websocket fails", () => {
        const manager = new PresenceManager({
            siteId: "site-a",
            reporterUrl: "https://pv.example/collect",
            reportOnLocalhost: true,
            getContext: identity,
            createWebSocket: FakeWebSocket as unknown as new (url: string) => WebSocket,
        });
        manager.start();
        const socket = FakeWebSocket.instances[0];
        socket.fail();

        expect(FakeXHR.requests).toHaveLength(1);
        vi.advanceTimersByTime(PRESENCE_HEARTBEAT_INTERVAL_MS);
        expect(FakeXHR.requests).toHaveLength(2);
        expect(FakeXHR.requests[0].url).toContain("/presence/heartbeat?sid=site-a");
    });
});

