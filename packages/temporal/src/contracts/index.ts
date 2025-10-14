/**
 * Temporal Workflow Contracts
 *
 * These types define the interfaces between Temporal workers and clients.
 * Workers implement these contracts, clients consume them.
 *
 * All workflows are database-agnostic - they return complete results
 * through Temporal, and clients decide what to persist.
 */

export * from './discovery';
export * from './portscan';
