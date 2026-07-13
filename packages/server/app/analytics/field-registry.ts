import { ColumnMappings } from "./schema";

export const METRICS_DATASET_NAME = "metricsDataset";
export const METRICS_V1_SCHEMA_VERSION = "v1";

export const ANALYTICS_ENGINE_FIELD_LIMITS = {
    indexes: 1,
    blobs: 20,
    doubles: 20,
} as const;

export type AnalyticsFieldSlot =
    | `index${number}`
    | `blob${number}`
    | `double${number}`;

export type AnalyticsFieldType = "index" | "string" | "number";
export type AnalyticsFieldStatus = "used" | "reserved" | "dead-but-locked";
export type AnalyticsFieldCardinality =
    | "none"
    | "low"
    | "medium"
    | "high"
    | "numeric";
export type AnalyticsFieldPrivacy =
    | "anonymous"
    | "derived"
    | "edge-geo"
    | "legacy"
    | "forbidden";
export type AnalyticsFieldRollupStrategy =
    | "core"
    | "top-n"
    | "geo-device"
    | "never"
    | "reserved";

export interface AnalyticsFieldRegistryEntry {
    dataset: typeof METRICS_DATASET_NAME;
    schemaVersion: typeof METRICS_V1_SCHEMA_VERSION;
    slot: AnalyticsFieldSlot;
    logicalName: string;
    valueType: AnalyticsFieldType;
    status: AnalyticsFieldStatus;
    source: string;
    cardinality: AnalyticsFieldCardinality;
    maxLength: number | null;
    nullable: boolean;
    privacy: AnalyticsFieldPrivacy;
    queryRole: string;
    compatibility: string;
    rollup: AnalyticsFieldRollupStrategy;
}

function field(
    entry: Omit<
        AnalyticsFieldRegistryEntry,
        "dataset" | "schemaVersion"
    >,
): AnalyticsFieldRegistryEntry {
    return {
        dataset: METRICS_DATASET_NAME,
        schemaVersion: METRICS_V1_SCHEMA_VERSION,
        ...entry,
    };
}

export const METRICS_V1_INDEX_FIELDS = [
    field({
        slot: "index1",
        logicalName: "siteId",
        valueType: "index",
        status: "used",
        source: "collect.sid",
        cardinality: "high",
        maxLength: null,
        nullable: false,
        privacy: "anonymous",
        queryRole: "AE shard/index; duplicated as blob8 for legacy SELECT/GROUP BY",
        compatibility: "locked; do not replace with visitor, visit, IP or event ids",
        rollup: "core",
    }),
] as const;

