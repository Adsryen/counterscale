import type { IdentityContext } from "./identity";
import { isLocalhostAddress } from "../shared/utils";

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;

export type PresenceVisibility = "visible" | "hidden";
export type PresenceEventType = "hello" | "page" | "visibility" | "heartbeat" | "closing";

type PresenceMessage = {
    type: PresenceEventType;
    siteId: string;
    visitId: string;
    tabId: string;
    path: string;
    visibility: PresenceVisibility;
    clientTime: number;
};

type WebSocketLike = Pick<WebSocket, "send" | "close" | "readyState"> & {
    onopen: ((event: Event) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
};

type WebSocketCtor = new (url: string) => WebSocketLike;

export interface PresenceManagerOptions {
    siteId: string;
    reporterUrl: string;
    reportOnLocalhost?: boolean;
    getContext: () => IdentityContext;
    windowRef?: Window;
    documentRef?: Document;
    createWebSocket?: WebSocketCtor;
    now?: () => number;
}

function getBrowserWindow(): Window | undefined {
    if (typeof window === "undefined") return undefined;
    return window;
}

function getBrowserDocument(): Document | undefined {
    if (typeof document === "undefined") return undefined;
    return document;
}

function getVisibility(documentRef?: Document): PresenceVisibility {
    return documentRef?.visibilityState === "hidden" ? "hidden" : "visible";
}

function collectToPresenceUrl(reporterUrl: string): URL {
    const url = new URL(reporterUrl, "https://example.com");
    url.pathname = url.pathname.replace(/\/collect\/?$/, "/presence");
    if (!url.pathname.endsWith("/presence")) url.pathname = "/presence";
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    return url;
}

function collectToHeartbeatUrl(reporterUrl: string, siteId: string): string {
    const url = new URL(reporterUrl, "https://example.com");
    url.pathname = url.pathname.replace(/\/collect\/?$/, "/presence/heartbeat");
    if (!url.pathname.endsWith("/presence/heartbeat")) url.pathname = "/presence/heartbeat";
    url.searchParams.set("sid", siteId);
    return url.toString();
}

function currentPath(windowRef?: Window): string {
    const location = windowRef?.location;
    if (!location) return "/";
    return location.pathname + location.search || "/";
}

export class PresenceManager {
    private readonly siteId: string;
    private readonly reporterUrl: string;
    private readonly reportOnLocalhost: boolean;
    private readonly getContext: () => IdentityContext;
    private readonly windowRef?: Window;
    private readonly documentRef?: Document;
    private readonly createWebSocket?: WebSocketCtor;
    private readonly now: () => number;
    private readonly cleanupFns: Array<() => void> = [];
    private socket?: WebSocketLike;
    private heartbeatTimer?: ReturnType<typeof setInterval>;
    private usingHttpFallback = false;
    private started = false;
    private stopped = false;
    private lastPath: string;

    constructor(options: PresenceManagerOptions) {
        this.siteId = options.siteId;
        this.reporterUrl = options.reporterUrl;
        this.reportOnLocalhost = options.reportOnLocalhost === true;
        this.getContext = options.getContext;
        this.windowRef = options.windowRef ?? getBrowserWindow();
        this.documentRef = options.documentRef ?? getBrowserDocument();
        this.createWebSocket = options.createWebSocket ?? (typeof WebSocket === "undefined" ? undefined : WebSocket);
        this.now = options.now ?? (() => Date.now());
        this.lastPath = currentPath(this.windowRef);
    }

    start(): void {
        if (!this.shouldReport() || this.started || this.stopped) return;
        this.started = true;
        this.registerLifecycleHandlers();
        this.connect();
    }

    updatePage(path: string = currentPath(this.windowRef)): void {
        if (!this.shouldReport() || this.stopped) return;
        this.lastPath = path || "/";
        this.start();
        this.send("page");
    }

    markActivity(): void {
        if (!this.shouldReport() || this.stopped) return;
        this.start();
        this.send("heartbeat");
    }

    cleanup(): void {
        if (this.stopped) return;
        this.send("closing");
        this.stopped = true;
        this.clearHeartbeat();
        while (this.cleanupFns.length > 0) this.cleanupFns.pop()?.();
        this.socket?.close();
        this.socket = undefined;
    }

    private shouldReport(): boolean {
        if (!this.windowRef) return false;
        if (this.reportOnLocalhost) return true;
        return !isLocalhostAddress(this.windowRef.location.hostname);
    }

    private connect(): void {
        if (!this.createWebSocket) {
            return;
        }
        try {
            const context = this.getContext();
            const url = collectToPresenceUrl(this.reporterUrl);
            url.searchParams.set("sid", this.siteId);
            url.searchParams.set("vid", context.visitId);
            url.searchParams.set("tid", context.tabId);
            url.searchParams.set("path", this.lastPath);
            url.searchParams.set("visibility", getVisibility(this.documentRef));
            const socket = new this.createWebSocket(url.toString());
            this.socket = socket;
            socket.onopen = () => {
                this.usingHttpFallback = false;
                this.startHeartbeat();
                this.send("hello");
            };
            socket.onerror = () => this.startHttpFallback();
            socket.onclose = () => this.startHttpFallback();
        } catch {
            this.startHttpFallback();
        }
    }

    private registerLifecycleHandlers(): void {
        const onVisibility = () => this.send("visibility");
        const onPageHide = () => this.send("closing");
        const onOnline = () => {
            if (!this.socket) this.connect();
            this.markActivity();
        };
        const onOffline = () => this.markActivity();

        this.documentRef?.addEventListener("visibilitychange", onVisibility);
        this.windowRef?.addEventListener("pagehide", onPageHide);
        this.windowRef?.addEventListener("online", onOnline);
        this.windowRef?.addEventListener("offline", onOffline);

        this.cleanupFns.push(() => {
            this.documentRef?.removeEventListener("visibilitychange", onVisibility);
            this.windowRef?.removeEventListener("pagehide", onPageHide);
            this.windowRef?.removeEventListener("online", onOnline);
            this.windowRef?.removeEventListener("offline", onOffline);
        });
    }

    private startHeartbeat(): void {
        this.clearHeartbeat();
        this.heartbeatTimer = setInterval(() => this.send("heartbeat"), PRESENCE_HEARTBEAT_INTERVAL_MS);
    }

    private startHttpFallback(): void {
        if (this.stopped || this.usingHttpFallback) return;
        this.usingHttpFallback = true;
        this.socket = undefined;
        this.startHeartbeat();
        this.sendHttp("heartbeat");
    }

    private clearHeartbeat(): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
    }

    private message(type: PresenceEventType): PresenceMessage {
        const context = this.getContext();
        return {
            type,
            siteId: this.siteId,
            visitId: context.visitId,
            tabId: context.tabId,
            path: this.lastPath,
            visibility: getVisibility(this.documentRef),
            clientTime: this.now(),
        };
    }

    private send(type: PresenceEventType): void {
        const payload = JSON.stringify(this.message(type));
        if (!this.usingHttpFallback) {
            if (this.socket?.readyState === 1) {
                try {
                    this.socket.send(payload);
                    return;
                } catch {
                    this.startHttpFallback();
                }
            } else {
                return;
            }
        }
        this.sendHttp(type, payload);
    }

    private sendHttp(type: PresenceEventType, payload = JSON.stringify(this.message(type))): void {
        const url = collectToHeartbeatUrl(this.reporterUrl, this.siteId);
        if (type === "closing" && this.windowRef?.navigator?.sendBeacon) {
            try {
                const blob = new Blob([payload], { type: "text/plain" });
                this.windowRef.navigator.sendBeacon(url, blob);
                return;
            } catch {
                // Fall through to XHR.
            }
        }

        try {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url, true);
            xhr.timeout = 1000;
            xhr.setRequestHeader("Content-Type", "text/plain");
            xhr.send(payload);
        } catch {
            // Presence is best-effort and must never block page tracking.
        }
    }
}

