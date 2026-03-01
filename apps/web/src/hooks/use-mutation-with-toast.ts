import { useMutation, type UseMutationOptions, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { createLogger } from "@repo/logger";
import { invalidateTRPCQuery } from "@/lib/query-utils";

const logger = createLogger({ name: "mutation-helper" });

/**
 * Captures exception for logging/monitoring
 * Can be extended to integrate with Sentry or other error tracking services
 */
function captureException(error: Error, meta?: Record<string, unknown>) {
  logger.error("Mutation error", { error: error.message, stack: error.stack, ...meta });
}

interface UseMutationWithToastProps<TData, TVariables = void, TContext = unknown> {
  /** The mutation function to execute */
  mutationFn: UseMutationOptions<TData, Error, TVariables, TContext>["mutationFn"];

  /** Optional mutation key for DevTools clarity */
  mutationKey?: QueryKey;

  /** Success message - string or function that receives response data */
  successMessage?: string | ((data: TData, vars: TVariables) => string);

  /** Error message fallback (default: "Something went wrong") */
  errorMessage?: string;

  /** Query keys to invalidate after successful mutation */
  invalidateKeys?: QueryKey[];

  /** Custom success handler - runs before invalidations */
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined
  ) => Promise<void> | void;

  /** Custom error handler - runs after logging */
  onError?: (
    error: Error,
    variables: TVariables,
    context: TContext | undefined
  ) => Promise<void> | void;

  /** Show success toast (default: true) */
  toastOnSuccess?: boolean;

  /** Show error toast (default: true) */
  toastOnError?: boolean;

  /** Optional onMutate for optimistic updates */
  onMutate?: UseMutationOptions<TData, Error, TVariables, TContext>["onMutate"];

  /** Optional onSettled for cleanup */
  onSettled?: UseMutationOptions<TData, Error, TVariables, TContext>["onSettled"];
}

/**
 * OpenPanel-style mutation helper
 *
 * Standardizes mutation handling across the app with:
 * - Uniform toast notifications for success/error
 * - Automatic query invalidation (supports tRPC and simple keys)
 * - Centralized error logging
 * - Optional custom callbacks
 *
 * @example
 * ```ts
 * // RECOMMENDED: Use query factory .base for invalidation
 * const deleteDeviceMutation = useMutationWithToast({
 *   mutationKey: ["device", "delete"],
 *   mutationFn: (data) => trpcClient.device.remove.mutate(data),
 *   successMessage: 'Device deleted successfully',
 *   invalidateKeys: [deviceQueries.list.base],  // Uses ['device', 'list']
 * });
 *
 * // Multiple invalidations
 * invalidateKeys: [
 *   deviceQueries.list.base,           // ['device', 'list']
 *   scheduleQueries.list.base,         // ['schedule', 'list']
 *   ['organizations'],                 // Simple path
 * ],
 *
 * // Prefix matching: ['device'] invalidates all device.* queries
 * invalidateKeys: [['device']]
 *
 * // For optimistic updates, use .key() to get specific query key
 * onMutate: async (variables) => {
 *   const queryKey = deviceQueries.detail.key(variables.deviceId);
 *   await queryClient.cancelQueries({ queryKey });
 *   // ... optimistic update
 * }
 * ```
 *
 * Query Key Patterns:
 * - Simple path: ['device', 'list'] - matches all device list queries regardless of params
 * - Full tRPC tuple: [['device', 'list'], { input: {...}, type: 'query' }] - specific query instance
 * - The invalidation logic uses prefix matching, so ['device'] matches ['device', 'list'], ['device', 'detail'], etc.
 */
export function useMutationWithToast<TData, TVariables = void, TContext = unknown>({
  mutationFn,
  mutationKey,
  successMessage,
  errorMessage = "Something went wrong",
  invalidateKeys = [],
  onSuccess,
  onError,
  toastOnSuccess = true,
  toastOnError = true,
  onMutate,
  onSettled,
}: UseMutationWithToastProps<TData, TVariables, TContext>) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables, TContext>({
    mutationKey,
    mutationFn,
    onMutate,
    async onSuccess(data, variables, context) {
      // Show success toast
      if (toastOnSuccess && successMessage) {
        const text =
          typeof successMessage === "function"
            ? successMessage(data, variables)
            : successMessage;
        toast.success(text);
      }

      // Run custom success handler
      if (onSuccess) {
        await onSuccess(data, variables, context);
      }

      // Invalidate queries with format-aware matching:
      // - Full tRPC tuple [['path'], { input }] → exact match using built-in queryKey
      // - Flat base path ['device', 'list'] → prefix match using invalidateTRPCQuery
      await Promise.all(
        invalidateKeys.map((key) => {
          // Full tRPC tuple: [['procedure', 'path'], { input, type }]
          // Use exact matching via built-in queryKey (TanStack Query handles this correctly)
          if (
            Array.isArray(key) &&
            Array.isArray(key[0]) &&
            key.length === 2 &&
            typeof key[1] === 'object' &&
            key[1] !== null
          ) {
            return queryClient.invalidateQueries({ queryKey: key });
          }
          // Flat base path: ['procedure', 'path']
          // Use prefix matching to invalidate all queries under this path
          return queryClient.invalidateQueries(
            invalidateTRPCQuery(key, { prefix: true })
          );
        })
      );
    },
    async onError(error, variables, context) {
      // Log error for monitoring
      captureException(error, {
        mutationKey,
        variables: typeof variables === 'object' ? variables : { value: variables },
      });

      // Show error toast
      if (toastOnError) {
        toast.error(
          error.message && error.message !== "Unknown error"
            ? error.message
            : errorMessage
        );
      }

      // Run custom error handler
      if (onError) {
        await onError(error, variables, context);
      }
    },
    onSettled,
  });
}
