/**
 * Parse JSON metadata that may be a string or object.
 * Returns empty object on failure or null/undefined input.
 */
export function parseJsonMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to empty object
    }
  }
  return {};
}
