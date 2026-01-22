declare module "*.schema.json" {
  import type { JsonSchema } from "./jsonSchema.js";
  const schema: JsonSchema;
  export default schema;
}

declare module "*.json" {
  const value: any;
  export default value;
}

declare module "https://esm.sh/@noble/ed25519@1.7.3" {
  export const etc: any;
  export const utils: any;
  export function sign(msg: Uint8Array, priv: Uint8Array): Promise<Uint8Array>;
  export function verify(sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean;
}