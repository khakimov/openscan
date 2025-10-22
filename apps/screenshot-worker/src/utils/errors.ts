/**
 * Error Handling Utilities
 *
 * Custom error classes for better error handling and logging.
 */

import type { ErrorResponse } from '../types';

/**
 * Base error class for screenshot worker errors
 */
export class ScreenshotWorkerError extends Error {
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, statusCode = 500, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(): Response {
    const body: ErrorResponse = {
      error: this.name,
      message: this.message,
      timestamp: new Date().toISOString(),
    };

    return Response.json(body, { status: this.statusCode });
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends ScreenshotWorkerError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ScreenshotWorkerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, context);
  }
}

/**
 * Screenshot capture timeout error
 */
export class CaptureTimeoutError extends ScreenshotWorkerError {
  constructor(url: string, timeout: number) {
    super(`Screenshot capture timed out after ${timeout}ms`, 500, { url, timeout });
  }
}

/**
 * R2 storage error
 */
export class StorageError extends ScreenshotWorkerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(`Storage error: ${message}`, 500, context);
  }
}

/**
 * Postback error (failed to post results to user-application)
 */
export class PostbackError extends ScreenshotWorkerError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(`Postback error: ${message}`, 500, context);
  }
}

/**
 * Handle errors and convert to HTTP response
 */
export function handleError(error: unknown, jobId?: string): Response {
  if (error instanceof ScreenshotWorkerError) {
    return error.toResponse();
  }

  if (error instanceof Error) {
    const body: ErrorResponse = {
      error: 'InternalServerError',
      message: error.message,
      jobId,
      timestamp: new Date().toISOString(),
    };
    return Response.json(body, { status: 500 });
  }

  // Unknown error
  const body: ErrorResponse = {
    error: 'UnknownError',
    message: 'An unknown error occurred',
    jobId,
    timestamp: new Date().toISOString(),
  };
  return Response.json(body, { status: 500 });
}
