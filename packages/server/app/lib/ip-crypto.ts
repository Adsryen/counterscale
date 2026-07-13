export type IpFamily = 4 | 6;

export type NormalizedIpAddress = {
    family: IpFamily;
    normalized: string;
    bytes: Uint8Array;
};

export type IpCryptoConfig = {
    encryptionKey: string;
    hmacKey: string;
    keyVersion: number;
};

export type IpPrefixToken = {
    prefixLength: 24 | 48;
    token: string;
};

export type EncryptedIpAddress = {
    normalizedIp: string;
    family: IpFamily;
    ciphertext: string;
    nonce: string;
    keyVersion: number;
    ipHmac: string;
    prefixes: IpPrefixToken[];
};

type DecryptableIpAddress = Pick<
    EncryptedIpAddress,
    "ciphertext" | "nonce" | "keyVersion"
>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function digestSecret(secret: string): Promise<ArrayBuffer> {
    return crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
}

async function importAesKey(secret: string): Promise<CryptoKey> {
    const raw = await digestSecret(secret);
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
        "encrypt",
        "decrypt",
    ]);
}

async function hmacHex(secret: string, value: string): Promise<string> {
    const raw = await digestSecret(secret);
    const key = await crypto.subtle.importKey(
        "raw",
        raw,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    return toHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

function parseIPv4(raw: string): Uint8Array | null {
    const parts = raw.split(".");
    if (parts.length !== 4) return null;
    const bytes = parts.map((part) => {
        if (!/^\d{1,3}$/.test(part)) return NaN;
        const n = Number(part);
        return Number.isInteger(n) && n >= 0 && n <= 255 ? n : NaN;
    });
    if (bytes.some((b) => Number.isNaN(b))) return null;
    return new Uint8Array(bytes);
}

function parseIPv6(raw: string): Uint8Array | null {
    let value = raw.toLowerCase();
    if (value.includes(".")) {
        const lastColon = value.lastIndexOf(":");
        if (lastColon < 0) return null;
        const v4 = parseIPv4(value.slice(lastColon + 1));
        if (!v4) return null;
        const high = ((v4[0] << 8) | v4[1]).toString(16);
        const low = ((v4[2] << 8) | v4[3]).toString(16);
        value = `${value.slice(0, lastColon)}:${high}:${low}`;
    }

    const halves = value.split("::");
    if (halves.length > 2) return null;

    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    if ([...left, ...right].some((h) => !/^[0-9a-f]{1,4}$/.test(h))) {
        return null;
    }

    const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
    if (halves.length === 1 && left.length !== 8) return null;
    if (halves.length === 2 && missing < 1) return null;

    const hextets = [
        ...left,
        ...Array.from({ length: missing }, () => "0"),
        ...right,
    ];
    if (hextets.length !== 8) return null;

    const bytes = new Uint8Array(16);
    hextets.forEach((part, i) => {
        const n = parseInt(part, 16);
        bytes[i * 2] = (n >> 8) & 0xff;
        bytes[i * 2 + 1] = n & 0xff;
    });
    return bytes;
}

function canonicalIPv6(bytes: Uint8Array): string {
    const hextets: number[] = [];
    for (let i = 0; i < 16; i += 2) {
        hextets.push((bytes[i] << 8) | bytes[i + 1]);
    }

    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < hextets.length;) {
        if (hextets[i] !== 0) {
            i++;
            continue;
        }
        let j = i;
        while (j < hextets.length && hextets[j] === 0) j++;
        const len = j - i;
        if (len > bestLen && len >= 2) {
            bestStart = i;
            bestLen = len;
        }
        i = j;
    }

    if (bestStart === -1) {
        return hextets.map((h) => h.toString(16)).join(":");
    }

    const parts: string[] = [];
    for (let i = 0; i < hextets.length; i++) {
        if (i === bestStart) {
            parts.push("");
            i += bestLen - 1;
            if (i === hextets.length - 1) parts.push("");
            continue;
        }
        parts.push(hextets[i].toString(16));
    }
    if (bestStart === 0) parts.unshift("");
    return parts.join(":");
}

export function normalizeIpAddress(raw: string): NormalizedIpAddress {
    const trimmed = raw.trim().replace(/^\[(.*)]$/, "$1").split("%")[0];
    const ipv4 = parseIPv4(trimmed);
    if (ipv4) {
        return {
            family: 4,
            normalized: Array.from(ipv4).join("."),
            bytes: ipv4,
        };
    }

    const ipv6 = parseIPv6(trimmed);
    if (ipv6) {
        return {
            family: 6,
            normalized: canonicalIPv6(ipv6),
            bytes: ipv6,
        };
    }

    throw new Error("Invalid IP address");
}

function prefixPlaintext(ip: NormalizedIpAddress): string {
    if (ip.family === 4) {
        return `v4:${ip.bytes[0]}.${ip.bytes[1]}.${ip.bytes[2]}.0/24`;
    }
    const prefixBytes = new Uint8Array(16);
    prefixBytes.set(ip.bytes.slice(0, 6));
    return `v6:${canonicalIPv6(prefixBytes)}/48`;
}

export async function encryptIpAddress(
    rawIp: string,
    config: IpCryptoConfig,
): Promise<EncryptedIpAddress> {
    const ip = normalizeIpAddress(rawIp);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await importAesKey(config.encryptionKey);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce },
            aesKey,
            textEncoder.encode(ip.normalized),
        ),
    );
    const prefixLength = ip.family === 4 ? 24 : 48;

    return {
        normalizedIp: ip.normalized,
        family: ip.family,
        ciphertext: toBase64(ciphertext),
        nonce: toBase64(nonce),
        keyVersion: config.keyVersion,
        ipHmac: await hmacHex(config.hmacKey, `${ip.family}:${ip.normalized}`),
        prefixes: [
            {
                prefixLength,
                token: await hmacHex(config.hmacKey, prefixPlaintext(ip)),
            },
        ],
    };
}

export async function decryptIpAddress(
    encrypted: DecryptableIpAddress,
    config: IpCryptoConfig,
): Promise<string> {
    if (encrypted.keyVersion !== config.keyVersion) {
        throw new Error("IP key version mismatch");
    }
    const aesKey = await importAesKey(config.encryptionKey);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(encrypted.nonce) },
        aesKey,
        fromBase64(encrypted.ciphertext),
    );
    return textDecoder.decode(plaintext);
}