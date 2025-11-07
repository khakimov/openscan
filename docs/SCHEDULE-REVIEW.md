# Design Review: Device Scan Scheduling System

## Context

I've created a design document for implementing recurring device scan schedules in our security platform. The full design is available in [docs/SCHEDULE.md](./SCHEDULE.md).

**Key architectural decision**: Use Restate Virtual Objects with durable timers instead of traditional cron jobs or external schedulers.

## Purpose of This Review

I need feedback on the architectural decisions, implementation patterns, and potential issues I may have overlooked. This document contains specific questions where I'm uncertain or see multiple valid approaches.

---

## Question 1: Virtual Object Key Strategy

**Current Design**: Virtual Object keyed by `deviceId` (one object per device)

**Reasoning**:
- Natural 1:1 mapping (one schedule per device)
- Simple state management
- Clear ownership model

**Alternative Approaches**:

### Option A (Current): Key by deviceId
```typescript
// deviceScanner.scheduleDeviceScan(deviceId, input)
ctx.key = "device-abc123"
```
✅ Pros: Simple, intuitive
❌ Cons: Can't have multiple schedules per device (e.g., quick scan every 12h + thorough scan weekly)

### Option B: Key by scheduleId
```typescript
// deviceScanner.scheduleDeviceScan(scheduleId, input)
ctx.key = "schedule-xyz789"
```
✅ Pros: Supports multiple schedules per device
❌ Cons: Need external index to find schedules by device, more complex queries

### Option C: Composite key (organizationId:deviceId)
```typescript
ctx.key = "org-123:device-abc"
```
✅ Pros: Organization isolation at Virtual Object level
❌ Cons: Redundant (database already handles org isolation), longer keys

**Questions**:
1. Is the 1:1 device-to-schedule constraint acceptable, or do we need multiple schedules per device?
2. If users want different scan types at different intervals, should we:
   - Create multiple Virtual Objects per device (Option B)?
   - Handle it at the configuration level (e.g., "run THOROUGH on weekends, QUICK on weekdays")?
3. Does the keying strategy affect Restate billing/performance?

**Decision**:
- ✅ Key Virtual Objects by `scheduleId`, allowing many schedules per device while keeping state isolated (`docs/SCHEDULE.md:366`–`docs/SCHEDULE.md:540`).
- ✅ Persist canonical interval config in DB (`interval_config` jsonb) and cache a human label for queries (`docs/SCHEDULE.md:104`–`docs/SCHEDULE.md:140`).
- ✅ Generate scheduleId in server layer and pass as Restate key to keep DB + VO aligned (`docs/SCHEDULE.md:704`–`docs/SCHEDULE.md:752`).
- 🔗 Device-level queries now use `getSchedulesForDevice` plus UI filtering for variants (`docs/SCHEDULE.md:150`–`docs/SCHEDULE.md:214`).

---

## Question 2: Timer Rescheduling Pattern

**Current Design**: Each `executeScan()` reschedules the next timer at the end using `ctx.objectSendClient(...)`

```typescript
async executeScan(ctx) {
  await ctx.run('scan', () => invokePortScan(...));

  const nextRunAt = calculateNextRun(new Date(), state.interval);
  const delayMs = Math.max(0, nextRunAt.getTime() - Date.now());

  ctx
    .objectSendClient(DeviceScanner, ctx.key)
    .executeScan(restate.rpc.sendOpts({ delay: { milliseconds: delayMs } }));
}
```

**Concern**: What happens if `executeScan()` fails before rescheduling?
- Does the schedule stop permanently?
- How does Restate handle partial failures in handlers?

**Alternative Approaches**:

### Option A (Current): Reschedule at end of execution
✅ Pros: Simple, adjusts for scan duration
❌ Cons: If rescheduling fails, schedule stops

### Option B: Reschedule at start of execution
```typescript
async executeScan(ctx) {
  // 1. Schedule next run FIRST
  const nextRunAt = calculateNextRun(new Date(), state.interval);
  const delayMs = Math.max(0, nextRunAt.getTime() - Date.now());
  ctx
    .objectSendClient(DeviceScanner, ctx.key)
    .executeScan(restate.rpc.sendOpts({ delay: { milliseconds: delayMs } }));

  // 2. Then run scan
  await ctx.run('scan', () => invokePortScan(...));
}
```
✅ Pros: Schedule survives scan failures
❌ Cons: Doesn't account for scan duration (could drift over time)

