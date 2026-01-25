// Block.js
export class Block {
  constructor({
    hash,
    height,
    time,
    timeStamp,
    source,
    confirms,
    blueScore,
    parents,
    signature,
    signatureValue,
    pulseIndex,
    seedValue,
    previousOutputValue,
    certificateId,
    uri,
    version,
    cipherSuite,
    period,
    chainIndex,
    localRandomValue,
    external,
    listValues,
    precommitmentValue,
    statusCode,
  }) {
    this.hash = hash;
    this.height = height;
    this.time = time;
    this.timeStamp = timeStamp || time;
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
    this.signature = signatureValue || signature;
    this.signatureValue = signatureValue || signature;
    this.pulseIndex = pulseIndex;
    this.seedValue = seedValue;
    this.previousOutputValue = previousOutputValue;
    this.certificateId = certificateId;
    this.uri = uri;
    this.version = version;
    this.cipherSuite = cipherSuite;
    this.period = period;
    this.chainIndex = chainIndex;
    this.localRandomValue = localRandomValue;
    this.external = external;
    this.listValues = listValues;
    this.precommitmentValue = precommitmentValue;
    this.statusCode = statusCode;
  }

  /**
   * Helper: Splits a single 128-char NIST hash into two 64-char blocks
   * while persisting all cryptographic evidence required for audit.
   */
  static fromNistSplit(qrngBlock) {
    const metadata = {
      time: qrngBlock.time,
      timeStamp: qrngBlock.timeStamp,
      source: "nist",
      pulseIndex: qrngBlock.pulseIndex,
      signature: qrngBlock.signature,
      signatureValue: qrngBlock.signatureValue,
      seedValue: qrngBlock.seedValue,
      previousOutputValue: qrngBlock.previousOutputValue,
      certificateId: qrngBlock.certificateId,
      uri: qrngBlock.uri,
      version: qrngBlock.version,
      cipherSuite: qrngBlock.cipherSuite,
      period: qrngBlock.period,
      chainIndex: qrngBlock.chainIndex,
      localRandomValue: qrngBlock.localRandomValue,
      external: qrngBlock.external,
      listValues: qrngBlock.listValues,
      precommitmentValue: qrngBlock.precommitmentValue,
      statusCode: qrngBlock.statusCode,
    };

    return [
      new Block({ ...metadata, hash: qrngBlock.hash.substring(0, 64) }),
      new Block({ ...metadata, hash: qrngBlock.hash.substring(64, 128) }),
    ];
  }
}
