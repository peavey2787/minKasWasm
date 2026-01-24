// Block.js
export class Block {
  constructor({
    hash,
    height,
    time,
    source,
    confirms,
    blueScore,
    parents,
    signature,
    pulseIndex
  }) {
    this.hash = hash;
    this.height = height;
    this.time = time;
    this.source = source;
    this.confirms = confirms;
    this.blueScore = blueScore;
    this.parents = parents;

    // Safety check for finality
    this.isFinal =
      source === "nist" || // NIST is always final
      (typeof confirms === "number" && confirms >= 6) || // BTC finality
      (typeof blueScore === "number");

    // Store NIST metadata if it exists
    this.metadata = {
      signature: signature || null,
      pulseIndex: pulseIndex || null
    };
  }
}
