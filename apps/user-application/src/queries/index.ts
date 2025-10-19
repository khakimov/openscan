/**
 * Centralized query definitions
 *
 * All TanStack Query queryOptions are defined here for:
 * - Reusability in loaders and components
 * - Type-safe query keys
 * - Single source of truth
 * - Easy cache invalidation
 */
export { deviceQueries } from './device-queries';
export { scanQueries } from './scan-queries';
export { discoveryQueries } from './discovery-queries';
