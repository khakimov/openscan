export interface CircuitBreakerOptions {
  threshold: number;
  cooldownMs: number;
  windowMs: number;
}

interface CircuitState {
  failureCount: number;
  firstFailureAt: number;
  blockedUntil?: number;
}

export interface CircuitStatus {
  isOpen: boolean;
  failureCount?: number;
  blockedUntil?: number;
}

/**
 * Simple in-memory circuit breaker. Provides basic protection against repeatedly
 * executing resource-heavy tools when they are consistently failing. Intended as
 * a stop-gap until we wire a shared cache/Redis implementation.
 */
export class InMemoryCircuitBreaker {
  private readonly state = new Map<string, CircuitState>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  public getStatus(key: string): CircuitStatus {
    const now = Date.now();
    const current = this.state.get(key);

    if (!current) {
      return { isOpen: false };
    }

    // If the circuit was opened and the cooldown has elapsed, reset it.
    if (current.blockedUntil && current.blockedUntil <= now) {
      this.state.delete(key);
      return { isOpen: false };
    }

    // If we are outside the rolling window reset the state to avoid stale counts.
    if (!current.blockedUntil && now - current.firstFailureAt > this.options.windowMs) {
      this.state.delete(key);
      return { isOpen: false };
    }

    if (current.blockedUntil && current.blockedUntil > now) {
      return {
        isOpen: true,
        failureCount: current.failureCount,
        blockedUntil: current.blockedUntil,
      };
    }

    return { isOpen: false };
  }

  public recordFailure(key: string): CircuitStatus {
    const now = Date.now();
    const existing = this.state.get(key);

    let nextState: CircuitState;
    if (!existing) {
      nextState = {
        failureCount: 1,
        firstFailureAt: now,
      };
    } else {
      // Reset the failure window if enough time passed since the first failure.
      if (now - existing.firstFailureAt > this.options.windowMs) {
        nextState = {
          failureCount: 1,
          firstFailureAt: now,
        };
      } else {
        nextState = {
          failureCount: existing.failureCount + 1,
          firstFailureAt: existing.firstFailureAt,
          blockedUntil: existing.blockedUntil,
        };
      }
    }

    if (nextState.failureCount >= this.options.threshold) {
      nextState.blockedUntil = now + this.options.cooldownMs;
    }

    this.state.set(key, nextState);

    return {
      isOpen: Boolean(nextState.blockedUntil && nextState.blockedUntil > now),
      failureCount: nextState.failureCount,
      blockedUntil: nextState.blockedUntil,
    };
  }

  public recordSuccess(key: string): void {
    this.state.delete(key);
  }
}

/**
 * Minimal async concurrency limiter. Ensures we do not spawn an unlimited number
 * of heavy scanner processes simultaneously on a single worker.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (!Number.isFinite(this.limit) || this.limit <= 0) {
      return task();
    }

    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.active += 1;

    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}
