import { build } from 'esbuild';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;
const entry = path.join(projectRoot, 'core', 'index.ts');
const outdir = path.join(projectRoot, 'dist');

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Bundle all JS (including wrapper/* and kas-wasm/kaspa.js) into dist/index.js
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  outfile: path.join(outdir, 'index.js'),
  // Keep the output as a single file (dynamic imports will be inlined)
  splitting: false,
  // Avoid minifying for now (better stack traces during integration)
  minify: false,
  // Some wrapper deps might use process/env checks; define a safe browser value
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

// Ensure the WASM binary sits next to dist/index.js so kaspa.js can load it via:
// new URL('kaspa_bg.wasm', import.meta.url)
const wasmSrc = path.join(projectRoot, '..', '..', 'kas-wasm', 'kaspa_bg.wasm');
const wasmDst = path.join(outdir, 'kaspa_bg.wasm');

await mkdir(outdir, { recursive: true });
if (await fileExists(wasmSrc)) {
  await copyFile(wasmSrc, wasmDst);
} else {
  // If the repo layout changes later, this error helps quickly.
  throw new Error(`kaspa_bg.wasm not found at: ${wasmSrc}`);
}

console.log('[KinesisSDK] Bundle complete:', path.relative(projectRoot, path.join(outdir, 'index.js')));
console.log('[KinesisSDK] WASM copied:', path.relative(projectRoot, wasmDst));
