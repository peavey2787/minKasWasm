// server/core/QRNG-fetcher.js


// Base class
export class QRNGProvider {
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
  }

  async fetchRandomness(params = {}) {
    throw new Error('fetchRandomness() must be implemented by subclass');
  }

  async request(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`${this.name} API error: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      // In browser, just log to console
      console.error(`[${this.name}] Request failed:`, err.message);
      throw err;
    }
  }
}

// Example provider: ANU QRNG
export class ANUQRNG extends QRNGProvider {
  constructor() {
    // Use CORS proxy for browser compatibility
    super('ANU QRNG', 'https://corsproxy.io/?http://qrng.anu.edu.au/API/jsonI.php');
  }

  async fetchRandomness(length = 16) {
    const url = `${this.baseUrl}?length=${length}&type=uint8`;
    const data = await this.request(url);
    return data.data; // array of random bytes
  }
}

// Example provider: qrandom.io
export class QRandomIO extends QRNGProvider {
  constructor() {
    super('qrandom.io', 'https://qrng.qrandom.io/api');
  }

  async fetchRandomness(bits = 256) {
    const url = `${this.baseUrl}?length=${bits}`;
    const data = await this.request(url);
    return data.randomness; // depends on API schema
  }
}
