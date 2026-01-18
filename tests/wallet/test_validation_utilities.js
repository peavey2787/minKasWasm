// Safe validation/unit test: utilities input validation & encoding helpers.

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectThrow(fn, { name = 'operation', includes = null } = {}) {
  try {
    await fn();
    return { ok: false, message: `${name} did not throw` };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (includes && !msg.includes(includes)) {
      return { ok: false, message: `${name} threw, but message did not include "${includes}". Got: ${msg}` };
    }
    return { ok: true };
  }
}

export async function runTestValidationUtilities(logFn = null) {
  if (typeof logFn === 'function') {
    logFn('[TEST] utilities validation + encoding');
  }

  const u = await import('../../wrapper/utilities.js');

  try {
    // validatePayload
    assert(u.validatePayload('hi') === true, 'validatePayload should accept small strings');
    assert(u.validatePayload(123) === false, 'validatePayload should reject non-strings');
    const tooLarge = 'a'.repeat(32 * 1024 * 2 + 1);
    assert(u.validatePayload(tooLarge) === false, 'validatePayload should reject >32KB payloads');

    // stringToHex / hexToString round-trip
    const hex = u.stringToHex('abc');
    assert(hex === '616263', `stringToHex("abc") unexpected: ${hex}`);
    const roundTrip = u.hexToString(hex);
    assert(roundTrip === 'abc', `hexToString round-trip failed: ${roundTrip}`);

    // bytesToHex / hexToBytes round-trip
    const baseHex = 'aa'.repeat(32); // 64 hex chars
    const bytes = u.hexToBytes(baseHex);
    assert(bytes && bytes.length === 32, `hexToBytes should return 32 bytes, got: ${bytes?.length}`);
    const hex2 = u.bytesToHex(bytes);
    assert(hex2 === baseHex, 'bytesToHex/hexToBytes round-trip mismatch');

    // hexToBytes should reject invalid lengths
    const badLen = await expectThrow(() => Promise.resolve(u.hexToBytes('abcd')), { name: 'hexToBytes(bad length)' });
    if (!badLen.ok) return fail(badLen.message);

    if (typeof logFn === 'function') logFn('[OK] utilities validation passed');
    return pass('utilities validation + encoding helpers');
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof logFn === 'function') logFn('[FAIL] ' + msg);
    return fail(msg);
  }
}
