// VRFProof.js
import { Block } from "./Block.js";

export class VRFProof {
  constructor({ btc, kaspa, nist, finalOutput, seed }) {
    // Force NIST into your Block model so metadata exists
    this.evidence = {
      btc: btc.map((b) => new Block(b)),
      kaspa: kaspa.map((k) => new Block(k)),
      nist: new Block(nist),
    };
    this.finalOutput = finalOutput;
    this.seed = seed;
    this.timestamp = Date.now();
  }
}
