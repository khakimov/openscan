/**
 * Heartbeat Helpers for Long-Running Activities
 *
 * Provides utilities for maintaining Temporal heartbeats during long-running
 * external processes like CLI tools (nmap, masscan, rustscan).
 *
 * IMPORTANT: Properly handles Temporal cancellation by:
 * 1. Monitoring cancellationSignal
 * 2. Killing child process when cancelled
 * 3. Rejecting the activity promise (not returning success)
 * 4. Maintaining deterministic cancellation semantics
 */

import { Context, CancelledFailure } from '@temporalio/activity';
import { execFile } from 'child_process';
import type { ExecFileOptions, ChildProcess } from 'child_process';

/**
 * Execute a CLI command with periodic heartbeats and proper cancellation handling
 *
 * Sends heartbeat every 30 seconds (configurable) to keep Temporal informed
 * that the activity is still alive, even during long-running executions.
 *
 * Handles cancellation properly by:
 * - Monitoring Temporal's cancellationSignal
 * - Killing the child process when cancelled
 * - Throwing CancelledFailure to reject the activity
 * - Never returning success after cancellation
 *
 * @param binary - Path to the executable
 * @param args - Command arguments
 * @param options - Child process options (timeout, maxBuffer, etc.)
 * @param heartbeatDetails - Optional details to include in heartbeat
 * @param heartbeatIntervalMs - Interval between heartbeats (default: 30s)
 */
export async function execFileWithHeartbeat(
  binary: string,
  args: string[],
  options: ExecFileOptions = {},
  heartbeatDetails?: Record<string, any>,
  heartbeatIntervalMs: number = 30000
): Promise<{ stdout: string; stderr: string }> {
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let childProcess: ChildProcess | null = null;
  let cancelled = false;

  const cleanup = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  // Send initial heartbeat
  try {
    Context.current().heartbeat({
      ...heartbeatDetails,
      stage: 'starting',
    });
  } catch (err) {
    // If cancellation happens immediately, rethrow to exit
    cleanup();
    throw err;
  }

  // Set up cancellation handler
  const cancellationSignal = Context.current().cancellationSignal;
  const cancelHandler = () => {
    cancelled = true;
    cleanup();

    // Kill the child process if it's running
    if (childProcess && !childProcess.killed) {
      childProcess.kill('SIGTERM'); // Try graceful shutdown first

      // Force kill after 5 seconds if still alive
      setTimeout(() => {
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  };

  cancellationSignal.addEventListener('abort', cancelHandler);

  // Set up periodic heartbeat with cancellation guard
  heartbeatTimer = setInterval(() => {
    if (cancelled) {
      cleanup();
      return;
    }

    try {
      Context.current().heartbeat({
        ...heartbeatDetails,
        stage: 'running',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      // Heartbeat threw - likely cancellation
      cancelled = true;
      cleanup();
      cancelHandler();
    }
  }, heartbeatIntervalMs);

  try {
    // Start the child process (execFile doesn't return ChildProcess from promisified version)
    // So we need to use the callback version with manual promise wrapping
    const processPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      childProcess = execFile(binary, args, {
        ...options,
        encoding: 'utf8',
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || ''
          });
        }
      });
    });

    const result = await processPromise;

    // Check if we were cancelled during execution
    if (cancelled) {
      cleanup();
      throw new CancelledFailure('Activity cancelled during execution');
    }

    // Clear heartbeat timer on success
    cleanup();
    cancellationSignal.removeEventListener('abort', cancelHandler);

    // Send final heartbeat (may throw if cancelled)
    try {
      Context.current().heartbeat({
        ...heartbeatDetails,
        stage: 'completed',
      });
    } catch (err) {
      // Cancellation during final heartbeat
      throw new CancelledFailure('Activity cancelled before completion');
    }

    return result;
  } catch (error) {
    // Clear resources
    cleanup();
    cancellationSignal.removeEventListener('abort', cancelHandler);

    // If we were cancelled, throw CancelledFailure
    if (cancelled) {
      throw new CancelledFailure('Activity cancelled');
    }

    // Send failure heartbeat (may throw if cancelled)
    try {
      Context.current().heartbeat({
        ...heartbeatDetails,
        stage: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (err) {
      // Cancellation during failure heartbeat
      throw new CancelledFailure('Activity cancelled during error handling');
    }

    throw error;
  }
}

/**
 * Start a periodic heartbeat for any long-running operation
 *
 * Returns a function to stop the heartbeat when the operation completes.
 * Use this for operations where you need manual control over the heartbeat lifecycle.
 *
 * @param heartbeatDetails - Details to include in each heartbeat
 * @param intervalMs - Interval between heartbeats (default: 30s)
 * @returns Function to stop the heartbeat
 *
 * @example
 * const stopHeartbeat = startPeriodicHeartbeat({ tool: 'nmap', target });
 * try {
 *   await longRunningOperation();
 * } finally {
 *   stopHeartbeat('completed');
 * }
 */
export function startPeriodicHeartbeat(
  heartbeatDetails: Record<string, any>,
  intervalMs: number = 30000
): (finalStage?: string) => void {
  let timer: NodeJS.Timeout | null = null;

  // Send initial heartbeat
  try {
    Context.current().heartbeat({
      ...heartbeatDetails,
      stage: 'starting',
    });
  } catch (err) {
    // If cancellation happens immediately, just return no-op cleanup
    return () => {};
  }

  // Set up periodic heartbeat with cancellation guard
  timer = setInterval(() => {
    try {
      Context.current().heartbeat({
        ...heartbeatDetails,
        stage: 'running',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      // Activity was cancelled - clear timer and let execution finish
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      // Don't rethrow - let the main execution path handle cancellation
    }
  }, intervalMs);

  // Return cleanup function
  return (finalStage: string = 'completed') => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    // Send final heartbeat (may throw if cancelled)
    try {
      Context.current().heartbeat({
        ...heartbeatDetails,
        stage: finalStage,
      });
    } catch (err) {
      // Cancellation during final heartbeat - ignore
    }
  };
}
