export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_ONLINE_GRACE_MS = 60_000;
export const PRESENCE_MAX_ID_LENGTH = 128;
export const PRESENCE_MAX_PATH_LENGTH = 512;
export const PRESENCE_MAX_MESSAGE_BYTES = 2048;

export type PresenceVisibility = "visible" | "hidden";
export type PresenceEventType = "hello" | "page" | "visibility" | "heartbeat" | "closing";
export type PresenceTransport = "websocket" | "http" | "grace";

export type PresenceEvent = {
    type: PresenceEventType;
    visitId: string;
    tabId: string;
    path: string;
    visibility: PresenceVisibility;
    now: number;
};

export type PresenceTabRecord = {
    visitId: string;
    tabId: string;
    path: string;
    visibility: PresenceVisibility;
    connectedAt: number;
    lastSeenAt: number;
    transport: PresenceTransport;
    expiresAt: number;
};

export type PresenceVisitSnapshot = {
    visitId: string;
    startedAt: string;
    lastSeenAt: string;
    tabs: Array<{
        tabId: string;
        path: string;
        visibility: PresenceVisibility;
        lastSeenAt: string;
    }>;
};

export type PresenceSnapshot = {
    generatedAt: string;
    online: PresenceVisitSnapshot[];
};

type ValidationResult =
    | { ok: true; event: PresenceEvent }
    | { ok: false; message: string; status: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function asBoundedId(value: unknown, field: string): string | ValidationResult {
    if (typeof value !== "string") {
        return { ok: false, message: `${field} is required`, status: 400 };
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > PRESENCE_MAX_ID_LENGTH) {
        return { ok: false, message: `${field} is invalid`, status: 400 };
    }
    return trimmed;
}

function normalizePath(value: unknown): string {
    if (typeof value !== "string") return "/";
    const trimmed = value.trim() || "/";
    return trimmed.length > PRESENCE_MAX_PATH_LENGTH
        ? trimmed.slice(0, PRESENCE_MAX_PATH_LENGTH)
        : trimmed;
}

function normalizeVisibility(value: unknown): PresenceVisibility {
    return value === "hidden" ? "hidden" : "visible";
}

function normalizeEventType(value: unknown): PresenceEventType {
    switch (value) {
        case "page":
        case "visibility":
        case "heartbeat":
        case "closing":
        case "hello":
            return value;
        default:
            return "heartbeat";
    }
}

export function parsePresenceEvent(
    value: unknown,
    now: number = Date.now(),
): ValidationResult {
    if (!isPlainObject(value)) {
        return { ok: false, message: "Invalid presence payload", status: 400 };
    }

    const visitId = asBoundedId(value.visitId ?? value.vid, "visitId");
    if (typeof visitId !== "string") return visitId;
    const tabId = asBoundedId(value.tabId ?? value.tid, "tabId");
    if (typeof tabId !== "string") return tabId;

    return {
        ok: true,
        event: {
            type: normalizeEventType(value.type),
            visitId,
            tabId,
            path: normalizePath(value.path),
            visibility: normalizeVisibility(value.visibility),
            now,
        },
    };
}

export function recordFromEvent(
    event: PresenceEvent,
    existing?: PresenceTabRecord,
    transport: PresenceTransport = "websocket",
): PresenceTabRecord {
    const connectedAt = existing?.connectedAt ?? event.now;
    return {
        visitId: event.visitId,
        tabId: event.tabId,
        path: event.path || existing?.path || "/",
        visibility: event.visibility,
        connectedAt,
        lastSeenAt: event.now,
        transport,
        expiresAt: event.now + PRESENCE_ONLINE_GRACE_MS,
    };
}

export function tabKey(record: Pick<PresenceTabRecord, "visitId" | "tabId">): string {
    return `${record.visitId}\u0000${record.tabId}`;
}

export function compactPresenceTabs(
    records: PresenceTabRecord[],
    now: number = Date.now(),
): PresenceTabRecord[] {
    const byTab = new Map<string, PresenceTabRecord>();
    for (const record of records) {
        if (record.expiresAt <= now) continue;
        const key = tabKey(record);
        const existing = byTab.get(key);
        if (!existing || record.lastSeenAt >= existing.lastSeenAt) {
            byTab.set(key, record);
        }
    }
    return Array.from(byTab.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function buildPresenceSnapshot(
    records: PresenceTabRecord[],
    now: number = Date.now(),
): PresenceSnapshot {
    const visits = new Map<
        string,
        { startedAt: number; lastSeenAt: number; tabs: PresenceTabRecord[] }
    >();

    for (const record of compactPresenceTabs(records, now)) {
        const existing = visits.get(record.visitId);
        if (!existing) {
            visits.set(record.visitId, {
                startedAt: record.connectedAt,
                lastSeenAt: record.lastSeenAt,
                tabs: [record],
            });
            continue;
        }
        existing.startedAt = Math.min(existing.startedAt, record.connectedAt);
        existing.lastSeenAt = Math.max(existing.lastSeenAt, record.lastSeenAt);
        existing.tabs.push(record);
    }

    return {
        generatedAt: new Date(now).toISOString(),
        online: Array.from(visits.entries())
            .map(([visitId, visit]) => ({
                visitId,
                startedAt: new Date(visit.startedAt).toISOString(),
                lastSeenAt: new Date(visit.lastSeenAt).toISOString(),
                tabs: visit.tabs
                    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
                    .map((tab) => ({
                        tabId: tab.tabId,
                        path: tab.path,
                        visibility: tab.visibility,
                        lastSeenAt: new Date(tab.lastSeenAt).toISOString(),
                    })),
            }))
            .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
    };
}