### Option C: Use Restate's built-in cron-like scheduler (if available)
```typescript
// Register recurring job once
ctx.scheduleRecurring('executeScan', { interval: state.interval });
```
✅ Pros: Framework handles rescheduling
❌ Cons: Need to check if Restate supports this pattern

**Questions**:
1. What happens if the send (`ctx.objectSendClient(...).executeScan(...)`) fails? Does Restate retry?
2. Should we reschedule BEFORE or AFTER scan execution?
3. How do we prevent schedule drift (e.g., scan takes 10 minutes, so "every 1 hour" becomes every 1h10m)?
4. Is there a Restate-native pattern for recurring jobs that I missed?

**Decision**:
- ✅ Adopt **reschedule-first with idempotent timer guard** (`docs/SCHEDULE.md:366`–`docs/SCHEDULE.md:756`).
- ✅ Guard against drift by anchoring next run on `state.pendingTimer.runAt` and using `calculateNextRun({ lastScheduledAt })`.
- ⚠️ If `acquireScanSlot` rejects due to concurrency, retry with jittered delay (≤ interval) and log.
- 🔗 See helper utilities `scheduleNextInvocation`, `buildTimerCallId`, and `intervalToMs` in `docs/SCHEDULE.md:592`.

---

## Question 3: Failure Handling & Auto-Pause Threshold

**Current Design**: Auto-pause after 5 consecutive failures

```typescript
if (state.consecutiveFailures >= 5) {
  state.isActive = false;
  await sendPostback({ type: 'SCHEDULE_AUTO_PAUSED' });
}
```

**Questions**:
1. Is 5 the right threshold? Should it be configurable per organization or scan type?
2. Should we distinguish between failure types?
   - **Transient** (network timeout, temporary DNS failure) → Keep retrying
   - **Permanent** (device offline, invalid IP) → Pause immediately
3. What's the user experience when a schedule auto-pauses?
   - Email notification?
   - In-app alert?
   - Dashboard warning?
4. Should we implement exponential backoff between retries instead of fixed intervals?
   - Example: After failure, wait 2x the interval before next attempt

**Alternative Approaches**:

### Option A (Current): Fixed threshold with alerting
- Simple, predictable
- User must manually resume

### Option B: Exponential backoff with max retry window
```typescript
// After failure, wait longer before next attempt
const backoffMultiplier = Math.min(2 ** state.consecutiveFailures, 24); // Max 24x
const nextRunAt = calculateNextRun(new Date(), state.interval, backoffMultiplier);
```
- More resilient to transient issues
- Could delay detection of persistent problems

### Option C: Smart failure classification
```typescript
if (error.type === 'DNS_RESOLUTION_FAILED' || error.type === 'HOST_UNREACHABLE') {
  // Permanent failure - pause immediately
  state.isActive = false;
} else {
  // Transient failure - retry with backoff
  state.consecutiveFailures++;
}
```
- Better user experience
- More complex to implement

**Decision**:
- ✅ Tiered thresholds (`QUICK=3`, `STANDARD=5`, `THOROUGH=8`) with exponential backoff capped at 6h (`docs/SCHEDULE.md:320`–`docs/SCHEDULE.md:437`).
- ✅ `classifyFailure()` maps scanner error codes to permanent vs transient behaviour (`docs/SCHEDULE.md:618`–`docs/SCHEDULE.md:666`).
- ✅ `state.deferUntil` defers execution without cancelling timers, avoiding drift while respecting durable scheduling (`docs/SCHEDULE.md:300`–`docs/SCHEDULE.md:332`).
- ⚠️ Auto-pause emits both failure + auto-pause postbacks so UX can display context.

---

## Question 4: State Persistence & Database Sync

**Current Design**: Dual state storage
- **Restate state**: Runtime execution data (timers, consecutiveFailures)
- **Database**: Schedule configuration and audit trail

**Concern**: State can drift between Restate and database

Example scenario:
1. User creates schedule → Database record created
2. Restate Virtual Object starts timer
3. Worker crashes before database is updated with `nextRunAt`
4. Database shows stale `nextRunAt`, Restate has correct state

**Questions**:
1. Should Restate state be the source of truth, or database?
2. How do we reconcile state after worker restarts?
3. Should we periodically sync Restate state → Database for observability?
4. What happens if database write succeeds but Restate call fails (or vice versa)?

**Alternative Approaches**:

### Option A (Current): Two sources of truth
- Restate: Runtime state (timers, execution)
- Database: Configuration + history
- Postbacks keep them in sync

