import type { JsonValue } from "./types.ts";

export class CanonicalValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalValueError";
  }
}

export function roundCanonical(value: number): number {
  if (!Number.isFinite(value)) {
    throw new CanonicalValueError("Canonical numbers must be finite");
  }
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalize(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalValueError(`${path} contains a non-finite number`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    const actualKeys = Object.keys(value);
    if (
      actualKeys.length !== expectedKeys.length ||
      expectedKeys.some((key, index) => actualKeys[index] !== key)
    ) {
      throw new CanonicalValueError(`${path} must be a dense JSON array with no extra properties`);
    }
    return expectedKeys.map((key, index) => normalize(value[Number(key)], `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalValueError(`${path} must be a plain object`);
    }
    // A normal object would interpret an own "__proto__" assignment as a
    // prototype mutation and omit it from the encoded value. A null-prototype
    // accumulator keeps every JSON key fingerprint-significant.
    const result = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined || typeof child === "function" || typeof child === "symbol") {
        throw new CanonicalValueError(`${path}.${key} is not JSON-compatible`);
      }
      result[key] = normalize(child, `${path}.${key}`);
    }
    return result;
  }
  throw new CanonicalValueError(`${path} is not JSON-compatible`);
}

export function canonicalValue(value: unknown): JsonValue {
  return normalize(value, "$root");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export async function canonicalDigest(value: unknown): Promise<string> {
  return sha256Text(canonicalJson(value));
}
