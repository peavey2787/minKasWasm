import { discoveryValidator } from "../validation/kktpValidator";
import { anchorType } from "./anchorType";
import { canonicalize } from "../canonical/kktpCanonical";
import { canonicalDiscoveryForSig } from "../canonical/kktpCanonicalHelpers";
import { signBytes, verifySignature } from "../crypto/signing";
import { toPlainJson } from "../utils/toPlainJson";

// Types
import type { DiscoveryAnchorFields } from "../types/anchors";

export class DiscoveryAnchor {
  type: string;
  version: number;

  sid: string;
  pub_sig: string;
  pub_dh: string;
  vrf_value?: string | null;
  vrf_proof?: string | null;
  meta: Record<string, unknown>;
  sig: string | null;

  constructor(fields: DiscoveryAnchorFields) {
    this.type = anchorType.discovery;
    this.version = 1;

    this.sid = fields.sid;
    this.pub_sig = fields.pub_sig;
    this.pub_dh = fields.pub_dh;
    this.vrf_value = fields.vrf_value ?? null;
    this.vrf_proof = fields.vrf_proof ?? null;
    this.meta = fields.meta;
    this.sig = fields.sig ?? null;

    discoveryValidator.validate(this);
  }

  toSigningPayload(): string {
    return canonicalDiscoveryForSig(toPlainJson(this));
  }

  async sign(privKey: string) {
    const bytes = new TextEncoder().encode(this.toSigningPayload());
    this.sig = await signBytes(privKey, bytes);
    return this;
  }

  async verify(): Promise<boolean> {
    if (!this.sig) return false;
    const bytes = new TextEncoder().encode(this.toSigningPayload());
    return await verifySignature(this.pub_sig, bytes, this.sig);
  }

  toCanonicalJSON(): string {
    return canonicalize(toPlainJson(this));
  }
}