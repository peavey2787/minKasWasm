import { KASPA_BLOCK_COUNT, BTC_BLOCK_COUNT } from './constants.js';
import { getKaspaBlocks, getBitcoinBlocks } from './fetcher/index.js';
import { getQRNG } from './fetcher/qrng.js';
import { hexToBinary, sha256Hash } from './crypto.js';
import { extractBits } from './extractor.js';
import { recursiveFolding } from './folding.js';
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
		// randA, randB: hex or binary strings
		// Default: 2 rounds, 256 positions, sha256 folding
		const ensureCanonicalHash = async (input) => {
			// If already a 64-char hex string, return as-is
			if (typeof input === 'string' && /^[0-9a-fA-F]{64}$/.test(input)) {
				return input;
			}
			// If input is a bitstring (only 0/1), convert to hex, pad, and hash
			if (typeof input === 'string' && /^[01]+$/.test(input)) {
				// Pad to 256 bits
				const padded = input.padEnd(256, '0').slice(0, 256);
				// Convert to hex
				let hex = '';
				for (let i = 0; i < 256; i += 4) {
					hex += parseInt(padded.slice(i, i + 4), 2).toString(16);
				}
				// Hash to canonical 64-char hex
				return await sha256Hash(hex);
			}
			// If input is a hex string but not 64 chars, hash it
			if (typeof input === 'string' && /^[0-9a-fA-F]+$/.test(input)) {
				return await sha256Hash(input);
			}
			throw new Error('Invalid input for canonical hash');
		};

		const hashA = await ensureCanonicalHash(randA);
		const hashB = await ensureCanonicalHash(randB);
		const blocks = [
			{ hash: hashA, isFinal: true },
			{ hash: hashB, isFinal: true }
		];
		// Initial extraction: use all positions
		const positions = Array.from({ length: 256 }, (_, i) => i);
		const { bitstring: initialBits } = await extractBits(blocks, positions);
		const foldingResult = await recursiveFolding(blocks, initialBits, 'sha256', options.iterations || 2, options.numPositions || 256);
		return foldingResult.finalOutput;
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
