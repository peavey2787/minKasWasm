// kktpCanonical.ts

export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") return serializeNumber(value as number);
  if (t === "string") return serializeString(value as string);
  if (Array.isArray(value)) return serializeArray(value);
  if (t === "object") return serializeObject(value as Record<string, unknown>);

  throw new Error("Unsupported type in canonical JSON");
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("Non-finite numbers are not allowed in canonical JSON");
  }

  let s = n.toString();

  if (s.includes("e") || s.includes("E")) {
    s = toPlainString(n);
  }

  if (s === "-0") s = "0";

  return s;
}

function toPlainString(n: number): string {
  const s = n.toString();
  if (!/e/i.test(s)) return s;

  const [mantissa, expStr] = s.split(/e/i);
  const exp = parseInt(expStr, 10);

  let [intPart, fracPart = ""] = mantissa.split(".");

  if (exp > 0) {
    const neededZeros = exp - fracPart.length;
    if (neededZeros >= 0) {
      return intPart + fracPart + "0".repeat(neededZeros);
    } else {
      const idx = fracPart.length + exp;
      return intPart + fracPart.slice(0, idx) + "." + fracPart.slice(idx);
    }
  } else {
    const zeros = "0".repeat(Math.abs(exp) - 1);
    return "0." + zeros + intPart + fracPart;
  }
}

function serializeString(str: string): string {
  let out = '"';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    switch (c) {
      case 0x22: out += '\\"'; break;
      case 0x5C: out += '\\\\'; break;
      case 0x08: out += '\\b'; break;
      case 0x0C: out += '\\f'; break;
      case 0x0A: out += '\\n'; break;
      case 0x0D: out += '\\r'; break;
      case 0x09: out += '\\t'; break;
      default:
        if (c < 0x20) {
          out += "\\u" + c.toString(16).padStart(4, "0");
        } else {
          out += str[i];
        }
    }
  }
  out += '"';
  return out;
}

function serializeArray(arr: unknown[]): string {
  const parts = [];
  for (let i = 0; i < arr.length; i++) {
    parts.push(serialize(arr[i]));
  }
  return "[" + parts.join(",") + "]";
}

function serializeObject(obj: Record<string, unknown>): string {
  if (obj === null) return "null";

  const keys = Object.keys(obj).sort();
  const parts = [];

  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    parts.push(serializeString(k) + ":" + serialize(v));
  }

  return "{" + parts.join(",") + "}";
}
