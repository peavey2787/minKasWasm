// Safe validation/unit test: invalid address formats should be rejected.

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectThrow(fn, { name = 'operation', includesAny = null, logFn = null } = {}) {
  try {
    await fn();
    return { ok: false, message: `${name} did not throw` };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof logFn === 'function') logFn(`[OK] ${name} threw: ${msg}`);

    if (Array.isArray(includesAny) && includesAny.length > 0) {
      const ok = includesAny.some((needle) => msg.includes(needle));
      if (!ok) {
        return { ok: false, message: `${name} threw, but message did not include any of: ${includesAny.join(', ')}. Got: ${msg}` };
      }
    }

    return { ok: true };
  }
}

export async function runTestValidationAddress(logFn = null) {
  if (typeof logFn === 'function') {
    logFn('[TEST] validateAddress should reject invalid formats');
  }

  const u = await import('../../wrapper/utilities.js');

  // Empty/null should be rejected with a clear message
  const empty1 = await expectThrow(() => Promise.resolve(u.validateAddress('')), {
    name: 'validateAddress("")',
    includesAny: ['Invalid address'],
    logFn,
  });
  if (!empty1.ok) return fail(empty1.message);

  const empty2 = await expectThrow(() => Promise.resolve(u.validateAddress(null)), {
    name: 'validateAddress(null)',
    includesAny: ['Invalid address'],
    logFn,
  });
  if (!empty2.ok) return fail(empty2.message);

  // Obviously invalid string should be rejected as an invalid *format*
  // NOTE: This currently depends on utilities.js having access to Address.
  // If Address is not available/imported, this test will fail and surface the bug.
  const invalid = await expectThrow(() => Promise.resolve(u.validateAddress('not-an-address')),
    {
      name: 'validateAddress("not-an-address")',
      includesAny: ['Invalid address format'],
      logFn,
    }
  );
  if (!invalid.ok) return fail(invalid.message);

  assert(typeof u.validatePayload === 'function', 'sanity: utilities module loaded');
  return pass('invalid addresses are rejected (empty/null/invalid format)');
}
