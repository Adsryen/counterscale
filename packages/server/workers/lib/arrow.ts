import { AnalyticsEngineAPI } from "../../app/analytics/query";
import { ColumnMappings } from "../../app/analytics/schema";
import { tableFromJSON, tableToIPC } from "apache-arrow";
import dayjs from "dayjs";

type MetricsRollupDimension = Exclude<
    keyof typeof ColumnMappings,
    | "siteId"
    | "newVisitor"
    | "newSession"
    | "bounce"
    | "userAgent"
    | "deviceModel"
    | "browserVersion"
    | "utmTerm"
    | "utmContent"
>;

export interface MetricsRollupSpec {
    id: string;
    description: string;
    dimensions: readonly MetricsRollupDimension[];
    maxExpectedGroupsPerSite: number;
}

export const METRICS_V1_ROLLUP_SPECS = [
    {
        id: "core-daily",
        description: "One row per timestamp/site with PV, legacy visitor and bounce counts.",
        dimensions: [],
        maxExpectedGroupsPerSite: 1,
    },
    {
        id: "content-source-top",
        description: "Content and source dimensions for Top N style reporting.",
        dimensions: [
            "host",
            "path",
            "referrer",
            "utmSource",
            "utmMedium",
            "utmCampaign",
        ],
        maxExpectedGroupsPerSite: 5000,
    },
    {
        id: "geo-device-top",
        description: "Administrative geography and device/browser dimensions.",
        dimensions: [
            "country",
            "region",
            "city",
            "regionCode",
            "browserName",
            "deviceType",
        ],
        maxExpectedGroupsPerSite: 2000,
    },
] as const satisfies readonly MetricsRollupSpec[];

interface ArrowRollupRecord {
    date: string;
    siteId: string;
    views: number;
    visitors: number;
    bounces: number;
    [key: string]: string | number;
}

export interface ArrowRollupFileResult {
    specId: string;
    filename: string;
    recordCount: number;
    dimensions: readonly MetricsRollupDimension[];
}

export interface ArrowRollupResult {
    files: ArrowRollupFileResult[];
    recordCount: number;
    /** Backward-compatible pointer to the first generated file. */
    filename: string;
}

function rowsToRecords(
    data: Map<string[], { views: number; visitors: number; bounces: number }>,
    dimensions: readonly MetricsRollupDimension[],
): ArrowRollupRecord[] {
    const records: ArrowRollupRecord[] = [];

    data.forEach((counts, key) => {
        const [date, siteId, ...columnValues] = key;
        const record: ArrowRollupRecord = {
            date,
            siteId,
            views: counts.views,
            visitors: counts.visitors,
            bounces: counts.bounces,
        };

        dimensions.forEach((column, index) => {
            record[column] = columnValues[index] || "";
        });

        records.push(record);
    });

    return records;
}

export async function extractAsArrow(
    { accountId, bearerToken }: { accountId: string; bearerToken: string },
    bucket: R2Bucket,
): Promise<ArrowRollupResult> {
    const api = new AnalyticsEngineAPI(accountId, bearerToken);

    // Get yesterday's date range
    const yesterday = dayjs().subtract(1, "day");
    const startDateTime = yesterday.startOf("day").toDate();
    const endDateTime = yesterday.endOf("day").toDate();
    const dateKey = yesterday.format("YYYY-MM-DD");

    const files: ArrowRollupFileResult[] = [];

    for (const spec of METRICS_V1_ROLLUP_SPECS) {
        const data = await api.getAllCountsByAllColumnsForAllSites(
            [...spec.dimensions],
            startDateTime,
            endDateTime,
        );

        const records = rowsToRecords(data, spec.dimensions);
        const table = tableFromJSON(records);
        const arrowBuffer = new Uint8Array(tableToIPC(table, "file"));
        const filename = `analytics/v1/${spec.id}/${dateKey}.arrow`;

        await bucket.put(filename, arrowBuffer);
        console.log(`Saved ${records.length} ${spec.id} records to ${filename}`);

        files.push({
            specId: spec.id,
            filename,
            recordCount: records.length,
            dimensions: spec.dimensions,
        });
    }

    return {
        files,
        recordCount: files.reduce((total, file) => total + file.recordCount, 0),
        filename: files[0]?.filename || "",
    };
}

// IIFE for testing
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        // Mock R2 bucket for local testing
        const mockBucket = {
            put: async (filename: string, data: Uint8Array) => {
                console.log(
                    `Mock: Would save ${data.length} bytes to ${filename}`,
                );
                return {
                    key: filename,
                    version: "mock",
                    size: data.length,
                    etag: "mock",
                    httpEtag: "mock",
                    uploaded: new Date(),
                    checksums: { md5: "mock", sha1: "mock", sha256: "mock" },
                    storageClass: "STANDARD",
                    writeHttpMetadata: {},
                };
            },
            head: async () => null,
            get: async () => null,
            delete: async () => {},
            createMultipartUpload: async () => ({
                uploadId: "mock",
                key: "mock",
                uploadPart: async () => ({ partNumber: 1, etag: "mock" }),
                abort: async () => {},
                complete: async () => ({
                    key: "mock",
                    version: "mock",
                    size: 0,
                    etag: "mock",
                    httpEtag: "mock",
                    uploaded: new Date(),
                    checksums: { md5: "mock", sha1: "mock", sha256: "mock" },
                    storageClass: "STANDARD",
                    writeHttpMetadata: {},
                }),
            }),
            resumeMultipartUpload: async () => ({
                uploadId: "mock",
                key: "mock",
                uploadPart: async () => ({ partNumber: 1, etag: "mock" }),
                abort: async () => {},
                complete: async () => ({
                    key: "mock",
                    version: "mock",
                    size: 0,
                    etag: "mock",
                    httpEtag: "mock",
                    uploaded: new Date(),
                    checksums: { md5: "mock", sha1: "mock", sha256: "mock" },
                    storageClass: "STANDARD",
                    writeHttpMetadata: {},
                }),
            }),
            list: async () => ({
                objects: [],
                delimitedPrefixes: [],
                truncated: false,
            }),
        } as unknown as R2Bucket;

        // Get credentials from environment variables
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const bearerToken = process.env.CLOUDFLARE_API_TOKEN;

        if (!accountId || !bearerToken) {
            console.error(
                "Error: Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables",
            );
            process.exit(1);
        }

        try {
            const result = await extractAsArrow(
                { accountId, bearerToken },
                mockBucket,
            );
            console.log("Success:", result);
        } catch (error) {
            console.error("Error:", error);
            process.exit(1);
        }
    })();
}
