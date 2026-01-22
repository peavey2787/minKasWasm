import { responseValidator } from "../validation/kktpValidator";
import { anchorType } from "./anchorType";
import { canonicalize } from "../canonical/kktpCanonical";
import { canonicalResponseForSig } from "../canonical/kktpCanonicalHelpers";
import { signBytes, verifySignature } from "../crypto/signing";
import { toPlainJson } from "../utils/toPlainJson";

// Types
import type { ResponseAnchorFields } from "../types/anchors";

export class ResponseAnchor {
  type: string;
  version: number;

  sid: string;
  initiator_pub_sig: string;
  initiator_pub_dh: string;
  pub_sig_resp: string;
  pub_dh_resp: string;
  vrf_value?: string | null;
  vrf_proof?: string | null;
  sig_resp: string | null;

  constructor(fields: ResponseAnchorFields) {
    this.type = anchorType.response;
    this.version = 1;

    this.sid = fields.sid;
    this.initiator_pub_sig = fields.initiator_pub_sig;
    this.initiator_pub_dh = fields.initiator_pub_dh;
    this.pub_sig_resp = fields.pub_sig_resp;
    this.pub_dh_resp = fields.pub_dh_resp;
    this.vrf_value = fields.vrf_value ?? null;
    this.vrf_proof = fields.vrf_proof ?? null;
    this.sig_resp = fields.sig_resp ?? null;

    responseValidator.validate(this);
  }

  toSigningPayload(): string {
    return canonicalResponseForSig(toPlainJson(this));
  }

  async sign(privKey: string) {
    const payload = this.toSigningPayload();
    const bytes = new TextEncoder().encode(payload);
    this.sig_resp = await signBytes(privKey, bytes);
    return this;
  }

  async verify(): Promise<boolean> {
    if (!this.sig_resp) return false;
    const payload = this.toSigningPayload();
    const bytes = new TextEncoder().encode(payload);
    return await verifySignature(this.pub_sig_resp, bytes, this.sig_resp);
  }

  toCanonicalJSON(): string {
    return canonicalize(toPlainJson(this));
  }
}