### Option B: Database as single source of truth
- Store everything in database
- Restate Virtual Object is stateless, reads from DB
- Cons: More DB queries, latency

### Option C: Restate as single source of truth
- Store configuration in Restate state
- Database only for audit log (event sourcing)
- Cons: Can't query schedules efficiently in UI

### Option D: Saga pattern with compensation
```typescript
async scheduleDeviceScan(ctx, input) {
  // 1. Reserve schedule ID in database
  const schedule = await ctx.run('db-reserve', () => reserveSchedule(input));

  try {
    // 2. Create Restate timer
    ctx.objectSendDelayed(...);

    // 3. Confirm in database
    await ctx.run('db-confirm', () => confirmSchedule(schedule.id));
  } catch (error) {
    // 4. Rollback database reservation
    await ctx.run('db-rollback', () => deleteSchedule(schedule.id));
    throw error;
  }
}
```
- Ensures consistency
- More complex, more database roundtrips

**Decision**:
- ✅ Database is the **source of truth**; Restate writes runtime updates back via `ctx.run(...)` (`docs/SCHEDULE.md:248`–`docs/SCHEDULE.md:452`).
- ✅ `createScanSchedule` uses `ON CONFLICT DO UPDATE` semantics so handler retries stay idempotent (`docs/SCHEDULE.md:210`–`docs/SCHEDULE.md:278`).
- ✅ Hourly reconciliation job compares Restate objects vs DB rows and pauses/recreates as needed (`docs/SCHEDULE.md:278`–`docs/SCHEDULE.md:338`).
- ⚠️ If timer scheduling fails post-DB-write, Restate retry + reconciliation catch drift automatically.

---

## Question 5: Interval Format & Parsing

**Current Design**: String format like "12h", "1d", "7d"

```typescript
function calculateNextRun(from: Date, interval: string): Date {
  const match = interval.match(/^(\d+)([hd])$/);
  // ...
}
```

**Questions**:
1. Should we support more granular intervals (minutes)? e.g., "30m", "15m"
2. Should we support cron-like expressions for advanced users? e.g., "0 2 * * *" (daily at 2am)
3. How do we handle timezone-aware scheduling? (e.g., "daily at 2am user's local time")
4. Should interval be stored as:
   - String ("12h") - human-readable but requires parsing
   - Milliseconds (43200000) - efficient but not human-readable
   - Structured object ({ value: 12, unit: 'hours' }) - type-safe but verbose

**Alternative Formats**:

### Option A (Current): Simple string format
```
"12h" | "1d" | "7d"
```
✅ Pros: Human-readable, URL-friendly
❌ Cons: Limited flexibility, no timezone support

### Option B: ISO 8601 Duration
```
"PT12H" | "P1D" | "P7D"
```
✅ Pros: Standard format, library support
❌ Cons: Less intuitive for users

### Option C: Cron expression
```
"0 */12 * * *" (every 12 hours)
"0 2 * * *"    (daily at 2am UTC)
```
✅ Pros: Flexible, industry standard
❌ Cons: Complex parsing, timezone handling tricky

### Option D: Structured configuration
```json
{
  "interval": { "value": 12, "unit": "hours" },
  "timezone": "America/Los_Angeles",
  "time": "02:00" // Optional: specific time of day
}
```
✅ Pros: Type-safe, supports all use cases
❌ Cons: Verbose, complex to store

**Decision**:
- ✅ Adopt discriminated `ScheduleInterval` union: durations (minutes/hours/days) and daily anchors with timezone (`docs/SCHEDULE.md:391`–`docs/SCHEDULE.md:420`).
- ✅ Persist JSON config + derived label for fast queries; helper `formatIntervalLabel` keeps UI human-readable (`docs/SCHEDULE.md:104`–`docs/SCHEDULE.md:150`, `docs/SCHEDULE.md:536`–`docs/SCHEDULE.md:612`).
- ✅ Validation via Zod schema in server layer; UI sends structured payload and pre-built presets map to config (`docs/SCHEDULE.md:692`–`docs/SCHEDULE.md:756`).
- ⚠️ Cron-like expressions deferred; add new interval kind when needed (backed by same union).

---

## Question 6: Concurrency & Resource Limits

**Current Design**: No explicit limits on concurrent scheduled scans

**Concerns**:
1. What if 100 devices all have schedules that fire at the same time?
2. Should we implement rate limiting or queueing?
3. How does this affect:
   - Worker CPU/memory
   - External scanning tool limits (nmap, masscan)
   - Target network impact (avoid flooding customer networks)

