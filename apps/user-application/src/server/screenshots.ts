/**
 * Screenshot Server Utilities
 *
 * Helper functions for screenshot URL generation.
 * Screenshot serving is handled directly in /api/screenshots route.
 */

/**
 * Generate screenshot URL for use in UI
 *
 * Usage in UI:
 * ```tsx
 * const screenshotUrl = getScreenshotUrl(r2Key, deviceId);
 * <img src={screenshotUrl} alt="Screenshot" />
 * ```
 */
export function getScreenshotUrl(r2Key: string, deviceId: string): string {
  const params = new URLSearchParams({
    r2Key,
    deviceId,
  });

  return `/api/screenshots?${params.toString()}`;
}
