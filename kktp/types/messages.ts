// kktp/types/messages.ts

import type { HexString } from "./crypto";

// ---- Mailbox message (encrypted payload) ----

export interface MailboxMessageFields {
  sid: string;          // session id
  pub_sig: HexString;   // sender signing key
  ciphertext: HexString;
  meta?: Record<string, unknown>;
  sig?: HexString;      // signature over canonical form
}

// If you want a runtime class to implement this:
export interface MailboxMessageLike extends MailboxMessageFields {
  type: string;         // e.g. "msg"
  version: number;
  toCanonicalJSON(): string;
}

// ---- Generic canonicalizable object ----

export interface Canonicalizable {
  toCanonicalJSON(): string;
}