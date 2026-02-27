/**
 * Query utility functions for TanStack Query + tRPC integration
 */

/**
 * Helper to invalidate tRPC-style queries by procedure path
 *
 * tRPC query keys are structured as: [['procedure', 'path'], { input: {...}, type: 'query' }]
 * This predicate matches the first element (procedure path) to invalidate all queries for that procedure.
 *
 * Usage:
 * ```ts
 * queryClient.invalidateQueries(
 *   invalidateTRPCQuery(['device', 'list'])
 * );
 * ```
 *
 * This will match queries like:
 * - [['device', 'list'], { input: { projectId: '123' }, type: 'query' }]
 * - [['device', 'list'], { input: { verificationStatus: 'VERIFIED' }, type: 'query' }]
 */
export function invalidateTRPCQuery(procedurePath: readonly string[]) {
  return {
    predicate: (query: any) => {
      const queryKey = query.queryKey;
      // Check if first element of query key matches our procedure path
      if (Array.isArray(queryKey) && Array.isArray(queryKey[0])) {
        // tRPC format: [['device', 'list'], { input: {...}, type: 'query' }]
        return JSON.stringify(queryKey[0]) === JSON.stringify(procedurePath);
      }
      return false;
    }
  };
}
