/**
 * Shared result type patterns
 * Eliminates boilerplate across domain contracts
 */

/**
 * Standard success/error discriminated union
 * Used for operations that return data on success
 *
 * @example
 * ```ts
 * type CreateUserResult = Result<{ user: User }>;
 * // Expands to:
 * // | { success: true; user: User; error?: undefined }
 * // | { success: false; error: string }
 * ```
 */
export type Result<TSuccess, TError = string> =
  | ({
      success: true;
      error?: undefined;
    } & TSuccess)
  | {
      success: false;
      error: TError;
    } & {
      [K in keyof TSuccess]?: undefined;
    };

/**
 * Result type for operations that return a message on success
 * Common for delete/update operations
 *
 * @example
 * ```ts
 * type DeleteResult = ResultWithMessage;
 * ```
 */
export type ResultWithMessage<TError = string> = Result<{ message: string }, TError>;

/**
 * Result type for list operations with pagination
 *
 * @example
 * ```ts
 * type UserListResult = ListResult<User>;
 * ```
 */
export type ListResult<TItem> = Result<{
  items: TItem[];
  totalCount: number;
  page: number;
  totalPages: number;
}>;
