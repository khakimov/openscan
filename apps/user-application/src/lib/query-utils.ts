import type { Query, QueryKey } from '@tanstack/react-query';

/**
 * Query utility functions for TanStack Query + tRPC integration
 */

/**
 * Extracts the procedure path from a query key.
 * tRPC format: [['procedure', 'path'], { input, type }] -> ['procedure', 'path']
 * Simple format: ['procedure', 'path'] -> ['procedure', 'path']
 */
function extractPath(key: QueryKey): string[] | null {
  if (!Array.isArray(key)) return null;
  return Array.isArray(key[0]) ? (key[0] as string[]) : (key as string[]);
}

export interface InvalidateTRPCQueryOptions {
  /**
   * If true, uses prefix matching so ['device'] invalidates ['device', 'list'], ['device', 'detail'], etc.
   * If false (default), requires exact path match.
   */
  prefix?: boolean;
}

/**
 * Helper to invalidate tRPC-style queries by procedure path.
 *
 * Two matching modes:
 * 1. Exact match (default): Matches queries with the exact procedure path.
 *    invalidateTRPCQuery(['device', 'list'])
 *    - Matches: [['device', 'list'], { input: {...}, type: 'query' }]
 *    - Does NOT match: [['device', 'detail'], ...]
 *
 * 2. Prefix match (prefix: true): Matches all queries under the path prefix.
 *    invalidateTRPCQuery(['device'], { prefix: true })
 *    - Matches: [['device', 'list'], ...], [['device', 'detail'], ...], [['device', 'list', 'all'], ...]
 *
 * Usage:
 * ```ts
 * // Exact match - only invalidates device.list queries
 * queryClient.invalidateQueries(invalidateTRPCQuery(['device', 'list']));
 *
 * // Prefix match - invalidates all device.* queries
 * queryClient.invalidateQueries(invalidateTRPCQuery(['device'], { prefix: true }));
 * ```
 */
export function invalidateTRPCQuery(
  procedurePath: QueryKey,
  options: InvalidateTRPCQueryOptions = {}
) {
  const { prefix = false } = options;

  return {
    predicate: (query: Query<unknown, Error, unknown, QueryKey>) => {
      const queryPath = extractPath(query.queryKey);
      const invalidatePath = extractPath(procedurePath);
      if (!queryPath || !invalidatePath) return false;

      if (prefix) {
        // Prefix matching: procedurePath must be a prefix of queryPath
        if (invalidatePath.length > queryPath.length) return false;
        return invalidatePath.every((seg, i) => queryPath[i] === seg);
      } else {
        // Exact matching: queryPath must exactly equal procedurePath
        if (invalidatePath.length !== queryPath.length) return false;
        return invalidatePath.every((seg, i) => queryPath[i] === seg);
      }
    },
  };
}
