// kktp/types/anchors.ts

// -----------------------------
// Discovery Anchor
// -----------------------------
export interface DiscoveryAnchorFields {
  sid: string;
  pub_sig: string;
  pub_dh: string;
  vrf_value?: string | null;
  vrf_proof?: string | null;
  meta: {
    game: string;
    version: string;
    expected_uptime_seconds: number;
    [key: string]: unknown; // allow extension fields
  };
  sig?: string | null;
}

// -----------------------------
// Response Anchor
// -----------------------------
export interface ResponseAnchorFields {
  sid: string;
  initiator_pub_sig: string;
  initiator_pub_dh: string;
  pub_sig_resp: string;
  pub_dh_resp: string;
  vrf_value?: string | null;
  vrf_proof?: string | null;
  sig_resp?: string | null;
}

// -----------------------------
// Session End Anchor
// -----------------------------
export interface SessionEndAnchorFields {
  sid: string;
  pub_sig: string;
  reason: string;
  sig?: string | null;
}

// -----------------------------
// Mailbox Message
// -----------------------------
export interface MailboxMessageFields {
  sid: string;
  mailbox_id: string;
  direction: "AtoB" | "BtoA";
  seq: number;
  nonce: string;
  ciphertext: string;
}
