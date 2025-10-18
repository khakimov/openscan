/**
 * Postback Handler Registry
 *
 * Central registry for managing postback handlers. The router uses this registry
 * to look up the correct handler based on the postback type field.
 *
 * Adding a new handler:
 * 1. Create handler class implementing PostbackHandler<YourType>
 * 2. Import the handler in this file
 * 3. Call postbackRegistry.register(new YourHandler())
 *
 * @example
 * // In your handler file
 * export class WebScanPostbackHandler implements PostbackHandler<WebScanPostback> {
 *   readonly type = 'WEB_SCAN';
 *   // ... implementation
 * }
 *
 * // In this file
 * import { WebScanPostbackHandler } from './web-scan';
 * postbackRegistry.register(new WebScanPostbackHandler());
 */

import type { PostbackHandler } from './base';
import type { BasePostback } from '../types';

/**
 * Handler Registry
 *
 * Maps postback type strings to handler instances.
 * Provides methods for registering handlers and looking them up by type.
 */
export class PostbackRegistry {
  /**
   * Internal storage: Map of type string -> handler instance
   * @private
   */
  private handlers: Map<string, PostbackHandler<any>>;

  constructor() {
    this.handlers = new Map();
  }

  /**
   * Register a postback handler
   *
   * Adds a handler to the registry. If a handler with the same type already exists,
   * it will be replaced (useful for testing or hot-reloading).
   *
   * @param handler - Handler instance to register
   *
   * @example
   * registry.register(new PortScanPostbackHandler());
   * registry.register(new DiscoveryPostbackHandler());
   */
  register<T extends BasePostback>(handler: PostbackHandler<T>): void {
    if (this.handlers.has(handler.type)) {
      console.warn(
        `[PostbackRegistry] Replacing existing handler for type: ${handler.type}`
      );
    }

    this.handlers.set(handler.type, handler);
    console.info(
      `[PostbackRegistry] Registered handler for type: ${handler.type}`
    );
  }

  /**
   * Get a handler by postback type
   *
   * Looks up a handler in the registry by its type string.
   * Returns undefined if no handler is registered for the given type.
   *
   * @param type - Postback type string (e.g., 'PORT_SCAN', 'DISCOVERY')
   * @returns Handler instance or undefined if not found
   *
   * @example
   * const handler = registry.get('PORT_SCAN');
   * if (handler) {
   *   await handler.handle(payload, ctx);
   * }
   */
  get(type: string): PostbackHandler<any> | undefined {
    return this.handlers.get(type);
  }

  /**
   * Get all registered postback types
   *
   * Returns an array of all registered type strings.
   * Useful for debugging and error messages.
   *
   * @returns Array of type strings
   *
   * @example
   * const types = registry.getAllTypes();
   * console.log(`Supported types: ${types.join(', ')}`);
   * // Output: "Supported types: PORT_SCAN, DISCOVERY"
   */
  getAllTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a handler is registered for a given type
   *
   * @param type - Postback type string to check
   * @returns true if handler exists, false otherwise
   *
   * @example
   * if (!registry.has('WEB_SCAN')) {
   *   console.log('Web scan handler not yet implemented');
   * }
   */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get the number of registered handlers
   *
   * @returns Count of registered handlers
   */
  get size(): number {
    return this.handlers.size;
  }

  /**
   * Clear all registered handlers
   *
   * Useful for testing. Removes all handlers from the registry.
   */
  clear(): void {
    this.handlers.clear();
    console.info('[PostbackRegistry] Cleared all handlers');
  }
}

/**
 * Singleton registry instance
 *
 * Import this instance to register handlers or look them up.
 * The singleton pattern ensures all parts of the app use the same registry.
 *
 * @example
 * // In handler files (port-scan.ts, discovery.ts, etc.)
 * import { postbackRegistry } from './registry';
 *
 * // Register handler when module loads
 * postbackRegistry.register(new PortScanPostbackHandler());
 *
 * // In router (index.ts)
 * import { postbackRegistry } from './handlers/registry';
 *
 * const handler = postbackRegistry.get(payload.type);
 */
export const postbackRegistry = new PostbackRegistry();

/**
 * Register all handlers
 *
 * Import and register concrete handlers here.
 * This ensures they're available when the registry is used.
 */
import { portScanPostbackHandler } from './port-scan';
import { discoveryPostbackHandler } from './discovery';

postbackRegistry.register(portScanPostbackHandler);
postbackRegistry.register(discoveryPostbackHandler);
