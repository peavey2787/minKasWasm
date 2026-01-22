// kktpCanonicalHelpers.js
const { canonicalize } = require("./kktpCanonical");

// Deep clone with field omissions and optional meta exclusion
function prepareForSigning(obj, { omitKeys = [], excludeMeta = false } = {}) {
  function walk(v) {
    if (v === null) return null;
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v)) {
        if (omitKeys.includes(k)) continue;
        if (excludeMeta && k === "meta") continue;
        const child = walk(v[k]);
        if (child !== undefined) out[k] = child;
      }
      return out;
    }
    return v;
  }
  return walk(obj);
}

// Example: Discovery Anchor signing input (omit "sig", exclude "meta")
function canonicalDiscoveryForSig(anchor) {
  const prepared = prepareForSigning(anchor, {
    omitKeys: ["sig"],
    excludeMeta: true
  });
  return canonicalize(prepared);
}

// Example: Response Anchor signing input (omit "sig_resp")
function canonicalResponseForSig(anchor) {
  const prepared = prepareForSigning(anchor, {
    omitKeys: ["sig_resp"],
    excludeMeta: true // spec says meta excluded from signing generally
  });
  return canonicalize(prepared);
}

// Example: Session End Anchor signing input (omit "sig")
function canonicalSessionEndForSig(anchor) {
  const prepared = prepareForSigning(anchor, {
    omitKeys: ["sig"],
    excludeMeta: true
  });
  return canonicalize(prepared);
}

module.exports = {
  canonicalize,
  prepareForSigning,
  canonicalDiscoveryForSig,
  canonicalResponseForSig,
  canonicalSessionEndForSig
};