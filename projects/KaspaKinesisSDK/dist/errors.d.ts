/**
 * SDK error codes and error class.
 * Downstream devs can switch on error.code without string-matching messages.
 */
export declare enum KinesisErrorCode {
    /** RPC client is not connected */
    NOT_CONNECTED = "ERR_NOT_CONNECTED",
    /** Wallet is locked or not initialized */
    WALLET_LOCKED = "ERR_WALLET_LOCKED",
    /** Insufficient funds (mature balance too low) */
    INSUFFICIENT_FUNDS = "ERR_INSUFFICIENT_FUNDS",
    /** SDK or RPC is busy / rate-limited; retry later */
    RATE_LIMITED = "ERR_RATE_LIMITED",
    /** Payload exceeds maximum allowed size */
    PAYLOAD_TOO_LARGE = "ERR_PAYLOAD_TOO_LARGE",
    /** Transaction rejected by policy (storage-mass, dust, etc.) */
    POLICY_REJECTED = "ERR_POLICY_REJECTED",
    /** Generic/unknown error */
    UNKNOWN = "ERR_UNKNOWN",
    /** VRF source fetch failed */
    VRF_FETCH_FAILED = "ERR_VRF_FETCH_FAILED",
    /** Observer not started */
    OBSERVER_NOT_STARTED = "ERR_OBSERVER_NOT_STARTED"
}
export declare class KinesisError extends Error {
    readonly code: KinesisErrorCode;
    readonly cause?: unknown;
    constructor(code: KinesisErrorCode, message: string, cause?: unknown);
    static notConnected(msg?: string): KinesisError;
    static walletLocked(msg?: string): KinesisError;
    static insufficientFunds(msg?: string): KinesisError;
    static rateLimited(msg?: string): KinesisError;
    static payloadTooLarge(msg?: string): KinesisError;
    static policyRejected(msg?: string, cause?: unknown): KinesisError;
    static vrfFetchFailed(msg?: string, cause?: unknown): KinesisError;
    static unknown(msg: string, cause?: unknown): KinesisError;
}
//# sourceMappingURL=errors.d.ts.map