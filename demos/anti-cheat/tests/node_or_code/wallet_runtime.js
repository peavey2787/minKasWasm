import { init as walletInit, createWallet, send, configureSendQueue, getSendQueueStats } from '../../../../wrapper/wallet_service.js';

let _walletLogger = null;

export function initWallet({ rpcClient, networkId, onLog, onBalanceChange }) {
  _walletLogger = (...args) => onLog?.(args.join(' '));

  walletInit({
    rpcClient,
    networkId,
    logger: _walletLogger,
    onBalanceChange,
  });

  // Diagnostics defaults: moderate retry with pacing to avoid burst-related submit failures.
  configureSendQueue({
    logger: _walletLogger,
    defaults: {
      maxAttempts: 5,
      minSpacingMs: 250,
    },
  });
}

// Allow diagnostics to tune pacing dynamically (calibration).
export function setWalletSendQueueDefaults(defaults = {}) {
  configureSendQueue({
    logger: _walletLogger || (() => {}),
    defaults,
  });
}

export async function createOrLoadDemoWallet() {
  // Stable password for demo/test usage
  return await createWallet({ password: 'anticheat-demo', filename: 'anticheat_demo_wallet1' });
}

export async function sendPayloadTx({ amountKas, toAddress, payload }) {
  return await send({ amount: String(amountKas), toAddress, payload });
}

export function getWalletSendQueueStats() {
  return getSendQueueStats();
}
