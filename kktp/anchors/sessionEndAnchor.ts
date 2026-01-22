// kktp/anchors/SessionEndAnchor.ts

import { sessionEndValidator } from "../validation/kktpValidator";
import { anchorType } from "./anchorType";
import { canonicalize } from "../canonical/kktpCanonical";
import { canonicalSessionEndForSig } from "../canonical/kktpCanonicalHelpers";
import { signBytes, verifySignature } from "../crypto/signing";
import { toPlainJson } from "../utils/toPlainJson";

// Types
import type { SessionEndAnchorFields } from "../types/anchors";

export class SessionEndAnchor {
  type: string;
  version: number;
  sid: string;
  pub_sig: string;
  reason: string;
  sig: string | null;

  constructor(fields: SessionEndAnchorFields) {
    this.type = anchorType.sessionEnd;
    this.version = 1;

    this.sid = fields.sid;
    this.pub_sig = fields.pub_sig;
    this.reason = fields.reason;
    this.sig = fields.sig ?? null;

    sessionEndValidator.validate(this);
  }

  toSigningPayload(): string {
    return canonicalSessionEndForSig(toPlainJson(this));
  }

  async sign(privKey: string) {
    const payload = this.toSigningPayload();
    const bytes = new TextEncoder().encode(payload);
    this.sig = await signBytes(privKey, bytes);
    return this;
  }

  async verify(): Promise<boolean> {
    if (!this.sig) return false;
    const payload = this.toSigningPayload();
    const bytes = new TextEncoder().encode(payload);
    return verifySignature(this.pub_sig, bytes, this.sig);
  }

  toCanonicalJSON(): string {
    return canonicalize(toPlainJson(this));
  }
}