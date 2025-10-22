/**
 * Structured Logger for Screenshot Worker
 *
 * Logs are written to console and automatically captured by Cloudflare Workers.
 * View logs with: wrangler tail screenshot-worker
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private environment: string;
  private version: string;

  constructor(environment = 'unknown', version = 'unknown') {
    this.environment = environment;
    this.version = version;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      environment: this.environment,
      version: this.version,
      ...context,
    };

    // Output as JSON for structured logging
    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    // Include error stack trace if available
    if (context?.error instanceof Error) {
      context.error = {
        message: context.error.message,
        stack: context.error.stack,
        name: context.error.name,
      };
    }
    this.log('error', message, context);
  }
}

/**
 * Create a logger instance
 *
 * Usage:
 * ```typescript
 * const logger = createLogger(env);
 * logger.info('Screenshot captured', { jobId, port, duration });
 * ```
 */
export function createLogger(env?: { ENVIRONMENT?: string; VERSION?: string }): Logger {
  return new Logger(env?.ENVIRONMENT, env?.VERSION);
}

// Export singleton for convenience
export const logger = new Logger();