export const METRICS_V1_BLOB_FIELDS = [
    field({
        slot: ColumnMappings.host,
        logicalName: "host",
        valueType: "string",
        status: "used",
        source: "collect.h",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "site hostname dimension",
        compatibility: "locked blob1",
        rollup: "core",
    }),
    field({
        slot: ColumnMappings.userAgent,
        logicalName: "userAgent",
        valueType: "string",
        status: "used",
        source: "User-Agent header",
        cardinality: "high",
        maxLength: null,
        nullable: true,
        privacy: "derived",
        queryRole: "legacy raw UA storage for parser-derived dimensions",
        compatibility: "locked blob2; avoid adding to new rollup dimensions",
        rollup: "never",
    }),
    field({
        slot: ColumnMappings.path,
        logicalName: "path",
        valueType: "string",
        status: "used",
        source: "collect.p",
        cardinality: "high",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "content/page dimension",
        compatibility: "locked blob3",
        rollup: "top-n",
    }),
    field({
        slot: ColumnMappings.country,
        logicalName: "country",
        valueType: "string",
        status: "used",
        source: "request.cf.country",
        cardinality: "low",
        maxLength: 2,
        nullable: true,
        privacy: "edge-geo",
        queryRole: "visitor geography dimension",
        compatibility: "locked blob4",
        rollup: "geo-device",
    }),
    field({
        slot: ColumnMappings.referrer,
        logicalName: "referrer",
        valueType: "string",
        status: "used",
        source: "collect.r",
        cardinality: "high",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "traffic source dimension",
        compatibility: "locked blob5",
        rollup: "top-n",
    }),
    field({
        slot: ColumnMappings.browserName,
        logicalName: "browserName",
        valueType: "string",
        status: "used",
        source: "parsed User-Agent",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "derived",
        queryRole: "browser dimension",
        compatibility: "locked blob6",
        rollup: "geo-device",
    }),
    field({
        slot: ColumnMappings.deviceModel,
        logicalName: "deviceModel",
        valueType: "string",
        status: "used",
        source: "parsed User-Agent",
        cardinality: "high",
        maxLength: null,
        nullable: true,
        privacy: "derived",
        queryRole: "legacy device model dimension",
        compatibility: "locked blob7; high-cardinality rollups require explicit budget",
        rollup: "never",
    }),
    field({
        slot: ColumnMappings.siteId,
        logicalName: "siteId",
        valueType: "string",
        status: "used",
        source: "collect.sid",
        cardinality: "high",
        maxLength: null,
        nullable: false,
        privacy: "anonymous",
        queryRole: "legacy SELECT/GROUP BY site dimension",
        compatibility: "locked blob8; keep duplicated with index1",
        rollup: "core",
    }),
    field({
        slot: ColumnMappings.browserVersion,
        logicalName: "browserVersion",
        valueType: "string",
        status: "used",
        source: "masked parsed User-Agent",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "derived",
        queryRole: "browser version dimension",
        compatibility: "locked blob9",
        rollup: "never",
    }),
    field({
        slot: ColumnMappings.deviceType,
        logicalName: "deviceType",
        valueType: "string",
        status: "used",
        source: "parsed User-Agent",
        cardinality: "low",
        maxLength: null,
        nullable: true,
        privacy: "derived",
        queryRole: "device type dimension",
        compatibility: "locked blob10",
        rollup: "geo-device",
    }),
    field({
        slot: ColumnMappings.utmSource,
        logicalName: "utmSource",
        valueType: "string",
        status: "used",
        source: "collect.us",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "UTM source dimension",
        compatibility: "locked blob11",
        rollup: "top-n",
    }),
    field({
        slot: ColumnMappings.utmMedium,
        logicalName: "utmMedium",
        valueType: "string",
        status: "used",
        source: "collect.um",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "UTM medium dimension",
        compatibility: "locked blob12",
        rollup: "top-n",
    }),
    field({
        slot: ColumnMappings.utmCampaign,
        logicalName: "utmCampaign",
        valueType: "string",
        status: "used",
        source: "collect.uc",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "UTM campaign dimension",
        compatibility: "locked blob13",
        rollup: "top-n",
    }),
    field({
        slot: ColumnMappings.utmTerm,
        logicalName: "utmTerm",
        valueType: "string",
        status: "used",
        source: "collect.ut",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "UTM term dimension",
        compatibility: "locked blob14",
        rollup: "never",
    }),
    field({
        slot: ColumnMappings.utmContent,
        logicalName: "utmContent",
        valueType: "string",
        status: "used",
        source: "collect.uco",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "anonymous",
        queryRole: "UTM content dimension",
        compatibility: "locked blob15",
        rollup: "never",
    }),
    field({
        slot: ColumnMappings.region,
        logicalName: "region",
        valueType: "string",
        status: "used",
        source: "request.cf.region",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "edge-geo",
        queryRole: "administrative region dimension",
        compatibility: "locked blob16",
        rollup: "geo-device",
    }),
    field({
        slot: ColumnMappings.city,
        logicalName: "city",
        valueType: "string",
        status: "used",
        source: "request.cf.city",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "edge-geo",
        queryRole: "city dimension",
        compatibility: "locked blob17",
        rollup: "geo-device",
    }),
    field({
        slot: ColumnMappings.regionCode,
        logicalName: "regionCode",
        valueType: "string",
        status: "used",
        source: "request.cf.regionCode",
        cardinality: "medium",
        maxLength: null,
        nullable: true,
        privacy: "edge-geo",
        queryRole: "ISO-3166-2 subdivision code dimension",
        compatibility: "locked blob18",
        rollup: "geo-device",
    }),
    field({
        slot: "blob19",
        logicalName: "reservedBlob19",
        valueType: "string",
        status: "reserved",
        source: "reserved",
        cardinality: "none",
        maxLength: null,
        nullable: true,
        privacy: "forbidden",
        queryRole: "none until a future field registry entry is approved",
        compatibility: "do not use as event type, UUID, IP, HMAC or prefix scratch space",
        rollup: "reserved",
    }),
    field({
        slot: "blob20",
        logicalName: "reservedBlob20",
        valueType: "string",
        status: "reserved",
        source: "reserved",
        cardinality: "none",
        maxLength: null,
        nullable: true,
        privacy: "forbidden",
        queryRole: "none until a future field registry entry is approved",
        compatibility: "do not use as event type, UUID, IP, HMAC or prefix scratch space",
        rollup: "reserved",
    }),
] as const;

const reservedDoubleFields = Array.from({ length: 15 }, (_, index) =>
    field({
        slot: `double${index + 6}` as const,
        logicalName: `reservedDouble${index + 6}`,
        valueType: "number",
        status: "reserved",
        source: "reserved",
        cardinality: "none",
        maxLength: null,
        nullable: true,
        privacy: "forbidden",
        queryRole: "none until a future field registry entry is approved",
        compatibility: "do not use for unbudgeted events or identity-derived values",
        rollup: "reserved",
    }),
);

