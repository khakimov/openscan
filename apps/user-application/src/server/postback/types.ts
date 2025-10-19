/**
 * Universal Postback Types
 *
 * Type-safe discriminated union pattern for handling multiple postback types
 * from restate-worker. Each postback type extends BasePostback and adds
 * specific data fields.
 *
 * Adding a new postback type:
 * 1. Define interface extending BasePostback
 * 2. Add to PostbackPayload union
 * 3. Create handler implementing PostbackHandler<YourType>
 * 4. Register handler in postbackRegistry
 */

/**
 * Base postback interface - common fields for all postback types
 */
export interface BasePostback {
  /** Discriminator field - identifies the postback type */
  type: string;

  /** Restate workflow key (e.g., "portscan-192-168-1-1-123456" or "discovery-example-com-123456") */
  scanId: string;

  /** Organization that owns this workflow */
  organizationId: string;

  /** ISO 8601 timestamp when postback was sent */
  timestamp: string;

  /** Workflow completion status */
  status: 'SUCCESS' | 'FAILURE';

  /** Error message if status is FAILURE */
  error?: string;
}

/**
 * Port scan postback - sent when port scan workflow completes
 */
export interface PortScanPostback extends BasePostback {
  type: 'PORT_SCAN';

  /** Device ID that was scanned */
  deviceId: string;

  /** Scan results data */
  data: {
    /** Target that was scanned (IP or hostname) */
    target: string;

    /** Array of discovered ports */
    ports: Array<{
      port: number;
      protocol: 'tcp' | 'udp';
      state: 'open' | 'closed' | 'filtered';
      service?: string;
      version?: string;
    }>;

    /** OS detection information (optional) */
    osInfo?: {
      name?: string;
      version?: string;
      accuracy?: number;
      cpe?: string[];
    };

    /** Scan timing metadata */
    timing?: {
      start?: number;
      end?: number;
      elapsed?: number;
    };

    /** Scanner metadata */
    scanMetadata?: {
      scanner?: string;
      version?: string;
      arguments?: string;
      duration?: number;
      resolvedTarget?: string;
    };
  };
}

/**
 * Discovery postback - sent when subdomain discovery workflow completes
 */
export interface DiscoveryPostback extends BasePostback {
  type: 'DISCOVERY';

  /** Discovery results data */
  data: {
    /** Target domain that was scanned */
    target: string;

    /** Array of discovered devices/subdomains */
    devices: Array<{
      hostname: string;
      ipAddress?: string;
      metadata?: Record<string, any>;
    }>;

    /** Total number of unique subdomains found */
    totalSubdomains: number;

    /** Workflow execution time in milliseconds */
    executionTime: number;

    /** Discovery tools used (e.g., ['subfinder', 'amass']) */
    tools: string[];

    /** Any errors encountered during discovery (optional) */
    errors?: string[];
  };
}

/**
 * Discriminated union of all postback types
 *
 * TypeScript will narrow the type based on the 'type' field:
 *
 * @example
 * function handlePostback(payload: PostbackPayload) {
 *   if (payload.type === 'PORT_SCAN') {
 *     // TypeScript knows payload is PortScanPostback
 *     console.log(payload.deviceId); // ✓ OK
 *   } else if (payload.type === 'DISCOVERY') {
 *     // TypeScript knows payload is DiscoveryPostback
 *     console.log(payload.data.devices); // ✓ OK
 *   }
 * }
 */
export type PostbackPayload =
  | PortScanPostback
  | DiscoveryPostback;
  // Add new postback types here:
  // | WebScanPostback
  // | VulnerabilityScanPostback
  // etc.

/**
 * Type guard to check if payload is a specific postback type
 *
 * @example
 * if (isPostbackType<PortScanPostback>(payload, 'PORT_SCAN')) {
 *   // payload is now typed as PortScanPostback
 * }
 */
export function isPostbackType<T extends PostbackPayload>(
  payload: PostbackPayload,
  type: T['type']
): payload is T {
  return payload.type === type;
}

/**
 * Extract the postback type string from a PostbackPayload type
 *
 * @example
 * type PortScanType = PostbackType<PortScanPostback>; // 'PORT_SCAN'
 */
export type PostbackType<T extends PostbackPayload> = T['type'];

/**
 * All valid postback type strings
 */
export type PostbackTypeString = PostbackPayload['type'];
