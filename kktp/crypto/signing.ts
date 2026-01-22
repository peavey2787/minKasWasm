import * as ed25519 from "https://esm.sh/@noble/ed25519@1.7.3";

// Noble requires this for sync hashing
ed25519.etc.sha512Sync = (...m: Uint8Array[]) => ed25519.utils.sha512(...m);

export async function signBytes(privKeyHex: string, messageBytes: Uint8Array): Promise<string> {
  const privKey = ed25519.utils.hexToBytes(privKeyHex);
  const sig = await ed25519.sign(messageBytes, privKey);
  return ed25519.utils.bytesToHex(sig);
}

export async function verifySignature(pubKeyHex: string, messageBytes: Uint8Array, signatureHex: string): Promise<boolean> {
  const pubKey = ed25519.utils.hexToBytes(pubKeyHex);
  const sig = ed25519.utils.hexToBytes(signatureHex);
  return ed25519.verify(sig, messageBytes, pubKey);
}