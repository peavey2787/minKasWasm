import { PrivateKeyGenerator, PublicKeyGenerator } from '../../../kas-wasm/kaspa.js';
import { getXPrvFromStorage } from '../../../wrapper/utilities.js';

function networkIdToNetworkName(networkId) {
  const nid = String(networkId || '').toLowerCase();
  return nid.startsWith('testnet') ? 'testnet' : 'mainnet';
}

export async function deriveReceiveAndChange0({ filename, password, networkId, accountIndex = 0 } = {}) {
  if (!filename) throw new Error('deriveReceiveAndChange0: filename required');
  if (!password) throw new Error('deriveReceiveAndChange0: password required');

  const xprv = await getXPrvFromStorage(filename, password);
  const xprvHex = xprv.toString();

  const acct = BigInt(accountIndex);
  const networkName = networkIdToNetworkName(networkId);

  const privGen = new PrivateKeyGenerator(xprvHex, false, acct);
  const pubGen = PublicKeyGenerator.fromMasterXPrv(xprvHex, false, acct);

  const receivePriv = privGen.receiveKey(0);
  const receivePub = receivePriv.toPublicKey();
  const receiveAddress = pubGen.receiveAddressAsString(networkName, 0);

  const changePriv = privGen.changeKey(0);
  const changePub = changePriv.toPublicKey();
  const changeAddress = pubGen.changeAddressAsString(networkName, 0);

  try { privGen.free?.(); } catch { /* ignore */ }
  try { pubGen.free?.(); } catch { /* ignore */ }

  return {
    receive: { privateKey: receivePriv.toString(), publicKey: receivePub.toString(), address: receiveAddress },
    change: { privateKey: changePriv.toString(), publicKey: changePub.toString(), address: changeAddress },
  };
}
