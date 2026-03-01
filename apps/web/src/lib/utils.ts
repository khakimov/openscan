import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a readable error message from an unknown error value.
 * Eliminates repetitive `err instanceof Error ? err.message : String(err)` patterns.
 *
 * @param err - The error value (could be Error, string, or anything else)
 * @returns A string representation of the error
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
