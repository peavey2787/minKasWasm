// cache.js
// Simple in-memory cache for BTC blocks and QRNG

let btcBlockCache = { blocks: [], timestamp: 0 };
let qrngCache = { data: null, timestamp: 0 };

export function getBtcBlockCache() {
    return btcBlockCache;
}

export function setBtcBlockCache(blocks) {
    btcBlockCache = { blocks, timestamp: Date.now() };
}

export function getQrngCache() {
    return qrngCache;
}

export function setQrngCache(data) {
    qrngCache = { data, timestamp: Date.now() };
}
