# Device Scanner Deterministic Time Notes

This document captured the follow-up work required to make the Restate `DeviceScanner`
virtual object deterministic by relying on `ctx.date()` instead of
`new Date()`/`Date.now()`. The content was previously stored in a `.ts` file which
caused TypeScript type errors during compilation, so it has been moved here for
future reference.

## Key Fix Patterns

1. **Capture deterministic time once per handler.**
   ```ts
   const baseTime = ctx.date(); // instead of new Date()
   ```
2. **Use the captured time for scheduling logic.**
   ```ts
   const nextRunAt = input.startImmediately
     ? baseTime
     : calculateNextExecutionTime(config.interval, baseTime);

   const delay = Math.max(0, nextRunAt.getTime() - baseTime.getTime());
   ```
3. **Update helper functions to accept a `baseTime: Date` argument** so all
   calculations use the deterministic source of truth.

4. **Prefer `baseTime` for state updates and postback timestamps** to preserve
   determinism on replay. Inside `ctx.run()` blocks it is acceptable to use
   real time, but reusing `baseTime` keeps behaviour consistent.

5. **Generate identifiers using the deterministic timestamp when possible**
   (for example `${scheduleId}-${baseTime.getTime()}`).

Refer to the Restate worker source files for concrete implementation details.
