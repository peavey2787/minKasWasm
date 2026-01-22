// kktpCanonicalHelpers.ts
import { canonicalize } from "./kktpCanonical";

// Generic JSON-like type
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Options for prepareForSigning
export interface PrepareOptions {
  omitKeys?: string[];
  excludeMeta?: boolean;
}

// Deep clone with field omissions and optional meta exclusion
export function prepareForSigning(
  obj: JsonValue,
  { omitKeys = [], excludeMeta = false }: PrepareOptions = {}
): JsonValue {
  function walk(v: JsonValue): JsonValue {
    if (v === null) return null;

    if (Array.isArray(v)) {
      return v.map(walk);
    }

    if (typeof v === "object") {
      const out: { [key: string]: JsonValue } = {};
      for (const k of Object.keys(v)) {
        if (omitKeys.includes(k)) continue;
        if (excludeMeta && k === "meta") continue;

        const child = walk((v as any)[k]);
        if (child !== undefined) out[k] = child;
      }
      return out;
    }

    return v;
  }

  return walk(obj);
}

// Example: Discovery Anchor signing input (omit "sig", exclude "meta")
export function canonicalDiscoveryForSig(anchor: JsonValue): string {
  const prepared = prepareForSigning(anchor, {
    omitKeys: ["sig"],
    excludeMeta: true
  });
  return canonicalize(prepared);
}

// Example: Response Anchor signing input (omit "sig_resp")
export function canonicalResponseForSig(anchor: JsonValue): string {
  const prepared = prepareForSigning(anchor, {
    omitKeys: ["sig_resp"],
    excludeMeta: true
  });
  return canonicalize(prepared);
}

// Example: Session End Anchor signing input (omit "sig")
export function canonicalSessionEndForSig(anchor: JsonValue): string {
  const prepared = prepareForSigning(anchor, {
    omitKeys: ["sig"],
    excludeMeta: true
  });
  return canonicalize(prepared);
}