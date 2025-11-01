/**
 * Base Handler Interfaces
 *
 * Defines the contract that all postback handlers must implement.
 * This enables type-safe, extensible postback handling with dependency injection.
 */

import type { z } from 'zod';
import type { ILogger } from '@repo/logger';
import type { BasePostback } from '../types';

/**
 * Context passed to all postback handlers
 *
 * Provides access to environment bindings, logging, and timing information.
 */
export interface HandlerContext {
  /** Environment bindings (use cloudflare:workers Env type) */
  env?: Partial<Env>;

  /** Logger instance for structured logging */
  logger: ILogger;

  /** Timestamp when postback processing started (for latency tracking) */
  startTime: number;
}

/**
 * Result returned by postback handlers
 *
 * Handlers return this standardized result to communicate success/failure
 * and provide analytics metadata.
 */
export interface HandlerResult {
  /** Whether the postback was handled successfully */
  success: boolean;

  /** Optional human-readable message (for logging or response body) */
  message?: string;

  /** Analytics metadata to track with Analytics Engine */
  analytics?: {
    /** Event type (e.g., 'postback_portscan_success') */
    eventType: string;

    /** String metadata (scanId, deviceId, organizationId, error message) */
    blobs?: string[];

    /** Numeric metadata (latency, port count, subdomain count) */
    doubles?: number[];
  };
}

/**
 * Postback Handler Interface
 *
 * All concrete postback handlers must implement this interface.
 * The generic type T ensures type-safety between the schema and handler method.
 *
 * @example
 * class PortScanPostbackHandler implements PostbackHandler<PortScanPostback> {
 *   readonly type = 'PORT_SCAN';
 *   readonly schema = PortScanPostbackSchema;
 *
 *   async handle(payload: PortScanPostback, ctx: HandlerContext): Promise<HandlerResult> {
 *     // Implementation
 *   }
 * }
 */
export interface PostbackHandler<T extends BasePostback> {
  /**
   * Postback type identifier (e.g., 'PORT_SCAN', 'DISCOVERY')
   *
   * Must match the 'type' field in the postback payload.
   * Used by the router to select the correct handler.
   */
  readonly type: string;

  /**
   * Zod schema for validating the postback payload
   *
   * The schema ensures the payload conforms to type T.
   * Validation happens before handle() is called.
   */
  readonly schema: z.ZodType<T>;

  /**
   * Handle the postback
   *
   * Core business logic for processing the postback.
   * Called after authentication and validation pass.
   *
   * @param payload - Validated postback payload (type T)
   * @param ctx - Handler context with env, logger, startTime
   * @returns HandlerResult with success flag and optional analytics
   *
   * @throws Should not throw - catch errors and return HandlerResult with success: false
   */
  handle(payload: T, ctx: HandlerContext): Promise<HandlerResult>;
}
