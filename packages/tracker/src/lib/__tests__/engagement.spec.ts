import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EngagementManager } from "../engagement";

class FakeXHR {
    static requests: Array<{ method: string; url: string; body: unknown }> = [];
    timeout = 0;
    headers: Record<string, string> = {};
    private method = "";
    private url = "";

    open(method: string, url: string) {
        this.method = method;
        this.url = url;
    }

    setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
    }

    send(body?: unknown) {
        FakeXHR.requests.push({ method: this.method, url: this.url, body });
    }
}

function createEventTargetLike<T extends { type: string } = Event>() {
    const listeners = new Map<string, Array<(event: T) => void>>();
    return {
        addEventListener(type: string, listener: (event: T) => void) {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        removeEventListener(type: string, listener: (event: T) => void) {
            listeners.set(
                type,
                (listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
            );
        },
        dispatch(type: string) {
            for (const listener of listeners.get(type) ?? []) {
                listener({ type } as T);
            }
        },
    };
}

function createHarness() {
    let now = 0;
    let visibilityState: Document["visibilityState"] = "visible";
    const documentTarget = createEventTargetLike();
    const windowTarget = createEventTargetLike();
    const sendBeacon = vi.fn((_: string | URL, __?: BodyInit | null) => true);
    const documentRef = {
        get visibilityState() {
            return visibilityState;
        },
        addEventListener: documentTarget.addEventListener,
        removeEventListener: documentTarget.removeEventListener,
    } as unknown as Document;
    const windowRef = {
        location: { hostname: "example.com" },
        navigator: { sendBeacon },
        addEventListener: windowTarget.addEventListener,
        removeEventListener: windowTarget.removeEventListener,
    } as unknown as Window;

    const manager = new EngagementManager({
        siteId: "site-a",
        reporterUrl: "https://collector.example.com/collect",
        reportOnLocalhost: true,
        getContext: () => ({
            visitorId: "visitor-1",
            visitId: "visit-1",
            tabId: "tab-1",
            identityScope: "persistent",
            isNewVisit: false,
            clientTime: now,
        }),
        getPageviewId: () => "client-pv-1",
        windowRef,
        documentRef,
        now: () => now,
    });

    return {
        manager,
        sendBeacon,
        setNow(value: number) {
            now = value;
        },
        setVisibility(value: Document["visibilityState"]) {
            visibilityState = value;
        },
        dispatchDocument: documentTarget.dispatch,
        dispatchWindow: windowTarget.dispatch,
    };
}

function searchParams(url: string) {
    return new URL(url).searchParams;
}

describe("EngagementManager", () => {
    beforeEach(() => {
        FakeXHR.requests = [];
        vi.stubGlobal("XMLHttpRequest", FakeXHR);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    test("flushes visible milliseconds to collect engagement without IP or DOM fields", () => {
        const harness = createHarness();
        harness.manager.startPage("/home", "client-pv-1");

        harness.setNow(5_000);
        harness.manager.flush("interval");

        expect(FakeXHR.requests).toHaveLength(1);
        const request = FakeXHR.requests[0];
        expect(request.method).toBe("POST");
        expect(new URL(request.url).pathname).toBe("/collect/engagement");
        expect(Object.fromEntries(searchParams(request.url))).toMatchObject({
            sid: "site-a",
            vid: "visit-1",
            tid: "tab-1",
            pid: "client-pv-1",
            ms: "5000",
            ct: "5000",
            p: "/home",
        });
        expect(request.url).not.toContain("ip=");
        expect(request.url).not.toContain("client_ip=");
        expect(request.body).toBeNull();
    });

    test("flushes the previous page before starting a new pageview", () => {
        const harness = createHarness();
        harness.manager.startPage("/first", "client-pv-1");

        harness.setNow(10_000);
        harness.manager.startPage("/second", "client-pv-2");

        expect(FakeXHR.requests).toHaveLength(1);
        expect(Object.fromEntries(searchParams(FakeXHR.requests[0].url))).toMatchObject({
            pid: "client-pv-1",
            ms: "10000",
            p: "/first",
        });

        harness.setNow(13_000);
        harness.manager.flush("interval");
        expect(Object.fromEntries(searchParams(FakeXHR.requests[1].url))).toMatchObject({
            pid: "client-pv-2",
            ms: "3000",
            p: "/second",
        });
    });

    test("uses sendBeacon for pagehide flushes", () => {
        const harness = createHarness();
        harness.manager.startPage("/home", "client-pv-1");

        harness.setNow(2_000);
        harness.dispatchWindow("pagehide");

        expect(harness.sendBeacon).toHaveBeenCalledTimes(1);
        const [url, body] = harness.sendBeacon.mock.calls[0];
        expect(Object.fromEntries(searchParams(String(url)))).toMatchObject({
            pid: "client-pv-1",
            ms: "2000",
            p: "/home",
        });
        expect(body).toBeNull();
    });
});
