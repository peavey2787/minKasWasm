var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined")
    return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../kas-wasm/kaspa.js
function getObject(idx) {
  return heap[idx];
}
function addHeapObject(obj) {
  if (heap_next === heap.length)
    heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_export_0(addHeapObject(e));
  }
}
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127)
      break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
function dropObject(idx) {
  if (idx < 132)
    return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_4.get(state.dtor)(a, state.b);
        CLOSURE_DTORS.unregister(state);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function makeClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    try {
      return f(state.a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_4.get(state.dtor)(state.a, state.b);
        state.a = 0;
        CLOSURE_DTORS.unregister(state);
      }
    }
  };
  real.original = state;
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
function addBorrowedObject(obj) {
  if (stack_pointer == 1)
    throw new Error("out of js stack");
  heap[--stack_pointer] = obj;
  return stack_pointer;
}
function decryptXChaCha20Poly1305(base64string, password) {
  let deferred4_0;
  let deferred4_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(base64string, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(password, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    wasm.decryptXChaCha20Poly1305(retptr, ptr0, len0, ptr1, len1);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    var ptr3 = r0;
    var len3 = r1;
    if (r3) {
      ptr3 = 0;
      len3 = 0;
      throw takeObject(r2);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export_3(deferred4_0, deferred4_1, 1);
  }
}
function encryptXChaCha20Poly1305(plainText, password) {
  let deferred4_0;
  let deferred4_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(plainText, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(password, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    wasm.encryptXChaCha20Poly1305(retptr, ptr0, len0, ptr1, len1);
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    var ptr3 = r0;
    var len3 = r1;
    if (r3) {
      ptr3 = 0;
      len3 = 0;
      throw takeObject(r2);
    }
    deferred4_0 = ptr3;
    deferred4_1 = len3;
    return getStringFromWasm0(ptr3, len3);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export_3(deferred4_0, deferred4_1, 1);
  }
}
function sompiToKaspaString(sompi) {
  let deferred2_0;
  let deferred2_1;
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.sompiToKaspaString(retptr, addHeapObject(sompi));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
    var ptr1 = r0;
    var len1 = r1;
    if (r3) {
      ptr1 = 0;
      len1 = 0;
      throw takeObject(r2);
    }
    deferred2_0 = ptr1;
    deferred2_1 = len1;
    return getStringFromWasm0(ptr1, len1);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
    wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
  }
}
function kaspaToSompi(kaspa) {
  const ptr0 = passStringToWasm0(kaspa, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.kaspaToSompi(ptr0, len0);
  return takeObject(ret);
}
function __wbg_adapter_66(arg0, arg1) {
  wasm.__wbindgen_export_5(arg0, arg1);
}
function __wbg_adapter_69(arg0, arg1, arg2) {
  wasm.__wbindgen_export_6(arg0, arg1, addHeapObject(arg2));
}
function __wbg_adapter_72(arg0, arg1) {
  wasm.__wbindgen_export_7(arg0, arg1);
}
function __wbg_adapter_75(arg0, arg1, arg2) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wbindgen_export_8(retptr, arg0, arg1, addHeapObject(arg2));
    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
    if (r1) {
      throw takeObject(r0);
    }
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wbg_adapter_78(arg0, arg1, arg2) {
  wasm.__wbindgen_export_9(arg0, arg1, addHeapObject(arg2));
}
function __wbg_adapter_81(arg0, arg1, arg2, arg3) {
  const ret = wasm.__wbindgen_export_10(arg0, arg1, addHeapObject(arg2), arg3);
  return takeObject(ret);
}
function __wbg_adapter_84(arg0, arg1, arg2) {
  wasm.__wbindgen_export_11(arg0, arg1, addHeapObject(arg2));
}
function __wbg_adapter_87(arg0, arg1, arg2) {
  wasm.__wbindgen_export_11(arg0, arg1, arg2);
}
function __wbg_adapter_90(arg0, arg1, arg2) {
  wasm.__wbindgen_export_12(arg0, arg1, addHeapObject(arg2));
}
function __wbg_adapter_199(arg0, arg1, arg2, arg3) {
  wasm.__wbindgen_export_13(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}
async function __wbg_load(module2, imports) {
  if (typeof Response === "function" && module2 instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module2, imports);
      } catch (e) {
        if (module2.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module2.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module2, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module: module2 };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_BigInt_470dd987b8190f8e = function(arg0) {
    const ret = BigInt(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_BigInt_ddea6d2f55558acb = function() {
    return handleError(function(arg0) {
      const ret = BigInt(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_String_8f0eb39a4a4c2f66 = function(arg0, arg1) {
    const ret = String(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_Window_b0044ac7db258535 = function(arg0) {
    const ret = getObject(arg0).Window;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_WorkerGlobalScope_b74cefefc62a37da = function(arg0) {
    const ret = getObject(arg0).WorkerGlobalScope;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_abort_775ef1d17fc65868 = function(arg0) {
    getObject(arg0).abort();
  };
  imports.wbg.__wbg_aborted_new = function(arg0) {
    const ret = Aborted.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_accountkind_new = function(arg0) {
    const ret = AccountKind.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_addListener_d78339dd4535b756 = function(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).addListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_address_new = function(arg0) {
    const ret = Address.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_advance_b3ccc91b80962d79 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).advance(arg1 >>> 0);
    }, arguments);
  };
  imports.wbg.__wbg_appendChild_8204974b7328bf98 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).appendChild(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_append_8c7dd8d641a5f01b = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_body_942ea927546a04ba = function(arg0) {
    const ret = getObject(arg0).body;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_call_672a4d21634d4a24 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).call(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_cancelAnimationFrame_032049cb190240a7 = function(arg0) {
    cancelAnimationFrame(takeObject(arg0));
  };
  imports.wbg.__wbg_clearInterval_d472232e2fb5e5e4 = function() {
    return handleError(function(arg0) {
      clearInterval(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_clearTimeout_c5ac0f4b6a07b59e = function() {
    return handleError(function(arg0) {
      clearTimeout(getObject(arg0));
    }, arguments);
  };
  imports.wbg.__wbg_close_0880036443561527 = function() {
    return handleError(function(arg0) {
      getObject(arg0).close();
    }, arguments);
  };
  imports.wbg.__wbg_continue_c46c11d3dbe1b030 = function() {
    return handleError(function(arg0) {
      getObject(arg0).continue();
    }, arguments);
  };
  imports.wbg.__wbg_count_613cb921d67a4f26 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).count();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createElement_8c9931a732ee2fea = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).createElement(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createIndex_873ac48adc772309 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      const ret = getObject(arg0).createIndex(getStringFromWasm0(arg1, arg2), getObject(arg3), getObject(arg4));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createObjectStore_e566459f7161f82f = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).createObjectStore(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_createObjectURL_6e98d2f9c7bd9764 = function() {
    return handleError(function(arg0, arg1) {
      const ret = URL.createObjectURL(getObject(arg1));
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_crypto_ed58b8e10a292839 = function(arg0) {
    const ret = getObject(arg0).crypto;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_data_432d9c3df2630942 = function(arg0) {
    const ret = getObject(arg0).data;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_delete_200677093b4cf756 = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).delete(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_delete_36c8630e530a2a1a = function(arg0, arg1) {
    const ret = getObject(arg0).delete(getObject(arg1));
    return ret;
  };
  imports.wbg.__wbg_document_d249400bd7bd996d = function(arg0) {
    const ret = getObject(arg0).document;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_done_769e5ede4b31c67b = function(arg0) {
    const ret = getObject(arg0).done;
    return ret;
  };
  imports.wbg.__wbg_entries_3265d4158b33e5dc = function(arg0) {
    const ret = Object.entries(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_entries_c8a90a7ed73e84ce = function(arg0) {
    const ret = getObject(arg0).entries();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_error_5edc95999c70d386 = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.error(getStringFromWasm0(arg0, arg1));
    } finally {
      wasm.__wbindgen_export_3(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_error_b5d62a6100a65a3b = function(arg0, arg1) {
    console.error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_error_ff4ddaabdfc5dbb3 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).error;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_existsSync_6b2031627aea3e5a = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).existsSync(getStringFromWasm0(arg1, arg2));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_fetch_509096533071c657 = function(arg0, arg1) {
    const ret = getObject(arg0).fetch(getObject(arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_fetch_7bb58c5ed3c31810 = function(arg0) {
    const ret = fetch(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_fromCodePoint_f37c25c172f2e8b5 = function() {
    return handleError(function(arg0) {
      const ret = String.fromCodePoint(arg0 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_from_2a5d3e218e67aa85 = function(arg0) {
    const ret = Array.from(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_from_d608a04300bfd9ac = function(arg0) {
    const ret = Buffer.from(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_generatorsummary_new = function(arg0) {
    const ret = GeneratorSummary.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_getItem_17f98dee3b43fa7e = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg1).getItem(getStringFromWasm0(arg2, arg3));
      var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_getRandomValues_bcb4912f16000dc4 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).getRandomValues(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_get_13495dac72693ecc = function(arg0, arg1) {
    const ret = getObject(arg0).get(getObject(arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_get_67b2ba62fc30de12 = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.get(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_get_8da03f81f6a1111e = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).get(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_get_a8e28596722a45ff = function() {
    return handleError(function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        const ret = chrome.storage.local.get(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
      } finally {
        wasm.__wbindgen_export_3(deferred0_0, deferred0_1, 1);
      }
    }, arguments);
  };
  imports.wbg.__wbg_get_b9b93047fe3cf45b = function(arg0, arg1) {
    const ret = getObject(arg0)[arg1 >>> 0];
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_get_f1f75752f252b231 = function() {
    return handleError(function() {
      const ret = chrome.storage.local.get();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_getwithrefkey_1dc361bd10053bfe = function(arg0, arg1) {
    const ret = getObject(arg0)[getObject(arg1)];
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_global_b6f5c73312f62313 = function(arg0) {
    const ret = getObject(arg0).global;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_has_a5ea9117f258a0ec = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.has(getObject(arg0), getObject(arg1));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_hash_new = function(arg0) {
    const ret = Hash.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_headers_9cb51cfd2ac780a4 = function(arg0) {
    const ret = getObject(arg0).headers;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_index_e00ca5fff206ee3e = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).index(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_indexedDB_601ec26c63e333de = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).indexedDB;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_indexedDB_b1f49280282046f8 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).indexedDB;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_indexedDB_f6b47b0dc333fd2f = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).indexedDB;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_innerHTML_e1553352fe93921a = function(arg0, arg1) {
    const ret = getObject(arg1).innerHTML;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_instanceof_ArrayBuffer_e14585432e3737fc = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof ArrayBuffer;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Map_f3469ce2244d2430 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Map;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Object_7f2dcef8f78644a4 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Object;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Response_f2cc20d9f7dfd644 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Response;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Uint8Array_17156bcf118086a9 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Window_def73ea0955fc569 = function(arg0) {
    let result;
    try {
      result = getObject(arg0) instanceof Window;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_isArray_a1eab7e0d067391b = function(arg0) {
    const ret = Array.isArray(getObject(arg0));
    return ret;
  };
  imports.wbg.__wbg_isSafeInteger_343e2beeeece1bb0 = function(arg0) {
    const ret = Number.isSafeInteger(getObject(arg0));
    return ret;
  };
  imports.wbg.__wbg_is_c7481c65e7e5df9e = function(arg0, arg1) {
    const ret = Object.is(getObject(arg0), getObject(arg1));
    return ret;
  };
  imports.wbg.__wbg_iterator_9a24c88df860dc65 = function() {
    const ret = Symbol.iterator;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_key_c5e0a01cf450dca2 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg1).key(arg2 >>> 0);
      var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
      var len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_keys_5c77a08ddc2fb8a6 = function(arg0) {
    const ret = Object.keys(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
    const ret = getObject(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_length_e2d2a49132c1b256 = function(arg0) {
    const ret = getObject(arg0).length;
    return ret;
  };
  imports.wbg.__wbg_length_ed4a84b02b798bda = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).length;
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_localStorage_1406c99c39728187 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).localStorage;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_location_350d99456c2f3693 = function(arg0) {
    const ret = getObject(arg0).location;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_log_6c164928aa7b57f4 = function(arg0, arg1) {
    console.log(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_mkdirSync_29d1fd92bf140bd0 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      getObject(arg0).mkdirSync(getStringFromWasm0(arg1, arg2), takeObject(arg3));
    }, arguments);
  };
  imports.wbg.__wbg_msCrypto_0a36e2ec3a343d26 = function(arg0) {
    const ret = getObject(arg0).msCrypto;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_navigator_1577371c070c8947 = function(arg0) {
    const ret = getObject(arg0).navigator;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_networkid_new = function(arg0) {
    const ret = NetworkId.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new0_f788a2397c7ca929 = function() {
    const ret = /* @__PURE__ */ new Date();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_018dcc2d6c8c2f6a = function() {
    return handleError(function() {
      const ret = new Headers();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_0b790fd655ff1a97 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new WebSocket(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_23a2665fac83c611 = function(arg0, arg1) {
    try {
      var state0 = { a: arg0, b: arg1 };
      var cb0 = (arg02, arg12) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return __wbg_adapter_199(a, state0.b, arg02, arg12);
        } finally {
          state0.a = a;
        }
      };
      const ret = new Promise(cb0);
      return addHeapObject(ret);
    } finally {
      state0.a = state0.b = 0;
    }
  };
  imports.wbg.__wbg_new_405e22f390576ce2 = function() {
    const ret = new Object();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_5e0be73521bc8c17 = function() {
    const ret = /* @__PURE__ */ new Map();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_757fd34d47ff40d2 = function(arg0) {
    const ret = new ArrayBuffer(arg0 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_78feb108b6472713 = function() {
    const ret = new Array();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_new_b1a33e5095abf678 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Worker(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_e25e5aab09ff45db = function() {
    return handleError(function() {
      const ret = new AbortController();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_new_f5f8a7325e1cb479 = function() {
    const ret = new Error();
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function(arg0) {
    const ret = new Uint8Array(arg0 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_newwithnodejsconfigimpl_b0a2d4e5b0763676 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      const ret = new WebSocket(getStringFromWasm0(arg0, arg1), takeObject(arg2), takeObject(arg3), takeObject(arg4), takeObject(arg5), takeObject(arg6));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithstrandinit_06c535e0a867c635 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_newwithstrsequenceandoptions_aaff55b467c81b63 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Blob(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_next_25feadfc0913fea9 = function(arg0) {
    const ret = getObject(arg0).next;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_next_6574e1a8a62d1055 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).next();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_node_02999533c4ea02e3 = function(arg0) {
    const ret = getObject(arg0).node;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_nodedescriptor_new = function(arg0) {
    const ret = NodeDescriptor.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_now_807e54c39636c349 = function() {
    const ret = Date.now();
    return ret;
  };
  imports.wbg.__wbg_now_d18023d54d4e5500 = function(arg0) {
    const ret = getObject(arg0).now();
    return ret;
  };
  imports.wbg.__wbg_objectStore_21878d46d25b64b6 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).objectStore(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_oldVersion_e8337811e52861c6 = function(arg0) {
    const ret = getObject(arg0).oldVersion;
    return ret;
  };
  imports.wbg.__wbg_on_9ef8de87725b93b5 = function(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).on(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_once_8901720a31f56808 = function(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).once(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_openCursor_d8ea5d621ec422f8 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).openCursor(getObject(arg1), __wbindgen_enum_IdbCursorDirection[arg2]);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_open_e0c0b2993eb596e1 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg0).open(getStringFromWasm0(arg1, arg2), arg3 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_pendingtransaction_new = function(arg0) {
    const ret = PendingTransaction.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_postMessage_6edafa8f7b9c2f52 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).postMessage(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_prependListener_dc1e8b094d0f731e = function(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).prependListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_prependOnceListener_93873dc17dd2fcad = function(arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).prependOnceListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_process_5c1d670bc53614b8 = function(arg0) {
    const ret = getObject(arg0).process;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_protocol_faa0494a9b2554cb = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg1).protocol;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_publickey_new = function(arg0) {
    const ret = PublicKey.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_push_737cfc8c1432c2c6 = function(arg0, arg1) {
    const ret = getObject(arg0).push(getObject(arg1));
    return ret;
  };
  imports.wbg.__wbg_put_066faa31a6a88f5b = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).put(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_queueMicrotask_97d92b4fcc8a61c5 = function(arg0) {
    queueMicrotask(getObject(arg0));
  };
  imports.wbg.__wbg_queueMicrotask_d3219def82552485 = function(arg0) {
    const ret = getObject(arg0).queueMicrotask;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_randomFillSync_ab2cfe79ebbf2740 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).randomFillSync(takeObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_readFileSync_42b340d959241f2b = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg0).readFileSync(getStringFromWasm0(arg1, arg2), takeObject(arg3));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_readdir_319d9b13a44c9af9 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).readdir(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_readyState_4013cfdf4f22afb0 = function(arg0) {
    const ret = getObject(arg0).readyState;
    return (__wbindgen_enum_IdbRequestReadyState.indexOf(ret) + 1 || 3) - 1;
  };
  imports.wbg.__wbg_readyState_6c28968f3e6c1e47 = function(arg0) {
    const ret = getObject(arg0).readyState;
    return ret;
  };
  imports.wbg.__wbg_removeAttribute_e419cd6726b4c62f = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).removeAttribute(getStringFromWasm0(arg1, arg2));
    }, arguments);
  };
  imports.wbg.__wbg_removeItem_9d2669ee3bba6f7d = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).removeItem(getStringFromWasm0(arg1, arg2));
    }, arguments);
  };
  imports.wbg.__wbg_remove_cb9af65ab98197c5 = function() {
    return handleError(function(arg0, arg1) {
      let deferred0_0;
      let deferred0_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        const ret = chrome.storage.local.remove(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
      } finally {
        wasm.__wbindgen_export_3(deferred0_0, deferred0_1, 1);
      }
    }, arguments);
  };
  imports.wbg.__wbg_renameSync_86e78b84a05e4a0b = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).renameSync(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_requestAnimationFrame_63a812187303a02c = function(arg0) {
    const ret = requestAnimationFrame(takeObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_require_05f2f70e92254dbb = function(arg0, arg1) {
    const ret = __require(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_require_11fc9008c54f5b90 = function(arg0, arg1) {
    const ret = __require(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_require_79b1e9274cde3c87 = function() {
    return handleError(function() {
      const ret = module.require;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_resolve_4851785c9c5f573d = function(arg0) {
    const ret = Promise.resolve(getObject(arg0));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_result_f29afabdf2c05826 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).result;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_rpcclient_new = function(arg0) {
    const ret = RpcClient.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_send_17f8c8c8e084cc5e = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).send(getArrayU8FromWasm0(arg1, arg2));
    }, arguments);
  };
  imports.wbg.__wbg_send_9a57107cc0d7eafa = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).send(getStringFromWasm0(arg1, arg2));
    }, arguments);
  };
  imports.wbg.__wbg_send_afb0c27f2d9698e3 = function() {
    return handleError(function(arg0, arg1) {
      getObject(arg0).send(getObject(arg1));
    }, arguments);
  };
  imports.wbg.__wbg_setAttribute_2704501201f15687 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_setInterval_160c4baec24e25f6 = function() {
    return handleError(function(arg0, arg1) {
      const ret = setInterval(getObject(arg0), arg1 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_setItem_212ecc915942ab0a = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setItem(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments);
  };
  imports.wbg.__wbg_setTime_8afa2faa26e7eb59 = function(arg0, arg1) {
    const ret = getObject(arg0).setTime(arg1);
    return ret;
  };
  imports.wbg.__wbg_setTimeout_430dd4984e76f6c3 = function() {
    return handleError(function(arg0, arg1) {
      const ret = setTimeout(getObject(arg0), arg1 >>> 0);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_set_005c36bbcfafb768 = function() {
    return handleError(function(arg0) {
      const ret = chrome.storage.local.set(takeObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_set_37837023f3d740e8 = function(arg0, arg1, arg2) {
    getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
  };
  imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
    getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
  };
  imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
  };
  imports.wbg.__wbg_set_8fc6bf8a5b1071d1 = function(arg0, arg1, arg2) {
    const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_set_bb8cecf6a62b9f46 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_setbinaryType_9981a6ba2bd58b94 = function(arg0, arg1) {
    getObject(arg0).binaryType = __wbindgen_enum_BinaryType[arg1];
  };
  imports.wbg.__wbg_setbody_5923b78a95eedf29 = function(arg0, arg1) {
    getObject(arg0).body = getObject(arg1);
  };
  imports.wbg.__wbg_setcredentials_c3a22f1cd105a2c6 = function(arg0, arg1) {
    getObject(arg0).credentials = __wbindgen_enum_RequestCredentials[arg1];
  };
  imports.wbg.__wbg_setheaders_834c0bdb6a8949ad = function(arg0, arg1) {
    getObject(arg0).headers = getObject(arg1);
  };
  imports.wbg.__wbg_setinnerHTML_31bde41f835786f7 = function(arg0, arg1, arg2) {
    getObject(arg0).innerHTML = getStringFromWasm0(arg1, arg2);
  };
  imports.wbg.__wbg_setmethod_3c5280fe5d890842 = function(arg0, arg1, arg2) {
    getObject(arg0).method = getStringFromWasm0(arg1, arg2);
  };
  imports.wbg.__wbg_setmode_5dc300b865044b65 = function(arg0, arg1) {
    getObject(arg0).mode = __wbindgen_enum_RequestMode[arg1];
  };
  imports.wbg.__wbg_setonabort_3bf4db6614fa98e9 = function(arg0, arg1) {
    getObject(arg0).onabort = getObject(arg1);
  };
  imports.wbg.__wbg_setonblocked_aebf64bd39f1eca8 = function(arg0, arg1) {
    getObject(arg0).onblocked = getObject(arg1);
  };
  imports.wbg.__wbg_setonclose_b15bdabd419b6357 = function(arg0, arg1) {
    getObject(arg0).onclose = getObject(arg1);
  };
  imports.wbg.__wbg_setoncomplete_4d19df0dadb7c4d4 = function(arg0, arg1) {
    getObject(arg0).oncomplete = getObject(arg1);
  };
  imports.wbg.__wbg_setonerror_b0d9d723b8fddbbb = function(arg0, arg1) {
    getObject(arg0).onerror = getObject(arg1);
  };
  imports.wbg.__wbg_setonerror_d7e3056cc6e56085 = function(arg0, arg1) {
    getObject(arg0).onerror = getObject(arg1);
  };
  imports.wbg.__wbg_setonerror_e2c5c0fa6fbf6d99 = function(arg0, arg1) {
    getObject(arg0).onerror = getObject(arg1);
  };
  imports.wbg.__wbg_setonmessage_007594843a0b97e8 = function(arg0, arg1) {
    getObject(arg0).onmessage = getObject(arg1);
  };
  imports.wbg.__wbg_setonmessage_5a885b16bdc6dca6 = function(arg0, arg1) {
    getObject(arg0).onmessage = getObject(arg1);
  };
  imports.wbg.__wbg_setonopen_c42cfdbb28b087c4 = function(arg0, arg1) {
    getObject(arg0).onopen = getObject(arg1);
  };
  imports.wbg.__wbg_setonsuccess_afa464ee777a396d = function(arg0, arg1) {
    getObject(arg0).onsuccess = getObject(arg1);
  };
  imports.wbg.__wbg_setonupgradeneeded_fcf7ce4f2eb0cb5f = function(arg0, arg1) {
    getObject(arg0).onupgradeneeded = getObject(arg1);
  };
  imports.wbg.__wbg_setonversionchange_6ee07fa49ee1e3a5 = function(arg0, arg1) {
    getObject(arg0).onversionchange = getObject(arg1);
  };
  imports.wbg.__wbg_setsignal_75b21ef3a81de905 = function(arg0, arg1) {
    getObject(arg0).signal = getObject(arg1);
  };
  imports.wbg.__wbg_settype_39ed370d3edd403c = function(arg0, arg1, arg2) {
    getObject(arg0).type = getStringFromWasm0(arg1, arg2);
  };
  imports.wbg.__wbg_setunique_dd24c422aa05df89 = function(arg0, arg1) {
    getObject(arg0).unique = arg1 !== 0;
  };
  imports.wbg.__wbg_signal_aaf9ad74119f20a4 = function(arg0) {
    const ret = getObject(arg0).signal;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_stack_c99a96ed42647c4c = function(arg0, arg1) {
    const ret = getObject(arg1).stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_statSync_9a429acc496bafda = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = getObject(arg0).statSync(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
    const ret = typeof global === "undefined" ? null : global;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
    const ret = typeof globalThis === "undefined" ? null : globalThis;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
    const ret = typeof self === "undefined" ? null : self;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
    const ret = typeof window === "undefined" ? null : window;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_status_f6360336ca686bf0 = function(arg0) {
    const ret = getObject(arg0).status;
    return ret;
  };
  imports.wbg.__wbg_stringify_f7ed6987935b4a24 = function() {
    return handleError(function(arg0) {
      const ret = JSON.stringify(getObject(arg0));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) {
    const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_target_0a62d9d79a2a1ede = function(arg0) {
    const ret = getObject(arg0).target;
    return isLikeNone(ret) ? 0 : addHeapObject(ret);
  };
  imports.wbg.__wbg_text_7805bea50de2af49 = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).text();
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_then_44b73946d2fb3e7d = function(arg0, arg1) {
    const ret = getObject(arg0).then(getObject(arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_then_48b406749878a531 = function(arg0, arg1, arg2) {
    const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_toString_2f76f493957b63da = function(arg0, arg1, arg2) {
    const ret = getObject(arg1).toString(arg2);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_toString_b5d4438bc26b267c = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).toString(arg1);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_transaction_babc423936946a37 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = getObject(arg0).transaction(getStringFromWasm0(arg1, arg2), __wbindgen_enum_IdbTransactionMode[arg3]);
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_transaction_new = function(arg0) {
    const ret = Transaction.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_transactioninput_new = function(arg0) {
    const ret = TransactionInput.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_transactionoutput_new = function(arg0) {
    const ret = TransactionOutput.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_transactionrecordnotification_new = function(arg0) {
    const ret = TransactionRecordNotification.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_unlinkSync_656392e8d747415f = function() {
    return handleError(function(arg0, arg1, arg2) {
      getObject(arg0).unlinkSync(getStringFromWasm0(arg1, arg2));
    }, arguments);
  };
  imports.wbg.__wbg_update_acd72607f506872a = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg0).update(getObject(arg1));
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_url_ae10c34ca209681d = function(arg0, arg1) {
    const ret = getObject(arg1).url;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_userAgent_12e9d8e62297563f = function() {
    return handleError(function(arg0, arg1) {
      const ret = getObject(arg1).userAgent;
      const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
      const len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_utxoentryreference_new = function(arg0) {
    const ret = UtxoEntryReference.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_value_68c4e9a54bb7fd5e = function() {
    return handleError(function(arg0) {
      const ret = getObject(arg0).value;
      return addHeapObject(ret);
    }, arguments);
  };
  imports.wbg.__wbg_value_cd1ffa7b1ab794f1 = function(arg0) {
    const ret = getObject(arg0).value;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_versions_c71aa1626a93e0a1 = function(arg0) {
    const ret = getObject(arg0).versions;
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_walletdescriptor_new = function(arg0) {
    const ret = WalletDescriptor.__wrap(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbg_warn_28319e260c89a4f8 = function(arg0, arg1) {
    console.warn(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_writeFileSync_6325b339950ab342 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).writeFileSync(getStringFromWasm0(arg1, arg2), takeObject(arg3), takeObject(arg4));
    }, arguments);
  };
  imports.wbg.__wbindgen_array_new = function() {
    const ret = [];
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_array_push = function(arg0, arg1) {
    getObject(arg0).push(takeObject(arg1));
  };
  imports.wbg.__wbindgen_as_number = function(arg0) {
    const ret = +getObject(arg0);
    return ret;
  };
  imports.wbg.__wbindgen_bigint_from_i64 = function(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_bigint_from_u64 = function(arg0) {
    const ret = BigInt.asUintN(64, arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_bigint_get_as_i64 = function(arg0, arg1) {
    const v = getObject(arg1);
    const ret = typeof v === "bigint" ? v : void 0;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbindgen_boolean_get = function(arg0) {
    const v = getObject(arg0);
    const ret = typeof v === "boolean" ? v ? 1 : 0 : 2;
    return ret;
  };
  imports.wbg.__wbindgen_cb_drop = function(arg0) {
    const obj = takeObject(arg0).original;
    if (obj.cnt-- == 1) {
      obj.a = 0;
      return true;
    }
    const ret = false;
    return ret;
  };
  imports.wbg.__wbindgen_closure_wrapper16385 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 6406, __wbg_adapter_78);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper17150 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 6436, __wbg_adapter_81);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper17152 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 6436, __wbg_adapter_84);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper17154 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 6436, __wbg_adapter_87);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper17515 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 6560, __wbg_adapter_90);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper17516 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 6560, __wbg_adapter_90);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper4216 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 1320, __wbg_adapter_75);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper826 = function(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 182, __wbg_adapter_66);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper947 = function(arg0, arg1, arg2) {
    const ret = makeClosure(arg0, arg1, 237, __wbg_adapter_69);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_closure_wrapper949 = function(arg0, arg1, arg2) {
    const ret = makeClosure(arg0, arg1, 237, __wbg_adapter_72);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
    const ret = new Error(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_in = function(arg0, arg1) {
    const ret = getObject(arg0) in getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_is_array = function(arg0) {
    const ret = Array.isArray(getObject(arg0));
    return ret;
  };
  imports.wbg.__wbindgen_is_bigint = function(arg0) {
    const ret = typeof getObject(arg0) === "bigint";
    return ret;
  };
  imports.wbg.__wbindgen_is_falsy = function(arg0) {
    const ret = !getObject(arg0);
    return ret;
  };
  imports.wbg.__wbindgen_is_function = function(arg0) {
    const ret = typeof getObject(arg0) === "function";
    return ret;
  };
  imports.wbg.__wbindgen_is_null = function(arg0) {
    const ret = getObject(arg0) === null;
    return ret;
  };
  imports.wbg.__wbindgen_is_object = function(arg0) {
    const val = getObject(arg0);
    const ret = typeof val === "object" && val !== null;
    return ret;
  };
  imports.wbg.__wbindgen_is_string = function(arg0) {
    const ret = typeof getObject(arg0) === "string";
    return ret;
  };
  imports.wbg.__wbindgen_is_undefined = function(arg0) {
    const ret = getObject(arg0) === void 0;
    return ret;
  };
  imports.wbg.__wbindgen_jsval_eq = function(arg0, arg1) {
    const ret = getObject(arg0) === getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_jsval_loose_eq = function(arg0, arg1) {
    const ret = getObject(arg0) == getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_lt = function(arg0, arg1) {
    const ret = getObject(arg0) < getObject(arg1);
    return ret;
  };
  imports.wbg.__wbindgen_memory = function() {
    const ret = wasm.memory;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_neg = function(arg0) {
    const ret = -getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "number" ? obj : void 0;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbindgen_number_new = function(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
    takeObject(arg0);
  };
  imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
  };
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbindgen_try_into_number = function(arg0) {
    let result;
    try {
      result = +getObject(arg0);
    } catch (e) {
      result = e;
    }
    const ret = result;
    return addHeapObject(ret);
  };
  return imports;
}
function __wbg_init_memory(imports, memory) {
}
function __wbg_finalize_init(instance, module2) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module2;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  return wasm;
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0)
    return wasm;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = new URL("kaspa_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  __wbg_init_memory(imports);
  const { instance, module: module2 } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module2);
}
var wasm, heap, heap_next, WASM_VECTOR_LEN, cachedUint8ArrayMemory0, cachedTextEncoder, encodeString, cachedDataViewMemory0, cachedTextDecoder, CLOSURE_DTORS, stack_pointer, AccountsDiscoveryKind, AddressVersion, CommitRevealAddressKind, ConnectStrategy, Encoding, FeeSource, Language, NetworkType, NewAddressKind, Opcodes, SighashType, __wbindgen_enum_BinaryType, __wbindgen_enum_IdbCursorDirection, __wbindgen_enum_IdbRequestReadyState, __wbindgen_enum_IdbTransactionMode, __wbindgen_enum_RequestCredentials, __wbindgen_enum_RequestMode, AbortableFinalization, AbortedFinalization, Aborted, AccountKindFinalization, AccountKind, AddressFinalization, Address, AgentConstructorOptionsFinalization, AppendFileOptionsFinalization, AssertionErrorOptionsFinalization, BalanceFinalization, BalanceStringsFinalization, ConsoleConstructorOptionsFinalization, CreateHookCallbacksFinalization, CreateReadStreamOptionsFinalization, CreateWriteStreamOptionsFinalization, CryptoBoxFinalization, CryptoBoxPrivateKeyFinalization, CryptoBoxPublicKeyFinalization, DerivationPathFinalization, FormatInputPathObjectFinalization, GeneratorFinalization, Generator, GeneratorSummaryFinalization, GeneratorSummary, GetNameOptionsFinalization, HashFinalization, Hash, HeaderFinalization, KeypairFinalization, Keypair, MkdtempSyncOptionsFinalization, MnemonicFinalization, Mnemonic, NetServerOptionsFinalization, NetworkIdFinalization, NetworkId, NodeDescriptorFinalization, NodeDescriptor, PSKBFinalization, PSKTFinalization, PaymentOutputFinalization, PaymentOutputsFinalization, PendingTransactionFinalization, PendingTransaction, PipeOptionsFinalization, PoWFinalization, PrivateKeyFinalization, PrivateKey, PrivateKeyGeneratorFinalization, PrivateKeyGenerator, ProcessSendOptionsFinalization, PrvKeyDataInfoFinalization, PublicKeyFinalization, PublicKey, PublicKeyGeneratorFinalization, PublicKeyGenerator, ReadStreamFinalization, ResolverFinalization, Resolver, RpcClientFinalization, RpcClient, ScriptBuilderFinalization, ScriptPublicKeyFinalization, ScriptPublicKey, SetAadOptionsFinalization, SigHashTypeFinalization, StorageFinalization, StreamTransformOptionsFinalization, TransactionFinalization, Transaction, TransactionInputFinalization, TransactionInput, TransactionOutpointFinalization, TransactionOutpoint, TransactionOutputFinalization, TransactionOutput, TransactionRecordFinalization, TransactionRecord, TransactionRecordNotificationFinalization, TransactionRecordNotification, TransactionSigningHashFinalization, TransactionSigningHashECDSAFinalization, TransactionUtxoEntryFinalization, UserInfoOptionsFinalization, UtxoContextFinalization, UtxoEntriesFinalization, UtxoEntryFinalization, UtxoEntry, UtxoEntryReferenceFinalization, UtxoEntryReference, UtxoProcessorFinalization, WalletFinalization, Wallet, WalletDescriptorFinalization, WalletDescriptor, WasiOptionsFinalization, WriteFileSyncOptionsFinalization, WriteStreamFinalization, XOnlyPublicKeyFinalization, XOnlyPublicKey, XPrvFinalization, XPrv, XPubFinalization, XPub, kaspa_default;
var init_kaspa = __esm({
  "../../kas-wasm/kaspa.js"() {
    heap = new Array(128).fill(void 0);
    heap.push(void 0, null, true, false);
    heap_next = heap.length;
    WASM_VECTOR_LEN = 0;
    cachedUint8ArrayMemory0 = null;
    cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : { encode: () => {
      throw Error("TextEncoder not available");
    } };
    encodeString = typeof cachedTextEncoder.encodeInto === "function" ? function(arg, view) {
      return cachedTextEncoder.encodeInto(arg, view);
    } : function(arg, view) {
      const buf = cachedTextEncoder.encode(arg);
      view.set(buf);
      return {
        read: arg.length,
        written: buf.length
      };
    };
    cachedDataViewMemory0 = null;
    cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
      throw Error("TextDecoder not available");
    } };
    if (typeof TextDecoder !== "undefined") {
      cachedTextDecoder.decode();
    }
    CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((state) => {
      wasm.__wbindgen_export_4.get(state.dtor)(state.a, state.b);
    });
    stack_pointer = 128;
    AccountsDiscoveryKind = Object.freeze({
      Bip44: 0,
      "0": "Bip44"
    });
    AddressVersion = Object.freeze({
      /**
       * PubKey addresses always have the version byte set to 0
       */
      PubKey: 0,
      "0": "PubKey",
      /**
       * PubKey ECDSA addresses always have the version byte set to 1
       */
      PubKeyECDSA: 1,
      "1": "PubKeyECDSA",
      /**
       * ScriptHash addresses always have the version byte set to 8
       */
      ScriptHash: 8,
      "8": "ScriptHash"
    });
    CommitRevealAddressKind = Object.freeze({
      Receive: 0,
      "0": "Receive",
      Change: 1,
      "1": "Change"
    });
    ConnectStrategy = Object.freeze({
      /**
       * Continuously attempt to connect to the server. This behavior will
       * block `connect()` function until the connection is established.
       */
      Retry: 0,
      "0": "Retry",
      /**
       * Causes `connect()` to return immediately if the first-time connection
       * has failed.
       */
      Fallback: 1,
      "1": "Fallback"
    });
    Encoding = Object.freeze({
      Borsh: 0,
      "0": "Borsh",
      SerdeJson: 1,
      "1": "SerdeJson"
    });
    FeeSource = Object.freeze({
      SenderPays: 0,
      "0": "SenderPays",
      ReceiverPays: 1,
      "1": "ReceiverPays"
    });
    Language = Object.freeze({
      /**
       * English is presently the only supported language
       */
      English: 0,
      "0": "English"
    });
    NetworkType = Object.freeze({
      Mainnet: 0,
      "0": "Mainnet",
      Testnet: 1,
      "1": "Testnet",
      Devnet: 2,
      "2": "Devnet",
      Simnet: 3,
      "3": "Simnet"
    });
    NewAddressKind = Object.freeze({
      Receive: 0,
      "0": "Receive",
      Change: 1,
      "1": "Change"
    });
    Opcodes = Object.freeze({
      OpFalse: 0,
      "0": "OpFalse",
      OpData1: 1,
      "1": "OpData1",
      OpData2: 2,
      "2": "OpData2",
      OpData3: 3,
      "3": "OpData3",
      OpData4: 4,
      "4": "OpData4",
      OpData5: 5,
      "5": "OpData5",
      OpData6: 6,
      "6": "OpData6",
      OpData7: 7,
      "7": "OpData7",
      OpData8: 8,
      "8": "OpData8",
      OpData9: 9,
      "9": "OpData9",
      OpData10: 10,
      "10": "OpData10",
      OpData11: 11,
      "11": "OpData11",
      OpData12: 12,
      "12": "OpData12",
      OpData13: 13,
      "13": "OpData13",
      OpData14: 14,
      "14": "OpData14",
      OpData15: 15,
      "15": "OpData15",
      OpData16: 16,
      "16": "OpData16",
      OpData17: 17,
      "17": "OpData17",
      OpData18: 18,
      "18": "OpData18",
      OpData19: 19,
      "19": "OpData19",
      OpData20: 20,
      "20": "OpData20",
      OpData21: 21,
      "21": "OpData21",
      OpData22: 22,
      "22": "OpData22",
      OpData23: 23,
      "23": "OpData23",
      OpData24: 24,
      "24": "OpData24",
      OpData25: 25,
      "25": "OpData25",
      OpData26: 26,
      "26": "OpData26",
      OpData27: 27,
      "27": "OpData27",
      OpData28: 28,
      "28": "OpData28",
      OpData29: 29,
      "29": "OpData29",
      OpData30: 30,
      "30": "OpData30",
      OpData31: 31,
      "31": "OpData31",
      OpData32: 32,
      "32": "OpData32",
      OpData33: 33,
      "33": "OpData33",
      OpData34: 34,
      "34": "OpData34",
      OpData35: 35,
      "35": "OpData35",
      OpData36: 36,
      "36": "OpData36",
      OpData37: 37,
      "37": "OpData37",
      OpData38: 38,
      "38": "OpData38",
      OpData39: 39,
      "39": "OpData39",
      OpData40: 40,
      "40": "OpData40",
      OpData41: 41,
      "41": "OpData41",
      OpData42: 42,
      "42": "OpData42",
      OpData43: 43,
      "43": "OpData43",
      OpData44: 44,
      "44": "OpData44",
      OpData45: 45,
      "45": "OpData45",
      OpData46: 46,
      "46": "OpData46",
      OpData47: 47,
      "47": "OpData47",
      OpData48: 48,
      "48": "OpData48",
      OpData49: 49,
      "49": "OpData49",
      OpData50: 50,
      "50": "OpData50",
      OpData51: 51,
      "51": "OpData51",
      OpData52: 52,
      "52": "OpData52",
      OpData53: 53,
      "53": "OpData53",
      OpData54: 54,
      "54": "OpData54",
      OpData55: 55,
      "55": "OpData55",
      OpData56: 56,
      "56": "OpData56",
      OpData57: 57,
      "57": "OpData57",
      OpData58: 58,
      "58": "OpData58",
      OpData59: 59,
      "59": "OpData59",
      OpData60: 60,
      "60": "OpData60",
      OpData61: 61,
      "61": "OpData61",
      OpData62: 62,
      "62": "OpData62",
      OpData63: 63,
      "63": "OpData63",
      OpData64: 64,
      "64": "OpData64",
      OpData65: 65,
      "65": "OpData65",
      OpData66: 66,
      "66": "OpData66",
      OpData67: 67,
      "67": "OpData67",
      OpData68: 68,
      "68": "OpData68",
      OpData69: 69,
      "69": "OpData69",
      OpData70: 70,
      "70": "OpData70",
      OpData71: 71,
      "71": "OpData71",
      OpData72: 72,
      "72": "OpData72",
      OpData73: 73,
      "73": "OpData73",
      OpData74: 74,
      "74": "OpData74",
      OpData75: 75,
      "75": "OpData75",
      OpPushData1: 76,
      "76": "OpPushData1",
      OpPushData2: 77,
      "77": "OpPushData2",
      OpPushData4: 78,
      "78": "OpPushData4",
      Op1Negate: 79,
      "79": "Op1Negate",
      OpReserved: 80,
      "80": "OpReserved",
      OpTrue: 81,
      "81": "OpTrue",
      Op2: 82,
      "82": "Op2",
      Op3: 83,
      "83": "Op3",
      Op4: 84,
      "84": "Op4",
      Op5: 85,
      "85": "Op5",
      Op6: 86,
      "86": "Op6",
      Op7: 87,
      "87": "Op7",
      Op8: 88,
      "88": "Op8",
      Op9: 89,
      "89": "Op9",
      Op10: 90,
      "90": "Op10",
      Op11: 91,
      "91": "Op11",
      Op12: 92,
      "92": "Op12",
      Op13: 93,
      "93": "Op13",
      Op14: 94,
      "94": "Op14",
      Op15: 95,
      "95": "Op15",
      Op16: 96,
      "96": "Op16",
      OpNop: 97,
      "97": "OpNop",
      OpVer: 98,
      "98": "OpVer",
      OpIf: 99,
      "99": "OpIf",
      OpNotIf: 100,
      "100": "OpNotIf",
      OpVerIf: 101,
      "101": "OpVerIf",
      OpVerNotIf: 102,
      "102": "OpVerNotIf",
      OpElse: 103,
      "103": "OpElse",
      OpEndIf: 104,
      "104": "OpEndIf",
      OpVerify: 105,
      "105": "OpVerify",
      OpReturn: 106,
      "106": "OpReturn",
      OpToAltStack: 107,
      "107": "OpToAltStack",
      OpFromAltStack: 108,
      "108": "OpFromAltStack",
      Op2Drop: 109,
      "109": "Op2Drop",
      Op2Dup: 110,
      "110": "Op2Dup",
      Op3Dup: 111,
      "111": "Op3Dup",
      Op2Over: 112,
      "112": "Op2Over",
      Op2Rot: 113,
      "113": "Op2Rot",
      Op2Swap: 114,
      "114": "Op2Swap",
      OpIfDup: 115,
      "115": "OpIfDup",
      OpDepth: 116,
      "116": "OpDepth",
      OpDrop: 117,
      "117": "OpDrop",
      OpDup: 118,
      "118": "OpDup",
      OpNip: 119,
      "119": "OpNip",
      OpOver: 120,
      "120": "OpOver",
      OpPick: 121,
      "121": "OpPick",
      OpRoll: 122,
      "122": "OpRoll",
      OpRot: 123,
      "123": "OpRot",
      OpSwap: 124,
      "124": "OpSwap",
      OpTuck: 125,
      "125": "OpTuck",
      /**
       * Splice opcodes.
       */
      OpCat: 126,
      "126": "OpCat",
      OpSubStr: 127,
      "127": "OpSubStr",
      OpLeft: 128,
      "128": "OpLeft",
      OpRight: 129,
      "129": "OpRight",
      OpSize: 130,
      "130": "OpSize",
      /**
       * Bitwise logic opcodes.
       */
      OpInvert: 131,
      "131": "OpInvert",
      OpAnd: 132,
      "132": "OpAnd",
      OpOr: 133,
      "133": "OpOr",
      OpXor: 134,
      "134": "OpXor",
      OpEqual: 135,
      "135": "OpEqual",
      OpEqualVerify: 136,
      "136": "OpEqualVerify",
      OpReserved1: 137,
      "137": "OpReserved1",
      OpReserved2: 138,
      "138": "OpReserved2",
      /**
       * Numeric related opcodes.
       */
      Op1Add: 139,
      "139": "Op1Add",
      Op1Sub: 140,
      "140": "Op1Sub",
      Op2Mul: 141,
      "141": "Op2Mul",
      Op2Div: 142,
      "142": "Op2Div",
      OpNegate: 143,
      "143": "OpNegate",
      OpAbs: 144,
      "144": "OpAbs",
      OpNot: 145,
      "145": "OpNot",
      Op0NotEqual: 146,
      "146": "Op0NotEqual",
      OpAdd: 147,
      "147": "OpAdd",
      OpSub: 148,
      "148": "OpSub",
      OpMul: 149,
      "149": "OpMul",
      OpDiv: 150,
      "150": "OpDiv",
      OpMod: 151,
      "151": "OpMod",
      OpLShift: 152,
      "152": "OpLShift",
      OpRShift: 153,
      "153": "OpRShift",
      OpBoolAnd: 154,
      "154": "OpBoolAnd",
      OpBoolOr: 155,
      "155": "OpBoolOr",
      OpNumEqual: 156,
      "156": "OpNumEqual",
      OpNumEqualVerify: 157,
      "157": "OpNumEqualVerify",
      OpNumNotEqual: 158,
      "158": "OpNumNotEqual",
      OpLessThan: 159,
      "159": "OpLessThan",
      OpGreaterThan: 160,
      "160": "OpGreaterThan",
      OpLessThanOrEqual: 161,
      "161": "OpLessThanOrEqual",
      OpGreaterThanOrEqual: 162,
      "162": "OpGreaterThanOrEqual",
      OpMin: 163,
      "163": "OpMin",
      OpMax: 164,
      "164": "OpMax",
      OpWithin: 165,
      "165": "OpWithin",
      /**
       * Undefined opcodes.
       */
      OpUnknown166: 166,
      "166": "OpUnknown166",
      OpUnknown167: 167,
      "167": "OpUnknown167",
      /**
       * Crypto opcodes.
       */
      OpSHA256: 168,
      "168": "OpSHA256",
      OpCheckMultiSigECDSA: 169,
      "169": "OpCheckMultiSigECDSA",
      OpBlake2b: 170,
      "170": "OpBlake2b",
      OpCheckSigECDSA: 171,
      "171": "OpCheckSigECDSA",
      OpCheckSig: 172,
      "172": "OpCheckSig",
      OpCheckSigVerify: 173,
      "173": "OpCheckSigVerify",
      OpCheckMultiSig: 174,
      "174": "OpCheckMultiSig",
      OpCheckMultiSigVerify: 175,
      "175": "OpCheckMultiSigVerify",
      OpCheckLockTimeVerify: 176,
      "176": "OpCheckLockTimeVerify",
      OpCheckSequenceVerify: 177,
      "177": "OpCheckSequenceVerify",
      /**
       * Undefined opcodes.
       */
      OpUnknown178: 178,
      "178": "OpUnknown178",
      OpUnknown179: 179,
      "179": "OpUnknown179",
      OpUnknown180: 180,
      "180": "OpUnknown180",
      OpUnknown181: 181,
      "181": "OpUnknown181",
      OpUnknown182: 182,
      "182": "OpUnknown182",
      OpUnknown183: 183,
      "183": "OpUnknown183",
      OpUnknown184: 184,
      "184": "OpUnknown184",
      OpUnknown185: 185,
      "185": "OpUnknown185",
      OpUnknown186: 186,
      "186": "OpUnknown186",
      OpUnknown187: 187,
      "187": "OpUnknown187",
      OpUnknown188: 188,
      "188": "OpUnknown188",
      OpUnknown189: 189,
      "189": "OpUnknown189",
      OpUnknown190: 190,
      "190": "OpUnknown190",
      OpUnknown191: 191,
      "191": "OpUnknown191",
      OpUnknown192: 192,
      "192": "OpUnknown192",
      OpUnknown193: 193,
      "193": "OpUnknown193",
      OpUnknown194: 194,
      "194": "OpUnknown194",
      OpUnknown195: 195,
      "195": "OpUnknown195",
      OpUnknown196: 196,
      "196": "OpUnknown196",
      OpUnknown197: 197,
      "197": "OpUnknown197",
      OpUnknown198: 198,
      "198": "OpUnknown198",
      OpUnknown199: 199,
      "199": "OpUnknown199",
      OpUnknown200: 200,
      "200": "OpUnknown200",
      OpUnknown201: 201,
      "201": "OpUnknown201",
      OpUnknown202: 202,
      "202": "OpUnknown202",
      OpUnknown203: 203,
      "203": "OpUnknown203",
      OpUnknown204: 204,
      "204": "OpUnknown204",
      OpUnknown205: 205,
      "205": "OpUnknown205",
      OpUnknown206: 206,
      "206": "OpUnknown206",
      OpUnknown207: 207,
      "207": "OpUnknown207",
      OpUnknown208: 208,
      "208": "OpUnknown208",
      OpUnknown209: 209,
      "209": "OpUnknown209",
      OpUnknown210: 210,
      "210": "OpUnknown210",
      OpUnknown211: 211,
      "211": "OpUnknown211",
      OpUnknown212: 212,
      "212": "OpUnknown212",
      OpUnknown213: 213,
      "213": "OpUnknown213",
      OpUnknown214: 214,
      "214": "OpUnknown214",
      OpUnknown215: 215,
      "215": "OpUnknown215",
      OpUnknown216: 216,
      "216": "OpUnknown216",
      OpUnknown217: 217,
      "217": "OpUnknown217",
      OpUnknown218: 218,
      "218": "OpUnknown218",
      OpUnknown219: 219,
      "219": "OpUnknown219",
      OpUnknown220: 220,
      "220": "OpUnknown220",
      OpUnknown221: 221,
      "221": "OpUnknown221",
      OpUnknown222: 222,
      "222": "OpUnknown222",
      OpUnknown223: 223,
      "223": "OpUnknown223",
      OpUnknown224: 224,
      "224": "OpUnknown224",
      OpUnknown225: 225,
      "225": "OpUnknown225",
      OpUnknown226: 226,
      "226": "OpUnknown226",
      OpUnknown227: 227,
      "227": "OpUnknown227",
      OpUnknown228: 228,
      "228": "OpUnknown228",
      OpUnknown229: 229,
      "229": "OpUnknown229",
      OpUnknown230: 230,
      "230": "OpUnknown230",
      OpUnknown231: 231,
      "231": "OpUnknown231",
      OpUnknown232: 232,
      "232": "OpUnknown232",
      OpUnknown233: 233,
      "233": "OpUnknown233",
      OpUnknown234: 234,
      "234": "OpUnknown234",
      OpUnknown235: 235,
      "235": "OpUnknown235",
      OpUnknown236: 236,
      "236": "OpUnknown236",
      OpUnknown237: 237,
      "237": "OpUnknown237",
      OpUnknown238: 238,
      "238": "OpUnknown238",
      OpUnknown239: 239,
      "239": "OpUnknown239",
      OpUnknown240: 240,
      "240": "OpUnknown240",
      OpUnknown241: 241,
      "241": "OpUnknown241",
      OpUnknown242: 242,
      "242": "OpUnknown242",
      OpUnknown243: 243,
      "243": "OpUnknown243",
      OpUnknown244: 244,
      "244": "OpUnknown244",
      OpUnknown245: 245,
      "245": "OpUnknown245",
      OpUnknown246: 246,
      "246": "OpUnknown246",
      OpUnknown247: 247,
      "247": "OpUnknown247",
      OpUnknown248: 248,
      "248": "OpUnknown248",
      OpUnknown249: 249,
      "249": "OpUnknown249",
      OpSmallInteger: 250,
      "250": "OpSmallInteger",
      OpPubKeys: 251,
      "251": "OpPubKeys",
      OpUnknown252: 252,
      "252": "OpUnknown252",
      OpPubKeyHash: 253,
      "253": "OpPubKeyHash",
      OpPubKey: 254,
      "254": "OpPubKey",
      OpInvalidOpCode: 255,
      "255": "OpInvalidOpCode"
    });
    SighashType = Object.freeze({
      All: 0,
      "0": "All",
      None: 1,
      "1": "None",
      Single: 2,
      "2": "Single",
      AllAnyOneCanPay: 3,
      "3": "AllAnyOneCanPay",
      NoneAnyOneCanPay: 4,
      "4": "NoneAnyOneCanPay",
      SingleAnyOneCanPay: 5,
      "5": "SingleAnyOneCanPay"
    });
    __wbindgen_enum_BinaryType = ["blob", "arraybuffer"];
    __wbindgen_enum_IdbCursorDirection = ["next", "nextunique", "prev", "prevunique"];
    __wbindgen_enum_IdbRequestReadyState = ["pending", "done"];
    __wbindgen_enum_IdbTransactionMode = ["readonly", "readwrite", "versionchange", "readwriteflush", "cleanup"];
    __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];
    __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
    AbortableFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_abortable_free(ptr >>> 0, 1));
    AbortedFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_aborted_free(ptr >>> 0, 1));
    Aborted = class _Aborted {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Aborted.prototype);
        obj.__wbg_ptr = ptr;
        AbortedFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AbortedFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_aborted_free(ptr, 0);
      }
    };
    AccountKindFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_accountkind_free(ptr >>> 0, 1));
    AccountKind = class _AccountKind {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_AccountKind.prototype);
        obj.__wbg_ptr = ptr;
        AccountKindFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AccountKindFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_accountkind_free(ptr, 0);
      }
      /**
       * @param {string} kind
       */
      constructor(kind) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.accountkind_ctor(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          AccountKindFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.accountkind_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    AddressFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_address_free(ptr >>> 0, 1));
    Address = class _Address {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Address.prototype);
        obj.__wbg_ptr = ptr;
        AddressFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          version: this.version,
          prefix: this.prefix,
          payload: this.payload
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AddressFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_address_free(ptr, 0);
      }
      /**
       * @param {string} address
       */
      constructor(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.address_constructor(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        AddressFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @param {string} address
       * @returns {boolean}
       */
      static validate(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.address_validate(ptr0, len0);
        return ret !== 0;
      }
      /**
       * Convert an address to a string.
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.address_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      get version() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.address_version(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      get prefix() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.address_prefix(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {string} prefix
       */
      set setPrefix(prefix) {
        const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.address_set_setPrefix(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {string}
       */
      get payload() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.address_payload(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {number} n
       * @returns {string}
       */
      short(n) {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.address_short(retptr, this.__wbg_ptr, n);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    AgentConstructorOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_agentconstructoroptions_free(ptr >>> 0, 1));
    AppendFileOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_appendfileoptions_free(ptr >>> 0, 1));
    AssertionErrorOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_assertionerroroptions_free(ptr >>> 0, 1));
    BalanceFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_balance_free(ptr >>> 0, 1));
    BalanceStringsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_balancestrings_free(ptr >>> 0, 1));
    ConsoleConstructorOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_consoleconstructoroptions_free(ptr >>> 0, 1));
    CreateHookCallbacksFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_createhookcallbacks_free(ptr >>> 0, 1));
    CreateReadStreamOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_createreadstreamoptions_free(ptr >>> 0, 1));
    CreateWriteStreamOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_createwritestreamoptions_free(ptr >>> 0, 1));
    CryptoBoxFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_cryptobox_free(ptr >>> 0, 1));
    CryptoBoxPrivateKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_cryptoboxprivatekey_free(ptr >>> 0, 1));
    CryptoBoxPublicKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_cryptoboxpublickey_free(ptr >>> 0, 1));
    DerivationPathFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_derivationpath_free(ptr >>> 0, 1));
    FormatInputPathObjectFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_formatinputpathobject_free(ptr >>> 0, 1));
    GeneratorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_generator_free(ptr >>> 0, 1));
    Generator = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GeneratorFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_generator_free(ptr, 0);
      }
      /**
       * @param {IGeneratorSettingsObject} args
       */
      constructor(args) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.generator_ctor(retptr, addHeapObject(args));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          GeneratorFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate next transaction
       * @returns {Promise<any>}
       */
      next() {
        const ret = wasm.generator_next(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<GeneratorSummary>}
       */
      estimate() {
        const ret = wasm.generator_estimate(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {GeneratorSummary}
       */
      summary() {
        const ret = wasm.generator_summary(this.__wbg_ptr);
        return GeneratorSummary.__wrap(ret);
      }
    };
    GeneratorSummaryFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_generatorsummary_free(ptr >>> 0, 1));
    GeneratorSummary = class _GeneratorSummary {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_GeneratorSummary.prototype);
        obj.__wbg_ptr = ptr;
        GeneratorSummaryFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          networkType: this.networkType,
          utxos: this.utxos,
          fees: this.fees,
          mass: this.mass,
          transactions: this.transactions,
          finalAmount: this.finalAmount,
          finalTransactionId: this.finalTransactionId
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GeneratorSummaryFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_generatorsummary_free(ptr, 0);
      }
      /**
       * @returns {NetworkType}
       */
      get networkType() {
        const ret = wasm.generatorsummary_networkType(this.__wbg_ptr);
        return ret;
      }
      /**
       * @returns {number}
       */
      get utxos() {
        const ret = wasm.generatorsummary_utxos(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @returns {bigint}
       */
      get fees() {
        const ret = wasm.generatorsummary_fees(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {bigint}
       */
      get mass() {
        const ret = wasm.generatorsummary_mass(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {number}
       */
      get transactions() {
        const ret = wasm.generatorsummary_transactions(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @returns {bigint | undefined}
       */
      get finalAmount() {
        const ret = wasm.generatorsummary_finalAmount(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {string | undefined}
       */
      get finalTransactionId() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.generatorsummary_finalTransactionId(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    GetNameOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_getnameoptions_free(ptr >>> 0, 1));
    HashFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_hash_free(ptr >>> 0, 1));
    Hash = class _Hash {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Hash.prototype);
        obj.__wbg_ptr = ptr;
        HashFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HashFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hash_free(ptr, 0);
      }
      /**
       * @param {string} hex_str
       */
      constructor(hex_str) {
        const ptr0 = passStringToWasm0(hex_str, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hash_constructor(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        HashFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.hash_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    HeaderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_header_free(ptr >>> 0, 1));
    KeypairFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_keypair_free(ptr >>> 0, 1));
    Keypair = class _Keypair {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Keypair.prototype);
        obj.__wbg_ptr = ptr;
        KeypairFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
          xOnlyPublicKey: this.xOnlyPublicKey
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KeypairFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_keypair_free(ptr, 0);
      }
      /**
       * Get the [`PublicKey`] of this [`Keypair`].
       * @returns {string}
       */
      get publicKey() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.keypair_get_public_key(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Get the [`PrivateKey`] of this [`Keypair`].
       * @returns {string}
       */
      get privateKey() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.keypair_get_private_key(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Get the `XOnlyPublicKey` of this [`Keypair`].
       * @returns {any}
       */
      get xOnlyPublicKey() {
        const ret = wasm.keypair_get_xonly_public_key(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Get the [`Address`] of this Keypair's [`PublicKey`].
       * Receives a [`NetworkType`](kaspa_consensus_core::network::NetworkType)
       * to determine the prefix of the address.
       * JavaScript: `let address = keypair.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddress(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.keypair_toAddress(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Get `ECDSA` [`Address`] of this Keypair's [`PublicKey`].
       * Receives a [`NetworkType`](kaspa_consensus_core::network::NetworkType)
       * to determine the prefix of the address.
       * JavaScript: `let address = keypair.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddressECDSA(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.keypair_toAddressECDSA(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Create a new random [`Keypair`].
       * JavaScript: `let keypair = Keypair::random();`.
       * @returns {Keypair}
       */
      static random() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.keypair_random(retptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _Keypair.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Create a new [`Keypair`] from a [`PrivateKey`].
       * JavaScript: `let privkey = new PrivateKey(hexString); let keypair = privkey.toKeypair();`.
       * @param {PrivateKey} secret_key
       * @returns {Keypair}
       */
      static fromPrivateKey(secret_key) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertClass(secret_key, PrivateKey);
          wasm.keypair_fromPrivateKey(retptr, secret_key.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _Keypair.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    MkdtempSyncOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_mkdtempsyncoptions_free(ptr >>> 0, 1));
    MnemonicFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_mnemonic_free(ptr >>> 0, 1));
    Mnemonic = class _Mnemonic {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Mnemonic.prototype);
        obj.__wbg_ptr = ptr;
        MnemonicFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          entropy: this.entropy,
          phrase: this.phrase
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MnemonicFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mnemonic_free(ptr, 0);
      }
      /**
       * @param {string} phrase
       * @param {Language | null} [language]
       */
      constructor(phrase, language) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.mnemonic_constructor(retptr, ptr0, len0, isLikeNone(language) ? 1 : language);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          MnemonicFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Validate mnemonic phrase. Returns `true` if the phrase is valid, `false` otherwise.
       * @param {string} phrase
       * @param {Language | null} [language]
       * @returns {boolean}
       */
      static validate(phrase, language) {
        const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.mnemonic_validate(ptr0, len0, isLikeNone(language) ? 1 : language);
        return ret !== 0;
      }
      /**
       * @returns {string}
       */
      get entropy() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.mnemonic_entropy(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {string} entropy
       */
      set entropy(entropy) {
        const ptr0 = passStringToWasm0(entropy, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.mnemonic_set_entropy(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @param {number | null} [word_count]
       * @returns {Mnemonic}
       */
      static random(word_count) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.mnemonic_random(retptr, isLikeNone(word_count) ? 4294967297 : word_count >>> 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _Mnemonic.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {string}
       */
      get phrase() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.mnemonic_phrase(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {string} phrase
       */
      set phrase(phrase) {
        const ptr0 = passStringToWasm0(phrase, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.mnemonic_set_phrase(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @param {string | null} [password]
       * @returns {string}
       */
      toSeed(password) {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          var ptr0 = isLikeNone(password) ? 0 : passStringToWasm0(password, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          var len0 = WASM_VECTOR_LEN;
          wasm.mnemonic_toSeed(retptr, this.__wbg_ptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred2_0 = r0;
          deferred2_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
    };
    NetServerOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_netserveroptions_free(ptr >>> 0, 1));
    NetworkIdFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_networkid_free(ptr >>> 0, 1));
    NetworkId = class _NetworkId {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_NetworkId.prototype);
        obj.__wbg_ptr = ptr;
        NetworkIdFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          type: this.type,
          suffix: this.suffix,
          id: this.id
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NetworkIdFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_networkid_free(ptr, 0);
      }
      /**
       * @returns {NetworkType}
       */
      get type() {
        const ret = wasm.__wbg_get_networkid_type(this.__wbg_ptr);
        return ret;
      }
      /**
       * @param {NetworkType} arg0
       */
      set type(arg0) {
        wasm.__wbg_set_networkid_type(this.__wbg_ptr, arg0);
      }
      /**
       * @returns {number | undefined}
       */
      get suffix() {
        const ret = wasm.__wbg_get_networkid_suffix(this.__wbg_ptr);
        return ret === 4294967297 ? void 0 : ret;
      }
      /**
       * @param {number | null} [arg0]
       */
      set suffix(arg0) {
        wasm.__wbg_set_networkid_suffix(this.__wbg_ptr, isLikeNone(arg0) ? 4294967297 : arg0 >>> 0);
      }
      /**
       * @param {any} value
       */
      constructor(value) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.networkid_ctor(retptr, addBorrowedObject(value));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          NetworkIdFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {string}
       */
      get id() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.networkid_id(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.networkid_id(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      addressPrefix() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.networkid_addressPrefix(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    NodeDescriptorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_nodedescriptor_free(ptr >>> 0, 1));
    NodeDescriptor = class _NodeDescriptor {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_NodeDescriptor.prototype);
        obj.__wbg_ptr = ptr;
        NodeDescriptorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          uid: this.uid,
          url: this.url
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NodeDescriptorFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_nodedescriptor_free(ptr, 0);
      }
      /**
       * The unique identifier of the node.
       * @returns {string}
       */
      get uid() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_nodedescriptor_uid(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * The unique identifier of the node.
       * @param {string} arg0
       */
      set uid(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_nodedescriptor_uid(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * The URL of the node WebSocket (wRPC URL).
       * @returns {string}
       */
      get url() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_nodedescriptor_url(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * The URL of the node WebSocket (wRPC URL).
       * @param {string} arg0
       */
      set url(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_nodedescriptor_url(this.__wbg_ptr, ptr0, len0);
      }
    };
    PSKBFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pskb_free(ptr >>> 0, 1));
    PSKTFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pskt_free(ptr >>> 0, 1));
    PaymentOutputFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_paymentoutput_free(ptr >>> 0, 1));
    PaymentOutputsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_paymentoutputs_free(ptr >>> 0, 1));
    PendingTransactionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pendingtransaction_free(ptr >>> 0, 1));
    PendingTransaction = class _PendingTransaction {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_PendingTransaction.prototype);
        obj.__wbg_ptr = ptr;
        PendingTransactionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          id: this.id,
          paymentAmount: this.paymentAmount,
          changeAmount: this.changeAmount,
          feeAmount: this.feeAmount,
          mass: this.mass,
          minimumSignatures: this.minimumSignatures,
          aggregateInputAmount: this.aggregateInputAmount,
          aggregateOutputAmount: this.aggregateOutputAmount,
          type: this.type,
          transaction: this.transaction
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PendingTransactionFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pendingtransaction_free(ptr, 0);
      }
      /**
       * Transaction Id
       * @returns {string}
       */
      get id() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_id(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Total amount transferred to the destination (aggregate output - change).
       * @returns {any}
       */
      get paymentAmount() {
        const ret = wasm.pendingtransaction_paymentAmount(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Change amount (if any).
       * @returns {bigint}
       */
      get changeAmount() {
        const ret = wasm.pendingtransaction_changeAmount(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Total transaction fees (network fees + priority fees).
       * @returns {bigint}
       */
      get feeAmount() {
        const ret = wasm.pendingtransaction_feeAmount(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Calculated transaction mass.
       * @returns {bigint}
       */
      get mass() {
        const ret = wasm.pendingtransaction_mass(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Minimum number of signatures required by the transaction.
       * (as specified during the transaction creation).
       * @returns {number}
       */
      get minimumSignatures() {
        const ret = wasm.pendingtransaction_minimumSignatures(this.__wbg_ptr);
        return ret;
      }
      /**
       * Total aggregate input amount.
       * @returns {bigint}
       */
      get aggregateInputAmount() {
        const ret = wasm.pendingtransaction_aggregateInputAmount(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Total aggregate output amount.
       * @returns {bigint}
       */
      get aggregateOutputAmount() {
        const ret = wasm.pendingtransaction_aggregateOutputAmount(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Transaction type ("batch" or "final").
       * @returns {string}
       */
      get type() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_type(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * List of unique addresses used by transaction inputs.
       * This method can be used to determine addresses used by transaction inputs
       * in order to select private keys needed for transaction signing.
       * @returns {Array<any>}
       */
      addresses() {
        const ret = wasm.pendingtransaction_addresses(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Provides a list of UTXO entries used by the transaction.
       * @returns {Array<any>}
       */
      getUtxoEntries() {
        const ret = wasm.pendingtransaction_getUtxoEntries(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Creates and returns a signature for the input at the specified index.
       * @param {number} input_index
       * @param {PrivateKey} private_key
       * @param {SighashType | null} [sighash_type]
       * @returns {HexString}
       */
      createInputSignature(input_index, private_key, sighash_type) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertClass(private_key, PrivateKey);
          wasm.pendingtransaction_createInputSignature(retptr, this.__wbg_ptr, input_index, private_key.__wbg_ptr, isLikeNone(sighash_type) ? 6 : sighash_type);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Sets a signature to the input at the specified index.
       * @param {number} input_index
       * @param {HexString | Uint8Array} signature_script
       */
      fillInput(input_index, signature_script) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_fillInput(retptr, this.__wbg_ptr, input_index, addHeapObject(signature_script));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Signs the input at the specified index with the supplied private key
       * and an optional SighashType.
       * @param {number} input_index
       * @param {PrivateKey} private_key
       * @param {SighashType | null} [sighash_type]
       */
      signInput(input_index, private_key, sighash_type) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertClass(private_key, PrivateKey);
          wasm.pendingtransaction_signInput(retptr, this.__wbg_ptr, input_index, private_key.__wbg_ptr, isLikeNone(sighash_type) ? 6 : sighash_type);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Signs transaction with supplied [`Array`] or [`PrivateKey`] or an array of
       * raw private key bytes (encoded as `Uint8Array` or as hex strings)
       * @param {(PrivateKey | HexString | Uint8Array)[]} js_value
       * @param {boolean | null} [check_fully_signed]
       */
      sign(js_value, check_fully_signed) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_sign(retptr, this.__wbg_ptr, addHeapObject(js_value), isLikeNone(check_fully_signed) ? 16777215 : check_fully_signed ? 1 : 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Submit transaction to the supplied [`RpcClient`]
       * **IMPORTANT:** This method will remove UTXOs from the associated
       * {@link UtxoContext} if one was used to create the transaction
       * and will return UTXOs back to {@link UtxoContext} in case of
       * a failed submission.
       *
       * # Important
       *
       * Make sure to consume the returned `txid` value. Always invoke this method
       * as follows `let txid = await pendingTransaction.submit(rpc);`. If you do not
       * consume the returned value and the rpc object is temporary, the GC will
       * collect the `rpc` object passed to submit() potentially causing a panic.
       *
       * @see {@link RpcClient.submitTransaction}
       * @param {RpcClient} wasm_rpc_client
       * @returns {Promise<string>}
       */
      submit(wasm_rpc_client) {
        _assertClass(wasm_rpc_client, RpcClient);
        const ret = wasm.pendingtransaction_submit(this.__wbg_ptr, wasm_rpc_client.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Returns encapsulated network [`Transaction`]
       * @returns {Transaction}
       */
      get transaction() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_transaction(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Transaction.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Serializes the transaction to a pure JavaScript Object.
       * The schema of the JavaScript object is defined by {@link ISerializableTransaction}.
       * @see {@link ISerializableTransaction}
       * @see {@link Transaction}, {@link ISerializableTransaction}
       * @returns {ITransaction | Transaction}
       */
      serializeToObject() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_serializeToObject(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Serializes the transaction to a JSON string.
       * The schema of the JSON is defined by {@link ISerializableTransaction}.
       * Once serialized, the transaction can be deserialized using {@link Transaction.deserializeFromJSON}.
       * @see {@link Transaction}, {@link ISerializableTransaction}
       * @returns {string}
       */
      serializeToJSON() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_serializeToJSON(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * Serializes the transaction to a "Safe" JSON schema where it converts all `bigint` values to `string` to avoid potential client-side precision loss.
       * Once serialized, the transaction can be deserialized using {@link Transaction.deserializeFromSafeJSON}.
       * @see {@link Transaction}, {@link ISerializableTransaction}
       * @returns {string}
       */
      serializeToSafeJSON() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.pendingtransaction_serializeToSafeJSON(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
    };
    PipeOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pipeoptions_free(ptr >>> 0, 1));
    PoWFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_pow_free(ptr >>> 0, 1));
    PrivateKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_privatekey_free(ptr >>> 0, 1));
    PrivateKey = class _PrivateKey {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_PrivateKey.prototype);
        obj.__wbg_ptr = ptr;
        PrivateKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PrivateKeyFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_privatekey_free(ptr, 0);
      }
      /**
       * Create a new [`PrivateKey`] from a hex-encoded string.
       * @param {string} key
       */
      constructor(key) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(key, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.privatekey_try_new(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          PrivateKeyFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Returns the [`PrivateKey`] key encoded as a hex string.
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekey_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Generate a [`Keypair`] from this [`PrivateKey`].
       * @returns {Keypair}
       */
      toKeypair() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekey_toKeypair(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Keypair.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {PublicKey}
       */
      toPublicKey() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekey_toPublicKey(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return PublicKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Get the [`Address`] of the PublicKey generated from this PrivateKey.
       * Receives a [`NetworkType`](kaspa_consensus_core::network::NetworkType)
       * to determine the prefix of the address.
       * JavaScript: `let address = privateKey.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddress(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekey_toAddress(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Get `ECDSA` [`Address`] of the PublicKey generated from this PrivateKey.
       * Receives a [`NetworkType`](kaspa_consensus_core::network::NetworkType)
       * to determine the prefix of the address.
       * JavaScript: `let address = privateKey.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddressECDSA(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekey_toAddressECDSA(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
    };
    PrivateKeyGeneratorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_privatekeygenerator_free(ptr >>> 0, 1));
    PrivateKeyGenerator = class {
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PrivateKeyGeneratorFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_privatekeygenerator_free(ptr, 0);
      }
      /**
       * @param {XPrv | string} xprv
       * @param {boolean} is_multisig
       * @param {bigint} account_index
       * @param {number | null} [cosigner_index]
       */
      constructor(xprv, is_multisig, account_index, cosigner_index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekeygenerator_new(retptr, addBorrowedObject(xprv), is_multisig, account_index, isLikeNone(cosigner_index) ? 4294967297 : cosigner_index >>> 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          PrivateKeyGeneratorFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @param {number} index
       * @returns {PrivateKey}
       */
      receiveKey(index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekeygenerator_receiveKey(retptr, this.__wbg_ptr, index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return PrivateKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} index
       * @returns {PrivateKey}
       */
      changeKey(index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.privatekeygenerator_changeKey(retptr, this.__wbg_ptr, index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return PrivateKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    ProcessSendOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_processsendoptions_free(ptr >>> 0, 1));
    PrvKeyDataInfoFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_prvkeydatainfo_free(ptr >>> 0, 1));
    PublicKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_publickey_free(ptr >>> 0, 1));
    PublicKey = class _PublicKey {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_PublicKey.prototype);
        obj.__wbg_ptr = ptr;
        PublicKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PublicKeyFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_publickey_free(ptr, 0);
      }
      /**
       * Create a new [`PublicKey`] from a hex-encoded string.
       * @param {string} key
       */
      constructor(key) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(key, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.publickey_try_new(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          PublicKeyFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickey_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Get the [`Address`] of this PublicKey.
       * Receives a [`NetworkType`] to determine the prefix of the address.
       * JavaScript: `let address = publicKey.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddress(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickey_toAddress(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Get `ECDSA` [`Address`] of this PublicKey.
       * Receives a [`NetworkType`] to determine the prefix of the address.
       * JavaScript: `let address = publicKey.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddressECDSA(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickey_toAddressECDSA(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {XOnlyPublicKey}
       */
      toXOnlyPublicKey() {
        const ret = wasm.publickey_toXOnlyPublicKey(this.__wbg_ptr);
        return XOnlyPublicKey.__wrap(ret);
      }
      /**
       * Compute a 4-byte key fingerprint for this public key as a hex string.
       * Default implementation uses `RIPEMD160(SHA256(public_key))`.
       * @returns {HexString | undefined}
       */
      fingerprint() {
        const ret = wasm.publickey_fingerprint(this.__wbg_ptr);
        return takeObject(ret);
      }
    };
    PublicKeyGeneratorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_publickeygenerator_free(ptr >>> 0, 1));
    PublicKeyGenerator = class _PublicKeyGenerator {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_PublicKeyGenerator.prototype);
        obj.__wbg_ptr = ptr;
        PublicKeyGeneratorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PublicKeyGeneratorFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_publickeygenerator_free(ptr, 0);
      }
      /**
       * @param {XPub | string} kpub
       * @param {number | null} [cosigner_index]
       * @returns {PublicKeyGenerator}
       */
      static fromXPub(kpub, cosigner_index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_fromXPub(retptr, addBorrowedObject(kpub), isLikeNone(cosigner_index) ? 4294967297 : cosigner_index >>> 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _PublicKeyGenerator.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @param {XPrv | string} xprv
       * @param {boolean} is_multisig
       * @param {bigint} account_index
       * @param {number | null} [cosigner_index]
       * @returns {PublicKeyGenerator}
       */
      static fromMasterXPrv(xprv, is_multisig, account_index, cosigner_index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_fromMasterXPrv(retptr, addBorrowedObject(xprv), is_multisig, account_index, isLikeNone(cosigner_index) ? 4294967297 : cosigner_index >>> 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _PublicKeyGenerator.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate Receive Public Key derivations for a given range.
       * @param {number} start
       * @param {number} end
       * @returns {(PublicKey | string)[]}
       */
      receivePubkeys(start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receivePubkeys(retptr, this.__wbg_ptr, start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate a single Receive Public Key derivation at a given index.
       * @param {number} index
       * @returns {PublicKey}
       */
      receivePubkey(index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receivePubkey(retptr, this.__wbg_ptr, index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return PublicKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate a range of Receive Public Key derivations and return them as strings.
       * @param {number} start
       * @param {number} end
       * @returns {Array<string>}
       */
      receivePubkeysAsStrings(start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receivePubkeysAsStrings(retptr, this.__wbg_ptr, start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate a single Receive Public Key derivation at a given index and return it as a string.
       * @param {number} index
       * @returns {string}
       */
      receivePubkeyAsString(index) {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receivePubkeyAsString(retptr, this.__wbg_ptr, index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * Generate Receive Address derivations for a given range.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} start
       * @param {number} end
       * @returns {Address[]}
       */
      receiveAddresses(networkType, start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receiveAddresses(retptr, this.__wbg_ptr, addBorrowedObject(networkType), start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate a single Receive Address derivation at a given index.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} index
       * @returns {Address}
       */
      receiveAddress(networkType, index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receiveAddress(retptr, this.__wbg_ptr, addBorrowedObject(networkType), index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate a range of Receive Address derivations and return them as strings.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} start
       * @param {number} end
       * @returns {Array<string>}
       */
      receiveAddressAsStrings(networkType, start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receiveAddressAsStrings(retptr, this.__wbg_ptr, addBorrowedObject(networkType), start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate a single Receive Address derivation at a given index and return it as a string.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} index
       * @returns {string}
       */
      receiveAddressAsString(networkType, index) {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_receiveAddressAsString(retptr, this.__wbg_ptr, addBorrowedObject(networkType), index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * Generate Change Public Key derivations for a given range.
       * @param {number} start
       * @param {number} end
       * @returns {(PublicKey | string)[]}
       */
      changePubkeys(start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changePubkeys(retptr, this.__wbg_ptr, start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate a single Change Public Key derivation at a given index.
       * @param {number} index
       * @returns {PublicKey}
       */
      changePubkey(index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changePubkey(retptr, this.__wbg_ptr, index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return PublicKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate a range of Change Public Key derivations and return them as strings.
       * @param {number} start
       * @param {number} end
       * @returns {Array<string>}
       */
      changePubkeysAsStrings(start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changePubkeysAsStrings(retptr, this.__wbg_ptr, start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Generate a single Change Public Key derivation at a given index and return it as a string.
       * @param {number} index
       * @returns {string}
       */
      changePubkeyAsString(index) {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changePubkeyAsString(retptr, this.__wbg_ptr, index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * Generate Change Address derivations for a given range.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} start
       * @param {number} end
       * @returns {Address[]}
       */
      changeAddresses(networkType, start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changeAddresses(retptr, this.__wbg_ptr, addBorrowedObject(networkType), start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate a single Change Address derivation at a given index.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} index
       * @returns {Address}
       */
      changeAddress(networkType, index) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changeAddress(retptr, this.__wbg_ptr, addBorrowedObject(networkType), index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate a range of Change Address derivations and return them as strings.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} start
       * @param {number} end
       * @returns {Array<string>}
       */
      changeAddressAsStrings(networkType, start, end) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changeAddressAsStrings(retptr, this.__wbg_ptr, addBorrowedObject(networkType), start, end);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Generate a single Change Address derivation at a given index and return it as a string.
       * @param {NetworkType | NetworkId | string} networkType
       * @param {number} index
       * @returns {string}
       */
      changeAddressAsString(networkType, index) {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_changeAddressAsString(retptr, this.__wbg_ptr, addBorrowedObject(networkType), index);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.publickeygenerator_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
    };
    ReadStreamFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_readstream_free(ptr >>> 0, 1));
    ResolverFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_resolver_free(ptr >>> 0, 1));
    Resolver = class _Resolver {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Resolver.prototype);
        obj.__wbg_ptr = ptr;
        ResolverFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          urls: this.urls
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ResolverFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_resolver_free(ptr, 0);
      }
      /**
       * List of public Kaspa Resolver URLs.
       * @returns {string[] | undefined}
       */
      get urls() {
        const ret = wasm.resolver_urls(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Fetches a public Kaspa wRPC endpoint for the given encoding and network identifier.
       * @see {@link Encoding}, {@link NetworkId}, {@link Node}
       * @param {Encoding} encoding
       * @param {NetworkId | string} network_id
       * @returns {Promise<NodeDescriptor>}
       */
      getNode(encoding, network_id) {
        const ret = wasm.resolver_getNode(this.__wbg_ptr, encoding, addHeapObject(network_id));
        return takeObject(ret);
      }
      /**
       * Fetches a public Kaspa wRPC endpoint URL for the given encoding and network identifier.
       * @see {@link Encoding}, {@link NetworkId}
       * @param {Encoding} encoding
       * @param {NetworkId | string} network_id
       * @returns {Promise<string>}
       */
      getUrl(encoding, network_id) {
        const ret = wasm.resolver_getUrl(this.__wbg_ptr, encoding, addHeapObject(network_id));
        return takeObject(ret);
      }
      /**
       * Connect to a public Kaspa wRPC endpoint for the given encoding and network identifier
       * supplied via {@link IResolverConnect} interface.
       * @see {@link IResolverConnect}, {@link RpcClient}
       * @param {IResolverConnect | NetworkId | string} options
       * @returns {Promise<RpcClient>}
       */
      connect(options) {
        const ret = wasm.resolver_connect(this.__wbg_ptr, addHeapObject(options));
        return takeObject(ret);
      }
      /**
       * Creates a new Resolver client with the given
       * configuration supplied as {@link IResolverConfig}
       * interface. If not supplied, the default configuration
       * containing a list of community-operated resolvers
       * will be used.
       * @param {IResolverConfig | string[] | null} [args]
       */
      constructor(args) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.resolver_ctor(retptr, isLikeNone(args) ? 0 : addHeapObject(args));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          ResolverFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    RpcClientFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_rpcclient_free(ptr >>> 0, 1));
    RpcClient = class _RpcClient {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_RpcClient.prototype);
        obj.__wbg_ptr = ptr;
        RpcClientFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          url: this.url,
          resolver: this.resolver,
          isConnected: this.isConnected,
          encoding: this.encoding,
          nodeId: this.nodeId
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RpcClientFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rpcclient_free(ptr, 0);
      }
      /**
       * Retrieves the current number of blocks in the Kaspa BlockDAG.
       * This is not a block count, not a "block height" and can not be
       * used for transaction validation.
       * Returned information: Current block count.
       * @see {@link IGetBlockCountRequest}, {@link IGetBlockCountResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetBlockCountRequest | null} [request]
       * @returns {Promise<IGetBlockCountResponse>}
       */
      getBlockCount(request) {
        const ret = wasm.rpcclient_getBlockCount(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Provides information about the Directed Acyclic Graph (DAG)
       * structure of the Kaspa BlockDAG.
       * Returned information: Number of blocks in the DAG,
       * number of tips in the DAG, hash of the selected parent block,
       * difficulty of the selected parent block, selected parent block
       * blue score, selected parent block time.
       * @see {@link IGetBlockDagInfoRequest}, {@link IGetBlockDagInfoResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetBlockDagInfoRequest | null} [request]
       * @returns {Promise<IGetBlockDagInfoResponse>}
       */
      getBlockDagInfo(request) {
        const ret = wasm.rpcclient_getBlockDagInfo(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Returns the total current coin supply of Kaspa network.
       * Returned information: Total coin supply.
       * @see {@link IGetCoinSupplyRequest}, {@link IGetCoinSupplyResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetCoinSupplyRequest | null} [request]
       * @returns {Promise<IGetCoinSupplyResponse>}
       */
      getCoinSupply(request) {
        const ret = wasm.rpcclient_getCoinSupply(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves information about the peers connected to the Kaspa node.
       * Returned information: Peer ID, IP address and port, connection
       * status, protocol version.
       * @see {@link IGetConnectedPeerInfoRequest}, {@link IGetConnectedPeerInfoResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetConnectedPeerInfoRequest | null} [request]
       * @returns {Promise<IGetConnectedPeerInfoResponse>}
       */
      getConnectedPeerInfo(request) {
        const ret = wasm.rpcclient_getConnectedPeerInfo(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves general information about the Kaspa node.
       * Returned information: Version of the Kaspa node, protocol
       * version, network identifier.
       * This call is primarily used by gRPC clients.
       * For wRPC clients, use {@link RpcClient.getServerInfo}.
       * @see {@link IGetInfoRequest}, {@link IGetInfoResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetInfoRequest | null} [request]
       * @returns {Promise<IGetInfoResponse>}
       */
      getInfo(request) {
        const ret = wasm.rpcclient_getInfo(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Provides a list of addresses of known peers in the Kaspa
       * network that the node can potentially connect to.
       * Returned information: List of peer addresses.
       * @see {@link IGetPeerAddressesRequest}, {@link IGetPeerAddressesResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetPeerAddressesRequest | null} [request]
       * @returns {Promise<IGetPeerAddressesResponse>}
       */
      getPeerAddresses(request) {
        const ret = wasm.rpcclient_getPeerAddresses(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves various metrics and statistics related to the
       * performance and status of the Kaspa node.
       * Returned information: Memory usage, CPU usage, network activity.
       * @see {@link IGetMetricsRequest}, {@link IGetMetricsResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetMetricsRequest | null} [request]
       * @returns {Promise<IGetMetricsResponse>}
       */
      getMetrics(request) {
        const ret = wasm.rpcclient_getMetrics(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves current number of network connections
       * @see {@link IGetConnectionsRequest}, {@link IGetConnectionsResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetConnectionsRequest | null} [request]
       * @returns {Promise<IGetConnectionsResponse>}
       */
      getConnections(request) {
        const ret = wasm.rpcclient_getConnections(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves the current sink block, which is the block with
       * the highest cumulative difficulty in the Kaspa BlockDAG.
       * Returned information: Sink block hash, sink block height.
       * @see {@link IGetSinkRequest}, {@link IGetSinkResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetSinkRequest | null} [request]
       * @returns {Promise<IGetSinkResponse>}
       */
      getSink(request) {
        const ret = wasm.rpcclient_getSink(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Returns the blue score of the current sink block, indicating
       * the total amount of work that has been done on the main chain
       * leading up to that block.
       * Returned information: Blue score of the sink block.
       * @see {@link IGetSinkBlueScoreRequest}, {@link IGetSinkBlueScoreResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetSinkBlueScoreRequest | null} [request]
       * @returns {Promise<IGetSinkBlueScoreResponse>}
       */
      getSinkBlueScore(request) {
        const ret = wasm.rpcclient_getSinkBlueScore(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Tests the connection and responsiveness of a Kaspa node.
       * Returned information: None.
       * @see {@link IPingRequest}, {@link IPingResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IPingRequest | null} [request]
       * @returns {Promise<IPingResponse>}
       */
      ping(request) {
        const ret = wasm.rpcclient_ping(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Gracefully shuts down the Kaspa node.
       * Returned information: None.
       * @see {@link IShutdownRequest}, {@link IShutdownResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IShutdownRequest | null} [request]
       * @returns {Promise<IShutdownResponse>}
       */
      shutdown(request) {
        const ret = wasm.rpcclient_shutdown(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves information about the Kaspa server.
       * Returned information: Version of the Kaspa server, protocol
       * version, network identifier.
       * @see {@link IGetServerInfoRequest}, {@link IGetServerInfoResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetServerInfoRequest | null} [request]
       * @returns {Promise<IGetServerInfoResponse>}
       */
      getServerInfo(request) {
        const ret = wasm.rpcclient_getServerInfo(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Obtains basic information about the synchronization status of the Kaspa node.
       * Returned information: Syncing status.
       * @see {@link IGetSyncStatusRequest}, {@link IGetSyncStatusResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetSyncStatusRequest | null} [request]
       * @returns {Promise<IGetSyncStatusResponse>}
       */
      getSyncStatus(request) {
        const ret = wasm.rpcclient_getSyncStatus(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Feerate estimates
       * @see {@link IGetFeeEstimateRequest}, {@link IGetFeeEstimateResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetFeeEstimateRequest | null} [request]
       * @returns {Promise<IGetFeeEstimateResponse>}
       */
      getFeeEstimate(request) {
        const ret = wasm.rpcclient_getFeeEstimate(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves the current network configuration.
       * Returned information: Current network configuration.
       * @see {@link IGetCurrentNetworkRequest}, {@link IGetCurrentNetworkResponse}
       * @throws `string` on an RPC error or a server-side error.
       * @param {IGetCurrentNetworkRequest | null} [request]
       * @returns {Promise<IGetCurrentNetworkResponse>}
       */
      getCurrentNetwork(request) {
        const ret = wasm.rpcclient_getCurrentNetwork(this.__wbg_ptr, isLikeNone(request) ? 0 : addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Adds a peer to the Kaspa node's list of known peers.
       * Returned information: None.
       * @see {@link IAddPeerRequest}, {@link IAddPeerResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IAddPeerRequest} request
       * @returns {Promise<IAddPeerResponse>}
       */
      addPeer(request) {
        const ret = wasm.rpcclient_addPeer(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Bans a peer from connecting to the Kaspa node for a specified duration.
       * Returned information: None.
       * @see {@link IBanRequest}, {@link IBanResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IBanRequest} request
       * @returns {Promise<IBanResponse>}
       */
      ban(request) {
        const ret = wasm.rpcclient_ban(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Estimates the network's current hash rate in hashes per second.
       * Returned information: Estimated network hashes per second.
       * @see {@link IEstimateNetworkHashesPerSecondRequest}, {@link IEstimateNetworkHashesPerSecondResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IEstimateNetworkHashesPerSecondRequest} request
       * @returns {Promise<IEstimateNetworkHashesPerSecondResponse>}
       */
      estimateNetworkHashesPerSecond(request) {
        const ret = wasm.rpcclient_estimateNetworkHashesPerSecond(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves the balance of a specific address in the Kaspa BlockDAG.
       * Returned information: Balance of the address.
       * @see {@link IGetBalanceByAddressRequest}, {@link IGetBalanceByAddressResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetBalanceByAddressRequest} request
       * @returns {Promise<IGetBalanceByAddressResponse>}
       */
      getBalanceByAddress(request) {
        const ret = wasm.rpcclient_getBalanceByAddress(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves balances for multiple addresses in the Kaspa BlockDAG.
       * Returned information: Balances of the addresses.
       * @see {@link IGetBalancesByAddressesRequest}, {@link IGetBalancesByAddressesResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetBalancesByAddressesRequest | Address[] | string[]} request
       * @returns {Promise<IGetBalancesByAddressesResponse>}
       */
      getBalancesByAddresses(request) {
        const ret = wasm.rpcclient_getBalancesByAddresses(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves a specific block from the Kaspa BlockDAG.
       * Returned information: Block information.
       * @see {@link IGetBlockRequest}, {@link IGetBlockResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetBlockRequest} request
       * @returns {Promise<IGetBlockResponse>}
       */
      getBlock(request) {
        const ret = wasm.rpcclient_getBlock(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves multiple blocks from the Kaspa BlockDAG.
       * Returned information: List of block information.
       * @see {@link IGetBlocksRequest}, {@link IGetBlocksResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetBlocksRequest} request
       * @returns {Promise<IGetBlocksResponse>}
       */
      getBlocks(request) {
        const ret = wasm.rpcclient_getBlocks(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Generates a new block template for mining.
       * Returned information: Block template information.
       * @see {@link IGetBlockTemplateRequest}, {@link IGetBlockTemplateResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetBlockTemplateRequest} request
       * @returns {Promise<IGetBlockTemplateResponse>}
       */
      getBlockTemplate(request) {
        const ret = wasm.rpcclient_getBlockTemplate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Checks if block is blue or not.
       * Returned information: Block blueness.
       * @see {@link IGetCurrentBlockColorRequest}, {@link IGetCurrentBlockColorResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetCurrentBlockColorRequest} request
       * @returns {Promise<IGetCurrentBlockColorResponse>}
       */
      getCurrentBlockColor(request) {
        const ret = wasm.rpcclient_getCurrentBlockColor(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves the estimated DAA (Difficulty Adjustment Algorithm)
       * score timestamp estimate.
       * Returned information: DAA score timestamp estimate.
       * @see {@link IGetDaaScoreTimestampEstimateRequest}, {@link IGetDaaScoreTimestampEstimateResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetDaaScoreTimestampEstimateRequest} request
       * @returns {Promise<IGetDaaScoreTimestampEstimateResponse>}
       */
      getDaaScoreTimestampEstimate(request) {
        const ret = wasm.rpcclient_getDaaScoreTimestampEstimate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Feerate estimates (experimental)
       * @see {@link IGetFeeEstimateExperimentalRequest}, {@link IGetFeeEstimateExperimentalResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetFeeEstimateExperimentalRequest} request
       * @returns {Promise<IGetFeeEstimateExperimentalResponse>}
       */
      getFeeEstimateExperimental(request) {
        const ret = wasm.rpcclient_getFeeEstimateExperimental(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves block headers from the Kaspa BlockDAG.
       * Returned information: List of block headers.
       * @see {@link IGetHeadersRequest}, {@link IGetHeadersResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetHeadersRequest} request
       * @returns {Promise<IGetHeadersResponse>}
       */
      getHeaders(request) {
        const ret = wasm.rpcclient_getHeaders(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves mempool entries from the Kaspa node's mempool.
       * Returned information: List of mempool entries.
       * @see {@link IGetMempoolEntriesRequest}, {@link IGetMempoolEntriesResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetMempoolEntriesRequest} request
       * @returns {Promise<IGetMempoolEntriesResponse>}
       */
      getMempoolEntries(request) {
        const ret = wasm.rpcclient_getMempoolEntries(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves mempool entries associated with specific addresses.
       * Returned information: List of mempool entries.
       * @see {@link IGetMempoolEntriesByAddressesRequest}, {@link IGetMempoolEntriesByAddressesResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetMempoolEntriesByAddressesRequest} request
       * @returns {Promise<IGetMempoolEntriesByAddressesResponse>}
       */
      getMempoolEntriesByAddresses(request) {
        const ret = wasm.rpcclient_getMempoolEntriesByAddresses(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves a specific mempool entry by transaction ID.
       * Returned information: Mempool entry information.
       * @see {@link IGetMempoolEntryRequest}, {@link IGetMempoolEntryResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetMempoolEntryRequest} request
       * @returns {Promise<IGetMempoolEntryResponse>}
       */
      getMempoolEntry(request) {
        const ret = wasm.rpcclient_getMempoolEntry(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves information about a subnetwork in the Kaspa BlockDAG.
       * Returned information: Subnetwork information.
       * @see {@link IGetSubnetworkRequest}, {@link IGetSubnetworkResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetSubnetworkRequest} request
       * @returns {Promise<IGetSubnetworkResponse>}
       */
      getSubnetwork(request) {
        const ret = wasm.rpcclient_getSubnetwork(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves unspent transaction outputs (UTXOs) associated with
       * specific addresses.
       * Returned information: List of UTXOs.
       * @see {@link IGetUtxosByAddressesRequest}, {@link IGetUtxosByAddressesResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetUtxosByAddressesRequest | Address[] | string[]} request
       * @returns {Promise<IGetUtxosByAddressesResponse>}
       */
      getUtxosByAddresses(request) {
        const ret = wasm.rpcclient_getUtxosByAddresses(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Retrieves the virtual chain corresponding to a specified block hash.
       * Returned information: Virtual chain information.
       * @see {@link IGetVirtualChainFromBlockRequest}, {@link IGetVirtualChainFromBlockResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IGetVirtualChainFromBlockRequest} request
       * @returns {Promise<IGetVirtualChainFromBlockResponse>}
       */
      getVirtualChainFromBlock(request) {
        const ret = wasm.rpcclient_getVirtualChainFromBlock(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Resolves a finality conflict in the Kaspa BlockDAG.
       * Returned information: None.
       * @see {@link IResolveFinalityConflictRequest}, {@link IResolveFinalityConflictResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IResolveFinalityConflictRequest} request
       * @returns {Promise<IResolveFinalityConflictResponse>}
       */
      resolveFinalityConflict(request) {
        const ret = wasm.rpcclient_resolveFinalityConflict(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Submits a block to the Kaspa network.
       * Returned information: None.
       * @see {@link ISubmitBlockRequest}, {@link ISubmitBlockResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {ISubmitBlockRequest} request
       * @returns {Promise<ISubmitBlockResponse>}
       */
      submitBlock(request) {
        const ret = wasm.rpcclient_submitBlock(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Submits a transaction to the Kaspa network.
       * Returned information: Submitted Transaction Id.
       * @see {@link ISubmitTransactionRequest}, {@link ISubmitTransactionResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {ISubmitTransactionRequest} request
       * @returns {Promise<ISubmitTransactionResponse>}
       */
      submitTransaction(request) {
        const ret = wasm.rpcclient_submitTransaction(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Submits an RBF transaction to the Kaspa network.
       * Returned information: Submitted Transaction Id, Transaction that was replaced.
       * @see {@link ISubmitTransactionReplacementRequest}, {@link ISubmitTransactionReplacementResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {ISubmitTransactionReplacementRequest} request
       * @returns {Promise<ISubmitTransactionReplacementResponse>}
       */
      submitTransactionReplacement(request) {
        const ret = wasm.rpcclient_submitTransactionReplacement(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Unbans a previously banned peer, allowing it to connect
       * to the Kaspa node again.
       * Returned information: None.
       * @see {@link IUnbanRequest}, {@link IUnbanResponse}
       * @throws `string` on an RPC error, a server-side error or when supplying incorrect arguments.
       * @param {IUnbanRequest} request
       * @returns {Promise<IUnbanResponse>}
       */
      unban(request) {
        const ret = wasm.rpcclient_unban(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * Manage subscription for a block added notification event.
       * Block added notification event is produced when a new
       * block is added to the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      subscribeBlockAdded() {
        const ret = wasm.rpcclient_subscribeBlockAdded(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      unsubscribeBlockAdded() {
        const ret = wasm.rpcclient_unsubscribeBlockAdded(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a finality conflict notification event.
       * Finality conflict notification event is produced when a finality
       * conflict occurs in the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      subscribeFinalityConflict() {
        const ret = wasm.rpcclient_subscribeFinalityConflict(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      unsubscribeFinalityConflict() {
        const ret = wasm.rpcclient_unsubscribeFinalityConflict(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a finality conflict resolved notification event.
       * Finality conflict resolved notification event is produced when a finality
       * conflict in the Kaspa BlockDAG is resolved.
       * @returns {Promise<void>}
       */
      subscribeFinalityConflictResolved() {
        const ret = wasm.rpcclient_subscribeFinalityConflictResolved(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      unsubscribeFinalityConflictResolved() {
        const ret = wasm.rpcclient_unsubscribeFinalityConflictResolved(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a sink blue score changed notification event.
       * Sink blue score changed notification event is produced when the blue
       * score of the sink block changes in the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      subscribeSinkBlueScoreChanged() {
        const ret = wasm.rpcclient_subscribeSinkBlueScoreChanged(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      unsubscribeSinkBlueScoreChanged() {
        const ret = wasm.rpcclient_unsubscribeSinkBlueScoreChanged(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a pruning point UTXO set override notification event.
       * Pruning point UTXO set override notification event is produced when the
       * UTXO set override for the pruning point changes in the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      subscribePruningPointUtxoSetOverride() {
        const ret = wasm.rpcclient_subscribePruningPointUtxoSetOverride(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      unsubscribePruningPointUtxoSetOverride() {
        const ret = wasm.rpcclient_unsubscribePruningPointUtxoSetOverride(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a new block template notification event.
       * New block template notification event is produced when a new block
       * template is generated for mining in the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      subscribeNewBlockTemplate() {
        const ret = wasm.rpcclient_subscribeNewBlockTemplate(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      unsubscribeNewBlockTemplate() {
        const ret = wasm.rpcclient_unsubscribeNewBlockTemplate(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a virtual DAA score changed notification event.
       * Virtual DAA score changed notification event is produced when the virtual
       * Difficulty Adjustment Algorithm (DAA) score changes in the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      subscribeVirtualDaaScoreChanged() {
        const ret = wasm.rpcclient_subscribeVirtualDaaScoreChanged(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a virtual DAA score changed notification event.
       * Virtual DAA score changed notification event is produced when the virtual
       * Difficulty Adjustment Algorithm (DAA) score changes in the Kaspa BlockDAG.
       * @returns {Promise<void>}
       */
      unsubscribeVirtualDaaScoreChanged() {
        const ret = wasm.rpcclient_unsubscribeVirtualDaaScoreChanged(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Subscribe for a UTXOs changed notification event.
       * UTXOs changed notification event is produced when the set
       * of unspent transaction outputs (UTXOs) changes in the
       * Kaspa BlockDAG. The event notification will be scoped to the
       * provided list of addresses.
       * @param {(Address | string)[]} addresses
       * @returns {Promise<void>}
       */
      subscribeUtxosChanged(addresses) {
        const ret = wasm.rpcclient_subscribeUtxosChanged(this.__wbg_ptr, addHeapObject(addresses));
        return takeObject(ret);
      }
      /**
       * Unsubscribe from UTXOs changed notification event
       * for a specific set of addresses.
       * @param {(Address | string)[]} addresses
       * @returns {Promise<void>}
       */
      unsubscribeUtxosChanged(addresses) {
        const ret = wasm.rpcclient_unsubscribeUtxosChanged(this.__wbg_ptr, addHeapObject(addresses));
        return takeObject(ret);
      }
      /**
       * Manage subscription for a virtual chain changed notification event.
       * Virtual chain changed notification event is produced when the virtual
       * chain changes in the Kaspa BlockDAG.
       * @param {boolean} include_accepted_transaction_ids
       * @returns {Promise<void>}
       */
      subscribeVirtualChainChanged(include_accepted_transaction_ids) {
        const ret = wasm.rpcclient_subscribeVirtualChainChanged(this.__wbg_ptr, include_accepted_transaction_ids);
        return takeObject(ret);
      }
      /**
       * Manage subscription for a virtual chain changed notification event.
       * Virtual chain changed notification event is produced when the virtual
       * chain changes in the Kaspa BlockDAG.
       * @param {boolean} include_accepted_transaction_ids
       * @returns {Promise<void>}
       */
      unsubscribeVirtualChainChanged(include_accepted_transaction_ids) {
        const ret = wasm.rpcclient_unsubscribeVirtualChainChanged(this.__wbg_ptr, include_accepted_transaction_ids);
        return takeObject(ret);
      }
      /**
       * @param {Encoding} encoding
       * @param {NetworkType | NetworkId | string} network
       * @returns {number}
       */
      static defaultPort(encoding, network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_defaultPort(retptr, encoding, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return r0;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Constructs an WebSocket RPC URL given the partial URL or an IP, RPC encoding
       * and a network type.
       *
       * # Arguments
       *
       * * `url` - Partial URL or an IP address
       * * `encoding` - RPC encoding
       * * `network_type` - Network type
       * @param {string} url
       * @param {Encoding} encoding
       * @param {NetworkId} network
       * @returns {string}
       */
      static parseUrl(url, encoding, network) {
        let deferred4_0;
        let deferred4_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(url, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          _assertClass(network, NetworkId);
          var ptr1 = network.__destroy_into_raw();
          wasm.rpcclient_parseUrl(retptr, ptr0, len0, encoding, ptr1);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr3 = r0;
          var len3 = r1;
          if (r3) {
            ptr3 = 0;
            len3 = 0;
            throw takeObject(r2);
          }
          deferred4_0 = ptr3;
          deferred4_1 = len3;
          return getStringFromWasm0(ptr3, len3);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred4_0, deferred4_1, 1);
        }
      }
      /**
       *
       * Create a new RPC client with optional {@link Encoding} and a `url`.
       *
       * @see {@link IRpcConfig} interface for more details.
       * @param {IRpcConfig | null} [config]
       */
      constructor(config) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_ctor(retptr, isLikeNone(config) ? 0 : addHeapObject(config));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          RpcClientFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * The current URL of the RPC client.
       * @returns {string | undefined}
       */
      get url() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_url(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Current rpc resolver
       * @returns {Resolver | undefined}
       */
      get resolver() {
        const ret = wasm.rpcclient_resolver(this.__wbg_ptr);
        return ret === 0 ? void 0 : Resolver.__wrap(ret);
      }
      /**
       * Set the resolver for the RPC client.
       * This setting will take effect on the next connection.
       * @param {Resolver} resolver
       */
      setResolver(resolver) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertClass(resolver, Resolver);
          var ptr0 = resolver.__destroy_into_raw();
          wasm.rpcclient_setResolver(retptr, this.__wbg_ptr, ptr0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Set the network id for the RPC client.
       * This setting will take effect on the next connection.
       * @param {NetworkId | string} network_id
       */
      setNetworkId(network_id) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_setNetworkId(retptr, this.__wbg_ptr, addBorrowedObject(network_id));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * The current connection status of the RPC client.
       * @returns {boolean}
       */
      get isConnected() {
        const ret = wasm.rpcclient_isConnected(this.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * The current protocol encoding.
       * @returns {string}
       */
      get encoding() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_encoding(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Optional: Resolver node id.
       * @returns {string | undefined}
       */
      get nodeId() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_nodeId(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Connect to the Kaspa RPC server. This function starts a background
       * task that connects and reconnects to the server if the connection
       * is terminated.  Use [`disconnect()`](Self::disconnect()) to
       * terminate the connection.
       * @see {@link IConnectOptions} interface for more details.
       * @param {IConnectOptions | undefined | null} [args]
       * @returns {Promise<void>}
       */
      connect(args) {
        const ret = wasm.rpcclient_connect(this.__wbg_ptr, isLikeNone(args) ? 0 : addHeapObject(args));
        return takeObject(ret);
      }
      /**
       * Disconnect from the Kaspa RPC server.
       * @returns {Promise<void>}
       */
      disconnect() {
        const ret = wasm.rpcclient_disconnect(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Start background RPC services (automatically started when invoking {@link RpcClient.connect}).
       * @returns {Promise<void>}
       */
      start() {
        const ret = wasm.rpcclient_start(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Stop background RPC services (automatically stopped when invoking {@link RpcClient.disconnect}).
       * @returns {Promise<void>}
       */
      stop() {
        const ret = wasm.rpcclient_stop(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Triggers a disconnection on the underlying WebSocket
       * if the WebSocket is in connected state.
       * This is intended for debug purposes only.
       * Can be used to test application reconnection logic.
       */
      triggerAbort() {
        wasm.rpcclient_triggerAbort(this.__wbg_ptr);
      }
      /**
       *
       * Register an event listener callback.
       *
       * Registers a callback function to be executed when a specific event occurs.
       * The callback function will receive an {@link RpcEvent} object with the event `type` and `data`.
       *
       * **RPC Subscriptions vs Event Listeners**
       *
       * Subscriptions are used to receive notifications from the RPC client.
       * Event listeners are client-side application registrations that are
       * triggered when notifications are received.
       *
       * If node is disconnected, upon reconnection you do not need to re-register event listeners,
       * however, you have to re-subscribe for Kaspa node notifications. As such, it is recommended
       * to register event listeners when the RPC `open` event is received.
       *
       * ```javascript
       * rpc.addEventListener("connect", async (event) => {
       *     console.log("Connected to", rpc.url);
       *     await rpc.subscribeDaaScore();
       *     // ... perform wallet address subscriptions
       * });
       * ```
       *
       * **Multiple events and listeners**
       *
       * `addEventListener` can be used to register multiple event listeners for the same event
       * as well as the same event listener for multiple events.
       *
       * ```javascript
       * // Registering a single event listener for multiple events:
       * rpc.addEventListener(["connect", "disconnect"], (event) => {
       *     console.log(event);
       * });
       *
       * // Registering event listener for all events:
       * // (by omitting the event type)
       * rpc.addEventListener((event) => {
       *     console.log(event);
       * });
       *
       * // Registering multiple event listeners for the same event:
       * rpc.addEventListener("connect", (event) => { // first listener
       *     console.log(event);
       * });
       * rpc.addEventListener("connect", (event) => { // second listener
       *     console.log(event);
       * });
       * ```
       *
       * **Use of context objects**
       *
       * You can also register an event with a `context` object. When the event is triggered,
       * the `handleEvent` method of the `context` object will be called while `this` value
       * will be set to the `context` object.
       * ```javascript
       * // Registering events with a context object:
       *
       * const context = {
       *     someProperty: "someValue",
       *     handleEvent: (event) => {
       *         // the following will log "someValue"
       *         console.log(this.someProperty);
       *         console.log(event);
       *     }
       * };
       * rpc.addEventListener(["connect","disconnect"], context);
       *
       * ```
       *
       * **General use examples**
       *
       * In TypeScript you can use {@link RpcEventType} enum (such as `RpcEventType.Connect`)
       * or `string` (such as "connect") to register event listeners.
       * In JavaScript you can only use `string`.
       *
       * ```typescript
       * // Example usage (TypeScript):
       *
       * rpc.addEventListener(RpcEventType.Connect, (event) => {
       *     console.log("Connected to", rpc.url);
       * });
       *
       * rpc.addEventListener(RpcEventType.VirtualDaaScoreChanged, (event) => {
       *     console.log(event.type,event.data);
       * });
       * await rpc.subscribeDaaScore();
       *
       * rpc.addEventListener(RpcEventType.BlockAdded, (event) => {
       *     console.log(event.type,event.data);
       * });
       * await rpc.subscribeBlockAdded();
       *
       * // Example usage (JavaScript):
       *
       * rpc.addEventListener("virtual-daa-score-changed", (event) => {
       *     console.log(event.type,event.data);
       * });
       *
       * await rpc.subscribeDaaScore();
       * rpc.addEventListener("block-added", (event) => {
       *     console.log(event.type,event.data);
       * });
       * await rpc.subscribeBlockAdded();
       * ```
       *
       * @see {@link RpcEventType} for a list of supported events.
       * @see {@link RpcEventData} for the event data interface specification.
       * @see {@link RpcClient.removeEventListener}, {@link RpcClient.removeAllEventListeners}
       * @param {RpcEventType | string | RpcEventCallback} event
       * @param {RpcEventCallback | null} [callback]
       */
      addEventListener(event, callback) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_addEventListener(retptr, this.__wbg_ptr, addHeapObject(event), isLikeNone(callback) ? 0 : addHeapObject(callback));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       *
       * Unregister an event listener.
       * This function will remove the callback for the specified event.
       * If the `callback` is not supplied, all callbacks will be
       * removed for the specified event.
       *
       * @see {@link RpcClient.addEventListener}
       * @param {RpcEventType | string} event
       * @param {RpcEventCallback | null} [callback]
       */
      removeEventListener(event, callback) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_removeEventListener(retptr, this.__wbg_ptr, addHeapObject(event), isLikeNone(callback) ? 0 : addHeapObject(callback));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       *
       * Unregister a single event listener callback from all events.
       *
       *
       * @param {RpcEventCallback} callback
       */
      clearEventListener(callback) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_clearEventListener(retptr, this.__wbg_ptr, addHeapObject(callback));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       *
       * Unregister all notification callbacks for all events.
       */
      removeAllEventListeners() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.rpcclient_removeAllEventListeners(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    ScriptBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_scriptbuilder_free(ptr >>> 0, 1));
    ScriptPublicKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_scriptpublickey_free(ptr >>> 0, 1));
    ScriptPublicKey = class _ScriptPublicKey {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_ScriptPublicKey.prototype);
        obj.__wbg_ptr = ptr;
        ScriptPublicKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          version: this.version,
          script: this.script
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ScriptPublicKeyFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_scriptpublickey_free(ptr, 0);
      }
      /**
       * @returns {number}
       */
      get version() {
        const ret = wasm.__wbg_get_scriptpublickey_version(this.__wbg_ptr);
        return ret;
      }
      /**
       * @param {number} arg0
       */
      set version(arg0) {
        wasm.__wbg_set_scriptpublickey_version(this.__wbg_ptr, arg0);
      }
      /**
       * @param {number} version
       * @param {any} script
       */
      constructor(version, script) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.scriptpublickey_constructor(retptr, version, addHeapObject(script));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          ScriptPublicKeyFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {string}
       */
      get script() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.scriptpublickey_script_as_hex(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    SetAadOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_setaadoptions_free(ptr >>> 0, 1));
    SigHashTypeFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_sighashtype_free(ptr >>> 0, 1));
    StorageFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_storage_free(ptr >>> 0, 1));
    StreamTransformOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_streamtransformoptions_free(ptr >>> 0, 1));
    TransactionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transaction_free(ptr >>> 0, 1));
    Transaction = class _Transaction {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_Transaction.prototype);
        obj.__wbg_ptr = ptr;
        TransactionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          id: this.id,
          inputs: this.inputs,
          outputs: this.outputs,
          version: this.version,
          lockTime: this.lockTime,
          gas: this.gas,
          subnetworkId: this.subnetworkId,
          payload: this.payload,
          mass: this.mass
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransactionFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transaction_free(ptr, 0);
      }
      /**
       * Determines whether or not a transaction is a coinbase transaction. A coinbase
       * transaction is a special transaction created by miners that distributes fees and block subsidy
       * to the previous blocks' miners, and specifies the script_pub_key that will be used to pay the current
       * miner in future blocks.
       * @returns {boolean}
       */
      is_coinbase() {
        const ret = wasm.transaction_is_coinbase(this.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * Recompute and finalize the tx id based on updated tx fields
       * @returns {Hash}
       */
      finalize() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_finalize(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Hash.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Returns the transaction ID
       * @returns {string}
       */
      get id() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_id(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {ITransaction | Transaction} js_value
       */
      constructor(js_value) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_constructor(retptr, addBorrowedObject(js_value));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          TransactionFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {TransactionInput[]}
       */
      get inputs() {
        const ret = wasm.transaction_get_inputs_as_js_array(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * Returns a list of unique addresses used by transaction inputs.
       * This method can be used to determine addresses used by transaction inputs
       * in order to select private keys needed for transaction signing.
       * @param {NetworkType | NetworkId | string} network_type
       * @returns {Address[]}
       */
      addresses(network_type) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_addresses(retptr, this.__wbg_ptr, addBorrowedObject(network_type));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @param {(ITransactionInput | TransactionInput)[]} js_value
       */
      set inputs(js_value) {
        try {
          wasm.transaction_set_inputs_from_js_array(this.__wbg_ptr, addBorrowedObject(js_value));
        } finally {
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {TransactionOutput[]}
       */
      get outputs() {
        const ret = wasm.transaction_get_outputs_as_js_array(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @param {(ITransactionOutput | TransactionOutput)[]} js_value
       */
      set outputs(js_value) {
        try {
          wasm.transaction_set_outputs_from_js_array(this.__wbg_ptr, addBorrowedObject(js_value));
        } finally {
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {number}
       */
      get version() {
        const ret = wasm.transaction_version(this.__wbg_ptr);
        return ret;
      }
      /**
       * @param {number} v
       */
      set version(v) {
        wasm.transaction_set_version(this.__wbg_ptr, v);
      }
      /**
       * @returns {bigint}
       */
      get lockTime() {
        const ret = wasm.transaction_lockTime(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} v
       */
      set lockTime(v) {
        wasm.transaction_set_lockTime(this.__wbg_ptr, v);
      }
      /**
       * @returns {bigint}
       */
      get gas() {
        const ret = wasm.transaction_gas(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} v
       */
      set gas(v) {
        wasm.transaction_set_gas(this.__wbg_ptr, v);
      }
      /**
       * @returns {string}
       */
      get subnetworkId() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_get_subnetwork_id_as_hex(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {any} js_value
       */
      set subnetworkId(js_value) {
        wasm.transaction_set_subnetwork_id_from_js_value(this.__wbg_ptr, addHeapObject(js_value));
      }
      /**
       * @returns {string}
       */
      get payload() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_get_payload_as_hex_string(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {any} js_value
       */
      set payload(js_value) {
        wasm.transaction_set_payload_from_js_value(this.__wbg_ptr, addHeapObject(js_value));
      }
      /**
       * @returns {bigint}
       */
      get mass() {
        const ret = wasm.transaction_get_mass(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} v
       */
      set mass(v) {
        wasm.transaction_set_mass(this.__wbg_ptr, v);
      }
      /**
       * Serializes the transaction to a pure JavaScript Object.
       * The schema of the JavaScript object is defined by {@link ISerializableTransaction}.
       * @see {@link ISerializableTransaction}
       * @returns {ISerializableTransaction}
       */
      serializeToObject() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_serializeToObject(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Serializes the transaction to a JSON string.
       * The schema of the JSON is defined by {@link ISerializableTransaction}.
       * @returns {string}
       */
      serializeToJSON() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_serializeToJSON(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * Serializes the transaction to a "Safe" JSON schema where it converts all `bigint` values to `string` to avoid potential client-side precision loss.
       * @returns {string}
       */
      serializeToSafeJSON() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_serializeToSafeJSON(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * Deserialize the {@link Transaction} Object from a pure JavaScript Object.
       * @param {any} js_value
       * @returns {Transaction}
       */
      static deserializeFromObject(js_value) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transaction_deserializeFromObject(retptr, addBorrowedObject(js_value));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _Transaction.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Deserialize the {@link Transaction} Object from a JSON string.
       * @param {string} json
       * @returns {Transaction}
       */
      static deserializeFromJSON(json) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(json, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.transaction_deserializeFromJSON(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _Transaction.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Deserialize the {@link Transaction} Object from a "Safe" JSON schema where all `bigint` values are represented as `string`.
       * @param {string} json
       * @returns {Transaction}
       */
      static deserializeFromSafeJSON(json) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(json, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.transaction_deserializeFromSafeJSON(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _Transaction.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    TransactionInputFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactioninput_free(ptr >>> 0, 1));
    TransactionInput = class _TransactionInput {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TransactionInput.prototype);
        obj.__wbg_ptr = ptr;
        TransactionInputFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          previousOutpoint: this.previousOutpoint,
          signatureScript: this.signatureScript,
          sequence: this.sequence,
          sigOpCount: this.sigOpCount,
          utxo: this.utxo
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransactionInputFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transactioninput_free(ptr, 0);
      }
      /**
       * @param {ITransactionInput | TransactionInput} value
       */
      constructor(value) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactioninput_constructor(retptr, addBorrowedObject(value));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          TransactionInputFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {TransactionOutpoint}
       */
      get previousOutpoint() {
        const ret = wasm.transactioninput_get_previous_outpoint(this.__wbg_ptr);
        return TransactionOutpoint.__wrap(ret);
      }
      /**
       * @param {any} js_value
       */
      set previousOutpoint(js_value) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactioninput_set_previous_outpoint(retptr, this.__wbg_ptr, addBorrowedObject(js_value));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @returns {string | undefined}
       */
      get signatureScript() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactioninput_get_signature_script_as_hex(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} js_value
       */
      set signatureScript(js_value) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactioninput_set_signature_script_from_js_value(retptr, this.__wbg_ptr, addHeapObject(js_value));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {bigint}
       */
      get sequence() {
        const ret = wasm.transactioninput_get_sequence(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} sequence
       */
      set sequence(sequence) {
        wasm.transactioninput_set_sequence(this.__wbg_ptr, sequence);
      }
      /**
       * @returns {number}
       */
      get sigOpCount() {
        const ret = wasm.transactioninput_get_sig_op_count(this.__wbg_ptr);
        return ret;
      }
      /**
       * @param {number} sig_op_count
       */
      set sigOpCount(sig_op_count) {
        wasm.transactioninput_set_sig_op_count(this.__wbg_ptr, sig_op_count);
      }
      /**
       * @returns {UtxoEntryReference | undefined}
       */
      get utxo() {
        const ret = wasm.transactioninput_get_utxo(this.__wbg_ptr);
        return ret === 0 ? void 0 : UtxoEntryReference.__wrap(ret);
      }
    };
    TransactionOutpointFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionoutpoint_free(ptr >>> 0, 1));
    TransactionOutpoint = class _TransactionOutpoint {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TransactionOutpoint.prototype);
        obj.__wbg_ptr = ptr;
        TransactionOutpointFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          transactionId: this.transactionId,
          index: this.index
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransactionOutpointFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transactionoutpoint_free(ptr, 0);
      }
      /**
       * @param {Hash} transaction_id
       * @param {number} index
       */
      constructor(transaction_id, index) {
        _assertClass(transaction_id, Hash);
        var ptr0 = transaction_id.__destroy_into_raw();
        const ret = wasm.transactionoutpoint_ctor(ptr0, index);
        this.__wbg_ptr = ret >>> 0;
        TransactionOutpointFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @returns {string}
       */
      getId() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactionoutpoint_getId(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      get transactionId() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactionoutpoint_transactionId(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {number}
       */
      get index() {
        const ret = wasm.transactionoutpoint_index(this.__wbg_ptr);
        return ret >>> 0;
      }
    };
    TransactionOutputFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionoutput_free(ptr >>> 0, 1));
    TransactionOutput = class _TransactionOutput {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TransactionOutput.prototype);
        obj.__wbg_ptr = ptr;
        TransactionOutputFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          value: this.value,
          scriptPublicKey: this.scriptPublicKey
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransactionOutputFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transactionoutput_free(ptr, 0);
      }
      /**
       * TransactionOutput constructor
       * @param {bigint} value
       * @param {ScriptPublicKey} script_public_key
       */
      constructor(value, script_public_key) {
        _assertClass(script_public_key, ScriptPublicKey);
        const ret = wasm.transactionoutput_ctor(value, script_public_key.__wbg_ptr);
        this.__wbg_ptr = ret >>> 0;
        TransactionOutputFinalization.register(this, this.__wbg_ptr, this);
        return this;
      }
      /**
       * @returns {bigint}
       */
      get value() {
        const ret = wasm.transactionoutput_value(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} v
       */
      set value(v) {
        wasm.transactionoutput_set_value(this.__wbg_ptr, v);
      }
      /**
       * @returns {ScriptPublicKey}
       */
      get scriptPublicKey() {
        const ret = wasm.transactionoutput_scriptPublicKey(this.__wbg_ptr);
        return ScriptPublicKey.__wrap(ret);
      }
      /**
       * @param {ScriptPublicKey} v
       */
      set scriptPublicKey(v) {
        _assertClass(v, ScriptPublicKey);
        wasm.transactionoutput_set_scriptPublicKey(this.__wbg_ptr, v.__wbg_ptr);
      }
    };
    TransactionRecordFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionrecord_free(ptr >>> 0, 1));
    TransactionRecord = class _TransactionRecord {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TransactionRecord.prototype);
        obj.__wbg_ptr = ptr;
        TransactionRecordFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          id: this.id,
          unixtimeMsec: this.unixtimeMsec,
          network: this.network,
          note: this.note,
          metadata: this.metadata,
          value: this.value,
          blockDaaScore: this.blockDaaScore,
          binding: this.binding,
          data: this.data,
          type: this.type
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransactionRecordFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transactionrecord_free(ptr, 0);
      }
      /**
       * @returns {Hash}
       */
      get id() {
        const ret = wasm.__wbg_get_transactionrecord_id(this.__wbg_ptr);
        return Hash.__wrap(ret);
      }
      /**
       * @param {Hash} arg0
       */
      set id(arg0) {
        _assertClass(arg0, Hash);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_transactionrecord_id(this.__wbg_ptr, ptr0);
      }
      /**
       * Unix time in milliseconds
       * @returns {bigint | undefined}
       */
      get unixtimeMsec() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_transactionrecord_unixtimeMsec(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r2 = getDataViewMemory0().getBigInt64(retptr + 8 * 1, true);
          return r0 === 0 ? void 0 : BigInt.asUintN(64, r2);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Unix time in milliseconds
       * @param {bigint | null} [arg0]
       */
      set unixtimeMsec(arg0) {
        wasm.__wbg_set_transactionrecord_unixtimeMsec(this.__wbg_ptr, !isLikeNone(arg0), isLikeNone(arg0) ? BigInt(0) : arg0);
      }
      /**
       * @returns {NetworkId}
       */
      get network() {
        const ret = wasm.__wbg_get_transactionrecord_network(this.__wbg_ptr);
        return NetworkId.__wrap(ret);
      }
      /**
       * @param {NetworkId} arg0
       */
      set network(arg0) {
        _assertClass(arg0, NetworkId);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_transactionrecord_network(this.__wbg_ptr, ptr0);
      }
      /**
       * @returns {string | undefined}
       */
      get note() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_transactionrecord_note(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [arg0]
       */
      set note(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactionrecord_note(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {string | undefined}
       */
      get metadata() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_transactionrecord_metadata(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [arg0]
       */
      set metadata(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactionrecord_metadata(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @param {bigint} currentDaaScore
       * @returns {string}
       */
      maturityProgress(currentDaaScore) {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactionrecord_maturityProgress(retptr, this.__wbg_ptr, addHeapObject(currentDaaScore));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {bigint}
       */
      get value() {
        const ret = wasm.transactionrecord_value(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {bigint}
       */
      get blockDaaScore() {
        const ret = wasm.transactionrecord_blockDaaScore(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {IBinding}
       */
      get binding() {
        const ret = wasm.transactionrecord_binding(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {ITransactionData}
       */
      get data() {
        const ret = wasm.transactionrecord_data(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {string}
       */
      get type() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.transactionrecord_type(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Check if the transaction record has the given address within the associated UTXO set.
       * @param {Address} address
       * @returns {boolean}
       */
      hasAddress(address) {
        _assertClass(address, Address);
        const ret = wasm.transactionrecord_hasAddress(this.__wbg_ptr, address.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * Serialize the transaction record to a JavaScript object.
       * @returns {any}
       */
      serialize() {
        const ret = wasm.transactionrecord_serialize(this.__wbg_ptr);
        return takeObject(ret);
      }
    };
    TransactionRecordNotificationFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionrecordnotification_free(ptr >>> 0, 1));
    TransactionRecordNotification = class _TransactionRecordNotification {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_TransactionRecordNotification.prototype);
        obj.__wbg_ptr = ptr;
        TransactionRecordNotificationFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          type: this.type,
          data: this.data
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TransactionRecordNotificationFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_transactionrecordnotification_free(ptr, 0);
      }
      /**
       * @returns {string}
       */
      get type() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_transactionrecordnotification_type(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {string} arg0
       */
      set type(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_transactionrecordnotification_type(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {TransactionRecord}
       */
      get data() {
        const ret = wasm.__wbg_get_transactionrecordnotification_data(this.__wbg_ptr);
        return TransactionRecord.__wrap(ret);
      }
      /**
       * @param {TransactionRecord} arg0
       */
      set data(arg0) {
        _assertClass(arg0, TransactionRecord);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_transactionrecordnotification_data(this.__wbg_ptr, ptr0);
      }
    };
    TransactionSigningHashFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionsigninghash_free(ptr >>> 0, 1));
    TransactionSigningHashECDSAFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionsigninghashecdsa_free(ptr >>> 0, 1));
    TransactionUtxoEntryFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_transactionutxoentry_free(ptr >>> 0, 1));
    UserInfoOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_userinfooptions_free(ptr >>> 0, 1));
    UtxoContextFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_utxocontext_free(ptr >>> 0, 1));
    UtxoEntriesFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_utxoentries_free(ptr >>> 0, 1));
    UtxoEntryFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_utxoentry_free(ptr >>> 0, 1));
    UtxoEntry = class _UtxoEntry {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_UtxoEntry.prototype);
        obj.__wbg_ptr = ptr;
        UtxoEntryFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          address: this.address,
          outpoint: this.outpoint,
          amount: this.amount,
          scriptPublicKey: this.scriptPublicKey,
          blockDaaScore: this.blockDaaScore,
          isCoinbase: this.isCoinbase
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        UtxoEntryFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_utxoentry_free(ptr, 0);
      }
      /**
       * @returns {Address | undefined}
       */
      get address() {
        const ret = wasm.__wbg_get_utxoentry_address(this.__wbg_ptr);
        return ret === 0 ? void 0 : Address.__wrap(ret);
      }
      /**
       * @param {Address | null} [arg0]
       */
      set address(arg0) {
        let ptr0 = 0;
        if (!isLikeNone(arg0)) {
          _assertClass(arg0, Address);
          ptr0 = arg0.__destroy_into_raw();
        }
        wasm.__wbg_set_utxoentry_address(this.__wbg_ptr, ptr0);
      }
      /**
       * @returns {TransactionOutpoint}
       */
      get outpoint() {
        const ret = wasm.__wbg_get_utxoentry_outpoint(this.__wbg_ptr);
        return TransactionOutpoint.__wrap(ret);
      }
      /**
       * @param {TransactionOutpoint} arg0
       */
      set outpoint(arg0) {
        _assertClass(arg0, TransactionOutpoint);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_utxoentry_outpoint(this.__wbg_ptr, ptr0);
      }
      /**
       * @returns {bigint}
       */
      get amount() {
        const ret = wasm.__wbg_get_utxoentry_amount(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} arg0
       */
      set amount(arg0) {
        wasm.__wbg_set_utxoentry_amount(this.__wbg_ptr, arg0);
      }
      /**
       * @returns {ScriptPublicKey}
       */
      get scriptPublicKey() {
        const ret = wasm.__wbg_get_utxoentry_scriptPublicKey(this.__wbg_ptr);
        return ScriptPublicKey.__wrap(ret);
      }
      /**
       * @param {ScriptPublicKey} arg0
       */
      set scriptPublicKey(arg0) {
        _assertClass(arg0, ScriptPublicKey);
        var ptr0 = arg0.__destroy_into_raw();
        wasm.__wbg_set_utxoentry_scriptPublicKey(this.__wbg_ptr, ptr0);
      }
      /**
       * @returns {bigint}
       */
      get blockDaaScore() {
        const ret = wasm.__wbg_get_utxoentry_blockDaaScore(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @param {bigint} arg0
       */
      set blockDaaScore(arg0) {
        wasm.__wbg_set_utxoentry_blockDaaScore(this.__wbg_ptr, arg0);
      }
      /**
       * @returns {boolean}
       */
      get isCoinbase() {
        const ret = wasm.__wbg_get_utxoentry_isCoinbase(this.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * @param {boolean} arg0
       */
      set isCoinbase(arg0) {
        wasm.__wbg_set_utxoentry_isCoinbase(this.__wbg_ptr, arg0);
      }
      /**
       * @returns {string}
       */
      toString() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.utxoentry_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    UtxoEntryReferenceFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_utxoentryreference_free(ptr >>> 0, 1));
    UtxoEntryReference = class _UtxoEntryReference {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_UtxoEntryReference.prototype);
        obj.__wbg_ptr = ptr;
        UtxoEntryReferenceFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          entry: this.entry,
          outpoint: this.outpoint,
          address: this.address,
          amount: this.amount,
          isCoinbase: this.isCoinbase,
          blockDaaScore: this.blockDaaScore,
          scriptPublicKey: this.scriptPublicKey
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        UtxoEntryReferenceFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_utxoentryreference_free(ptr, 0);
      }
      /**
       * @returns {string}
       */
      toString() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.utxoentryreference_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return takeObject(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {UtxoEntry}
       */
      get entry() {
        const ret = wasm.utxoentryreference_entry(this.__wbg_ptr);
        return UtxoEntry.__wrap(ret);
      }
      /**
       * @returns {TransactionOutpoint}
       */
      get outpoint() {
        const ret = wasm.utxoentryreference_outpoint(this.__wbg_ptr);
        return TransactionOutpoint.__wrap(ret);
      }
      /**
       * @returns {Address | undefined}
       */
      get address() {
        const ret = wasm.utxoentryreference_address(this.__wbg_ptr);
        return ret === 0 ? void 0 : Address.__wrap(ret);
      }
      /**
       * @returns {bigint}
       */
      get amount() {
        const ret = wasm.utxoentryreference_amount(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @returns {boolean}
       */
      get isCoinbase() {
        const ret = wasm.utxoentryreference_isCoinbase(this.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * @returns {bigint}
       */
      get blockDaaScore() {
        const ret = wasm.utxoentryreference_blockDaaScore(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
      }
      /**
       * @returns {ScriptPublicKey}
       */
      get scriptPublicKey() {
        const ret = wasm.utxoentryreference_scriptPublicKey(this.__wbg_ptr);
        return ScriptPublicKey.__wrap(ret);
      }
    };
    UtxoProcessorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_utxoprocessor_free(ptr >>> 0, 1));
    WalletFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_wallet_free(ptr >>> 0, 1));
    Wallet = class {
      toJSON() {
        return {
          rpc: this.rpc,
          isOpen: this.isOpen,
          isSynced: this.isSynced,
          descriptor: this.descriptor
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wallet_free(ptr, 0);
      }
      /**
       * @param {IWalletConfig} config
       */
      constructor(config) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.wallet_constructor(retptr, addHeapObject(config));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          WalletFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {RpcClient}
       */
      get rpc() {
        const ret = wasm.wallet_rpc(this.__wbg_ptr);
        return RpcClient.__wrap(ret);
      }
      /**
       * @remarks This is a local property indicating
       * if the wallet is currently open.
       * @returns {boolean}
       */
      get isOpen() {
        const ret = wasm.wallet_isOpen(this.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * @remarks This is a local property indicating
       * if the node is currently synced.
       * @returns {boolean}
       */
      get isSynced() {
        const ret = wasm.wallet_isSynced(this.__wbg_ptr);
        return ret !== 0;
      }
      /**
       * @returns {WalletDescriptor | undefined}
       */
      get descriptor() {
        const ret = wasm.wallet_descriptor(this.__wbg_ptr);
        return ret === 0 ? void 0 : WalletDescriptor.__wrap(ret);
      }
      /**
       * Check if a wallet with a given name exists.
       * @param {string | null} [name]
       * @returns {Promise<boolean>}
       */
      exists(name) {
        var ptr0 = isLikeNone(name) ? 0 : passStringToWasm0(name, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_exists(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      start() {
        const ret = wasm.wallet_start(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      stop() {
        const ret = wasm.wallet_stop(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @param {IConnectOptions | undefined | null} [args]
       * @returns {Promise<void>}
       */
      connect(args) {
        const ret = wasm.wallet_connect(this.__wbg_ptr, isLikeNone(args) ? 0 : addHeapObject(args));
        return takeObject(ret);
      }
      /**
       * @returns {Promise<void>}
       */
      disconnect() {
        const ret = wasm.wallet_disconnect(this.__wbg_ptr);
        return takeObject(ret);
      }
      /**
       * @param {string | WalletNotificationCallback} event
       * @param {WalletNotificationCallback | null} [callback]
       */
      addEventListener(event, callback) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.wallet_addEventListener(retptr, this.__wbg_ptr, addHeapObject(event), isLikeNone(callback) ? 0 : addHeapObject(callback));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {WalletEventType | WalletEventType[] | string | string[]} event
       * @param {WalletNotificationCallback | null} [callback]
       */
      removeEventListener(event, callback) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.wallet_removeEventListener(retptr, this.__wbg_ptr, addHeapObject(event), isLikeNone(callback) ? 0 : addHeapObject(callback));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {NetworkId | string} network_id
       */
      setNetworkId(network_id) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.wallet_setNetworkId(retptr, this.__wbg_ptr, addHeapObject(network_id));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          if (r1) {
            throw takeObject(r0);
          }
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Ping backend
       * @see {@link IBatchRequest} {@link IBatchResponse}
       * @throws `string` in case of an error.
       * @param {IBatchRequest} request
       * @returns {Promise<IBatchResponse>}
       */
      batch(request) {
        const ret = wasm.wallet_batch(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IFlushRequest} {@link IFlushResponse}
       * @throws `string` in case of an error.
       * @param {IFlushRequest} request
       * @returns {Promise<IFlushResponse>}
       */
      flush(request) {
        const ret = wasm.wallet_flush(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IRetainContextRequest} {@link IRetainContextResponse}
       * @throws `string` in case of an error.
       * @param {IRetainContextRequest} request
       * @returns {Promise<IRetainContextResponse>}
       */
      retainContext(request) {
        const ret = wasm.wallet_retainContext(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IGetStatusRequest} {@link IGetStatusResponse}
       * @throws `string` in case of an error.
       * @param {IGetStatusRequest} request
       * @returns {Promise<IGetStatusResponse>}
       */
      getStatus(request) {
        const ret = wasm.wallet_getStatus(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletEnumerateRequest} {@link IWalletEnumerateResponse}
       * @throws `string` in case of an error.
       * @param {IWalletEnumerateRequest} request
       * @returns {Promise<IWalletEnumerateResponse>}
       */
      walletEnumerate(request) {
        const ret = wasm.wallet_walletEnumerate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletCreateRequest} {@link IWalletCreateResponse}
       * @throws `string` in case of an error.
       * @param {IWalletCreateRequest} request
       * @returns {Promise<IWalletCreateResponse>}
       */
      walletCreate(request) {
        const ret = wasm.wallet_walletCreate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletOpenRequest} {@link IWalletOpenResponse}
       * @throws `string` in case of an error.
       * @param {IWalletOpenRequest} request
       * @returns {Promise<IWalletOpenResponse>}
       */
      walletOpen(request) {
        const ret = wasm.wallet_walletOpen(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletReloadRequest} {@link IWalletReloadResponse}
       * @throws `string` in case of an error.
       * @param {IWalletReloadRequest} request
       * @returns {Promise<IWalletReloadResponse>}
       */
      walletReload(request) {
        const ret = wasm.wallet_walletReload(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletCloseRequest} {@link IWalletCloseResponse}
       * @throws `string` in case of an error.
       * @param {IWalletCloseRequest} request
       * @returns {Promise<IWalletCloseResponse>}
       */
      walletClose(request) {
        const ret = wasm.wallet_walletClose(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletChangeSecretRequest} {@link IWalletChangeSecretResponse}
       * @throws `string` in case of an error.
       * @param {IWalletChangeSecretRequest} request
       * @returns {Promise<IWalletChangeSecretResponse>}
       */
      walletChangeSecret(request) {
        const ret = wasm.wallet_walletChangeSecret(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletExportRequest} {@link IWalletExportResponse}
       * @throws `string` in case of an error.
       * @param {IWalletExportRequest} request
       * @returns {Promise<IWalletExportResponse>}
       */
      walletExport(request) {
        const ret = wasm.wallet_walletExport(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IWalletImportRequest} {@link IWalletImportResponse}
       * @throws `string` in case of an error.
       * @param {IWalletImportRequest} request
       * @returns {Promise<IWalletImportResponse>}
       */
      walletImport(request) {
        const ret = wasm.wallet_walletImport(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IPrvKeyDataEnumerateRequest} {@link IPrvKeyDataEnumerateResponse}
       * @throws `string` in case of an error.
       * @param {IPrvKeyDataEnumerateRequest} request
       * @returns {Promise<IPrvKeyDataEnumerateResponse>}
       */
      prvKeyDataEnumerate(request) {
        const ret = wasm.wallet_prvKeyDataEnumerate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IPrvKeyDataCreateRequest} {@link IPrvKeyDataCreateResponse}
       * @throws `string` in case of an error.
       * @param {IPrvKeyDataCreateRequest} request
       * @returns {Promise<IPrvKeyDataCreateResponse>}
       */
      prvKeyDataCreate(request) {
        const ret = wasm.wallet_prvKeyDataCreate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IPrvKeyDataRemoveRequest} {@link IPrvKeyDataRemoveResponse}
       * @throws `string` in case of an error.
       * @param {IPrvKeyDataRemoveRequest} request
       * @returns {Promise<IPrvKeyDataRemoveResponse>}
       */
      prvKeyDataRemove(request) {
        const ret = wasm.wallet_prvKeyDataRemove(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IPrvKeyDataGetRequest} {@link IPrvKeyDataGetResponse}
       * @throws `string` in case of an error.
       * @param {IPrvKeyDataGetRequest} request
       * @returns {Promise<IPrvKeyDataGetResponse>}
       */
      prvKeyDataGet(request) {
        const ret = wasm.wallet_prvKeyDataGet(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsEnumerateRequest} {@link IAccountsEnumerateResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsEnumerateRequest} request
       * @returns {Promise<IAccountsEnumerateResponse>}
       */
      accountsEnumerate(request) {
        const ret = wasm.wallet_accountsEnumerate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsRenameRequest} {@link IAccountsRenameResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsRenameRequest} request
       * @returns {Promise<IAccountsRenameResponse>}
       */
      accountsRename(request) {
        const ret = wasm.wallet_accountsRename(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsDiscoveryRequest} {@link IAccountsDiscoveryResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsDiscoveryRequest} request
       * @returns {Promise<IAccountsDiscoveryResponse>}
       */
      accountsDiscovery(request) {
        const ret = wasm.wallet_accountsDiscovery(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsCreateRequest} {@link IAccountsCreateResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsCreateRequest} request
       * @returns {Promise<IAccountsCreateResponse>}
       */
      accountsCreate(request) {
        const ret = wasm.wallet_accountsCreate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsEnsureDefaultRequest} {@link IAccountsEnsureDefaultResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsEnsureDefaultRequest} request
       * @returns {Promise<IAccountsEnsureDefaultResponse>}
       */
      accountsEnsureDefault(request) {
        const ret = wasm.wallet_accountsEnsureDefault(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsImportRequest} {@link IAccountsImportResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsImportRequest} request
       * @returns {Promise<IAccountsImportResponse>}
       */
      accountsImport(request) {
        const ret = wasm.wallet_accountsImport(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsActivateRequest} {@link IAccountsActivateResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsActivateRequest} request
       * @returns {Promise<IAccountsActivateResponse>}
       */
      accountsActivate(request) {
        const ret = wasm.wallet_accountsActivate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsDeactivateRequest} {@link IAccountsDeactivateResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsDeactivateRequest} request
       * @returns {Promise<IAccountsDeactivateResponse>}
       */
      accountsDeactivate(request) {
        const ret = wasm.wallet_accountsDeactivate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsGetRequest} {@link IAccountsGetResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsGetRequest} request
       * @returns {Promise<IAccountsGetResponse>}
       */
      accountsGet(request) {
        const ret = wasm.wallet_accountsGet(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsCreateNewAddressRequest} {@link IAccountsCreateNewAddressResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsCreateNewAddressRequest} request
       * @returns {Promise<IAccountsCreateNewAddressResponse>}
       */
      accountsCreateNewAddress(request) {
        const ret = wasm.wallet_accountsCreateNewAddress(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsSendRequest} {@link IAccountsSendResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsSendRequest} request
       * @returns {Promise<IAccountsSendResponse>}
       */
      accountsSend(request) {
        const ret = wasm.wallet_accountsSend(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsPskbSignRequest} {@link IAccountsPskbSignResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsPskbSignRequest} request
       * @returns {Promise<IAccountsPskbSignResponse>}
       */
      accountsPskbSign(request) {
        const ret = wasm.wallet_accountsPskbSign(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsPskbBroadcastRequest} {@link IAccountsPskbBroadcastResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsPskbBroadcastRequest} request
       * @returns {Promise<IAccountsPskbBroadcastResponse>}
       */
      accountsPskbBroadcast(request) {
        const ret = wasm.wallet_accountsPskbBroadcast(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsPskbSendRequest} {@link IAccountsPskbSendResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsPskbSendRequest} request
       * @returns {Promise<IAccountsPskbSendResponse>}
       */
      accountsPskbSend(request) {
        const ret = wasm.wallet_accountsPskbSend(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsGetUtxosRequest} {@link IAccountsGetUtxosResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsGetUtxosRequest} request
       * @returns {Promise<IAccountsGetUtxosResponse>}
       */
      accountsGetUtxos(request) {
        const ret = wasm.wallet_accountsGetUtxos(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsTransferRequest} {@link IAccountsTransferResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsTransferRequest} request
       * @returns {Promise<IAccountsTransferResponse>}
       */
      accountsTransfer(request) {
        const ret = wasm.wallet_accountsTransfer(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsEstimateRequest} {@link IAccountsEstimateResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsEstimateRequest} request
       * @returns {Promise<IAccountsEstimateResponse>}
       */
      accountsEstimate(request) {
        const ret = wasm.wallet_accountsEstimate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link ITransactionsDataGetRequest} {@link ITransactionsDataGetResponse}
       * @throws `string` in case of an error.
       * @param {ITransactionsDataGetRequest} request
       * @returns {Promise<ITransactionsDataGetResponse>}
       */
      transactionsDataGet(request) {
        const ret = wasm.wallet_transactionsDataGet(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link ITransactionsReplaceNoteRequest} {@link ITransactionsReplaceNoteResponse}
       * @throws `string` in case of an error.
       * @param {ITransactionsReplaceNoteRequest} request
       * @returns {Promise<ITransactionsReplaceNoteResponse>}
       */
      transactionsReplaceNote(request) {
        const ret = wasm.wallet_transactionsReplaceNote(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link ITransactionsReplaceMetadataRequest} {@link ITransactionsReplaceMetadataResponse}
       * @throws `string` in case of an error.
       * @param {ITransactionsReplaceMetadataRequest} request
       * @returns {Promise<ITransactionsReplaceMetadataResponse>}
       */
      transactionsReplaceMetadata(request) {
        const ret = wasm.wallet_transactionsReplaceMetadata(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAddressBookEnumerateRequest} {@link IAddressBookEnumerateResponse}
       * @throws `string` in case of an error.
       * @param {IAddressBookEnumerateRequest} request
       * @returns {Promise<IAddressBookEnumerateResponse>}
       */
      addressBookEnumerate(request) {
        const ret = wasm.wallet_addressBookEnumerate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IFeeRateEstimateRequest} {@link IFeeRateEstimateResponse}
       * @throws `string` in case of an error.
       * @param {IFeeRateEstimateRequest} request
       * @returns {Promise<IFeeRateEstimateResponse>}
       */
      feeRateEstimate(request) {
        const ret = wasm.wallet_feeRateEstimate(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IFeeRatePollerEnableRequest} {@link IFeeRatePollerEnableResponse}
       * @throws `string` in case of an error.
       * @param {IFeeRatePollerEnableRequest} request
       * @returns {Promise<IFeeRatePollerEnableResponse>}
       */
      feeRatePollerEnable(request) {
        const ret = wasm.wallet_feeRatePollerEnable(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IFeeRatePollerDisableRequest} {@link IFeeRatePollerDisableResponse}
       * @throws `string` in case of an error.
       * @param {IFeeRatePollerDisableRequest} request
       * @returns {Promise<IFeeRatePollerDisableResponse>}
       */
      feeRatePollerDisable(request) {
        const ret = wasm.wallet_feeRatePollerDisable(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsCommitRevealRequest} {@link IAccountsCommitRevealResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsCommitRevealRequest} request
       * @returns {Promise<IAccountsCommitRevealResponse>}
       */
      accountsCommitReveal(request) {
        const ret = wasm.wallet_accountsCommitReveal(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
      /**
       * @see {@link IAccountsCommitRevealManualRequest} {@link IAccountsCommitRevealManualResponse}
       * @throws `string` in case of an error.
       * @param {IAccountsCommitRevealManualRequest} request
       * @returns {Promise<IAccountsCommitRevealManualResponse>}
       */
      accountsCommitRevealManual(request) {
        const ret = wasm.wallet_accountsCommitRevealManual(this.__wbg_ptr, addHeapObject(request));
        return takeObject(ret);
      }
    };
    WalletDescriptorFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_walletdescriptor_free(ptr >>> 0, 1));
    WalletDescriptor = class _WalletDescriptor {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_WalletDescriptor.prototype);
        obj.__wbg_ptr = ptr;
        WalletDescriptorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          title: this.title,
          filename: this.filename
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletDescriptorFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_walletdescriptor_free(ptr, 0);
      }
      /**
       * @returns {string | undefined}
       */
      get title() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_walletdescriptor_title(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          let v1;
          if (r0 !== 0) {
            v1 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export_3(r0, r1 * 1, 1);
          }
          return v1;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {string | null} [arg0]
       */
      set title(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_walletdescriptor_title(this.__wbg_ptr, ptr0, len0);
      }
      /**
       * @returns {string}
       */
      get filename() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.__wbg_get_walletdescriptor_filename(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @param {string} arg0
       */
      set filename(arg0) {
        const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_walletdescriptor_filename(this.__wbg_ptr, ptr0, len0);
      }
    };
    WasiOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_wasioptions_free(ptr >>> 0, 1));
    WriteFileSyncOptionsFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_writefilesyncoptions_free(ptr >>> 0, 1));
    WriteStreamFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_writestream_free(ptr >>> 0, 1));
    XOnlyPublicKeyFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_xonlypublickey_free(ptr >>> 0, 1));
    XOnlyPublicKey = class _XOnlyPublicKey {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_XOnlyPublicKey.prototype);
        obj.__wbg_ptr = ptr;
        XOnlyPublicKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XOnlyPublicKeyFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xonlypublickey_free(ptr, 0);
      }
      /**
       * @param {string} key
       */
      constructor(key) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(key, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.xonlypublickey_try_new(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          XOnlyPublicKeyFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xonlypublickey_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * Get the [`Address`] of this XOnlyPublicKey.
       * Receives a [`NetworkType`] to determine the prefix of the address.
       * JavaScript: `let address = xOnlyPublicKey.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddress(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xonlypublickey_toAddress(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * Get `ECDSA` [`Address`] of this XOnlyPublicKey.
       * Receives a [`NetworkType`] to determine the prefix of the address.
       * JavaScript: `let address = xOnlyPublicKey.toAddress(NetworkType.MAINNET);`.
       * @param {NetworkType | NetworkId | string} network
       * @returns {Address}
       */
      toAddressECDSA(network) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xonlypublickey_toAddressECDSA(retptr, this.__wbg_ptr, addBorrowedObject(network));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return Address.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @param {Address} address
       * @returns {XOnlyPublicKey}
       */
      static fromAddress(address) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          _assertClass(address, Address);
          wasm.xonlypublickey_fromAddress(retptr, address.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _XOnlyPublicKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
    };
    XPrvFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_xprv_free(ptr >>> 0, 1));
    XPrv = class _XPrv {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_XPrv.prototype);
        obj.__wbg_ptr = ptr;
        XPrvFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          xprv: this.xprv,
          privateKey: this.privateKey,
          depth: this.depth,
          parentFingerprint: this.parentFingerprint,
          childNumber: this.childNumber,
          chainCode: this.chainCode
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XPrvFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xprv_free(ptr, 0);
      }
      /**
       * @param {HexString} seed
       */
      constructor(seed) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_try_new(retptr, addHeapObject(seed));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          XPrvFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * Create {@link XPrv} from `xprvxxxx..` string
       * @param {string} xprv
       * @returns {XPrv}
       */
      static fromXPrv(xprv) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(xprv, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.xprv_fromXPrv(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _XPrv.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} child_number
       * @param {boolean | null} [hardened]
       * @returns {XPrv}
       */
      deriveChild(child_number, hardened) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_deriveChild(retptr, this.__wbg_ptr, child_number, isLikeNone(hardened) ? 16777215 : hardened ? 1 : 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _XPrv.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} path
       * @returns {XPrv}
       */
      derivePath(path) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_derivePath(retptr, this.__wbg_ptr, addBorrowedObject(path));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _XPrv.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @param {string} prefix
       * @returns {string}
       */
      intoString(prefix) {
        let deferred3_0;
        let deferred3_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.xprv_intoString(retptr, this.__wbg_ptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr2 = r0;
          var len2 = r1;
          if (r3) {
            ptr2 = 0;
            len2 = 0;
            throw takeObject(r2);
          }
          deferred3_0 = ptr2;
          deferred3_1 = len2;
          return getStringFromWasm0(ptr2, len2);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred3_0, deferred3_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      toString() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * @returns {XPub}
       */
      toXPub() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_toXPub(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return XPub.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {PrivateKey}
       */
      toPrivateKey() {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_toPrivateKey(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return PrivateKey.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @returns {string}
       */
      get xprv() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_toString(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * @returns {string}
       */
      get privateKey() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_privateKey(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {number}
       */
      get depth() {
        const ret = wasm.xprv_depth(this.__wbg_ptr);
        return ret;
      }
      /**
       * @returns {string}
       */
      get parentFingerprint() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_parentFingerprint(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {number}
       */
      get childNumber() {
        const ret = wasm.xprv_childNumber(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @returns {string}
       */
      get chainCode() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xprv_chainCode(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    XPubFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
    }, unregister: () => {
    } } : new FinalizationRegistry((ptr) => wasm.__wbg_xpub_free(ptr >>> 0, 1));
    XPub = class _XPub {
      static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(_XPub.prototype);
        obj.__wbg_ptr = ptr;
        XPubFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
      }
      toJSON() {
        return {
          xpub: this.xpub,
          depth: this.depth,
          parentFingerprint: this.parentFingerprint,
          childNumber: this.childNumber,
          chainCode: this.chainCode
        };
      }
      toString() {
        return JSON.stringify(this);
      }
      __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XPubFinalization.unregister(this);
        return ptr;
      }
      free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xpub_free(ptr, 0);
      }
      /**
       * @param {string} xpub
       */
      constructor(xpub) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(xpub, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.xpub_try_new(retptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          this.__wbg_ptr = r0 >>> 0;
          XPubFinalization.register(this, this.__wbg_ptr, this);
          return this;
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {number} child_number
       * @param {boolean | null} [hardened]
       * @returns {XPub}
       */
      deriveChild(child_number, hardened) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xpub_deriveChild(retptr, this.__wbg_ptr, child_number, isLikeNone(hardened) ? 16777215 : hardened ? 1 : 0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _XPub.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
        }
      }
      /**
       * @param {any} path
       * @returns {XPub}
       */
      derivePath(path) {
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xpub_derivePath(retptr, this.__wbg_ptr, addBorrowedObject(path));
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          if (r2) {
            throw takeObject(r1);
          }
          return _XPub.__wrap(r0);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          heap[stack_pointer++] = void 0;
        }
      }
      /**
       * @param {string} prefix
       * @returns {string}
       */
      intoString(prefix) {
        let deferred3_0;
        let deferred3_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
          const len0 = WASM_VECTOR_LEN;
          wasm.xpub_intoString(retptr, this.__wbg_ptr, ptr0, len0);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr2 = r0;
          var len2 = r1;
          if (r3) {
            ptr2 = 0;
            len2 = 0;
            throw takeObject(r2);
          }
          deferred3_0 = ptr2;
          deferred3_1 = len2;
          return getStringFromWasm0(ptr2, len2);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred3_0, deferred3_1, 1);
        }
      }
      /**
       * @returns {PublicKey}
       */
      toPublicKey() {
        const ret = wasm.xpub_toPublicKey(this.__wbg_ptr);
        return PublicKey.__wrap(ret);
      }
      /**
       * @returns {string}
       */
      get xpub() {
        let deferred2_0;
        let deferred2_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xpub_xpub(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
          var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
          var ptr1 = r0;
          var len1 = r1;
          if (r3) {
            ptr1 = 0;
            len1 = 0;
            throw takeObject(r2);
          }
          deferred2_0 = ptr1;
          deferred2_1 = len1;
          return getStringFromWasm0(ptr1, len1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
      }
      /**
       * @returns {number}
       */
      get depth() {
        const ret = wasm.xpub_depth(this.__wbg_ptr);
        return ret;
      }
      /**
       * @returns {string}
       */
      get parentFingerprint() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xpub_parentFingerprint(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
      /**
       * @returns {number}
       */
      get childNumber() {
        const ret = wasm.xpub_childNumber(this.__wbg_ptr);
        return ret >>> 0;
      }
      /**
       * @returns {string}
       */
      get chainCode() {
        let deferred1_0;
        let deferred1_1;
        try {
          const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
          wasm.xpub_chainCode(retptr, this.__wbg_ptr);
          var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
          var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
          deferred1_0 = r0;
          deferred1_1 = r1;
          return getStringFromWasm0(r0, r1);
        } finally {
          wasm.__wbindgen_add_to_stack_pointer(16);
          wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
      }
    };
    kaspa_default = __wbg_init;
  }
});

// ../../wrapper/kaspa_client.js
var kaspa_client_exports = {};
__export(kaspa_client_exports, {
  connect: () => connect
});
async function connect(rpcUrl, networkId = "testnet-10", { onDisconnect } = {}) {
  if (!wasmInitialized) {
    await kaspa_default();
    wasmInitialized = true;
  }
  console.log(`Connecting to Kaspa node at ${rpcUrl || "public resolver"} on network ${networkId}...`);
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {
      console.warn("Cleanup error:", e);
    }
    client = null;
  }
  currentRpcUrl = rpcUrl;
  currentNetworkId = networkId;
  const options = {
    networkId,
    resolver: rpcUrl ? void 0 : new Resolver(),
    url: rpcUrl || void 0
  };
  const newClient = new RpcClient(options);
  const connectOptions = {
    blockAsyncConnect: true,
    retryInterval: 2e3,
    // retry every 2s if needed
    strategy: ConnectStrategy.Persistent,
    timeoutDuration: 1e4
    // fail after 10s
  };
  try {
    await newClient.connect(connectOptions);
  } catch (err) {
    console.error("Connect failed:", err);
    throw err;
  }
  client = newClient;
  if (client && typeof client.on === "function") {
    client.on("disconnect", async () => {
      console.warn("Disconnected from Kaspa node");
      if (typeof onDisconnect === "function") {
        await onDisconnect();
      }
    });
  }
  if (rpcUrl) {
    console.log(`Connected to Kaspa node at ${rpcUrl} on network ${currentNetworkId}`);
  } else {
    console.log(`Connected to public Kaspa node via resolver on network ${currentNetworkId}`);
  }
  return client;
}
var client, wasmInitialized, currentRpcUrl, currentNetworkId;
var init_kaspa_client = __esm({
  "../../wrapper/kaspa_client.js"() {
    init_kaspa();
    client = null;
    wasmInitialized = false;
    currentRpcUrl = null;
    currentNetworkId = null;
  }
});

// core/adapters/kaspa-adapter.ts
var kaspa_adapter_exports = {};
__export(kaspa_adapter_exports, {
  connectAdapter: () => connectAdapter,
  disconnectAdapter: () => disconnectAdapter
});
async function connectAdapter(options) {
  const { network, rpcUrl, logger } = options;
  const { connect: connect2 } = await Promise.resolve().then(() => (init_kaspa_client(), kaspa_client_exports));
  const rpc = rpcUrl ? await connect2(rpcUrl, network) : await connect2(null, network);
  logger.log("[KaspaAdapter] Connected to", network);
  return rpc;
}
async function disconnectAdapter(rpc) {
  const { disconnect } = await Promise.resolve().then(() => (init_kaspa_client(), kaspa_client_exports));
  if (typeof disconnect === "function") {
    await disconnect(rpc);
  }
}
var init_kaspa_adapter = __esm({
  "core/adapters/kaspa-adapter.ts"() {
    "use strict";
  }
});

// ../../crypto/encryption.js
function encryptMessage(plaintext, password) {
  if (typeof plaintext !== "string" || typeof password !== "string") {
    throw new TypeError("encryptMessage requires string inputs");
  }
  try {
    const cipherText = encryptXChaCha20Poly1305(plaintext, password);
    return {
      version: 1,
      // bump if you change format later
      cipherText
    };
  } catch (err) {
    throw new Error(`Encryption failed: ${err.message}`);
  }
}
function decryptMessage(payload, password) {
  if (!password || typeof password !== "string") {
    throw new TypeError("decryptMessage requires a string password");
  }
  let cipherText;
  if (typeof payload === "string") {
    cipherText = payload;
  } else if (payload && typeof payload === "object" && payload.cipherText) {
    if (payload.version !== 1) {
      throw new Error(`Unsupported payload version: ${payload.version}`);
    }
    cipherText = payload.cipherText;
  } else {
    throw new TypeError("decryptMessage requires a cipherText string or payload object");
  }
  try {
    return decryptXChaCha20Poly1305(cipherText, password);
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}
var init_encryption = __esm({
  "../../crypto/encryption.js"() {
    init_kaspa();
  }
});

// ../../wrapper/storage.js
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "filename" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeWalletData(walletData, masterPassword) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const encryptedPayload = encryptMessage(JSON.stringify(walletData), masterPassword);
  store.put({
    filename: walletData.filename,
    payload: encryptedPayload
  });
  return tx.complete;
}
async function loadWalletData(filename2, masterPassword) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const request = store.get(filename2);
    request.onsuccess = () => {
      const record = request.result;
      if (!record) {
        return reject(new Error(`No wallet found for filename: ${filename2}`));
      }
      try {
        const plaintext = decryptMessage(record.payload, masterPassword);
        resolve(JSON.parse(plaintext));
      } catch (err) {
        reject(new Error(`Failed to decrypt wallet data: ${err.message}`));
      }
    };
    request.onerror = () => reject(request.error);
  });
}
var DB_NAME, STORE_NAME, DB_VERSION;
var init_storage = __esm({
  "../../wrapper/storage.js"() {
    init_encryption();
    DB_NAME = "KaspaWalletDB";
    STORE_NAME = "MetaDataStore";
    DB_VERSION = 2;
  }
});

// ../../wrapper/utilities.js
import * as secp from "https://esm.sh/@noble/secp256k1";
function generateMnemonic(wordCount = 24) {
  const mnemonic = Mnemonic.random(wordCount);
  return mnemonic.phrase;
}
async function getMnemonicFromStorage(filename2, masterPassword) {
  const walletData = await loadWalletData(filename2, masterPassword);
  const mnemonic = walletData.mnemonic;
  return mnemonic;
}
function validateAddress(address) {
  if (address == null || address === "") {
    throw new Error("Invalid address: " + address);
  }
  if (typeof address === "string") {
    try {
      address = new Address(address);
      return address;
    } catch (err) {
      throw new Error("Invalid address format: " + address);
    }
  }
  return address;
}
function validatePayload(payload) {
  if (typeof payload !== "string")
    return false;
  if (payload.length > MAX_PAYLOAD_BYTES * 2)
    return false;
  return true;
}
function stringToHex(str) {
  return Array.from(new TextEncoder().encode(str)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToString(hex) {
  if (hex.startsWith("0x"))
    hex = hex.slice(2);
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );
  return new TextDecoder().decode(bytes);
}
async function getXPrvFromStorage(filename2, masterPassword) {
  const walletData = await loadWalletData(filename2, masterPassword);
  const xPrv = XPrv.fromXPrv(walletData.xprv);
  return xPrv;
}
function getXPrv(mnemonicPhrase, passphrase = null) {
  const seed = passphrase ? new Mnemonic(mnemonicPhrase).toSeed(passphrase) : new Mnemonic(mnemonicPhrase).toSeed();
  const xPrv = new XPrv(seed);
  return xPrv;
}
async function deriveReceivingChildKeyPair({ xprvHex, network = NETWORK, accountIndex = 0n, index = 0 }) {
  if (typeof index !== "number" || index < 0) {
    throw new Error("Index must be a non-negative integer");
  }
  const gen = new PrivateKeyGenerator(xprvHex, false, accountIndex);
  const privKey = gen.receiveKey(index);
  const pubKey = privKey.toPublicKey();
  const pubGen = PublicKeyGenerator.fromMasterXPrv(xprvHex, false, accountIndex);
  const addr = pubGen.receiveAddressAsString(network, index);
  return { privateKey: privKey.toString(), publicKey: pubKey.toString(), address: addr };
}
async function deriveChangeChildKeyPair({ xprvHex, network = NETWORK, accountIndex = 0n, index = 0 }) {
  if (typeof index !== "number" || index < 0) {
    throw new Error("Index must be a non-negative integer");
  }
  const gen = new PrivateKeyGenerator(xprvHex, false, accountIndex);
  const privKey = gen.changeKey(index);
  const pubKey = privKey.toPublicKey();
  const pubGen = PublicKeyGenerator.fromMasterXPrv(xprvHex, false, accountIndex);
  const addr = pubGen.changeAddressAsString(network, index);
  return { privateKey: privKey.toString(), publicKey: pubKey.toString(), address: addr };
}
var MAX_PAYLOAD_BYTES, NETWORK;
var init_utilities = __esm({
  "../../wrapper/utilities.js"() {
    init_kaspa();
    init_storage();
    MAX_PAYLOAD_BYTES = 32 * 1024;
    NETWORK = "testnet";
  }
});

// ../../wrapper/wallet_service.js
var wallet_service_exports = {};
__export(wallet_service_exports, {
  activateAccount: () => activateAccount,
  closeWallet: () => closeWallet,
  createWallet: () => createWallet,
  deleteWalletData: () => deleteWalletData,
  estimateTransactionFee: () => estimateTransactionFee,
  generateNewAddress: () => generateNewAddress,
  generateNewKeypair: () => generateNewKeypair,
  getAllWallets: () => getAllWallets,
  getDefaultSigningKeysForActiveAccount: () => getDefaultSigningKeysForActiveAccount,
  getMnemonic: () => getMnemonic,
  getSpendableBalance: () => getSpendableBalance,
  getWalletContext: () => getWalletContext,
  init: () => init,
  send: () => send
});
function getWalletContext() {
  return {
    wallet,
    walletInitialized,
    accountId,
    filename,
    currentNetworkId: currentNetworkId2,
    currentAccountIndex,
    log
  };
}
function init({ rpcClient, networkId, balanceElementId = null, onBalanceChange = null, logger = null } = {}) {
  if (walletInitialized)
    return;
  log = typeof logger === "function" ? logger : () => {
  };
  currentNetworkId2 = networkId;
  const walletOptions = {
    resident: false,
    networkId
  };
  if (rpcClient.url) {
    walletOptions.url = rpcClient.url;
    log("Initializing wallet with direct connect to RPC URL:", rpcClient.url);
  } else {
    walletOptions.resolver = rpcClient.resolver;
    log("Initializing wallet with public node using RPC resolver.");
  }
  wallet = new Wallet(walletOptions);
  wallet.addEventListener("balance", (event) => {
    const bal = event?.data?.balance;
    if (bal && typeof bal.mature !== "undefined") {
      const matureBalance = sompiToKaspaString(bal.mature);
      log("Balance changed:", matureBalance, "KAS");
      try {
        let balanceResult = null;
        if (balanceElementId) {
          balanceResult = document.getElementById(balanceElementId);
          balanceResult.textContent = `Balance:
${matureBalance} KAS`;
        }
      } catch (err) {
        log("Error updating balance element:", err);
      }
      if (typeof onBalanceChange === "function") {
        onBalanceChange(matureBalance);
      }
    }
  });
  walletInitialized = true;
}
async function closeWallet() {
  try {
    await wallet.walletClose();
  } catch (err) {
    log("Error closing wallet:", err);
    throw err;
  }
  wallet = null;
  walletInitialized = false;
  walletSecret = null;
  accountId = null;
  currentAccountIndex = 0;
  filename = DEFAULT_FILENAME;
  log = () => {
  };
  walletOpened = false;
  walletConnected = false;
  walletStarted = false;
}
async function createWallet({ password, filename: filename2 = DEFAULT_FILENAME, userHint = "", mnemonic = null, storeMnemonic = false, discoverAddresses = true }) {
  if (!walletInitialized) {
    throw new Error("Wallet not initialized. Call init() first.");
  }
  walletSecret = password;
  filename2 = filename2 || DEFAULT_FILENAME;
  try {
    if (!walletOpened) {
      log("Opening wallet...");
      const descriptors = await wallet.walletOpen({
        accountDescriptors: true,
        filename: filename2,
        walletSecret
      });
      log("Wallet accounts:", descriptors);
      if (descriptors) {
        walletOpened = true;
        log("Wallet opened.");
      }
    }
    if (!walletConnected) {
      log("Connecting wallet...");
      await wallet.connect();
      walletConnected = true;
      log("Wallet connected.");
    }
    if (!walletStarted) {
      log("Starting wallet...");
      await wallet.start();
      walletStarted = true;
      log("Wallet started.");
    }
    const address = await activateAccount();
    return { address };
  } catch (err) {
    return await _createNewWallet({ password, filename: filename2, userHint, mnemonic, storeMnemonic, discoverAddresses });
  }
}
async function _createNewWallet({ password, filename: filename2 = DEFAULT_FILENAME, userHint = "", mnemonic = null, storeMnemonic = false, discoverAddresses = true }) {
  log("Creating new wallet...");
  const mnemonicPhrase = mnemonic || generateMnemonic(24);
  try {
    const descriptor = await wallet.walletCreate({
      filename: filename2,
      overwriteWalletStorage: false,
      title: filename2,
      userHint,
      walletSecret: password
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes("Wallet already exists")) {
    } else {
      throw new Error("Error creating wallet: " + msg);
    }
  }
  if (!walletOpened) {
    log("Opening newly created wallet...");
    await wallet.walletOpen({ filename: filename2, walletSecret });
    walletOpened = true;
    log("Wallet opened.");
  }
  let prvKeyData = await wallet.prvKeyDataCreate({
    walletSecret,
    kind: "mnemonic",
    mnemonic: mnemonicPhrase
  });
  let account = await wallet.accountsCreate({
    walletSecret,
    type: "bip32",
    accountName: "Account-B",
    prvKeyDataId: prvKeyData.prvKeyDataId
  });
  accountId = account.accountDescriptor.accountId;
  const xprv = await getXPrv(mnemonicPhrase);
  const xPrvString = xprv.toString();
  if (storeMnemonic) {
    storeWalletData({ filename: filename2, mnemonic: mnemonicPhrase, xprv: xPrvString }, password);
  } else {
    storeWalletData({ filename: filename2, xprv: xPrvString }, password);
  }
  if (!walletConnected) {
    log("Connecting wallet...");
    await wallet.connect();
    walletConnected = true;
    log("Wallet connected.");
  }
  if (!walletStarted) {
    log("Starting wallet...");
    await wallet.start();
    walletStarted = true;
    log("Wallet started.");
  }
  if (discoverAddresses) {
    log("Performing accounts discovery...");
    const results = await wallet.accountsDiscovery({
      accountScanExtent: 10,
      // scan first 10 accounts
      addressScanExtent: 50,
      // scan first 50 addresses per account
      bip39_mnemonic: mnemonicPhrase,
      discoveryKind: AccountsDiscoveryKind.BIP44
    });
    log("Accounts discovery completed.");
  }
  const address = await activateAccount();
  log("Wallet created and data stored securely.");
  return { address, mnemonic: mnemonicPhrase };
}
async function activateAccount(accountIndex = 0) {
  log("Activating account...");
  currentAccountIndex = accountIndex;
  const accounts = await wallet.accountsEnumerate();
  accountId = accounts.accountDescriptors[accountIndex].accountId;
  const address = accounts.accountDescriptors[accountIndex].receiveAddress;
  await wallet.accountsActivate({ accountId });
  log("Account activated. Receiving address:", address);
  return address;
}
async function estimateTransactionFee({ amount, toAddress, payload, priorityFeeKas }) {
  if (toAddress == null || toAddress === "") {
    throw new Error("Invalid address: " + toAddress);
  }
  if (amount == null || isNaN(Number(amount))) {
    throw new Error(amount, " Kas, Amount must be >= MIN_KAS_AMOUNT");
  }
  const accounts = await wallet.accountsEnumerate({});
  if (!accounts.accountDescriptors?.length) {
    throw new Error("No accounts found in wallet.");
  }
  const activeAccount = accounts.accountDescriptors[currentAccountIndex];
  const changeAddress = activeAccount.changeAddress;
  const receiveAddress = activeAccount.receiveAddress;
  validateAddress(changeAddress);
  validateAddress(toAddress);
  log("Fetching UTXOs for addresses...");
  const addresses = [receiveAddress, changeAddress].filter(Boolean);
  const utxoResult = await wallet.rpc.getUtxosByAddresses(addresses);
  const utxoEntries = Array.isArray(utxoResult) ? utxoResult : Array.isArray(utxoResult?.entries) ? utxoResult.entries : [];
  if (utxoEntries.length === 0)
    throw new Error("No UTXOs...");
  utxoEntries.sort((a, b) => a.amount > b.amount ? 1 : -1);
  log(`UTXOs fetched: ${utxoEntries.length} entries.`);
  const amountSompi = kaspaToSompi(amount);
  const outputs = [{
    // Pass as string (validated above)
    address: String(toAddress),
    amount: amountSompi
  }];
  let priorityFee = 0n;
  if (priorityFeeKas != null && priorityFeeKas !== "") {
    priorityFee = kaspaToSompi(priorityFeeKas);
  }
  let payloadHex = void 0;
  if (payload) {
    if (/^[0-9a-fA-F]*$/.test(payload) && payload.length % 2 === 0) {
      payloadHex = payload;
    } else {
      payloadHex = stringToHex(payload);
    }
  }
  const settings = {
    entries: utxoEntries,
    utxoEntries,
    outputs,
    changeAddress: String(changeAddress),
    priorityFee,
    payload: payloadHex,
    networkId: currentNetworkId2
  };
  let estimate;
  try {
    const generator = new Generator(settings);
    estimate = await generator.estimate();
    try {
      generator.free();
    } catch {
    }
    log("Generator estimate completed.");
  } catch (err) {
    throw new Error("Generator estimate failed: " + (err && err.message ? err.message : String(err)));
  }
  const totalFees = estimate.fees ?? 0n;
  const mass = estimate.mass ?? 0n;
  const baseFee = totalFees - priorityFee;
  return {
    mass,
    fees: totalFees,
    feesKas: sompiToKaspaString(totalFees),
    priorityFee,
    baseFee,
    utxos: utxoEntries
  };
}
async function send({ amount, toAddress, payload, priorityFeeKas }) {
  if (!walletInitialized || !wallet) {
    throw new Error("Wallet not initialized. Call init() first.");
  }
  const toAddressObj = validateAddress(toAddress);
  let priorityFeeSompi = 0n;
  if (priorityFeeKas > 0) {
    priorityFeeSompi = kaspaToSompi(priorityFeeKas);
  }
  let amountSompi;
  amountSompi = kaspaToSompi(amount.toString());
  if (amountSompi <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
  let priorityFeeSompiChecked = priorityFeeSompi;
  if (typeof priorityFeeSompiChecked !== "bigint") {
    priorityFeeSompiChecked = BigInt(priorityFeeSompiChecked);
  }
  const sendRequest = {
    walletSecret,
    accountId,
    priorityFeeSompi: priorityFeeSompiChecked,
    destination: [{
      address: toAddressObj,
      amount: amountSompi
    }]
  };
  if (payload) {
    if (!validatePayload(payload)) {
      throw new Error("Payload must be a string and <= 32KB");
    }
    const hex = stringToHex(payload);
    if (hex.length % 2 !== 0) {
      throw new Error("Invalid hex payload");
    }
    if (hex.length / 2 > 32 * 1024) {
      throw new Error("Payload too large");
    }
    sendRequest.payload = hex;
  }
  try {
    return await wallet.accountsSend(sendRequest);
  } catch (err) {
    const causeMsg = err && err.message ? err.message : String(err);
    throw new Error(`Transaction failed: ${causeMsg}`, { cause: err });
  }
}
async function getSpendableBalance() {
  const res = await wallet.accountsGet({ accountId });
  let bal = null;
  if (res.account?.balance) {
    bal = res.account.balance;
  } else if (res.accounts?.[0]?.balance) {
    bal = res.accounts[0].balance;
  } else if (res.accountDescriptor?.balance) {
    bal = res.accountDescriptor.balance;
  }
  if (!bal || !bal.mature) {
    return 0n;
  }
  return BigInt(bal.mature);
}
async function generateNewAddress(change = false) {
  const addr = await wallet.accountsCreateNewAddress({
    accountId,
    networkId: wallet.networkId,
    addressKind: change ? "change" : "receive"
  });
  return addr.address;
}
async function generateNewKeypair(index) {
  const xprv = await getXPrvFromStorage(filename, walletSecret);
  const xprvHex = xprv.toString();
  const derivedKeyPair = await deriveReceivingChildKeyPair({ xprvHex, index });
  return {
    privateKey: derivedKeyPair.privateKey,
    publicKey: derivedKeyPair.publicKey
  };
}
async function deleteWalletData(filename2) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes(filename2)) {
      localStorage.removeItem(key);
    }
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("kaspa_wallet_db");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Delete blocked"));
  });
}
async function getAllWallets() {
  if (!wallet) {
    throw new Error("Wallet not initialized. Call init() first.");
  }
  try {
    const result = await wallet.walletEnumerate({});
    return result.walletDescriptors || [];
  } catch (err) {
    throw new Error("Failed to enumerate wallets: " + (err && err.message ? err.message : err));
  }
}
async function getMnemonic({ theFilename = "", password = "" } = {}) {
  if (theFilename.length === 0) {
    theFilename = filename;
  }
  if (password.length === 0) {
    password = walletSecret;
  }
  return await getMnemonicFromStorage(theFilename, password);
}
async function getDefaultSigningKeysForActiveAccount() {
  if (!walletInitialized || !wallet)
    throw new Error("Wallet not initialized. Call init() first.");
  if (!walletSecret)
    throw new Error("Wallet secret not set (create/open wallet first).");
  const accounts = await wallet.accountsEnumerate({});
  const active = accounts?.accountDescriptors?.[currentAccountIndex];
  if (!active)
    throw new Error("Active account not found.");
  const netName = String(currentNetworkId2 || "").toLowerCase().startsWith("testnet") ? "testnet" : "mainnet";
  const xprv = await getXPrvFromStorage(filename, walletSecret);
  const xprvHex = xprv.toString();
  const receive0 = await deriveReceivingChildKeyPair({
    xprvHex,
    network: netName,
    accountIndex: BigInt(currentAccountIndex),
    index: 0
  });
  const change0 = await deriveChangeChildKeyPair({
    xprvHex,
    network: netName,
    accountIndex: BigInt(currentAccountIndex),
    index: 0
  });
  return {
    receive: receive0,
    // { privateKey, publicKey, address }
    change: change0
    // { privateKey, publicKey, address }
  };
}
var DEFAULT_FILENAME, wallet, walletInitialized, walletSecret, accountId, filename, currentNetworkId2, currentAccountIndex, log, walletOpened, walletConnected, walletStarted;
var init_wallet_service = __esm({
  "../../wrapper/wallet_service.js"() {
    init_kaspa();
    init_storage();
    init_utilities();
    DEFAULT_FILENAME = "default_wallet";
    wallet = null;
    walletInitialized = false;
    walletSecret = null;
    accountId = null;
    filename = DEFAULT_FILENAME;
    currentNetworkId2 = null;
    currentAccountIndex = 0;
    log = () => {
    };
    walletOpened = false;
    walletConnected = false;
    walletStarted = false;
  }
});

// core/adapters/wallet-adapter.ts
var wallet_adapter_exports = {};
__export(wallet_adapter_exports, {
  createWalletAdapter: () => createWalletAdapter,
  getBalanceAdapter: () => getBalanceAdapter,
  initWalletAdapter: () => initWalletAdapter
});
async function initWalletAdapter(options) {
  const { rpc, network, logger, onBalanceChange } = options;
  const { init: init2 } = await Promise.resolve().then(() => (init_wallet_service(), wallet_service_exports));
  init2({
    rpcClient: rpc,
    networkId: network,
    logger: (...args) => logger.log("[WalletAdapter]", ...args),
    onBalanceChange: (matureBalance) => {
      const matureKas = matureBalance;
      const matureSompi = kasToSompi(matureBalance);
      onBalanceChange({
        matureKas,
        pendingKas: "0",
        matureSompi,
        pendingSompi: 0n
      });
    }
  });
}
async function createWalletAdapter(options) {
  const { name, password } = options;
  const { createWallet: createWallet3 } = await Promise.resolve().then(() => (init_wallet_service(), wallet_service_exports));
  const result = await createWallet3({
    password,
    filename: name,
    userHint: "Kinesis SDK wallet",
    storeMnemonic: false,
    discoverAddresses: true
  });
  walletHandle = result;
  return {
    address: result.address,
    handle: result
  };
}
async function getBalanceAdapter() {
  const { getSpendableBalance: getSpendableBalance2 } = await Promise.resolve().then(() => (init_wallet_service(), wallet_service_exports));
  const matureKas = await getSpendableBalance2();
  return {
    matureKas: String(matureKas),
    pendingKas: "0",
    matureSompi: kasToSompi(String(matureKas)),
    pendingSompi: 0n
  };
}
function kasToSompi(kas) {
  try {
    const parts = kas.split(".");
    const whole = BigInt(parts[0] || "0");
    let frac = parts[1] || "";
    frac = frac.padEnd(8, "0").slice(0, 8);
    return whole * 100000000n + BigInt(frac);
  } catch {
    return 0n;
  }
}
var walletHandle;
var init_wallet_adapter = __esm({
  "core/adapters/wallet-adapter.ts"() {
    "use strict";
    walletHandle = null;
  }
});

// core/adapters/tx-adapter.ts
var tx_adapter_exports = {};
__export(tx_adapter_exports, {
  sendAdapter: () => sendAdapter
});
async function sendAdapter(options) {
  const { amountKas, toAddress, payload } = options;
  const { send: send2 } = await Promise.resolve().then(() => (init_wallet_service(), wallet_service_exports));
  const result = await send2({
    amount: amountKas,
    toAddress,
    payload: payload ?? void 0
  });
  const txId = result?.txid ?? result?.transactionId ?? result?.id ?? String(result);
  return { txId };
}
var init_tx_adapter = __esm({
  "core/adapters/tx-adapter.ts"() {
    "use strict";
  }
});

// ../../wrapper/indexer.js
var indexer_exports = {};
__export(indexer_exports, {
  EvictionReason: () => EvictionReason,
  IndexerEventType: () => IndexerEventType,
  IndexerStore: () => IndexerStore,
  KaspaIndexer: () => KaspaIndexer,
  MatchMode: () => MatchMode
});
var IndexerEventType, MatchMode, EvictionReason, IndexerStore, KaspaIndexer;
var init_indexer = __esm({
  "../../wrapper/indexer.js"() {
    IndexerEventType = Object.freeze({
      TRANSACTION_IN_MEMORY: "transaction-in-memory",
      MATCHING_TRANSACTION_IN_MEMORY: "matching-transaction-in-memory",
      BLOCK_IN_MEMORY: "block-in-memory",
      TRANSACTION_CACHED: "transaction-cached",
      MATCHING_TRANSACTION_CACHED: "matching-transaction-cached",
      BLOCK_CACHED: "block-cached",
      EVICT: "evict"
    });
    MatchMode = Object.freeze({
      ALL: "all",
      TRANSACTIONS: "transactions",
      MATCHING: "matching",
      BLOCKS: "blocks",
      CUSTOM: "custom"
    });
    EvictionReason = Object.freeze({
      TTL: "ttl",
      SIZE: "size",
      IN_MEMORY_TRANSACTION: "in_memory_transaction",
      IN_MEMORY_BLOCK: "in_memory_block"
    });
    IndexerStore = Object.freeze({
      TRANSACTIONS: "transactions",
      MATCHING_TRANSACTIONS: "matching_transactions",
      BLOCKS: "blocks"
    });
    KaspaIndexer = class {
      // Metrics for observability
      _metrics = {
        transactionsIndexed: 0,
        blocksIndexed: 0,
        evictions: { ttl: 0, size: 0 },
        cacheHits: 0,
        cacheMisses: 0
      };
      // In-memory rolling cache for deduplication
      _txidCacheSet = /* @__PURE__ */ new Set();
      _txidCacheQueue = [];
      _txidCacheMax = 1e3;
      // In-memory buffers for batch flush
      _pendingTxs = [];
      _pendingBlocks = [];
      _inMemoryMaxTxs = 1e3;
      // max in-memory txs/blocks before deduplication kicks in
      _inMemoryMaxBlocks = 1e3;
      _flushInterval = 5e3;
      // ms
      _flushTimer = null;
      // Prevent overlapping async operations
      _flushPromise = null;
      _evictPromise = null;
      // Prevent multiple initDB calls
      _initPromise = null;
      constructor({
        ttlMinutes = null,
        flushInterval = 5e3,
        maxSize = null,
        batchThresholdRatio = 0.1,
        priorityTTL = true,
        inMemoryMaxTxs = 1e3,
        inMemoryMaxBlocks = 1e3,
        dbName = "kaspaIndexer",
        matchMode = MatchMode.ALL,
        indexAllTransactions = true,
        indexAllMatchingTransactions = true,
        indexAllBlocks = false,
        onIndexerUpdate = null
      } = {}) {
        this.active = false;
        this.ttlMs = ttlMinutes ? ttlMinutes * 60 * 1e3 : null;
        this._flushInterval = flushInterval;
        this.maxSize = maxSize;
        this.batchThresholdRatio = batchThresholdRatio;
        this.priorityTTL = priorityTTL;
        this.dbName = dbName;
        this.db = null;
        this._evictionInterval = null;
        this.onIndexerUpdate = typeof onIndexerUpdate === "function" ? onIndexerUpdate : null;
        this.matchMode = matchMode;
        this.indexAllTransactions = indexAllTransactions;
        this.indexAllMatchingTransactions = indexAllMatchingTransactions;
        this.indexAllBlocks = indexAllBlocks;
        this._inMemoryMaxTxs = inMemoryMaxTxs;
        this._inMemoryMaxBlocks = inMemoryMaxBlocks;
        this._dbReady = new Promise((resolve) => {
          this._resolveDbReady = resolve;
        });
      }
      get flushInterval() {
        return this._flushInterval;
      }
      async initDB() {
        if (this.db)
          return this.db;
        if (this._initPromise)
          return this._initPromise;
        this._initPromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(this.dbName, 2);
          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IndexerStore.MATCHING_TRANSACTIONS)) {
              const store = db.createObjectStore(IndexerStore.MATCHING_TRANSACTIONS, { keyPath: "txid" });
              store.createIndex("timestamp", "timestamp");
            }
            if (!db.objectStoreNames.contains(IndexerStore.TRANSACTIONS)) {
              const txStore = db.createObjectStore(IndexerStore.TRANSACTIONS, { keyPath: "txid" });
              txStore.createIndex("timestamp", "timestamp");
            }
            if (!db.objectStoreNames.contains(IndexerStore.BLOCKS)) {
              const blockStore = db.createObjectStore(IndexerStore.BLOCKS, { keyPath: "hash" });
              blockStore.createIndex("timestamp", "timestamp");
            }
          };
          request.onsuccess = async (e) => {
            this.db = e.target.result;
            await this._preloadTxidCache();
            if (this._resolveDbReady)
              this._resolveDbReady();
            resolve(this.db);
          };
          request.onerror = (e) => reject(e);
          request.onblocked = () => reject(new Error("IndexedDB open blocked (another tab/connection?)"));
        });
        return this._initPromise;
      }
      /**
       * Reset both IndexedDB stores and all in-memory buffers/metrics.
       * Note: the DB connection must be open before clearing stores.
       * @returns {Promise<void>}
       */
      async resetEverything() {
        await this.initDB();
        this.active = false;
        this._stopEvictionTimer();
        this._stopFlushTimer();
        for (const storeName of Object.values(IndexerStore)) {
          await this.clearStore(storeName);
        }
        this._pendingTxs = [];
        this._pendingBlocks = [];
        this._txidCacheSet.clear();
        this._txidCacheQueue = [];
        this._metrics = {
          transactionsIndexed: 0,
          blocksIndexed: 0,
          evictions: { ttl: 0, size: 0 },
          cacheHits: 0,
          cacheMisses: 0
        };
      }
      /**
       * Fresh-start sequence:
       * 1) Init DB (must be open to clear)
       * 2) Reset everything (DB + memory)
       * 3) Start normal indexing
       * @returns {Promise<void>}
       */
      async freshStart() {
        await this.initDB();
        await this.resetEverything();
        this.start();
      }
      start() {
        this.active = true;
        this._startEvictionTimer();
        this._startFlushTimer();
      }
      stop() {
        this.active = false;
        this._stopEvictionTimer();
        this._stopFlushTimer();
        this.flush();
      }
      /* Indexing methods */
      /**
       * Add a transaction to the indexer.
       * @param {Object} tx - The transaction object to index.
       * @param {boolean} isMatch - Whether this transaction is a matching transaction.
       * @returns {Promise<void>}
       */
      async addTransaction(tx, isMatch = true) {
        if (this.matchMode === MatchMode.BLOCKS)
          return;
        if (this.matchMode === MatchMode.MATCHING && !isMatch)
          return;
        if (this.matchMode === MatchMode.TRANSACTIONS && isMatch)
          return;
        if (this.matchMode === MatchMode.CUSTOM) {
          if (!this.indexAllTransactions && !this.indexAllMatchingTransactions)
            return;
          if (!this.indexAllTransactions && !isMatch)
            return;
          if (!this.indexAllMatchingTransactions && isMatch)
            return;
        }
        const now = Number(tx.timestamp);
        const txid = tx.txid;
        if (!txid) {
          this._metrics.cacheMisses++;
          return;
        }
        if (this._txidCacheSet.has(txid)) {
          this._metrics.cacheHits++;
          return;
        }
        this._txidCacheSet.add(txid);
        this._txidCacheQueue.push(txid);
        if (this._txidCacheQueue.length > this._txidCacheMax) {
          const oldest = this._txidCacheQueue.shift();
          this._txidCacheSet.delete(oldest);
        }
        const entry = { ...tx, timestamp: now };
        this._pendingTxs.push({ entry, isMatch });
        if (typeof this.onIndexerUpdate === "function") {
          if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.TRANSACTIONS || this.matchMode === MatchMode.CUSTOM && this.indexAllTransactions) {
            this.onIndexerUpdate({ type: IndexerEventType.TRANSACTION_IN_MEMORY, data: entry });
          }
          if (isMatch && (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.MATCHING || this.matchMode === MatchMode.CUSTOM && this.indexAllMatchingTransactions)) {
            this.onIndexerUpdate({ type: IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY, data: entry });
          }
        }
        this._metrics.transactionsIndexed++;
        if (this._pendingTxs.length >= this._inMemoryMaxTxs) {
          await this.flush();
        }
      }
      /**
       * Add a batch of transactions to the indexer.
       * @param {Object[]} txs - Array of transaction objects to index.
       * @param {boolean} isMatch - Whether these transactions are matching transactions.
       * @returns {Promise<void>}
       */
      async addTransactionsBatch(txs, isMatch = true) {
        for (const tx of txs) {
          await this.addTransaction(tx, isMatch);
        }
      }
      /**
       * Add a block to the indexer.
       * @param {Object} block - The block object to index.
       * @returns {Promise<void>}
       */
      async addBlock(block) {
        if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.BLOCKS || this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks) {
          const now = Number(block.header?.timestamp ?? block.timestamp);
          const hash = block.header?.hash || block.hash;
          if (!hash) {
            console.error("Block has no hash, cannot index.", block);
            return;
          }
          const blockEntry = { ...block, timestamp: now, hash };
          this._pendingBlocks.push(blockEntry);
          this._metrics.blocksIndexed++;
          if (typeof this.onIndexerUpdate === "function") {
            if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.BLOCKS || this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks) {
              this.onIndexerUpdate({ type: IndexerEventType.BLOCK_IN_MEMORY, data: blockEntry });
            }
          }
          if (this._pendingBlocks.length >= this._inMemoryMaxBlocks) {
            await this.flush();
          }
        }
      }
      /**
       * Flush pending transactions and blocks to IndexedDB.
       * @returns {Promise<void>}
       */
      async flush() {
        if (this._flushPromise)
          return this._flushPromise;
        this._flushPromise = (async () => {
          await this._dbReady;
          const batchTxs = [];
          const batchMatchingTxs = [];
          const batchBlocks = [];
          const txPromises = [];
          if (this._pendingTxs.length) {
            const txReqMatching = this.db.transaction(IndexerStore.MATCHING_TRANSACTIONS, "readwrite");
            const storeMatching = txReqMatching.objectStore(IndexerStore.MATCHING_TRANSACTIONS);
            const txReqAll = this.db.transaction(IndexerStore.TRANSACTIONS, "readwrite");
            const storeAll = txReqAll.objectStore(IndexerStore.TRANSACTIONS);
            for (const { entry, isMatch } of this._pendingTxs) {
              if (isMatch)
                storeMatching.put(entry);
              else
                storeAll.put(entry);
              if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.TRANSACTIONS || this.matchMode === MatchMode.CUSTOM && this.indexAllTransactions) {
                batchTxs.push(entry);
              }
              if (isMatch && (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.MATCHING || this.matchMode === MatchMode.CUSTOM && this.indexAllMatchingTransactions)) {
                batchMatchingTxs.push(entry);
              }
            }
            this._pendingTxs = [];
            txPromises.push(this._awaitIDBTransaction(txReqMatching));
            txPromises.push(this._awaitIDBTransaction(txReqAll));
          }
          if (this._pendingBlocks.length) {
            const blockReq = this.db.transaction(IndexerStore.BLOCKS, "readwrite");
            const store = blockReq.objectStore(IndexerStore.BLOCKS);
            for (const blockEntry of this._pendingBlocks) {
              store.put(blockEntry);
              if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.BLOCKS || this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks) {
                batchBlocks.push(blockEntry);
              }
            }
            this._pendingBlocks = [];
            txPromises.push(this._awaitIDBTransaction(blockReq));
          }
          if (txPromises.length)
            await Promise.all(txPromises);
          if (typeof this.onIndexerUpdate === "function") {
            if (batchTxs.length > 0) {
              this.onIndexerUpdate({ type: IndexerEventType.TRANSACTION_CACHED, data: batchTxs });
            }
            if (batchMatchingTxs.length > 0) {
              this.onIndexerUpdate({ type: IndexerEventType.MATCHING_TRANSACTION_CACHED, data: batchMatchingTxs });
            }
            if (batchBlocks.length > 0) {
              this.onIndexerUpdate({ type: IndexerEventType.BLOCK_CACHED, data: batchBlocks });
            }
          }
          await this._enforceMaxSizeAfterFlush();
        })();
        try {
          await this._flushPromise;
        } finally {
          this._flushPromise = null;
        }
      }
      /**
       * Evict old entries based on TTL and max size.
       * @returns {Promise<void>}
       */
      async evict() {
        if (this._evictPromise)
          return this._evictPromise;
        this._evictPromise = (async () => {
          await this._dbReady;
          const now = Date.now();
          if (!this.priorityTTL && this.maxSize && this.maxSize > 0) {
            const over = await this._isAnyRelevantStoreOverMaxSize();
            if (!over)
              return;
          }
          const stdOnEvict = (storeName) => (evictInfo) => {
            if (this.onIndexerUpdate) {
              this.onIndexerUpdate({
                type: IndexerEventType.EVICT,
                data: {
                  key: evictInfo.key,
                  reason: evictInfo.reason,
                  storeName
                }
              });
            }
          };
          if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.MATCHING) {
            await this._evictStore(IndexerStore.MATCHING_TRANSACTIONS, "txid", stdOnEvict(IndexerStore.MATCHING_TRANSACTIONS), now);
          }
          if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.TRANSACTIONS) {
            await this._evictStore(IndexerStore.TRANSACTIONS, "txid", stdOnEvict(IndexerStore.TRANSACTIONS), now);
          }
          if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.BLOCKS) {
            await this._evictStore(IndexerStore.BLOCKS, "hash", stdOnEvict(IndexerStore.BLOCKS), now);
          }
          if (this.matchMode === MatchMode.CUSTOM) {
            if (this.indexAllMatchingTransactions) {
              await this._evictStore(IndexerStore.MATCHING_TRANSACTIONS, "txid", stdOnEvict(IndexerStore.MATCHING_TRANSACTIONS), now);
            }
            if (this.indexAllTransactions) {
              await this._evictStore(IndexerStore.TRANSACTIONS, "txid", stdOnEvict(IndexerStore.TRANSACTIONS), now);
            }
            if (this.indexAllBlocks) {
              await this._evictStore(IndexerStore.BLOCKS, "hash", stdOnEvict(IndexerStore.BLOCKS), now);
            }
          }
        })();
        try {
          await this._evictPromise;
        } finally {
          this._evictPromise = null;
        }
      }
      /**
       * Clear all entries from a specific object store.
       * @param {string} storeName - The name of the store (use IndexerStore constant).
       * @returns {Promise<void>}
       */
      async clearStore(storeName) {
        if (!this.db) {
          await this.initDB();
        }
        await this._dbReady;
        if (!Object.values(IndexerStore).includes(storeName)) {
          throw new Error(`Invalid storeName: ${storeName}`);
        }
        return new Promise((resolve, reject) => {
          try {
            const tx = this.db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.clear();
            tx.oncomplete = () => {
              if (this._metrics) {
                this._metrics.storesCleared = (this._metrics.storesCleared || 0) + 1;
                this._metrics.clearsByStore = this._metrics.clearsByStore || {};
                this._metrics.clearsByStore[storeName] = (this._metrics.clearsByStore[storeName] || 0) + 1;
              }
              resolve();
            };
            tx.onerror = (e) => {
              console.error(`IndexedDB clear failed for store ${storeName}:`, e.target.error);
              reject(e.target.error);
            };
            tx.onabort = (e) => {
              console.error(`IndexedDB transaction aborted for store ${storeName}:`, e.target.error);
              reject(e.target.error);
            };
          } catch (err) {
            console.error(`IndexedDB clear failed for store ${storeName}:`, err);
            reject(err);
          }
        });
      }
      /**
       * Get a snapshot of current metrics.
       * @returns {Object}
       */
      getMetrics() {
        return { ...this._metrics, evictions: { ...this._metrics.evictions } };
      }
      /* In-memory Getters */
      /**
       * Get matching transactions in memory.
       * @returns {Object[]}
       */
      getAllMatchingTransactions() {
        return this._pendingTxs.filter(({ isMatch }) => isMatch).map(({ entry }) => entry);
      }
      /**
       * Get all transactions in memory.
       * @returns {Object[]}
       */
      getAllTransactions() {
        return this._pendingTxs.map(({ entry }) => entry);
      }
      /** Get all blocks in memory.
       * @returns {Object[]}
       */
      getAllBlocks() {
        return this._pendingBlocks.slice();
      }
      /**
       * Get a transaction by its txid from in-memory buffer.
       * @param {string} txid - The transaction ID.
       * @returns {Object|null} - The matching transaction or null.
       */
      getTransaction(txid) {
        const match = this._pendingTxs.find(({ entry }) => entry.txid === txid);
        return match ? match.entry : null;
      }
      /* IndexedDB Getters */
      /**
       * Get a transaction by its txid.
       * @param {string} txid - The transaction ID.
       * @returns {Promise<Object|null>} - The matching transaction or null.
       */
      async getCachedTransaction(txid) {
        return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, (txs) => txs.find((tx) => tx.txid === txid) || null);
      }
      /**
       * Get all matching indexed transactions.
       * @returns {Promise<Object[]>} - Array of all transactions.
       */
      async getAllCachedMatchingTransactions() {
        return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, (txs) => txs);
      }
      /**
       * Get all indexed transactions.
       * @returns {Promise<Object[]>} - Array of all blocks.
       */
      async getAllCachedTransactions() {
        return this._queryStore(IndexerStore.TRANSACTIONS, (txs) => txs);
      }
      /**
       * Get all indexed blocks.
       * @returns {Promise<Object[]>} - Array of all blocks.
       */
      async getAllCachedBlocks() {
        return this._queryStore(IndexerStore.BLOCKS, (blocks) => blocks);
      }
      /**
       * Get the most recent transaction matching the given criteria.
       * @param {string} sender - Sender address.
       * @param {string} receiver - Receiver address.
       * @param {number} blockDaaScore - Block DAA score.
       * @param {bigint} amount - Amount transferred.
       * @returns {Promise<Object|null>} - The most recent matching transaction or null.
       */
      async getMostRecentCachedTransaction(sender, receiver, blockDaaScore, amount) {
        return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, (txs) => {
          const matches = txs.filter(
            (tx) => tx.sender === sender && tx.receiver === receiver && tx.blockDaaScore === blockDaaScore && tx.amount === amount
          ).sort((a, b) => b.timestamp - a.timestamp);
          return matches[0] || null;
        });
      }
      /**
       * Get transactions with a Block DAA score greater than the specified minimum.
       * @param {number} minBlockDaaScore - The minimum Block DAA score.
       * @returns {Promise<Object[]>} - Array of matching transactions.
       */
      async getCachedTransactionsAfterBlockDaaScore(minBlockDaaScore) {
        return this._queryStore(
          IndexerStore.MATCHING_TRANSACTIONS,
          (txs) => txs.filter((tx) => tx.blockDaaScore > minBlockDaaScore)
        );
      }
      /**
       * Get transactions for a specific address, optionally within a recent time frame.
       * @param {string} address - The address to query.
       * @param {number|null} [recentSeconds=null] - If provided, only transactions within this many seconds from now are returned.
       * @returns {Promise<Object[]>} - Array of matching transactions.
       */
      async getCachedTransactionsForAddress(address, recentSeconds = null) {
        const now = Date.now();
        return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, (txs) => {
          let matches = txs.filter(
            (tx) => tx.sender === address || tx.receiver === address
          );
          if (recentSeconds) {
            const cutoff = now - recentSeconds * 1e3;
            matches = matches.filter((tx) => tx.timestamp >= cutoff);
          }
          return matches.sort((a, b) => b.timestamp - a.timestamp);
        });
      }
      /* Internal helpers */
      _startEvictionTimer() {
        if (this._evictionInterval)
          clearInterval(this._evictionInterval);
        const interval = this.ttlMs && this.ttlMs > 0 ? this.ttlMs : 6e5;
        this._evictionInterval = setInterval(() => {
          this.evict();
        }, interval);
      }
      _startFlushTimer() {
        if (this._flushTimer)
          clearInterval(this._flushTimer);
        this._flushTimer = setInterval(() => this.flush(), this._flushInterval);
      }
      _stopEvictionTimer() {
        if (this._evictionInterval) {
          clearInterval(this._evictionInterval);
          this._evictionInterval = null;
        }
      }
      _stopFlushTimer() {
        if (this._flushTimer) {
          clearInterval(this._flushTimer);
          this._flushTimer = null;
        }
      }
      /**
       * (Internal) Preload recent txids into in-memory cache for deduplication.
       */
      async _preloadTxidCache() {
        const preloadStore = async (storeName) => {
          return new Promise((resolve) => {
            try {
              const txReq = this.db.transaction(storeName, "readonly");
              const store = txReq.objectStore(storeName);
              const req = store.getAllKeys();
              req.onsuccess = () => resolve(req.result || []);
              req.onerror = () => resolve([]);
            } catch (err) {
              if (err.name === "NotFoundError") {
                resolve([]);
              } else {
                console.error(`Error preloading store ${storeName}:`, err);
                resolve([]);
              }
            }
          });
        };
        const allTxids = await preloadStore(IndexerStore.TRANSACTIONS);
        const recentTxids = allTxids.slice(-this._txidCacheMax);
        this._txidCacheSet = new Set(recentTxids);
        this._txidCacheQueue = [...recentTxids];
      }
      /**
       * (Internal) Generic helper to query any object store.
       * @param {string} storeName - The name of the object store.
       * @param {function(Object[]): any} processFn - Function to process the full result set.
       * @returns {Promise<any>}
       */
      async _queryStore(storeName, processFn) {
        return new Promise((resolve, reject) => {
          try {
            const tx = this.db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            const finalize = (fn) => {
              try {
                resolve(fn());
              } catch (err) {
                reject(err);
              }
            };
            req.onsuccess = () => finalize(() => processFn(req.result || []));
            req.onerror = () => reject(req.error || new Error("IndexedDB getAll() failed"));
            tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
            tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction error"));
          } catch (err) {
            reject(err);
          }
        });
      }
      /** 
       * (Internal) Helper to prune in-memory buffer to max size.
       * @param {Array} buffer - The in-memory buffer array.
       * @param {number} max - The maximum allowed size.
       * @param {string} evictionReason - Reason for eviction.
       * @param {string} storeName - Name of the store.
       * @param {string} keyField - Key field name.
       */
      _pruneInMemoryBuffer(buffer, max, evictionReason, storeName, keyField) {
        while (buffer.length > max) {
          const removed = buffer.shift();
          if (this.onIndexerUpdate && removed) {
            this.onIndexerUpdate({
              type: IndexerEventType.EVICT,
              data: {
                key: removed.entry ? removed.entry[keyField] : removed[keyField],
                reason: evictionReason,
                storeName
              }
            });
          }
        }
      }
      _awaitIDBTransaction(tx) {
        return new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
          tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction error"));
        });
      }
      _getRelevantStoresForCurrentMode() {
        if (this.matchMode === MatchMode.ALL) {
          return [
            { name: IndexerStore.MATCHING_TRANSACTIONS, keyField: "txid" },
            { name: IndexerStore.TRANSACTIONS, keyField: "txid" },
            { name: IndexerStore.BLOCKS, keyField: "hash" }
          ];
        }
        if (this.matchMode === MatchMode.MATCHING) {
          return [{ name: IndexerStore.MATCHING_TRANSACTIONS, keyField: "txid" }];
        }
        if (this.matchMode === MatchMode.TRANSACTIONS) {
          return [{ name: IndexerStore.TRANSACTIONS, keyField: "txid" }];
        }
        if (this.matchMode === MatchMode.BLOCKS) {
          return [{ name: IndexerStore.BLOCKS, keyField: "hash" }];
        }
        if (this.matchMode === MatchMode.CUSTOM) {
          const stores = [];
          if (this.indexAllMatchingTransactions)
            stores.push({ name: IndexerStore.MATCHING_TRANSACTIONS, keyField: "txid" });
          if (this.indexAllTransactions)
            stores.push({ name: IndexerStore.TRANSACTIONS, keyField: "txid" });
          if (this.indexAllBlocks)
            stores.push({ name: IndexerStore.BLOCKS, keyField: "hash" });
          return stores;
        }
        return [];
      }
      async _countStore(storeName) {
        await this._dbReady;
        return new Promise((resolve) => {
          try {
            const tx = this.db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
          } catch {
            resolve(0);
          }
        });
      }
      async _isAnyRelevantStoreOverMaxSize() {
        if (!this.maxSize || this.maxSize <= 0)
          return false;
        const stores = this._getRelevantStoresForCurrentMode();
        for (const { name } of stores) {
          const count = await this._countStore(name);
          if (count > this.maxSize)
            return true;
        }
        return false;
      }
      async _enforceMaxSizeAfterFlush() {
        if (!this.maxSize || this.maxSize <= 0)
          return;
        const now = Date.now();
        const stdOnEvict = (storeName) => (evictInfo) => {
          if (this.onIndexerUpdate) {
            this.onIndexerUpdate({
              type: IndexerEventType.EVICT,
              data: { key: evictInfo.key, reason: evictInfo.reason, storeName }
            });
          }
        };
        const stores = this._getRelevantStoresForCurrentMode();
        for (const { name, keyField } of stores) {
          await this._evictStoreBySizeOnly(name, keyField, stdOnEvict(name), now);
        }
      }
      async _evictStoreBySizeOnly(storeName, keyField, onEvict, now) {
        await this._dbReady;
        if (!this.maxSize || this.maxSize <= 0)
          return;
        const txReq = this.db.transaction(storeName, "readwrite");
        const store = txReq.objectStore(storeName);
        const removeFromCache = (key) => {
          if (this._txidCacheSet.has(key)) {
            this._txidCacheSet.delete(key);
            const idx = this._txidCacheQueue.indexOf(key);
            if (idx !== -1)
              this._txidCacheQueue.splice(idx, 1);
          }
        };
        const onEvictAndRemove = (evictInfo) => {
          removeFromCache(evictInfo.key);
          if (onEvict)
            onEvict(evictInfo);
        };
        await this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove, now);
        await this._awaitIDBTransaction(txReq);
      }
      /**
      * Prune an IndexedDB store by TTL and/or max size.
      * @param {string} storeName - The name of the store (use IndexerStore constant).
      * @param {string} keyField - The key field name (e.g., "txid" or "hash").
      * @param {function} onEvict - Callback for each evicted item.
      * @returns {Promise<void>}
      */
      async _pruneIndexedDBStore(storeName, keyField, onEvict) {
        await this._dbReady;
        const now = Date.now();
        const storeTx = this.db.transaction(storeName, "readwrite");
        const store = storeTx.objectStore(storeName);
        if (this.priorityTTL) {
          if (this.ttlMs)
            await this._evictByTTL(store, keyField, now, this.ttlMs, onEvict);
          if (this.maxSize)
            await this._evictBySize(store, keyField, this.maxSize, onEvict, now);
        } else {
          if (this.maxSize)
            await this._evictBySize(store, keyField, this.maxSize, onEvict, now);
          if (this.ttlMs)
            await this._evictByTTL(store, keyField, now, this.ttlMs, onEvict);
        }
        await this._awaitIDBTransaction(storeTx);
      }
      /** 
       * (Internal) Helper to evict from a given store, enforcing eviction priority. 
       */
      async _evictStore(storeName, keyField, onEvict, now) {
        await this._dbReady;
        const txReq = this.db.transaction(storeName, "readwrite");
        const store = txReq.objectStore(storeName);
        const removeFromCache = (key) => {
          if (this._txidCacheSet.has(key)) {
            this._txidCacheSet.delete(key);
            const idx = this._txidCacheQueue.indexOf(key);
            if (idx !== -1)
              this._txidCacheQueue.splice(idx, 1);
          }
        };
        const onEvictAndRemove = (evictInfo) => {
          removeFromCache(evictInfo.key);
          if (onEvict)
            onEvict(evictInfo);
        };
        if (this.priorityTTL) {
          if (this.ttlMs)
            await this._evictByTTL(store, keyField, now, this.ttlMs, onEvictAndRemove);
          if (this.maxSize)
            await this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove, now);
        } else {
          if (this.maxSize)
            await this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove, now);
          if (this.ttlMs)
            await this._evictByTTL(store, keyField, now, this.ttlMs, onEvictAndRemove);
        }
        await this._awaitIDBTransaction(txReq);
      }
      /** 
       * (Internal) Evict items from a store by TTL. 
       */
      async _evictByTTL(store, keyField, now, ttlMs, onEvict) {
        const cutoff = now - ttlMs;
        const index = store.index("timestamp");
        const range = IDBKeyRange.upperBound(cutoff);
        const totalCount = await new Promise((resolve) => {
          const req = store.count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(0);
        });
        const expiredCount = await new Promise((resolve) => {
          let count = 0;
          const req = index.openCursor(range);
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              count++;
              cursor.continue();
            } else {
              resolve(count);
            }
          };
          req.onerror = () => resolve(0);
        });
        const batchThreshold = Math.floor(totalCount * this.batchThresholdRatio);
        if (expiredCount >= batchThreshold) {
          await new Promise((resolve) => {
            const req = index.openCursor(range);
            req.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                const entry = cursor.value;
                if (entry.timestamp <= cutoff) {
                  const delReq = store.delete(cursor.primaryKey);
                  delReq.onerror = (err) => {
                    console.error("IndexedDB delete failed (TTL eviction):", err.target.error);
                  };
                  if (onEvict)
                    onEvict({ key: cursor.primaryKey, reason: EvictionReason.TTL });
                  this._metrics.evictions.ttl++;
                }
                cursor.continue();
              } else {
                resolve();
              }
            };
            req.onerror = (e) => {
              console.error("IndexedDB openCursor failed (TTL eviction):", e.target.error);
              resolve();
            };
          });
        }
      }
      /** 
       * (Internal) Evict items from a store by max size. 
       */
      async _evictBySize(store, keyField, maxSize, onEvict, now) {
        if (!maxSize || maxSize <= 0)
          return;
        const total = await new Promise((resolve) => {
          const req = store.count();
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = (e) => {
            console.error("IndexedDB count failed (Size eviction):", e.target.error);
            resolve(0);
          };
        });
        if (total <= maxSize)
          return;
        const excess = total - maxSize;
        await new Promise((resolve) => {
          const index = store.index("timestamp");
          const cursorReq = index.openCursor();
          let deleted = 0;
          cursorReq.onerror = (err) => {
            console.error("IndexedDB openCursor failed (Size eviction):", err.target.error);
            resolve();
          };
          cursorReq.onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (!cursor || deleted >= excess) {
              resolve();
              return;
            }
            const delReq = store.delete(cursor.primaryKey);
            delReq.onerror = (err) => {
              console.error("IndexedDB delete failed (Size eviction):", err.target.error);
            };
            if (onEvict)
              onEvict({ key: cursor.primaryKey, reason: EvictionReason.SIZE });
            this._metrics.evictions.size++;
            deleted++;
            cursor.continue();
          };
        });
      }
    };
  }
});

// ../../wrapper/scanner.js
var scanner_exports = {};
__export(scanner_exports, {
  BlockScannerEvent: () => BlockScannerEvent,
  KaspaBlockScanner: () => KaspaBlockScanner,
  SearchMode: () => SearchMode
});
var BlockScannerEvent, SearchMode, KaspaBlockScanner;
var init_scanner = __esm({
  "../../wrapper/scanner.js"() {
    init_utilities();
    init_indexer();
    BlockScannerEvent = Object.freeze({
      BLOCK_ADDED: "block-added"
    });
    SearchMode = Object.freeze({
      INCLUDES: "includes",
      STARTS_WITH: "startsWith",
      EXACT: "exact",
      ENDS_WITH: "endsWith"
    });
    KaspaBlockScanner = class {
      #prefix = null;
      indexer = null;
      /**
       * Create a KaspaBlockScanner instance.
       * @param {Object} client - The Kaspa RPC client instance.
       * @param {Object} options - Scanner options.
       * @param {string|null} [options.prefix=null] - Plain string prefix to encode and match in payloads.
       * @param {string[]} [options.addresses=[]] - List of addresses to watch.
       * @param {string} [options.mode=SearchMode.INCLUDES] - Search mode: includes, startsWith, exact, endsWith.
       */
      constructor(client2, { prefix = null, addresses = [], mode = SearchMode.INCLUDES, indexerOptions = {} } = {}) {
        this.client = client2;
        this.blockSubscription = null;
        this.scanning = false;
        this.onBlock = null;
        this.#prefix = prefix ? stringToHex(prefix) : null;
        this.addresses = Array.isArray(addresses) ? addresses : [];
        this.searchMode = Object.values(SearchMode).includes(mode) ? mode : SearchMode.INCLUDES;
        this.indexer = new KaspaIndexer(indexerOptions);
        this.indexer.initDB().then(() => {
          if (typeof indexerOptions.onIndexerUpdate === "function") {
            this.indexer.onIndexerUpdate = indexerOptions.onIndexerUpdate;
          }
        });
      }
      get prefix() {
        return this.#prefix;
      }
      set prefix(value) {
        this.#prefix = value ? stringToHex(value) : null;
      }
      // --- Modularized scanning logic ---
      async start(onBlock) {
        if (!this.client)
          throw new Error("Kaspa client required");
        this.scanning = true;
        this.onBlock = onBlock;
        if (this.blockSubscription) {
          this.client.removeEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
          this.blockSubscription = null;
        }
        await this.client.subscribeBlockAdded();
        this.blockSubscription = (event) => {
          const block = event.data.block;
          const matches = [];
          this._indexBlockIfNeeded(block);
          const hasPrefix = !!this.prefix;
          const hasAddresses = Array.isArray(this.addresses) && this.addresses.length > 0;
          const indexerActive = !!(this.indexer && this.indexer.active);
          if (hasPrefix || hasAddresses || indexerActive) {
            this._processBlockTransactions(block, matches);
          }
          if (block && typeof onBlock === "function") {
            onBlock(block, matches);
          }
        };
        this.client.addEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
      }
      _processBlockTransactions(block, matches) {
        if (block && Array.isArray(block.transactions)) {
          for (const tx of block.transactions) {
            const { matchObj, isMatch } = this._analyzeTransaction(tx, block);
            if (isMatch) {
              matches.push(matchObj);
              this._indexMatchingTransactionIfNeeded(matchObj);
            }
            this._indexAllTransactionIfNeeded(tx, block);
          }
        }
      }
      _analyzeTransaction(tx, block) {
        const { payloadMatch, decodedPayload } = this._matchPayload(tx);
        const addressMatch = this._matchAddress(tx);
        const isMatch = payloadMatch || addressMatch;
        let matchObj = null;
        if (isMatch) {
          matchObj = this._buildMatchObject(tx, block, payloadMatch, addressMatch, decodedPayload);
        }
        return { matchObj, isMatch };
      }
      _matchPayload(tx) {
        let payloadMatch = false;
        let decodedPayload = null;
        if (this.prefix && tx.payload) {
          const payloadHex = tx.payload;
          const prefixHex = this.prefix;
          switch (this.searchMode) {
            case SearchMode.INCLUDES:
              if (payloadHex.includes(prefixHex))
                payloadMatch = true;
              break;
            case SearchMode.STARTS_WITH:
              if (payloadHex.startsWith(prefixHex))
                payloadMatch = true;
              break;
            case SearchMode.EXACT:
              if (payloadHex === prefixHex)
                payloadMatch = true;
              break;
            case SearchMode.ENDS_WITH:
              if (payloadHex.endsWith(prefixHex))
                payloadMatch = true;
              break;
          }
          if (payloadMatch) {
            try {
              decodedPayload = hexToString(payloadHex);
            } catch (e) {
              decodedPayload = null;
            }
          }
        }
        return { payloadMatch, decodedPayload };
      }
      _matchAddress(tx) {
        if (!Array.isArray(this.addresses) || this.addresses.length === 0)
          return false;
        let addressMatch = false;
        if (Array.isArray(tx.outputs)) {
          for (const out of tx.outputs) {
            if (out.address && this.addresses.includes(out.address)) {
              addressMatch = true;
              break;
            }
          }
        }
        if (!addressMatch && Array.isArray(tx.inputs)) {
          for (const input of tx.inputs) {
            const senderAddress = input.previousOutpointAddress;
            if (senderAddress && this.addresses.includes(senderAddress)) {
              addressMatch = true;
              break;
            }
          }
        }
        return addressMatch;
      }
      _buildMatchObject(tx, block, payloadMatch, addressMatch, decodedPayload) {
        return {
          txid: tx.verboseData.transactionId,
          timestamp: tx.verboseData.blockTime,
          blockHash: block.header.hash,
          blueScore: block.header.blueScore,
          blockDaaScore: block.header.daaScore,
          payloadHex: tx.payload,
          decodedPayload,
          payloadMatch,
          addressMatch,
          rawTx: tx
        };
      }
      _indexMatchingTransactionIfNeeded(matchObj) {
        if (!this.indexer.active)
          return;
        if (this.indexer.matchMode === MatchMode.ALL || this.indexer.matchMode === MatchMode.MATCHING || this.indexer.matchMode === MatchMode.CUSTOM && this.indexer.indexAllMatchingTransactions) {
          this.indexer.addTransaction(matchObj, true);
        }
      }
      _indexAllTransactionIfNeeded(tx, block) {
        if (!this.indexer.active)
          return;
        if (this.indexer.matchMode === MatchMode.ALL || this.indexer.matchMode === MatchMode.TRANSACTIONS || this.indexer.matchMode === MatchMode.CUSTOM && this.indexer.indexAllTransactions) {
          const obj = this._buildMatchObject(tx, block, false, false, null);
          this.indexer.addTransaction(obj, false);
        }
      }
      _indexBlockIfNeeded(block) {
        if (!this.indexer.active)
          return;
        if (this.indexer.matchMode === MatchMode.ALL || this.indexer.matchMode === MatchMode.BLOCKS || this.indexer.matchMode === MatchMode.CUSTOM && this.indexer.indexAllBlocks) {
          this.indexer.addBlock(block);
        }
      }
      /**
       * Stop scanning for new blocks and remove event listeners.
       */
      stop() {
        this.scanning = false;
        if (this.blockSubscription) {
          this.client.removeEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
          this.blockSubscription = null;
        }
        this.onBlock = null;
        this.prefix = null;
        this.addresses = [];
        this.searchMode = SearchMode.INCLUDES;
      }
    };
  }
});

// core/adapters/scanner-adapter.ts
var scanner_adapter_exports = {};
__export(scanner_adapter_exports, {
  createScannerAdapter: () => createScannerAdapter,
  stopScannerAdapter: () => stopScannerAdapter
});
async function createScannerAdapter(options) {
  const { rpc, prefixes, onMatch, logger } = options;
  const { KaspaBlockScanner: KaspaBlockScanner2 } = await Promise.resolve().then(() => (init_scanner(), scanner_exports));
  const { MatchMode: MatchMode2 } = await Promise.resolve().then(() => (init_indexer(), indexer_exports));
  const primaryPrefix = prefixes[0] || "";
  const scanner = new KaspaBlockScanner2(rpc, {
    prefix: primaryPrefix,
    indexerOptions: {
      matchMode: MatchMode2.CUSTOM,
      indexAllTransactions: false,
      indexAllMatchingTransactions: true,
      indexAllBlocks: false,
      inMemoryMaxTxs: 500,
      inMemoryMaxBlocks: 200,
      ttlMinutes: 30,
      onIndexerUpdate: (evt) => {
        if (!evt || !evt.data)
          return;
        const items = Array.isArray(evt.data) ? evt.data : [evt.data];
        for (const item of items) {
          const payloadRaw = item.decodedPayload;
          if (typeof payloadRaw !== "string")
            continue;
          for (const prefix of prefixes) {
            if (payloadRaw.startsWith(prefix)) {
              onMatch({
                txId: item.txid ?? "",
                blockHash: item.blockHash ?? null,
                timestamp: item.timestamp ?? null,
                payloadRaw,
                matchedPrefix: prefix
              });
              break;
            }
          }
        }
      }
    }
  });
  await scanner.indexer?.initDB?.();
  scanner.indexer?.start?.();
  scanner.start(() => {
  });
  logger.log("[ScannerAdapter] Started watching prefixes:", prefixes);
  return scanner;
}
async function stopScannerAdapter(handle) {
  const scanner = handle;
  scanner?.indexer?.stop?.();
  scanner?.stop?.();
}
var init_scanner_adapter = __esm({
  "core/adapters/scanner-adapter.ts"() {
    "use strict";
  }
});

// core/adapters/vrf-adapter.ts
var vrf_adapter_exports = {};
__export(vrf_adapter_exports, {
  collectKaspaBlocksAdapter: () => collectKaspaBlocksAdapter,
  fetchBtcBlocksAdapter: () => fetchBtcBlocksAdapter,
  fetchQrngAdapter: () => fetchQrngAdapter
});
async function collectKaspaBlocksAdapter(options) {
  const { rpc, count, timeoutMs } = options;
  const { KaspaBlockScanner: KaspaBlockScanner2 } = await Promise.resolve().then(() => (init_scanner(), scanner_exports));
  const hashes = [];
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      scanner?.stop?.();
      if (hashes.length > 0) {
        resolve({ hashes, entropyHex: hashes.join("") });
      } else {
        reject(new Error("Timeout collecting Kaspa blocks"));
      }
    }, timeoutMs);
    const scanner = new KaspaBlockScanner2(rpc, {
      indexerOptions: {
        indexAllBlocks: true,
        indexAllTransactions: false
      }
    });
    scanner.start((block) => {
      if (block?.hash) {
        hashes.push(block.hash);
        if (hashes.length >= count) {
          clearTimeout(timeout);
          scanner.stop();
          resolve({ hashes, entropyHex: hashes.join("") });
        }
      }
    });
  });
}
async function fetchBtcBlocksAdapter(options) {
  const { count, timeoutMs } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const tipRes = await fetch("https://blockchain.info/latestblock", {
      signal: controller.signal
    });
    const tip = await tipRes.json();
    const tipHeight = tip.height;
    const hashes = [];
    const heights = [];
    for (let i = 0; i < count; i++) {
      const height = tipHeight - i;
      const res = await fetch(`https://blockchain.info/block-height/${height}?format=json`, {
        signal: controller.signal
      });
      const data = await res.json();
      const block = data.blocks?.[0];
      if (block?.hash) {
        hashes.push(block.hash);
        heights.push(height);
      }
    }
    clearTimeout(timeout);
    return {
      hashes,
      entropyHex: hashes.join(""),
      heights
    };
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchQrngAdapter(options) {
  const { bytes, manualInput, timeoutMs } = options;
  if (manualInput && manualInput.trim()) {
    const hex = parseManualInput(manualInput);
    return { entropyHex: hex, byteCount: hex.length / 2 };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://qrng.anu.edu.au/API/jsonI.php?length=${bytes}&type=uint8`,
      { signal: controller.signal }
    );
    const data = await res.json();
    const arr = data.data ?? [];
    const hex = arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    return { entropyHex: hex, byteCount: arr.length };
  } finally {
    clearTimeout(timeout);
  }
}
function parseManualInput(input) {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    const decoded = atob(trimmed);
    return Array.from(decoded).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
  }
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr)) {
      return arr.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
    }
  } catch {
  }
  const parts = trimmed.split(/[,\s]+/).filter((p) => /^\d+$/.test(p));
  if (parts.length > 0) {
    return parts.map((p) => Number(p).toString(16).padStart(2, "0")).join("");
  }
  return "";
}
var init_vrf_adapter = __esm({
  "core/adapters/vrf-adapter.ts"() {
    "use strict";
  }
});

// core/client.ts
async function createClient(options) {
  const { network, rpcUrl, logger = console } = options;
  const { connectAdapter: connectAdapter2 } = await Promise.resolve().then(() => (init_kaspa_adapter(), kaspa_adapter_exports));
  const rpc = await connectAdapter2({ network, rpcUrl, logger });
  const state = {
    connected: true,
    network,
    rpc,
    logger
  };
  const client2 = {
    get connected() {
      return state.connected;
    },
    get network() {
      return state.network;
    },
    get rpc() {
      return state.rpc;
    },
    async disconnect() {
      if (!state.connected)
        return;
      try {
        const { disconnectAdapter: disconnectAdapter2 } = await Promise.resolve().then(() => (init_kaspa_adapter(), kaspa_adapter_exports));
        await disconnectAdapter2(state.rpc);
      } catch (e) {
        state.logger.warn("[KinesisClient] disconnect error", e);
      }
      state.connected = false;
    }
  };
  return client2;
}

// core/errors.ts
var KinesisErrorCode = /* @__PURE__ */ ((KinesisErrorCode3) => {
  KinesisErrorCode3["NOT_CONNECTED"] = "ERR_NOT_CONNECTED";
  KinesisErrorCode3["WALLET_LOCKED"] = "ERR_WALLET_LOCKED";
  KinesisErrorCode3["INSUFFICIENT_FUNDS"] = "ERR_INSUFFICIENT_FUNDS";
  KinesisErrorCode3["RATE_LIMITED"] = "ERR_RATE_LIMITED";
  KinesisErrorCode3["PAYLOAD_TOO_LARGE"] = "ERR_PAYLOAD_TOO_LARGE";
  KinesisErrorCode3["POLICY_REJECTED"] = "ERR_POLICY_REJECTED";
  KinesisErrorCode3["UNKNOWN"] = "ERR_UNKNOWN";
  KinesisErrorCode3["VRF_FETCH_FAILED"] = "ERR_VRF_FETCH_FAILED";
  KinesisErrorCode3["OBSERVER_NOT_STARTED"] = "ERR_OBSERVER_NOT_STARTED";
  return KinesisErrorCode3;
})(KinesisErrorCode || {});
var KinesisError = class _KinesisError extends Error {
  code;
  cause;
  constructor(code, message, cause) {
    super(message);
    this.name = "KinesisError";
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, _KinesisError.prototype);
  }
  static notConnected(msg = "Client is not connected") {
    return new _KinesisError("ERR_NOT_CONNECTED" /* NOT_CONNECTED */, msg);
  }
  static walletLocked(msg = "Wallet is locked or not initialized") {
    return new _KinesisError("ERR_WALLET_LOCKED" /* WALLET_LOCKED */, msg);
  }
  static insufficientFunds(msg = "Insufficient funds") {
    return new _KinesisError("ERR_INSUFFICIENT_FUNDS" /* INSUFFICIENT_FUNDS */, msg);
  }
  static rateLimited(msg = "Rate limited; retry later") {
    return new _KinesisError("ERR_RATE_LIMITED" /* RATE_LIMITED */, msg);
  }
  static payloadTooLarge(msg = "Payload exceeds maximum size") {
    return new _KinesisError("ERR_PAYLOAD_TOO_LARGE" /* PAYLOAD_TOO_LARGE */, msg);
  }
  static policyRejected(msg = "Transaction rejected by policy", cause) {
    return new _KinesisError("ERR_POLICY_REJECTED" /* POLICY_REJECTED */, msg, cause);
  }
  static vrfFetchFailed(msg = "VRF source fetch failed", cause) {
    return new _KinesisError("ERR_VRF_FETCH_FAILED" /* VRF_FETCH_FAILED */, msg, cause);
  }
  static unknown(msg, cause) {
    return new _KinesisError("ERR_UNKNOWN" /* UNKNOWN */, msg, cause);
  }
};

// core/wallet.ts
async function createWallet2(options) {
  const { client: client2, name, password, logger = console } = options;
  if (!client2.connected) {
    throw KinesisError.notConnected("Cannot create wallet: client not connected");
  }
  const { initWalletAdapter: initWalletAdapter2, createWalletAdapter: createWalletAdapter2, getBalanceAdapter: getBalanceAdapter2 } = await Promise.resolve().then(() => (init_wallet_adapter(), wallet_adapter_exports));
  const balanceCallbacks = /* @__PURE__ */ new Set();
  const handleBalanceChange = (balance) => {
    state.lastBalance = balance;
    for (const cb of balanceCallbacks) {
      try {
        cb(balance);
      } catch {
      }
    }
  };
  await initWalletAdapter2({
    rpc: client2.rpc,
    network: client2.network,
    logger,
    onBalanceChange: handleBalanceChange
  });
  const { address, handle } = await createWalletAdapter2({
    name,
    password
  });
  const state = {
    ready: true,
    address,
    handle,
    balanceCallbacks,
    lastBalance: null,
    logger
  };
  const wallet2 = {
    get ready() {
      return state.ready;
    },
    get address() {
      return state.address;
    },
    get handle() {
      return state.handle;
    },
    async getBalance() {
      if (!state.ready)
        throw KinesisError.walletLocked();
      if (state.lastBalance)
        return state.lastBalance;
      const balance = await getBalanceAdapter2();
      state.lastBalance = balance;
      return balance;
    },
    onBalanceChange(cb) {
      state.balanceCallbacks.add(cb);
      return () => {
        state.balanceCallbacks.delete(cb);
      };
    },
    async close() {
      state.ready = false;
      state.balanceCallbacks.clear();
    }
  };
  return wallet2;
}

// core/sender.ts
var MAX_PAYLOAD_BYTES2 = 32 * 1024;
function utf8Len(s) {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
}
function createSender(options) {
  const { client: client2, wallet: wallet2, toAddress = "", logger = console } = options;
  const state = {
    client: client2,
    wallet: wallet2,
    defaultTo: toAddress,
    logger,
    backlog: [],
    inFlight: false
  };
  async function send2(params) {
    if (!state.client.connected)
      throw KinesisError.notConnected();
    if (!state.wallet.ready)
      throw KinesisError.walletLocked();
    const to = params.toAddress || state.defaultTo;
    if (!to)
      throw new KinesisError("ERR_UNKNOWN" /* UNKNOWN */, "No recipient address specified");
    const payload = params.payload ?? null;
    if (payload && utf8Len(payload) > MAX_PAYLOAD_BYTES2) {
      throw KinesisError.payloadTooLarge(`Payload is ${utf8Len(payload)} bytes; max is ${MAX_PAYLOAD_BYTES2}`);
    }
    if (payload) {
      state.backlog.push(payload);
    }
    while (state.inFlight) {
      await sleep(50);
    }
    state.inFlight = true;
    try {
      const { sendAdapter: sendAdapter2 } = await Promise.resolve().then(() => (init_tx_adapter(), tx_adapter_exports));
      const result = await sendAdapter2({
        amountKas: params.amountKas,
        toAddress: to,
        payload: buildBundledPayload(state.backlog),
        wallet: state.wallet.handle
      });
      const sentPayload = buildBundledPayload(state.backlog);
      state.backlog = [];
      return { txId: result.txId, payload: sentPayload };
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (/insufficient|not enough|balance|fund/i.test(msg)) {
        throw KinesisError.insufficientFunds(msg);
      }
      if (/storage.mass|policy|dust/i.test(msg)) {
        throw KinesisError.policyRejected(msg, err);
      }
      if (/rate|busy|limit/i.test(msg)) {
        throw KinesisError.rateLimited(msg);
      }
      throw KinesisError.unknown(msg, err);
    } finally {
      state.inFlight = false;
    }
  }
  return {
    send: send2,
    get backlogSize() {
      return state.backlog.length;
    }
  };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function buildBundledPayload(backlog) {
  if (backlog.length === 0)
    return null;
  if (backlog.length === 1)
    return backlog[0];
  const bundled = JSON.stringify(backlog);
  if (utf8Len(bundled) > MAX_PAYLOAD_BYTES2) {
    return backlog[backlog.length - 1];
  }
  return bundled;
}

// core/observer.ts
function createObserver(options) {
  const { client: client2, filters, logger = console } = options;
  const state = {
    client: client2,
    filters,
    logger,
    running: false,
    callbacks: /* @__PURE__ */ new Set(),
    scannerHandle: null
  };
  function emit(event) {
    for (const cb of state.callbacks) {
      try {
        cb(event);
      } catch (e) {
        state.logger.warn("[KinesisObserver] callback error", e);
      }
    }
  }
  async function start() {
    if (!state.client.connected)
      throw KinesisError.notConnected();
    if (state.running)
      return;
    const { createScannerAdapter: createScannerAdapter2 } = await Promise.resolve().then(() => (init_scanner_adapter(), scanner_adapter_exports));
    const prefixes = state.filters.map((f) => f.prefix);
    state.scannerHandle = await createScannerAdapter2({
      rpc: state.client.rpc,
      prefixes,
      onMatch: (match) => {
        let payloadParsed = null;
        const prefixLen = match.matchedPrefix.length;
        const jsonPart = match.payloadRaw.slice(prefixLen);
        try {
          payloadParsed = JSON.parse(jsonPart);
        } catch {
        }
        emit({
          txId: match.txId,
          blockHash: match.blockHash,
          timestamp: match.timestamp,
          payloadRaw: match.payloadRaw,
          payloadParsed,
          matchedPrefix: match.matchedPrefix
        });
      },
      logger: state.logger
    });
    state.running = true;
  }
  function stop() {
    if (!state.running)
      return;
    (async () => {
      try {
        const { stopScannerAdapter: stopScannerAdapter2 } = await Promise.resolve().then(() => (init_scanner_adapter(), scanner_adapter_exports));
        await stopScannerAdapter2(state.scannerHandle);
      } catch (e) {
        state.logger.warn("[KinesisObserver] stop error", e);
      }
    })();
    state.running = false;
  }
  function on(_event, callback) {
    state.callbacks.add(callback);
    return () => {
      state.callbacks.delete(callback);
    };
  }
  return {
    start,
    stop,
    on,
    get running() {
      return state.running;
    }
  };
}

// core/vrf/index.ts
var vrf_exports = {};
__export(vrf_exports, {
  fetchBtcBlocks: () => fetchBtcBlocks,
  fetchKaspaBlocks: () => fetchKaspaBlocks,
  fetchQrng: () => fetchQrng,
  fold: () => fold
});

// core/vrf/kaspa-source.ts
async function fetchKaspaBlocks(options) {
  const { client: client2, count, timeoutMs = 6e4 } = options;
  if (!client2.connected)
    throw KinesisError.notConnected();
  const { collectKaspaBlocksAdapter: collectKaspaBlocksAdapter2 } = await Promise.resolve().then(() => (init_vrf_adapter(), vrf_adapter_exports));
  const result = await collectKaspaBlocksAdapter2({
    rpc: client2.rpc,
    count,
    timeoutMs
  });
  return result;
}

// core/vrf/btc-source.ts
async function fetchBtcBlocks(options = {}) {
  const { count = 6, timeoutMs = 15e3 } = options;
  const { fetchBtcBlocksAdapter: fetchBtcBlocksAdapter2 } = await Promise.resolve().then(() => (init_vrf_adapter(), vrf_adapter_exports));
  try {
    const result = await fetchBtcBlocksAdapter2({ count, timeoutMs });
    return result;
  } catch (e) {
    throw KinesisError.vrfFetchFailed("Failed to fetch BTC blocks", e);
  }
}

// core/vrf/qrng-source.ts
async function fetchQrng(options = {}) {
  const { bytes = 32, manualInput, timeoutMs = 1e4 } = options;
  const { fetchQrngAdapter: fetchQrngAdapter2 } = await Promise.resolve().then(() => (init_vrf_adapter(), vrf_adapter_exports));
  try {
    const result = await fetchQrngAdapter2({ bytes, manualInput, timeoutMs });
    return result;
  } catch (e) {
    throw KinesisError.vrfFetchFailed("Failed to fetch QRNG", e);
  }
}

// core/vrf/fold.ts
async function fold(options) {
  const { kaspa, btc, qrng, iterations = 1e3 } = options;
  const parts = [];
  if (kaspa?.entropyHex)
    parts.push(kaspa.entropyHex);
  if (btc?.entropyHex)
    parts.push(btc.entropyHex);
  if (qrng?.entropyHex)
    parts.push(qrng.entropyHex);
  const combined = parts.join("");
  const bytes = hexToBytes(combined || "00");
  let hash = bytes;
  for (let i = 0; i < iterations; i++) {
    const digest = await crypto.subtle.digest("SHA-256", hash.buffer);
    hash = new Uint8Array(digest);
  }
  return {
    outputHex: bytesToHex(hash),
    inputs: {
      kaspaEntropyHex: kaspa?.entropyHex ?? null,
      btcEntropyHex: btc?.entropyHex ?? null,
      qrngEntropyHex: qrng?.entropyHex ?? null
    },
    iterations
  };
}
function hexToBytes(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const len = clean.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export {
  KinesisError,
  KinesisErrorCode,
  createClient,
  createObserver,
  createSender,
  createWallet2 as createWallet,
  vrf_exports as vrf
};
//# sourceMappingURL=index.js.map
