/**
 * SDK error codes and error class.
 * Downstream devs can switch on error.code without string-matching messages.
 */

export enum KinesisErrorCode {
  /** RPC client is not connected */
  NOT_CONNECTED = 'ERR_NOT_CONNECTED',
  /** Wallet is locked or not initialized */
  WALLET_LOCKED = 'ERR_WALLET_LOCKED',
  /** Insufficient funds (mature balance too low) */
  INSUFFICIENT_FUNDS = 'ERR_INSUFFICIENT_FUNDS',
  /** SDK or RPC is busy / rate-limited; retry later */
  RATE_LIMITED = 'ERR_RATE_LIMITED',
  /** Payload exceeds maximum allowed size */
  PAYLOAD_TOO_LARGE = 'ERR_PAYLOAD_TOO_LARGE',
  /** Transaction rejected by policy (storage-mass, dust, etc.) */
  POLICY_REJECTED = 'ERR_POLICY_REJECTED',
  /** Generic/unknown error */
  UNKNOWN = 'ERR_UNKNOWN',
  /** VRF source fetch failed */
  VRF_FETCH_FAILED = 'ERR_VRF_FETCH_FAILED',
  /** Observer not started */
  OBSERVER_NOT_STARTED = 'ERR_OBSERVER_NOT_STARTED',
}

export class KinesisError extends Error {
  public readonly code: KinesisErrorCode;
  public readonly cause?: unknown;

  constructor(code: KinesisErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'KinesisError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, KinesisError.prototype);
  }

  static notConnected(msg = 'Client is not connected'): KinesisError {
    return new KinesisError(KinesisErrorCode.NOT_CONNECTED, msg);
  }

  static walletLocked(msg = 'Wallet is locked or not initialized'): KinesisError {
    return new KinesisError(KinesisErrorCode.WALLET_LOCKED, msg);
  }

  static insufficientFunds(msg = 'Insufficient funds'): KinesisError {
    return new KinesisError(KinesisErrorCode.INSUFFICIENT_FUNDS, msg);
  }

  static rateLimited(msg = 'Rate limited; retry later'): KinesisError {
    return new KinesisError(KinesisErrorCode.RATE_LIMITED, msg);
  }

  static payloadTooLarge(msg = 'Payload exceeds maximum size'): KinesisError {
    return new KinesisError(KinesisErrorCode.PAYLOAD_TOO_LARGE, msg);
  }

  static policyRejected(msg = 'Transaction rejected by policy', cause?: unknown): KinesisError {
    return new KinesisError(KinesisErrorCode.POLICY_REJECTED, msg, cause);
  }

  static vrfFetchFailed(msg = 'VRF source fetch failed', cause?: unknown): KinesisError {
    return new KinesisError(KinesisErrorCode.VRF_FETCH_FAILED, msg, cause);
  }

  static unknown(msg: string, cause?: unknown): KinesisError {
    return new KinesisError(KinesisErrorCode.UNKNOWN, msg, cause);
  }
}
