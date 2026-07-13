import { describe, expect, test } from "vitest";

import { ColumnMappings } from "../schema";
import {
    ANALYTICS_ENGINE_FIELD_LIMITS,
    ANALYTICS_STORAGE_ASSIGNMENTS,
    FORBIDDEN_METRICS_V1_RAW_IDENTIFIERS,
    METRICS_DATASET_NAME,
    METRICS_V1_FIELD_REGISTRY,
    getMetricsV1FieldBySlot,
} from "../field-registry";

describe("metricsDataset v1 field registry", () => {
    test("covers every AE slot without exceeding 20/20/1", () => {
        const indexes = METRICS_V1_FIELD_REGISTRY.filter((field) =>
            field.slot.startsWith("index"),
        );
        const blobs = METRICS_V1_FIELD_REGISTRY.filter((field) =>
            field.slot.startsWith("blob"),
        );
        const doubles = METRICS_V1_FIELD_REGISTRY.filter((field) =>
            field.slot.startsWith("double"),
        );

        expect(indexes).toHaveLength(ANALYTICS_ENGINE_FIELD_LIMITS.indexes);
        expect(blobs).toHaveLength(ANALYTICS_ENGINE_FIELD_LIMITS.blobs);
        expect(doubles).toHaveLength(ANALYTICS_ENGINE_FIELD_LIMITS.doubles);
        expect(new Set(METRICS_V1_FIELD_REGISTRY.map((field) => field.slot)).size).toBe(
            METRICS_V1_FIELD_REGISTRY.length,
        );
        expect(
            METRICS_V1_FIELD_REGISTRY.every(
                (field) => field.dataset === METRICS_DATASET_NAME,
            ),
        ).toBe(true);
    });

    test("locks all existing ColumnMappings to their historical slots", () => {
        Object.entries(ColumnMappings).forEach(([logicalName, slot]) => {
            const field = getMetricsV1FieldBySlot(slot);
            expect(field, `${logicalName} should be registered`).toBeDefined();
            expect(field?.logicalName).toBe(logicalName);
            expect(field?.status).not.toBe("reserved");
        });

        expect(getMetricsV1FieldBySlot("blob19")?.status).toBe("reserved");
        expect(getMetricsV1FieldBySlot("blob20")?.status).toBe("reserved");
    });

    test("documents legacy visitor/session/bounce semantics as non-reusable", () => {
        expect(getMetricsV1FieldBySlot(ColumnMappings.newVisitor)).toMatchObject({
            logicalName: "newVisitor",
            status: "used",
            compatibility: expect.stringContaining("not stable visitor_id UV"),
        });
        expect(getMetricsV1FieldBySlot(ColumnMappings.newSession)).toMatchObject({
            logicalName: "newSession",
            status: "dead-but-locked",
            compatibility: expect.stringContaining("never reuse"),
        });
        expect(getMetricsV1FieldBySlot(ColumnMappings.bounce)).toMatchObject({
            logicalName: "bounce",
            status: "used",
        });
    });

    test("keeps raw identity and IP material out of metricsDataset v1", () => {
        const registeredNames = new Set(
            METRICS_V1_FIELD_REGISTRY.map((field) => field.logicalName),
        );

        FORBIDDEN_METRICS_V1_RAW_IDENTIFIERS.forEach((name) => {
            expect(registeredNames.has(name)).toBe(false);
        });

        const detailAssignments = ANALYTICS_STORAGE_ASSIGNMENTS.filter(
            (assignment) =>
                assignment.capability.includes("identity") ||
                assignment.capability.includes("ip"),
        );
        expect(detailAssignments.map((assignment) => assignment.owner)).toEqual([
            "d1-detail",
            "d1-detail",
        ]);
    });
});
