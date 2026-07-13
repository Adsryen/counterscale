import type { IdentityContext } from "./identity";

type ActivityMessageType = "activity" | "pagehide";

type ActivityMessage = {
    type: "counterscale:activity";
    messageType: ActivityMessageType;
    siteId: string;
    visitId: string;
    tabId: string;
    clientTime: number;
};

type BroadcastChannelLike = Pick<
    BroadcastChannel,
    "close" | "postMessage" | "onmessage"
>;

export interface ActivityManagerOptions {
    siteId: string;
    getContext: () => IdentityContext;
    windowRef?: Window;
    documentRef?: Document;
    createBroadcastChannel?: (name: string) => BroadcastChannelLike;
}

function getBrowserWindow(): Window | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    return window;
}

function getBrowserDocument(): Document | undefined {
    if (typeof document === "undefined") {
        return undefined;
    }
    return document;
}

function createBrowserBroadcastChannel(
    name: string,
): BroadcastChannelLike | undefined {
    if (typeof BroadcastChannel === "undefined") {
        return undefined;
    }

    return new BroadcastChannel(name);
}

function isActivityMessage(
    value: unknown,
    siteId: string,
): value is ActivityMessage {
    if (!value || typeof value !== "object") {
        return false;
    }

    const message = value as Partial<ActivityMessage>;
    return message.type === "counterscale:activity" && message.siteId === siteId;
}

export class ActivityManager {
    private readonly siteId: string;
    private readonly getContext: () => IdentityContext;
    private readonly windowRef?: Window;
    private readonly documentRef?: Document;
    private readonly broadcastChannel?: BroadcastChannelLike;
    private readonly cleanupFns: Array<() => void> = [];

    constructor(options: ActivityManagerOptions) {
        this.siteId = options.siteId;
        this.getContext = options.getContext;
        this.windowRef = options.windowRef ?? getBrowserWindow();
        this.documentRef = options.documentRef ?? getBrowserDocument();

        this.broadcastChannel = this.createChannel(options);
        this.registerLifecycleHandlers();
    }

    markActivity(messageType: ActivityMessageType = "activity"): IdentityContext {
        const context = this.getContext();
        this.broadcastChannel?.postMessage({
            type: "counterscale:activity",
            messageType,
            siteId: this.siteId,
            visitId: context.visitId,
            tabId: context.tabId,
            clientTime: context.clientTime,
        } satisfies ActivityMessage);
        return context;
    }

    cleanup(): void {
        while (this.cleanupFns.length > 0) {
            this.cleanupFns.pop()?.();
        }
        this.broadcastChannel?.close();
    }

    private createChannel(
        options: ActivityManagerOptions,
    ): BroadcastChannelLike | undefined {
        try {
            const channel = options.createBroadcastChannel
                ? options.createBroadcastChannel(this.channelName)
                : createBrowserBroadcastChannel(this.channelName);

            if (channel) {
                channel.onmessage = (event: MessageEvent) => {
                    if (isActivityMessage(event.data, this.siteId)) {
                        this.getContext();
                    }
                };
            }

            return channel;
        } catch {
            return undefined;
        }
    }

    private get channelName(): string {
        return `counterscale:activity:${this.siteId}`;
    }

    private registerLifecycleHandlers(): void {
        const onActivity = () => {
            this.markActivity("activity");
        };
        const onPageHide = () => {
            this.markActivity("pagehide");
        };

        if (this.documentRef) {
            this.documentRef.addEventListener("visibilitychange", onActivity);
            this.cleanupFns.push(() => {
                this.documentRef?.removeEventListener(
                    "visibilitychange",
                    onActivity,
                );
            });
        }

        if (this.windowRef) {
            this.windowRef.addEventListener("online", onActivity);
            this.windowRef.addEventListener("offline", onActivity);
            this.windowRef.addEventListener("pagehide", onPageHide);
            this.cleanupFns.push(() => {
                this.windowRef?.removeEventListener("online", onActivity);
                this.windowRef?.removeEventListener("offline", onActivity);
                this.windowRef?.removeEventListener("pagehide", onPageHide);
            });
        }
    }
}
