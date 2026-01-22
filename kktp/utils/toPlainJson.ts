import type { JsonValue } from "../canonical/kktpCanonicalHelpers";

export function toPlainJson<T extends object>(value: T): JsonValue {
  return walk(value) as JsonValue;
}

function walk(v: any): JsonValue {
  if (v === null) return null;

  if (Array.isArray(v)) {
    return v.map(walk);
  }

  if (typeof v === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(v)) {
      const child = walk(v[key]);
      if (child !== undefined) out[key] = child;
    }
    return out;
  }

  // primitives
  return v;
}