**Questions**:
1. Should we limit concurrent scheduled scans per organization?
   - Example: Max 5 concurrent scans, queue the rest
2. Should we stagger schedule start times to avoid thundering herd?
   - Example: If user creates 50 schedules, randomize initial delays by ±5 minutes
3. How do we handle scan duration > interval?
   - Example: Thorough scan takes 2 hours, but interval is 1 hour
   - Should we skip the next run? Queue it? Warn user?

**Alternative Approaches**:

### Option A (Current): No limits
- Simple, works for small deployments
- Risky at scale

### Option B: Organization-level concurrency limit
```typescript
async executeScan(ctx) {
  // Wait if org has too many active scans
  await ctx.run('wait-for-slot', () => acquireScanSlot(organizationId));

  try {
    await ctx.run('scan', () => invokePortScan(...));
  } finally {
    await ctx.run('release-slot', () => releaseScanSlot(organizationId));
  }
}
```

### Option C: Global rate limiting with priority queue
- High-priority manual scans run first
- Scheduled scans queued with FIFO
- Requires distributed queue (Redis, Restate queue service?)

**Decision**:
- ✅ Enforce per-organization semaphore (default 5 leases) using `scan_schedule_leases` table and `acquireScanSlot`/`releaseScanSlot` wrappers (`docs/SCHEDULE.md:700`–`docs/SCHEDULE.md:764`).
- ✅ Restate handler acquires lease before invoking scans and defers with jitter if limit reached (`docs/SCHEDULE.md:328`–`docs/SCHEDULE.md:430`).
- ⚠️ Lease TTL (30m) auto-extends via worker heartbeat; nightly cleanup job purges expired leases (`docs/SCHEDULE.md:732`–`docs/SCHEDULE.md:756`).
- 🔗 Manual scans request higher priority via the same semaphore to avoid starvation (follow-up work).

---

## Question 7: Security & Authorization

**Current Design**: Schedule operations validate organizationId from session

**Questions**:
1. Should we allow project-level schedules (all devices in project)?
2. Who can create/edit/delete schedules?
   - Only organization admins?
   - Any org member?
   - Device "owner" (if we implement ownership)?
3. How do we prevent abuse?
   - User creates 1000 schedules with 5-minute intervals
   - User creates schedule for competitor's domain (via DNS hijacking)
4. Should scheduled scans respect device verification status?
   - Only scan VERIFIED devices?
   - Or scan CANDIDATE devices too (for automated discovery)?

**Validation Checklist**:
```typescript
// Before creating schedule:
✅ User has access to organization
✅ User has access to device
✅ Device exists and is active
❓ Device is verified? (VERIFIED vs CANDIDATE)
❓ User has "schedule_scans" permission?
❓ Organization hasn't exceeded schedule quota?
❓ Interval is within allowed range (min 1h, max 30d)?
```

**Decision**:
- ✅ Require `scan_schedules:manage` permission (granted to org admins by default) and block cross-org access (`docs/SCHEDULE.md:1381`–`docs/SCHEDULE.md:1415`).
- ✅ Enforce quotas: max 5 schedules/device + semaphore-backed org concurrency limit (`docs/SCHEDULE.md:700`–`docs/SCHEDULE.md:756`, `docs/SCHEDULE.md:720`–`docs/SCHEDULE.md:728`).
- ✅ Reject unverified devices unless elevated permission present; log audit events for every mutation (`docs/SCHEDULE.md:1389`–`docs/SCHEDULE.md:1405`).
- ⚠️ Rate limiting + billing-tier quotas tracked as follow-up (documented for future integration).

---

## Question 8: Migration & Backward Compatibility

**Current System**: No scheduling exists yet

**Questions**:
1. When we add scheduling, what happens to existing devices?
   - Should we auto-create schedules for VERIFIED devices?
   - Or require explicit opt-in?
2. How do we handle the transition period?
   - Phase 1: Only admins can create schedules (beta)
   - Phase 2: All users can create schedules
3. What's the rollback strategy if scheduling causes issues?
   - Can we disable scheduling globally via feature flag?
   - How do we clean up orphaned Restate timers?

**Decision**:
- ✅ No migration/compat needed for greenfield project; schedules only exist once feature ships. Documented cleanup script handles dev resets if needed.
- ✅ Keep feature behind `scan_scheduling.enabled` flag until UI + worker ready; flipping flag requires no data migrations.

---

## Question 9: Testing Strategy

**Current Design**: Unit tests for Virtual Object, integration tests for full flow

