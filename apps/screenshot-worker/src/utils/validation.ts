/**
 * Request Validation Utilities
 *
 * Uses Zod schemas for runtime validation.
 */

import { ZodError } from 'zod';
import { CaptureRequestSchema, type CaptureRequest } from '../types';
import { ValidationError } from './errors';

/**
 * Validate capture request payload
 *
 * @throws ValidationError if validation fails
 */
export function validateCaptureRequest(data: unknown): CaptureRequest {
  try {
    return CaptureRequestSchema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new ValidationError('Invalid request payload', {
        errors: messages,
      });
    }
    throw error;
  }
}

/**
 * Validate authentication header
 *
 * @throws AuthenticationError if validation fails
 */
export function validateAuthentication(
  request: Request,
  expectedKey: string
): void {
  const authHeader = request.headers.get('Authorization');
  const expectedHeader = `Bearer ${expectedKey}`;

  if (authHeader !== expectedHeader) {
    throw new ValidationError('Invalid or missing authentication');
  }
}

/**
 * Safely parse JSON from request body
 *
 * @throws ValidationError if JSON is invalid
 */
export async function parseRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body');
  }
}
