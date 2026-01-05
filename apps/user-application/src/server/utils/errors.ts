/**
 * Shared error handling utilities for server functions
 */

/**
 * Standard error response structure
 */
export interface ServerErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

/**
 * Standard success response structure
 */
export interface ServerSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ServerResponse<T = unknown> = ServerSuccessResponse<T> | ServerErrorResponse;

/**
 * Format an error for consistent server responses
 */
export function formatServerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Format error with details for debugging
 */
export function formatServerErrorWithDetails(error: unknown): {
  message: string;
  name?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    // Use type assertion since Wrangler types NODE_ENV as literal "production"
    // but at runtime it can be "development" in local dev
    const isDev = (process.env.NODE_ENV as string) === 'development';
    return {
      name: error.name,
      message: error.message,
      stack: isDev ? error.stack : undefined,
    };
  }
  return { message: String(error) };
}

/**
 * Create a standard error response
 */
export function errorResponse(error: unknown): ServerErrorResponse {
  return {
    success: false,
    error: formatServerError(error),
  };
}

/**
 * Create a standard success response
 */
export function successResponse<T>(data: T): ServerSuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Wrap a server function handler with standard error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>
): Promise<ServerResponse<T>> {
  return handler()
    .then(data => successResponse(data))
    .catch(error => errorResponse(error));
}