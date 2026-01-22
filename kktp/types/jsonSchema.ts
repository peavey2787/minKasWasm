// types/jsonSchema.ts

export interface JsonSchema {
  type?: string;
  required?: boolean | string[];
  enum?: unknown[];
  pattern?: string | RegExp;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
}