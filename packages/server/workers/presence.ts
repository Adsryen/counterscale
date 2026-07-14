import {
    PRESENCE_MAX_MESSAGE_BYTES,
    buildPresenceSnapshot,
    parsePresenceEvent,
    recordFromEvent,
    type PresenceTabRecord,
    type PresenceVisibility,
} from "./lib/presence-state";

const JSON_HEADERS = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
};

type PresenceRow = {
    visit_id: string;
    tab_id: string;
    path: string;
    visibility: string;
    connected_at: number;
    last_seen_at: number;
    transport: string;
    expires_at: number;
};

function json(data: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: { ...JSON_HEADERS, ...init.headers },
    });
}

function textSize(value: string | ArrayBuffer): number {
    return typeof value === "string" ? value.length : value.byteLength;
}

function rowToRecord(row: PresenceRow): PresenceTabRecord {
    return {
        visitId: row.visit_id,
        tabId: row.tab_id,
        path: row.path || "/",
        visibility: row.visibility === "hidden" ? "hidden" : "visible",
        connectedAt: Number(row.connected_at),
        lastSeenAt: Number(row.last_seen_at),
        transport: row.transport === "http" ? "http" : "grace",
        expiresAt: Number(row.expires_at),
    };
}

function attachmentToRecord(value: unknown): PresenceTabRecord | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<PresenceTabRecord>;
    if (
        typeof record.visitId !== "string" ||
        typeof record.tabId !== "string" ||
        typeof record.path !== "string" ||
        typeof record.connectedAt !== "number" ||
        typeof record.lastSeenAt !== "number" ||
        typeof record.expiresAt !== "number"
    ) {
        return null;
    }
    return {
        visitId: record.visitId,
        tabId: record.tabId,
        path: record.path,
        visibility: record.visibility === "hidden" ? "hidden" : "visible",
        connectedAt: record.connectedAt,
        lastSeenAt: record.lastSeenAt,
        transport: "websocket",
        expiresAt: record.expiresAt,
    };
}

function parseMaybeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export class SitePresence {
    private readonly state: DurableObjectState;

    constructor(state: DurableObjectState, _env: Env) {
        this.state = state;
        this.state.blockConcurrencyWhile(async () => {
            this.state.storage.sql.exec(
                `CREATE TABLE IF NOT EXISTS presence_tabs (
                    visit_id TEXT NOT NULL,
                    tab_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    visibility TEXT NOT NULL,
                    connected_at INTEGER NOT NULL,
                    last_seen_at INTEGER NOT NULL,
                    transport TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    PRIMARY KEY (visit_id, tab_id)
                )`,
            );
            this.state.storage.sql.exec(
                `CREATE INDEX IF NOT EXISTS idx_presence_tabs_expires
                 ON presence_tabs(expires_at)`,
            );
        });
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/presence/snapshot") {
            return json(this.snapshot(Date.now()));
        }

        if (url.pathname === "/presence/heartbeat" && request.method === "POST") {
            const body = parseMaybeJson(await request.text());
            const parsed = parsePresenceEvent(body, Date.now());
            if (!parsed.ok) {
                return json({ ok: false, error: parsed.message }, { status: parsed.status });
            }
            const existing = this.getRecord(parsed.event.visitId, parsed.event.tabId);
            const record = recordFromEvent(parsed.event, existing ?? undefined, "http");
            this.putRecord(record);
            return json({ ok: true, snapshot: this.snapshot(parsed.event.now) });
        }

        if (url.pathname === "/presence" && request.headers.get("Upgrade") === "websocket") {
            const now = Date.now();
            const parsed = parsePresenceEvent(
                {
                    type: "hello",
                    visitId: url.searchParams.get("vid"),
                    tabId: url.searchParams.get("tid"),
                    path: url.searchParams.get("path") || "/",
                    visibility: url.searchParams.get("visibility") as PresenceVisibility | null,
                },
                now,
            );
            if (!parsed.ok) {
                return new Response(parsed.message, { status: parsed.status });
            }

            const pair = new WebSocketPair();
            const client = pair[0];
            const server = pair[1];
            const existing = this.getRecord(parsed.event.visitId, parsed.event.tabId);
            const record = recordFromEvent(parsed.event, existing ?? undefined, "websocket");
            server.serializeAttachment(record);
            this.state.acceptWebSocket(server, [`visit:${record.visitId}`]);
            this.deleteRecord(record.visitId, record.tabId);
            return new Response(null, { status: 101, webSocket: client });
        }

        return new Response("Not Found", { status: 404 });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        if (textSize(message) > PRESENCE_MAX_MESSAGE_BYTES) {
            ws.close(1009, "Presence message too large");
            return;
        }
        const parsed = parsePresenceEvent(
            typeof message === "string" ? parseMaybeJson(message) : null,
            Date.now(),
        );
        if (!parsed.ok) {
            ws.send(JSON.stringify({ ok: false, error: parsed.message }));
            return;
        }
        const current = attachmentToRecord(ws.deserializeAttachment());
        if (current && current.visitId !== parsed.event.visitId) {
            ws.close(1008, "visit mismatch");
            return;
        }
        const record = recordFromEvent(parsed.event, current ?? undefined, "websocket");
        ws.serializeAttachment(record);
        if (parsed.event.type === "closing") {
            this.putRecord({ ...record, transport: "grace" });
        }
        ws.send(JSON.stringify({ ok: true, ts: record.lastSeenAt }));
    }

    async webSocketClose(ws: WebSocket): Promise<void> {
        const current = attachmentToRecord(ws.deserializeAttachment());
        if (current) {
            this.putRecord({ ...current, transport: "grace", expiresAt: Date.now() + 60_000 });
        }
    }

    async webSocketError(ws: WebSocket): Promise<void> {
        await this.webSocketClose(ws);
    }

    private snapshot(now: number) {
        this.cleanup(now);
        const records: PresenceTabRecord[] = [];
        for (const ws of this.state.getWebSockets()) {
            const record = attachmentToRecord(ws.deserializeAttachment());
            if (record) records.push(record);
        }
        for (const row of this.state.storage.sql
            .exec<PresenceRow>(
                `SELECT visit_id, tab_id, path, visibility, connected_at,
                        last_seen_at, transport, expires_at
                 FROM presence_tabs
                 WHERE expires_at > ?`,
                now,
            )
            .toArray()) {
            records.push(rowToRecord(row));
        }
        return buildPresenceSnapshot(records, now);
    }

    private getRecord(visitId: string, tabId: string): PresenceTabRecord | null {
        try {
            const row = this.state.storage.sql
                .exec<PresenceRow>(
                    `SELECT visit_id, tab_id, path, visibility, connected_at,
                            last_seen_at, transport, expires_at
                     FROM presence_tabs
                     WHERE visit_id = ? AND tab_id = ?`,
                    visitId,
                    tabId,
                )
                .toArray()[0];
            return row ? rowToRecord(row) : null;
        } catch {
            return null;
        }
    }

    private putRecord(record: PresenceTabRecord): void {
        this.state.storage.sql.exec(
            `INSERT OR REPLACE INTO presence_tabs (
                visit_id, tab_id, path, visibility, connected_at,
                last_seen_at, transport, expires_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            record.visitId,
            record.tabId,
            record.path,
            record.visibility,
            record.connectedAt,
            record.lastSeenAt,
            record.transport,
            record.expiresAt,
        );
    }

    private deleteRecord(visitId: string, tabId: string): void {
        this.state.storage.sql.exec(
            `DELETE FROM presence_tabs WHERE visit_id = ? AND tab_id = ?`,
            visitId,
            tabId,
        );
    }

    private cleanup(now: number): void {
        this.state.storage.sql.exec(
            `DELETE FROM presence_tabs WHERE expires_at <= ?`,
            now,
        );
    }
}
