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
    pulseIndex,
    seedValue,
    previousOutputValue,
    certificateId,
  }) {
    this.hash = hash;
    this.height = height;
    this.time = time;
    this.source = source || "nist";
    this.confirms = confirms;
    this.blueScore = blueScore;
    this.parents = parents;

    // Safety check for finality
    this.isFinal =
      this.source === "nist" ||
      (typeof confirms === "number" && confirms >= 6) ||
      typeof blueScore === "number";

    // NIST Metadata persistence
    this.signature = signature;
    this.pulseIndex = pulseIndex;
    this.seedValue = seedValue;
    this.previousOutputValue = previousOutputValue;
    this.certificateId = certificateId;
  }

  /**
   * Helper: Splits a single 128-char NIST hash into two 64-char blocks
   * while persisting all cryptographic evidence required for audit.
   */
  static fromNistSplit(qrngBlock) {
    const metadata = {
      time: qrngBlock.time,
      source: "nist",
      pulseIndex: qrngBlock.pulseIndex,
      signature: qrngBlock.signature,
      seedValue: qrngBlock.seedValue,
      previousOutputValue: qrngBlock.previousOutputValue,
      certificateId: qrngBlock.certificateId,
    };

    return [
      new Block({ ...metadata, hash: qrngBlock.hash.substring(0, 64) }),
      new Block({ ...metadata, hash: qrngBlock.hash.substring(64, 128) }),
    ];
  }
}