**Concerns**:
1. How do we test durable timers without waiting for real time to pass?
   - Does Restate have time-mocking utilities?
2. How do we test failure scenarios?
   - Worker crashes mid-scan
   - Database unavailable during postback
   - Restate ingress timeout
3. Should we implement chaos testing?
   - Randomly pause schedules
   - Inject failures during scan execution
   - Simulate worker restarts

**Questions**:
1. What's the minimum test coverage threshold? (80%? 90%?)
2. Should we create a staging environment with real Restate Cloud?
3. How do we test the migration path safely?
4. Should we implement canary releases?
   - Roll out to 1% of organizations first
   - Monitor failure rates before full rollout

**Decision**:
- ✅ 90% coverage target across worker + server layers using Restate TestDriver for deterministic time travel (`docs/SCHEDULE.md:1204`–`docs/SCHEDULE.md:1260`).
- ✅ Integration suite exercises saga + quota + concurrency paths; chaos tests simulate lease exhaustion and worker restarts (`docs/SCHEDULE.md:1262`–`docs/SCHEDULE.md:1298`).
- ✅ Environments: local (TestDriver), CI (Vitest + coverage), staging (feature flag) with nightly chaos run for durability (`docs/SCHEDULE.md:1300`–`docs/SCHEDULE.md:1314`).
- ⚠️ Migration tests not needed (greenfield), but reconciliation job verified via integration tests.

---

## Question 10: Observability & Debugging

**Current Design**: Logs + Workers Analytics Engine

**Questions**:
1. How do we debug "schedule stopped working" issues?
   - User reports schedule didn't run
   - How do we trace: Database → Restate → Worker → Scan → Postback?
2. What metrics are most important?
   - Schedule execution success rate (per device? per org? global?)
   - Timer drift (scheduled time vs actual execution time)
   - Auto-pause frequency
3. Should we implement distributed tracing?
   - Trace ID passed through entire flow
   - Correlate database updates, Restate invocations, scan results
4. How do we expose schedule health to users?
   - Dashboard widget: "3 of 10 schedules failed in last 24h"
   - Schedule detail page: execution history graph

**Monitoring Gaps**:
```
❓ How do we know if Restate timers are firing correctly?
❓ How do we detect schedule drift over time?
❓ How do we measure end-to-end latency (timer fires → scan completes)?
❓ How do we alert if auto-pause rate spikes (indicates systemic issue)?
```

**Decision**:
- ✅ Instrument OpenTelemetry counters/histograms for timer lag, scan duration, failures, and auto-pauses (`docs/SCHEDULE.md:1432`–`docs/SCHEDULE.md:1485`).
- ✅ Build Workers Analytics queries + Grafana dashboards for success rate, timer drift, and lease saturation with alert thresholds (`docs/SCHEDULE.md:1487`–`docs/SCHEDULE.md:1519`).
- ✅ Observable gauge reports active leases per org; reconciliation job + alerts detect starvation (`docs/SCHEDULE.md:704`–`docs/SCHEDULE.md:756`).
- ⚠️ Trace IDs flow through postbacks and UI health widget for end-to-end debugging.

---

## Summary: Key Decision Points

Please review and provide feedback on:

1. **Virtual Object keying** (deviceId vs scheduleId vs composite)
2. **Timer rescheduling pattern** (end vs start vs framework-native)
3. **Failure threshold** (fixed vs adaptive vs smart classification)
4. **State consistency** (dual storage vs single source of truth vs saga)
5. **Interval format** (string vs ISO 8601 vs cron vs structured)
6. **Concurrency limits** (none vs org-level vs global queue)
7. **Authorization model** (who can create/edit schedules)
8. **Migration strategy** (opt-in vs auto-enable vs beta rollout)
9. **Testing approach** (time-mocking, chaos testing, coverage targets)
10. **Observability** (metrics to track, tracing strategy, user-facing health)

## Additional Concerns

1. **Billing implications**: Should scheduled scans count toward usage quotas? Different pricing tier?
2. **Performance**: What's the maximum number of schedules per organization before we hit Restate limits?
3. **Compliance**: Do scheduled scans need audit logs for SOC2/ISO27001?
4. **User education**: How do we explain scheduling concepts to non-technical users?

---

## Next Steps

Based on review feedback, I will:
1. Revise [docs/SCHEDULE.md](./SCHEDULE.md) with final decisions
2. Create implementation plan with phases
3. Begin Phase 1: Database schema migration
4. Set up testing infrastructure for Restate Virtual Objects

Thank you for the review! 🙏
