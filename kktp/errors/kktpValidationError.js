// kktp/errors/kktpValidationError.js

export class KKTPValidationError extends Error {
  constructor(message, path = "") {
    super(path ? `${path}: ${message}` : message);
    this.name = "kktpValidationError";
  }
}