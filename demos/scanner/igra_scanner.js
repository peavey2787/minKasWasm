export function scanIgraPayload(tx) {
  const txid = tx.verboseData?.transactionId || tx.transactionId || "unknown";
  const payload = tx.payload;

  if (
    !payload ||
    typeof payload !== "string" ||
    payload.length < 2 ||
    (tx.inputs.length === 0 && tx.outputs.length === 1)
  ) {
    // skip invalid payloads
  } else {
    let hex = payload.startsWith("0x") ? payload.slice(2) : payload;
    if (hex.length % 2 !== 0) {
      hex = "0" + hex;
    }
    const pairs = hex.match(/.{1,2}/g);
    const bytes = new Uint8Array(pairs.map(b => parseInt(b, 16)));
    const firstByte = bytes[0];
    const version = firstByte >> 4;
    const typeId = firstByte & 0x0f;

    if (version === 0x9 && (typeId === 2 || typeId === 4 || typeId === 5)) {
      formatIgraPayload(bytes);
    }
  }
}

function formatIgraPayload(bytes) {
  if (!bytes || bytes.length < 5) return;

  const firstByte = bytes[0];
  const version = firstByte >> 4;
  const typeId = firstByte & 0x0f;

  if (version !== 0x9) return;
  if (typeId < 1 || typeId > 7) return;

  const nonceStart = bytes.length - 4;
  const l2Data = bytes.slice(1, nonceStart);
  const nonce = bytes.slice(nonceStart);

  if (looksLikeMinerMetadata(l2Data)) return;

  const isZipped = l2Data.length >= 2 && l2Data[0] === 0x78 && l2Data[1] === 0x9c;
  if (typeId === 5 && !isZipped) return;
  if (typeId !== 5 && isZipped) return;
  if (typeId === 2 && l2Data.length !== 28) return;
  if (typeId === 4 && !decodeRlp(l2Data)) return;

  console.log("=== IGRA PAYLOAD DETECTED ===");
  console.log("TxID:", txid);
  console.log("Version:", version, "TypeId:", typeId);
  console.log("L2Data length:", l2Data.length, "bytes");
  console.log("L2Data (HEX):", bytesToHex(l2Data));
  console.log("Nonce (4 bytes):", bytesToHex(nonce));
  console.log("payload (HEX):", bytesToHex(bytes));
  console.log("=== END IGRA PAYLOAD ===");
}

function decodeRlp(bytes) {
  let i = 0;
  function parse() {
    if (i >= bytes.length) throw new Error("RLP out of bounds");
    const b = bytes[i++];
    if (b <= 0x7f) {
      return b;
    } else if (b <= 0xb7) {
      const len = b - 0x80;
      const str = bytes.slice(i, i + len);
      i += len;
      return str;
    } else if (b <= 0xbf) {
      const lenlen = b - 0xb7;
      const len = parseInt(bytes.slice(i, i + lenlen)
        .reduce((s,v)=>s+v.toString(16).padStart(2,"0"),""),16);
      i += lenlen;
      const str = bytes.slice(i, i + len);
      i += len;
      return str;
    } else if (b <= 0xf7) {
      const len = b - 0xc0;
      const listEnd = i + len;
      const items = [];
      while (i < listEnd) items.push(parse());
      return items;
    } else {
      const lenlen = b - 0xf7;
      const len = parseInt(bytes.slice(i, i + lenlen)
        .reduce((s,v)=>s+v.toString(16).padStart(2,"0"),""),16);
      i += lenlen;
      const listEnd = i + len;
      const items = [];
      while (i < listEnd) items.push(parse());
      return items;
    }
  }
  try {    
    const items = []; // Parse until the buffer is consumed
    while (i < bytes.length) {
      items.push(parse());
    }
    return true; // success if we consumed everything cleanly
  } catch {
    return false;
  }
}

function bytesToAscii(bytes) {
  return Array.from(bytes)
    .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
    .join("");
}

function bytesToHex(bytes) {
  if (!bytes) return "";
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function looksLikeMinerMetadata(bytes) {
  const ascii = bytesToAscii(bytes)
    .toLowerCase()
    .replace(/[^\x20-\x7e]/g, "");
  return (
    ascii.includes("pool") ||
    ascii.includes("miner") ||
    ascii.includes("viabtc") ||
    ascii.includes("canxiuminer") ||
    ascii.includes("sparkpool") ||
    ascii.includes("nanopool") ||
    ascii.includes("f2pool") ||
    ascii.includes("2miners") ||
    ascii.includes(".com") ||
    ascii.includes("0.0/") ||
    ascii.includes("0.12.")
  );
}