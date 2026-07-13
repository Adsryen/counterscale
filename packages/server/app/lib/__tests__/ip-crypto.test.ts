import { describe, expect, test } from "vitest";

import {
    decryptIpAddress,
    encryptIpAddress,
    normalizeIpAddress,
} from "../ip-crypto";

const config = {
    encryptionKey: "test encryption key with enough entropy",
    hmacKey: "test hmac key with enough entropy",
    keyVersion: 7,
};

describe("ip crypto helpers", () => {
    test("normalizes IPv4 and IPv6 before indexing", () => {
        expect(normalizeIpAddress("  203.000.113.005 ")).toEqual({
            family: 4,
            normalized: "203.0.113.5",
            bytes: new Uint8Array([203, 0, 113, 5]),
        });
        expect(normalizeIpAddress("2001:0DB8:0000:0000:0000:ff00:0042:8329")).toMatchObject({
            family: 6,
            normalized: "2001:db8::ff00:42:8329",
        });
    });

    test("encrypts, hmacs and decrypts without storing plaintext", async () => {
        const encrypted = await encryptIpAddress("203.0.113.5", config);

        expect(encrypted.normalizedIp).toBe("203.0.113.5");
        expect(encrypted.family).toBe(4);
        expect(encrypted.keyVersion).toBe(7);
        expect(encrypted.ciphertext).not.toContain("203.0.113.5");
        expect(encrypted.nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
        expect(encrypted.ipHmac).toMatch(/^[0-9a-f]{64}$/);
        expect(encrypted.prefixes).toEqual([
            expect.objectContaining({ prefixLength: 24, token: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        ]);

        await expect(decryptIpAddress(encrypted, config)).resolves.toBe("203.0.113.5");
    });

    test("uses IPv6 /48 prefix tokens", async () => {
        const encrypted = await encryptIpAddress("2001:db8:abcd:12::1", config);
        expect(encrypted.normalizedIp).toBe("2001:db8:abcd:12::1");
        expect(encrypted.family).toBe(6);
        expect(encrypted.prefixes).toEqual([
            expect.objectContaining({ prefixLength: 48, token: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        ]);
    });
});