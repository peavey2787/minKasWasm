// kktp/types/session.ts

import type { HexString } from "./crypto";

// ---- Session roles ----

export type SessionRole = "initiator" | "responder";

// ---- Session phases / states ----

export type SessionPhase =
  | "discovery"
  | "handshake"
  | "active"
  | "ended";

// ---- Session state core ----

export interface SessionState {
  sid: string;                 // session id
  role: SessionRole;
  phase: SessionPhase;

  // Identity keys
  local_pub_sig: HexString;
  remote_pub_sig?: HexString;

  // DH keys
  local_pub_dh?: HexString;
  local_priv_dh?: HexString;
  remote_pub_dh?: HexString;

  // Derived keys (post-handshake)
  send_key?: Uint8Array;
  recv_key?: Uint8Array;

  // Optional metadata
  meta?: Record<string, unknown>;
}

// ---- State machine interface ----

export interface SessionStateMachine {
  getState(): SessionState;

  // Discovery / handshake
  applyDiscovery(anchor: unknown): void;
  applyResponse(anchor: unknown): void;
  applySessionEnd(anchor: unknown): void;

  // Messaging
  encryptMessage(plaintext: Uint8Array, meta?: Record<string, unknown>): Promise<unknown>;
  decryptMessage(mailboxMessage: unknown): Promise<Uint8Array>;

  // Lifecycle
  end(reason: string): void;
}