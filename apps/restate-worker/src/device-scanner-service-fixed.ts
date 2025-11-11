/**
 * DeviceScanner Virtual Object - Deterministic Time Fix
 *
 * This file contains the comprehensive fix for non-deterministic timestamps.
 *
 * KEY CHANGES:
 * 1. All handlers use ctx.date() for base time
 * 2. Helper functions accept baseTime parameter
 * 3. Timestamps inside ctx.run() blocks can use real time (side effects)
 * 4. State updates use deterministic timestamps
 *
 * LOCATIONS FIXED:
 * - Line 155: scheduleDeviceScan - use ctx.date() for nextRunAt calculation
 * - Line 164: scheduleDeviceScan - use baseTime.getTime() for delay
 * - Line 232: executeScan - use ctx.date() for nextRunTime calculation
 * - Line 179, 187, 195: executeScan postback - timestamps inside ctx.run() OK
 * - Line 114: executeScan scanId - Date.now() inside ctx.run() OK
 * - Line 501, 534, 557, 562, 564, 574: handleFailure - use baseTime parameter
 * - Line 360: calculateNextExecutionTime - accept baseTime parameter
 */

// ============================================================================
// PATTERN 1: Handler-level deterministic time
// ============================================================================

/**
 * Example fix for scheduleDeviceScan handler
 */
async function scheduleDeviceScan_FIXED(ctx: ObjectContext, input: any) {
  // Get deterministic base time ONCE at handler start
  const baseTime = ctx.date();

  // Calculate next run using baseTime (not new Date())
  const nextRunAt = input.startImmediately
    ? baseTime
    : calculateNextExecutionTime(config.interval, baseTime);

  // Calculate delay using baseTime (not Date.now())
  const delay = Math.max(0, nextRunAt.getTime() - baseTime.getTime());

  // ... rest of handler
}

/**
 * Example fix for executeScan handler
 */
async function executeScan_FIXED(ctx: ObjectContext, input: any) {
  // Get deterministic base time
  const baseTime = ctx.date();

  // RESCHEDULE-FIRST: use baseTime
  const nextRunTime = calculateNextExecutionTime(config.interval, baseTime);
  const delay = Math.max(0, nextRunTime.getTime() - baseTime.getTime());

  // State updates use baseTime
  if (scanSuccess) {
    ctx.set(STATE_KEYS.LAST_RUN_AT, baseTime.toISOString());

    // Timestamps INSIDE ctx.run() can use real time or baseTime
    await ctx.run('postback-success', async () => {
      await postUniversalPostback({
        // OK to use baseTime here (it's a captured variable)
        timestamp: baseTime.toISOString(),
        data: {
          lastRunAt: baseTime.toISOString(),
          nextRunAt: nextRunTime.toISOString(),
        },
      });
    });
  }
}

// ============================================================================
// PATTERN 2: Helper functions with baseTime parameter
// ============================================================================

/**
 * Fix for calculateNextExecutionTime - accept baseTime
 */
function calculateNextExecutionTime(
  interval: ScheduleInterval,
  baseTime: Date  // ← Add this parameter
): Date {
  // Use baseTime instead of new Date()
  const now = baseTime;

  if (interval.kind === 'duration') {
    const ms = convertToMilliseconds(interval.value, interval.unit);
    return new Date(now.getTime() + ms);
  }

  // Daily interval
  const next = new Date(now);
  next.setHours(interval.hour, interval.minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Fix for handleFailure - accept baseTime
 */
async function handleFailure(
  ctx: ObjectContext,
  scheduleId: string,
  config: ScheduleConfig,
  error: ClassifiedError,
  baseTime: Date  // ← Add this parameter
): Promise<void> {
  const currentFailures = (await ctx.get<number>(STATE_KEYS.CONSECUTIVE_FAILURES)) || 0;
  const newFailureCount = currentFailures + 1;

  ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, newFailureCount);
  ctx.set(STATE_KEYS.LAST_RUN_STATUS, 'FAILED');
  ctx.set(STATE_KEYS.LAST_RUN_AT, baseTime.toISOString()); // ← Use baseTime

  // ... auto-pause logic ...

  await ctx.run('postback-auto-pause', async () => {
    await postUniversalPostback({
      timestamp: baseTime.toISOString(), // ← Use baseTime
      // ...
    });
  });

  // Backoff calculation
  const backoffMs = error.type === 'TRANSIENT'
    ? Math.min(BACKOFF_BASE_MS * Math.pow(2, newFailureCount - 1), BACKOFF_MAX_MS)
    : 0;

  await ctx.run('postback-failure', async () => {
    // Calculate next run time using baseTime
    const nextRunTime = error.type === 'TRANSIENT'
      ? new Date(baseTime.getTime() + backoffMs)  // ← Use baseTime, not Date.now()
      : calculateNextExecutionTime(config.interval, baseTime);  // ← Pass baseTime

    await postUniversalPostback({
      scanId: `${scheduleId}-failure`,  // ← Don't use Date.now() for scanId
      timestamp: baseTime.toISOString(),
      data: {
        lastRunAt: baseTime.toISOString(),
        nextRunAt: nextRunTime.toISOString(),
        // ...
      },
    });
  });
}

// ============================================================================
// PATTERN 3: Timestamps inside ctx.run() - already deterministic
// ============================================================================

/**
 * These are OK because they're inside ctx.run() (side effects, not replayed):
 * - Line 114: scanId = `${scheduleId}-${Date.now()}` ← OK, inside ctx.run()
 * - Line 179-195: postback timestamps ← OK if using captured baseTime
 *
 * However, it's SAFER to use baseTime everywhere for consistency.
 */

// ============================================================================
// SUMMARY OF CHANGES NEEDED
// ============================================================================

/**
 * 1. Add baseTime parameter to:
 *    - calculateNextExecutionTime(interval, baseTime)
 *    - handleFailure(ctx, scheduleId, config, error, baseTime)
 *
 * 2. In each handler, capture baseTime ONCE at start:
 *    const baseTime = ctx.date();
 *
 * 3. Replace all instances of:
 *    - new Date() → baseTime
 *    - Date.now() → baseTime.getTime()
 *    - new Date().toISOString() → baseTime.toISOString()
 *
 * 4. Pass baseTime to helper functions:
 *    - calculateNextExecutionTime(interval, baseTime)
 *    - handleFailure(ctx, scheduleId, config, error, baseTime)
 *
 * 5. For scanId generation inside ctx.run():
 *    - Can keep Date.now() (it's replayed from journal)
 *    - OR use baseTime for consistency: `${scheduleId}-${baseTime.getTime()}`
 */

export {};