export const METRICS_V1_DOUBLE_FIELDS = [
    field({
        slot: ColumnMappings.newVisitor,
        logicalName: "newVisitor",
        valueType: "number",
        status: "used",
        source: "If-Modified-Since daily cookieless heuristic",
        cardinality: "numeric",
        maxLength: null,
        nullable: false,
        privacy: "legacy",
        queryRole: "legacy estimated daily visitor flag",
        compatibility: "locked double1; not stable visitor_id UV",
        rollup: "core",
    }),
    field({
        slot: ColumnMappings.newSession,
        logicalName: "newSession",
        valueType: "number",
        status: "dead-but-locked",
        source: "legacy slot; writer keeps 0",
        cardinality: "numeric",
        maxLength: null,
        nullable: false,
        privacy: "legacy",
        queryRole: "none for stable visits",
        compatibility: "locked double2 even though dead; never reuse",
        rollup: "never",
    }),
    field({
        slot: ColumnMappings.bounce,
        logicalName: "bounce",
        valueType: "number",
        status: "used",
        source: "cache hit-count bounce heuristic",
        cardinality: "numeric",
        maxLength: null,
        nullable: false,
        privacy: "legacy",
        queryRole: "legacy bounce aggregation",
        compatibility: "locked double3",
        rollup: "core",
    }),
    field({
        slot: ColumnMappings.latitude,
        logicalName: "latitude",
        valueType: "number",
        status: "used",
        source: "request.cf.latitude",
        cardinality: "numeric",
        maxLength: null,
        nullable: true,
        privacy: "edge-geo",
        queryRole: "city-level map point",
        compatibility: "locked double4; 0 means unknown",
        rollup: "geo-device",
    }),
    field({
        slot: ColumnMappings.longitude,
        logicalName: "longitude",
        valueType: "number",
        status: "used",
        source: "request.cf.longitude",
        cardinality: "numeric",
        maxLength: null,
        nullable: true,
        privacy: "edge-geo",
        queryRole: "city-level map point",
        compatibility: "locked double5; 0 means unknown",
        rollup: "geo-device",
    }),
    ...reservedDoubleFields,
] as const;

export const METRICS_V1_FIELD_REGISTRY = [
    ...METRICS_V1_INDEX_FIELDS,
    ...METRICS_V1_BLOB_FIELDS,
    ...METRICS_V1_DOUBLE_FIELDS,
] as const satisfies readonly AnalyticsFieldRegistryEntry[];

export function getMetricsV1FieldBySlot(slot: AnalyticsFieldSlot) {
    return METRICS_V1_FIELD_REGISTRY.find((field) => field.slot === slot);
}

export type AnalyticsStoragePlane =
    | "ae-v1"
    | "ae-dataset"
    | "d1-detail"
    | "presence-do"
    | "r2-rollup";

export interface AnalyticsStorageAssignment {
    capability: string;
    owner: AnalyticsStoragePlane;
    datasetOrTable: string;
    exactness: "exact" | "estimated" | "legacy";
    retainedFor: string;
    notes: string;
}

export const ANALYTICS_STORAGE_ASSIGNMENTS = [
    {
        capability: "anonymous-pageview-dimensions",
        owner: "ae-v1",
        datasetOrTable: METRICS_DATASET_NAME,
        exactness: "estimated",
        retainedFor: "Cloudflare Analytics Engine query window; long-term via R2 rollup",
        notes: "PV, trend, content/source/device/geo aggregate dimensions only.",
    },
    {
        capability: "visitor-visit-tab-identity",
        owner: "d1-detail",
        datasetOrTable: "visits/pageviews detail tables",
        exactness: "exact",
        retainedFor: "site-configured detail retention, default 60 days and max 365 days",
        notes: "Raw visitor_id/visit_id/tab_id never enter metricsDataset v1.",
    },
    {
        capability: "raw-ip-and-ip-derived-detail",
        owner: "d1-detail",
        datasetOrTable: "ip detail / geo enrichment tables",
        exactness: "exact",
        retainedFor: "site-configured detail retention when record_ip is enabled",
        notes: "Full IP, HMAC and prefixes are forbidden in metricsDataset v1 and R2 rollups.",
    },
    {
        capability: "current-online-presence",
        owner: "presence-do",
        datasetOrTable: "Presence Durable Object",
        exactness: "exact",
        retainedFor: "ephemeral online window",
        notes: "AE does not own current online or exact recent-active visit de-duplication.",
    },
    {
        capability: "client-environment-performance-errors",
        owner: "ae-dataset",
        datasetOrTable: "clientEventsDataset (planned)",
        exactness: "estimated",
        retainedFor: "separate dataset budget and coverage disclosure",
        notes: "OS, language, resolution, performance and error events need schema_version/event_type.",
    },
    {
        capability: "custom-events-and-conversions",
        owner: "ae-dataset",
        datasetOrTable: "conversionEventsDataset (planned)",
        exactness: "estimated",
        retainedFor: "separate dataset budget and coverage disclosure",
        notes: "Goals, funnels and commerce events wait for the event SDK contract.",
    },
    {
        capability: "long-term-anonymous-aggregates",
        owner: "r2-rollup",
        datasetOrTable: "DAILY_ROLLUPS",
        exactness: "estimated",
        retainedFor: "long-term anonymous aggregates only",
        notes: "Generated from explicit rollup specs; no raw IP, HMAC, prefix or raw UUID.",
    },
] as const satisfies readonly AnalyticsStorageAssignment[];

export const FORBIDDEN_METRICS_V1_RAW_IDENTIFIERS = [
    "visitor_id",
    "visit_id",
    "tab_id",
    "cid",
    "vid",
    "tid",
    "ip",
    "client_ip",
    "ip_hmac",
    "ip_prefix",
] as const;
