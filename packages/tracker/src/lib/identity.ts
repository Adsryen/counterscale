import type { IdentityScope } from "../shared/types";

const VISITOR_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const VISIT_TIMEOUT_MS = 30 * 60 * 1000;

interface StoredIdentity {
    visitorId: string;
    visitId: string;
    lastSeenAt: number;
    visitorExpiresAt: number;
}

export interface IdentityContext {
    visitorId: string;
    visitId: string;
    tabId: string;
    identityScope: IdentityScope;
    isNewVisit: boolean;
    clientTime: number;
}

export interface IdentityManagerOptions {
    siteId: string;
    now?: () => number;
    createId?: () => string;
    localStorage?: Storage;
    sessionStorage?: Storage;
}

function defaultNow(): number {
    return Date.now();
}

function defaultCreateId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getBrowserLocalStorage(): Storage | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    return window.localStorage;
}

function getBrowserSessionStorage(): Storage | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    return window.sessionStorage;
}

function parseStoredIdentity(value: string | null): StoredIdentity | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value) as Partial<StoredIdentity>;
        if (
            typeof parsed.visitorId !== "string" ||
            typeof parsed.visitId !== "string" ||
            typeof parsed.lastSeenAt !== "number" ||
            typeof parsed.visitorExpiresAt !== "number"
        ) {
            return null;
        }
        return parsed as StoredIdentity;
    } catch {
        return null;
    }
}

export class IdentityManager {
    private readonly siteId: string;
    private readonly now: () => number;
    private readonly createId: () => string;
    private readonly localStorage?: Storage;
    private readonly sessionStorage?: Storage;
    private pageContext?: IdentityContext;

    constructor(options: IdentityManagerOptions) {
        this.siteId = options.siteId;
        this.now = options.now ?? defaultNow;
        this.createId = options.createId ?? defaultCreateId;
        this.localStorage = options.localStorage ?? getBrowserLocalStorage();
        this.sessionStorage =
            options.sessionStorage ?? getBrowserSessionStorage();
    }

    getContext(): IdentityContext {
        const clientTime = this.now();

        try {
            return this.getPersistentContext(clientTime);
        } catch {
            return this.getPageScopedContext(clientTime);
        }
    }

    private get identityKey(): string {
        return `counterscale:identity:${this.siteId}`;
    }

    private get tabKey(): string {
        return `counterscale:tab:${this.siteId}`;
    }

    private getPersistentContext(clientTime: number): IdentityContext {
        if (!this.localStorage || !this.sessionStorage) {
            throw new Error("storage unavailable");
        }

        const stored = parseStoredIdentity(
            this.localStorage.getItem(this.identityKey),
        );
        let isNewVisit = false;
        let identity: StoredIdentity;

        if (!stored || stored.visitorExpiresAt <= clientTime) {
            isNewVisit = true;
            identity = {
                visitorId: this.createId(),
                visitId: this.createId(),
                lastSeenAt: clientTime,
                visitorExpiresAt: clientTime + VISITOR_TTL_MS,
            };
        } else if (clientTime - stored.lastSeenAt > VISIT_TIMEOUT_MS) {
            isNewVisit = true;
            identity = {
                ...stored,
                visitId: this.createId(),
                lastSeenAt: clientTime,
                visitorExpiresAt: clientTime + VISITOR_TTL_MS,
            };
        } else {
            identity = {
                ...stored,
                lastSeenAt: clientTime,
                visitorExpiresAt: clientTime + VISITOR_TTL_MS,
            };
        }

        const tabId = this.getOrCreateTabId();
        this.localStorage.setItem(this.identityKey, JSON.stringify(identity));

        return {
            visitorId: identity.visitorId,
            visitId: identity.visitId,
            tabId,
            identityScope: "persistent",
            isNewVisit,
            clientTime,
        };
    }

    private getOrCreateTabId(): string {
        if (!this.sessionStorage) {
            throw new Error("session storage unavailable");
        }

        const existing = this.sessionStorage.getItem(this.tabKey);
        if (existing) {
            return existing;
        }

        const tabId = this.createId();
        this.sessionStorage.setItem(this.tabKey, tabId);
        return tabId;
    }

    private getPageScopedContext(clientTime: number): IdentityContext {
        if (this.pageContext) {
            this.pageContext = {
                ...this.pageContext,
                clientTime,
                isNewVisit: false,
            };
            return this.pageContext;
        }

        this.pageContext = {
            visitorId: this.createId(),
            visitId: this.createId(),
            tabId: this.createId(),
            identityScope: "page",
            isNewVisit: true,
            clientTime,
        };
        return this.pageContext;
    }
}
