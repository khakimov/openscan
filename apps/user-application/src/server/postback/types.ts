import type {
  BasePostback,
  DiscoveryPostback,
  HttpxPostback,
  PortScanPostback,
  ScheduleAutoPausedPostback,
  ScheduledScanExecutedPostback,
  UniversalPostback,
} from '@repo/contracts/postbacks';

export type {
  BasePostback,
  DiscoveryPostback,
  HttpxPostback,
  PortScanPostback,
  ScheduleAutoPausedPostback,
  ScheduledScanExecutedPostback,
};

/**
 * Unified discriminated union covering every supported postback payload.
 * Consumers can narrow on payload.type for exhaustive handling.
 */
export type PostbackPayload = UniversalPostback;

/**
 * Type guard that narrows a postback payload to a specific discriminant.
 */
export function isPostbackType<T extends PostbackPayload>(
  payload: PostbackPayload,
  type: T['type'],
): payload is T {
  return payload.type === type;
}

/**
 * Convenience helpers for working with discriminated unions.
 */
export type PostbackType<T extends PostbackPayload> = T['type'];
export type PostbackTypeString = PostbackPayload['type'];

