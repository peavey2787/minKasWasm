import { KASPA_BLOCK_COUNT, BTC_BLOCK_COUNT } from './constants.js';
import { getKaspaBlocks, getBitcoinBlocks } from './fetcher/index.js';
import { getQRNG } from './fetcher/qrng.js';
import { hexToBinary, sha256Hash } from './crypto.js';
import { fold } from './folding.js';
import { runNistSuite } from './nist.js';

class Core {
	// Fetches QRNG randomness (default: ANU)
	async GetQRNG(length = 16, provider = 'ANU') {
		// Use the persistent cache-aware QRNG fetcher
		// Accept both 'ANU' and 'anu' (case-insensitive)
		const prov = provider.toLowerCase();
		return await getQRNG(prov, length);
	}

	// Fetches Kaspa blocks (finalized only)
	async GetKaspaBlocks(count = KASPA_BLOCK_COUNT) {
		return await getKaspaBlocks(count);
	}

	// Fetches Bitcoin blocks (finalized only)
	async GetBitcoinBlocks(count = BTC_BLOCK_COUNT) {
		return await getBitcoinBlocks(count);
	}

	// Folds two randomness sources using recursive folding
	async fold(randA, randB, options = {}) {
		return await fold(randA, randB, options);
	}

	// Full NIST test suite
	async fullNIST(bits) {
		// bits: binary string
		return await runNistSuite(bits);
	}

	// Basic NIST/mini test suite (subset)
	async basicNIST(bits) {
		// bits: binary string
		// Only run a subset of tests
		const all = await runNistSuite(bits);
		// Return only the most basic tests
		return all.filter(r => [
			'Frequency (Monobit) Test',
			'Block Frequency Test',
			'Runs Test',
			'Longest Run of Ones in a Block Test'
		].includes(r.testName));
	}

	// Generate randomness: QRNG + Kaspa + BTC, folded
	async GenerateFullRandomness() {
		// 1. Get QRNG
		const qrng = await this.GetQRNG(32); // 32 bytes = 256 bits
		// 2. Get finalized Kaspa and BTC blocks
		const kaspaBlocks = await this.GetKaspaBlocks(1);
		const btcBlocks = await this.GetBitcoinBlocks(1);
		if (!kaspaBlocks.length || !btcBlocks.length) throw new Error('No finalized blocks available');
		// 3. Fold all sources
		// Use block hashes as hex, QRNG as bytes (convert to binary)
		const qrngBits = qrng.map(b => b.toString(2).padStart(8, '0')).join('');
		const kaspaBits = hexToBinary(kaspaBlocks[0].hash);
		const btcBits = hexToBinary(btcBlocks[0].hash);
		// Fold QRNG + BTC
		const folded1 = await this.fold(qrngBits, btcBits);
		// Fold result with KAS
		const final = await this.fold(folded1, kaspaBits);
		return final;
	}

	// Generate randomness: Kaspa + BTC, folded
	async GeneratePartialRandomness() {
		const kaspaBlocks = await this.GetKaspaBlocks(1);
		const btcBlocks = await this.GetBitcoinBlocks(1);
		if (!kaspaBlocks.length || !btcBlocks.length) throw new Error('No finalized blocks available');
		const kaspaBits = hexToBinary(kaspaBlocks[0].hash);
		const btcBits = hexToBinary(btcBlocks[0].hash);
		return await this.fold(kaspaBits, btcBits);
	}
}

const core = new Core();
export default core;
