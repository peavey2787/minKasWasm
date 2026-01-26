// anchorHandler.js - Handles anchor creation, verification, and routing
import { canonicalize, prepareForSigning } from "../../kktp/protocol/integrity/canonical.js";
import { AnchorFactory } from "../../kktp/protocol/integrity/anchorFactory.js";
import {
  discoveryValidator,
  responseValidator,
  sessionEndValidator,
} from "../../kktp/protocol/integrity/validator.js";

const anchorFactory = new AnchorFactory();

/**
 * Verify anchor signature per §7.4
 * @returns {Promise<boolean>}
 */
export async function verifyAnchorSignature(kaspaPortal, anchor) {
  const isResponse = anchor.type === "response";
  const sigField = isResponse ? "sig_resp" : "sig";
  const pubKeyField = isResponse ? "pub_sig_resp" : "pub_sig";

  const signature = anchor[sigField];
  const pubKey = anchor[pubKeyField];

  if (!signature || !pubKey) return false;

  const body = canonicalize(
    prepareForSigning(anchor, {
      omitKeys: [sigField],
      excludeMeta: anchor.type === "discovery",
    }),
  );

  return await kaspaPortal.crypto.verifyMessage(pubKey, body, signature);
}

/**
 * Create and sign a discovery anchor
 */
export async function createDiscoveryAnchor(kaspaPortal, meta) {
  const keys = await kaspaPortal.generateIdentityKeys(0);

  const discovery = await anchorFactory.createDiscovery({
    meta,
    sig: keys.sig,
    dh: keys.dh,
  });

  // Sign the discovery anchor per §5.1: omit sig and meta
  const body = canonicalize(
    prepareForSigning(discovery, {
      omitKeys: ["sig"],
      excludeMeta: true,
    }),
  );
  discovery.sig = await kaspaPortal.crypto.signMessage(keys.sig.privateKey, body);

  discoveryValidator.validate(discovery);

  return {
    discovery,
    keys,
    dhPrivateKey: keys.dh.privateKey,
  };
}

/**
 * Create and sign a response anchor
 */
export async function createResponseAnchor(kaspaPortal, discovery) {
  const keys = await kaspaPortal.generateIdentityKeys(1);

  const response = await anchorFactory.createResponse(discovery, {
    sig: keys.sig,
    dh: keys.dh,
  });

  // Sign the response anchor per §5.3: omit sig_resp, no meta to exclude
  const body = canonicalize(
    prepareForSigning(response, {
      omitKeys: ["sig_resp"],
      excludeMeta: false,
    }),
  );
  response.sig_resp = await kaspaPortal.crypto.signMessage(keys.sig.privateKey, body);

  responseValidator.validate(response);

  return {
    response,
    keys,
    dhPrivateKey: keys.dh.privateKey,
  };
}

/**
 * Serialize anchor for broadcast
 */
export function serializeAnchorForBroadcast(anchor) {
  const canonical = canonicalize(anchor);
  return `KKTP:ANCHOR:${canonical}`;
}

/**
 * Parse incoming KKTP payload
 */
export function parseKKTPPayload(rawPayload) {
  if (!rawPayload || !rawPayload.startsWith("KKTP:")) {
    return null;
  }

  // Anchor format: KKTP:ANCHOR:{json}
  if (rawPayload.startsWith("KKTP:ANCHOR:")) {
    const jsonStr = rawPayload.substring("KKTP:ANCHOR:".length);
    try {
      const anchor = JSON.parse(jsonStr);
      return { type: "anchor", anchor };
    } catch (e) {
      console.warn("Failed to parse anchor:", e);
      return null;
    }
  }

  // Message format: KKTP:{mailboxId}:{json}
  const parts = rawPayload.split(":");
  if (parts.length >= 3) {
    const mailboxId = parts[1];
    const jsonStr = parts.slice(2).join(":");
    try {
      const message = JSON.parse(jsonStr);
      return { type: "message", mailboxId, message };
    } catch (e) {
      console.warn("Failed to parse message:", e);
      return null;
    }
  }

  return null;
}

/**
 * Validate and route anchor
 */
export async function validateAndRouteAnchor(kaspaPortal, anchor) {
  // Validate schema
  if (anchor.type === "discovery") {
    discoveryValidator.validate(anchor);
  } else if (anchor.type === "response") {
    responseValidator.validate(anchor);
  } else if (anchor.type === "session_end") {
    sessionEndValidator.validate(anchor);
  } else {
    throw new Error(`Unknown anchor type: ${anchor.type}`);
  }

  // Verify signature per §7.4
  const isValid = await verifyAnchorSignature(kaspaPortal, anchor);
  if (!isValid) {
    throw new Error("Invalid anchor signature");
  }

  return anchor;
}
