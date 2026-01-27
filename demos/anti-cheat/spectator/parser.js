export function parseAnchorPayload(decodedPayload, prefix) {
  if (typeof decodedPayload !== 'string') return null;

  let jsonPart = null;

  if (decodedPayload.startsWith(prefix + ':ANCHOR:')) {
    jsonPart = decodedPayload.slice((prefix + ':ANCHOR:').length);
  } else if (decodedPayload.startsWith(prefix + ':')) {
    // Check for mailbox ID
    const parts = decodedPayload.split(':');
    if (parts.length >= 3) {
      // KKTP : <mailbox> : <json>
      jsonPart = decodedPayload.slice(parts[0].length + parts[1].length + 2);
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

    return obj;
  } catch (err) {
    console.error("parseAnchorPayload error:", err);
    return null;
  }
}
