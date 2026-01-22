// kktp/validation/kktpValidator.ts

import { kktpValidatorType } from "./validatorType";
import { KKTPValidationError } from "../errors/kktpValidationError";

// Schemas
import discoverySchema from "../schemas/discovery.schema.json";
import responseSchema from "../schemas/response.schema.json";
import sessionEndSchema from "../schemas/sessionEnd.schema.json";
import mailboxMessageSchema from "../schemas/message.schema.json";

// Types
import type { ValidatorOptions } from "../types/validator";
import type { JsonSchema } from "../types/jsonSchema";

export class KKTPValidator {
  private schema: JsonSchema;
  private name: string;

  constructor(schema: JsonSchema, { name = kktpValidatorType.default }: ValidatorOptions = {}) {
    this.schema = schema;
    this.name = name;
  }

  validate(obj: unknown): true {
    this._validateSchema(this.schema, obj, this.name);
    return true;
  }

  private _validateSchema(schema: JsonSchema, value: unknown, path: string): void {
    if (schema.required && (value === undefined || value === null)) {
      throw new KKTPValidationError("Value is required", path);
    }

    if (value === undefined || value === null) {
      if (schema.type === "null" || !schema.required) return;
      throw new KKTPValidationError("Value cannot be null/undefined", path);
    }

    if (schema.type) this._checkType(schema.type, value, path);

    if (schema.enum && !schema.enum.includes(value)) {
      throw new KKTPValidationError(
        `Value "${value}" not in enum [${schema.enum.join(", ")}]`,
        path
      );
    }

    if (schema.pattern) {
      const re = schema.pattern instanceof RegExp ? schema.pattern : new RegExp(schema.pattern);
      if (typeof value !== "string" || !re.test(value)) {
        throw new KKTPValidationError(
          `Value "${value}" does not match pattern ${re}`,
          path
        );
      }
    }

    if (schema.type === "object" && schema.properties) {
      this._validateObject(schema, value as Record<string, unknown>, path);
    }

    if (schema.type === "array" && schema.items) {
      this._validateArray(schema, value as unknown[], path);
    }
  }

  private _checkType(expected: string, value: unknown, path: string): void {
    const actual =
      value === null
        ? "null"
        : Array.isArray(value)
        ? "array"
        : typeof value;

    if (expected === "number") {
      if (actual !== "number" || !Number.isFinite(value as number)) {
        throw new KKTPValidationError("Expected finite number", path);
      }
      return;
    }

    if (expected !== actual) {
      throw new KKTPValidationError(
        `Expected type "${expected}" but got "${actual}"`,
        path
      );
    }
  }

  private _validateObject(schema: JsonSchema, obj: Record<string, unknown>, path: string): void {
    const props = schema.properties || {};
    const keys = Object.keys(obj);

    for (const [key, propSchema] of Object.entries(props)) {
      if (propSchema.required && !(key in obj)) {
        throw new KKTPValidationError(`Missing required field "${key}"`, path);
      }
    }

    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj) {
        this._validateSchema(propSchema, obj[key], `${path}.${key}`);
      }
    }

    const additional = schema.additionalProperties;

    // Top-level special case: allow "meta" even when additionalProperties is false
    const isTopLevel = path === this.name;

    if (additional === false) {
      for (const key of keys) {
        if (!(key in props)) {
          if (isTopLevel && key === "meta") continue; // allow meta at top level
          throw new KKTPValidationError(`Unexpected field "${key}"`, `${path}.${key}`);
        }
      }
    }
  }

  private _validateArray(schema: JsonSchema, arr: unknown[], path: string): void {
    if (!Array.isArray(arr)) {
      throw new KKTPValidationError("Expected array", path);
    }

    const itemSchema = schema.items!;
    for (let i = 0; i < arr.length; i++) {
      this._validateSchema(itemSchema, arr[i], `${path}[${i}]`);
    }
  }
}

// ---- Ready-to-use validators ----

export const discoveryValidator = new KKTPValidator(discoverySchema, {
  name: kktpValidatorType.discovery,
});

export const responseValidator = new KKTPValidator(responseSchema, {
  name: kktpValidatorType.response,
});

export const sessionEndValidator = new KKTPValidator(sessionEndSchema, {
  name: kktpValidatorType.sessionEnd,
});

export const mailboxMessageValidator = new KKTPValidator(mailboxMessageSchema, {
  name: kktpValidatorType.mailboxMessage,
});