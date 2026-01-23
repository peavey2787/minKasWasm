import { state } from '../state.js';
import * as KKTP from '../kktp_lib.js';

export function parseAnchorPayload(decodedPayload, prefix) {
  if (typeof decodedPayload !== 'string') return null;
  
  let jsonPart = null;
  let isMsg = false;

  if (decodedPayload.startsWith(prefix + ':ANCHOR:')) {
    jsonPart = decodedPayload.slice((prefix + ':ANCHOR:').length);
  } else if (decodedPayload.startsWith(prefix + ':')) {
    // Check for mailbox ID
    const parts = decodedPayload.split(':');
    if (parts.length >= 3) {
      // KKTP : <mailbox> : <json>
      jsonPart = decodedPayload.slice(parts[0].length + parts[1].length + 2);
      isMsg = true;
    }
  }

  if (!jsonPart) return null;

  try {
    const obj = JSON.parse(jsonPart);
    if (!obj) return null;

    // Handle bundles (demo optimization)
    if (Array.isArray(obj.anchors)) {
      return { sid: obj.anchors[0]?.sid, anchors: obj.anchors };
    }

    // If it's an encrypted message, try to decrypt if we have keys
    if (isMsg && obj.type === 'msg' && state.kktp.kSession) {
      // Check mailbox ID if available in state to avoid decrypting wrong session msgs
      if (state.kktp.mailboxId && obj.mailbox_id !== state.kktp.mailboxId) {
         // Wrong mailbox, skip decryption
         return obj; 
      }

      const decrypted = KKTP.decryptMessage(state.kktp.kSession, obj);
      return decrypted;
    }

    return obj;
  } catch (err) {
    console.error("parseAnchorPayload error:", err);
    return null;
  }
}