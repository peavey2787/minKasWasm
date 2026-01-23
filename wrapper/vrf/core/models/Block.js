// Block.js - Minimal browser-compatible Block class
export class Block {
  constructor({ hash, height, time, source, confirms, blueScore, parents }) {
    this.hash = hash;
    this.height = height;
    this.time = time;
    this.source = source;
    this.confirms = confirms;
    this.blueScore = blueScore;
    this.parents = parents;
    // Mark as final if confirmations or blueScore is present
    this.isFinal = (typeof confirms === 'number' && confirms >= 0) || (typeof blueScore === 'number');
  }
}