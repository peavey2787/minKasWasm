import { sha256Hex, merkleRootSha256Hex } from '../merkle.js';

export async function verifyAnchorRoot(obj) {
  const prev = obj.prev_root ?? 'GENESIS';
  const moves = obj.moves || '';
  const dts = obj.dts || [];
  const leafHexes = [];

  leafHexes.push(await sha256Hex(`prev:${prev}`));

  // v2 format: includes timing
  for (let i = 0; i < moves.length; i++) {
    leafHexes.push(await sha256Hex(`m:${moves[i]}:dt:${dts[i]}:i:${i}`));
  }

  const computed = await merkleRootSha256Hex(leafHexes);
  return computed === obj.root;
}