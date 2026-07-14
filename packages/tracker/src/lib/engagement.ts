import type { IdentityContext } from "./identity";
import { isLocalhostAddress } from "../shared/utils";

export const ENGAGEMENT_FLUSH_INTERVAL_MS = 15_000;

export type EngagementFlushReason =
    | "interval"
    | "visibility"
    | "pagehide"
    | "pagechange"
    | "cleanup";

export interface EngagementManagerOptions {
    siteId: string;
    reporterUrl: string;
    reportOnLocalhost?: boolean;
    getContext: () => IdentityContext;
    getPageviewId: () => string | null;
    windowRef?: Window;
    documentRef?: Document;
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

function collectToEngagementUrl(reporterUrl: string): URL {
    const url = new URL(reporterUrl, "https://example.com");
    url.pathname = url.pathname.replace(/\/collect\/?$/, "/collect/engagement");
    if (!url.pathname.endsWith("/collect/engagement")) {
        url.pathname = "/collect/engagement";
    }
    return url;
}

function isVisible(documentRef?: Document): boolean {
    return documentRef?.visibilityState !== "hidden";
}

export class EngagementManager {
    private readonly siteId: string;
    private readonly reporterUrl: string;
    private readonly reportOnLocalhost: boolean;
    private readonly getContext: () => IdentityContext;
    private readonly getPageviewId: () => string | null;
    private readonly windowRef?: Window;
    private readonly documentRef?: Document;
    private readonly now: () => number;
    private readonly cleanupFns: Array<() => void> = [];
    private currentPath: string | null = null;
    private currentPageviewId: string | null = null;
    private visibleStartedAt: number | null = null;
    private visibleMs = 0;
    private lastFlushedVisibleMs = -1;
    private flushTimer?: ReturnType<typeof setInterval>;
    private stopped = false;

    constructor(options: EngagementManagerOptions) {
        this.siteId = options.siteId;
        this.reporterUrl = options.reporterUrl;
        this.reportOnLocalhost = options.reportOnLocalhost === true;
        this.getContext = options.getContext;
        this.getPageviewId = options.getPageviewId;
        this.windowRef = options.windowRef ?? getBrowserWindow();
        this.documentRef = options.documentRef ?? getBrowserDocument();
        this.now = options.now ?? (() => Date.now());
        this.registerLifecycleHandlers();
    }

    startPage(path: string, pageviewId: string): void {
        if (!this.shouldReport() || this.stopped) return;

        if (this.currentPageviewId && this.currentPageviewId !== pageviewId) {
            this.flush("pagechange");
        }

        this.currentPath = path || "/";
        this.currentPageviewId = pageviewId;
        this.visibleMs = 0;
        this.lastFlushedVisibleMs = -1;
        this.visibleStartedAt = isVisible(this.documentRef) ? this.now() : null;
        this.startTimer();
    }

    flush(reason: EngagementFlushReason): void {
        if (!this.shouldReport() || this.stopped) return;
        this.updateVisibleMs();

        const pageviewId = this.currentPageviewId ?? this.getPageviewId();
        if (!pageviewId || !this.currentPath) return;

        if (reason === "interval" && this.visibleMs === this.lastFlushedVisibleMs) {
            return;
        }

        this.lastFlushedVisibleMs = this.visibleMs;
        this.send(reason, pageviewId, this.currentPath, this.visibleMs);
    }

    cleanup(): void {
        if (this.stopped) return;
        this.flush("cleanup");
        this.stopped = true;
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flushTimer = undefined;
        while (this.cleanupFns.length > 0) this.cleanupFns.pop()?.();
    }

    private shouldReport(): boolean {
        if (!this.windowRef) return false;
        if (this.reportOnLocalhost) return true;
        return !isLocalhostAddress(this.windowRef.location.hostname);
    }

    private registerLifecycleHandlers(): void {
        const onVisibilityChange = () => {
            if (isVisible(this.documentRef)) {
                this.visibleStartedAt = this.now();
            } else {
                this.flush("visibility");
                this.visibleStartedAt = null;
            }
        };
        const onPageHide = () => this.flush("pagehide");

        this.documentRef?.addEventListener("visibilitychange", onVisibilityChange);
        this.windowRef?.addEventListener("pagehide", onPageHide);

        this.cleanupFns.push(() => {
            this.documentRef?.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
            this.windowRef?.removeEventListener("pagehide", onPageHide);
        });
    }

    private startTimer(): void {
        if (this.flushTimer) return;
        this.flushTimer = setInterval(
            () => this.flush("interval"),
            ENGAGEMENT_FLUSH_INTERVAL_MS,
        );
        const maybeNodeTimer = this.flushTimer as { unref?: () => void };
        maybeNodeTimer.unref?.();
    }

    private updateVisibleMs(): void {
        if (!isVisible(this.documentRef) || this.visibleStartedAt === null) {
            return;
        }
        const current = this.now();
        this.visibleMs += Math.max(0, current - this.visibleStartedAt);
        this.visibleStartedAt = current;
    }

    private send(
        reason: EngagementFlushReason,
        pageviewId: string,
        path: string,
        visibleMs: number,
    ): void {
        const context = this.getContext();
        const url = collectToEngagementUrl(this.reporterUrl);
        url.searchParams.set("sid", this.siteId);
        url.searchParams.set("vid", context.visitId);
        url.searchParams.set("tid", context.tabId);
        url.searchParams.set("pid", pageviewId);
        url.searchParams.set("ms", Math.max(0, Math.floor(visibleMs)).toString());
        url.searchParams.set("ct", this.now().toString());
        url.searchParams.set("p", path);

        if (reason === "pagehide" && this.windowRef?.navigator?.sendBeacon) {
            try {
                this.windowRef.navigator.sendBeacon(url.toString(), null);
                return;
            } catch {
                // Fall through to XHR.
            }
        }

        try {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url.toString(), true);
            xhr.timeout = 1000;
            xhr.setRequestHeader("Content-Type", "text/plain");
            xhr.send(null);
        } catch {
            // Engagement beacons are best-effort and must never block pageviews.
        }
    }
}
