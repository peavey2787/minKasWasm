export function makeDiagPayload({ prefix, seq }) {
  const payloadObj = {
    kind: 'diag',
    seq,
    nonce: Math.random().toString(16).slice(2),
    t: Date.now(),
  };
  return `${prefix}:${JSON.stringify(payloadObj)}`;
}

export function extractDecodedPayload(matchObj) {
  if (typeof matchObj?.decodedPayload === 'string') return matchObj.decodedPayload;

  const hex =
    matchObj?.payloadHex ??
    matchObj?.payload ??
    matchObj?.transaction?.payloadHex ??
    matchObj?.transaction?.payload ??
    null;

  if (typeof hex === 'string' && /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    try {
      const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }

  return null;
}

export function parseDiagSeq(payload, prefix) {
  const start = `${prefix}:`;
  if (typeof payload !== 'string' || !payload.startsWith(start)) return null;
  try {
    const obj = JSON.parse(payload.slice(start.length));
    if (obj?.kind !== 'diag') return null;
    return typeof obj.seq === 'number' ? obj.seq : null;
  } catch {
    return null;
  }
}
