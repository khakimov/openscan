/**
 * JSON-safe type definitions (zero dependencies)
 * Re-exported for use in DB package and elsewhere
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

/**
 * Runtime type guard for JSON-safe values
 * Use in tests to verify non-JSON types are rejected
 */
export function isJsonSafe(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number' && !isNaN(value)) return true;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonSafe);
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonSafe);
  }
  return false; // Date, Map, Set, function, undefined, Symbol all fail
}

/**
 * Helper to find non-JSON-safe values in an object
 */
function findNonJsonSafeValue(value: unknown, path: string = 'root'): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return null;
  if (typeof value === 'number' && !isNaN(value)) return null;
  if (typeof value === 'boolean') return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const result = findNonJsonSafeValue(value[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      const result = findNonJsonSafeValue(val, `${path}.${key}`);
      if (result) return result;
    }
    return null;
  }

  // Found a non-JSON-safe value
  const type = value === undefined ? 'undefined' :
               value instanceof Date ? 'Date' :
               value instanceof Map ? 'Map' :
               value instanceof Set ? 'Set' :
               typeof value === 'function' ? 'function' :
               typeof value === 'symbol' ? 'symbol' :
               typeof value;

  return `${path} (type: ${type}, value: ${String(value)})`;
}

/**
 * Safe cast helper with runtime validation
 * Use instead of `as JsonObject` - documents Zod guarantee
 */
export function toJsonObject(value: unknown): JsonObject {
  if (!isJsonSafe(value)) {
    const problemPath = findNonJsonSafeValue(value);
    throw new Error(`Value is not JSON-safe. Problem at: ${problemPath}`);
  }
  return value as JsonObject;
}
