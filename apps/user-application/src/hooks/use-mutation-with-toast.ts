import { useMutation, type UseMutationOptions, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { createLogger } from "@repo/logger";

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
 * - Automatic query invalidation
 * - Centralized error logging
 * - Optional custom callbacks
 *
 * @example
 * ```ts
 * const createProjectMutation = useMutationWithToast({
 *   mutationKey: ["project", "create"],
 *   mutationFn: (payload) => createProject(payload),
 *   successMessage: ({ project }) => `Project ${project.name} created`,
 *   invalidateKeys: [["projects"], ["onboarding-status"]],
 * });
 * ```
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

      // Invalidate queries using predicate matching for tRPC-style nested keys
      // tRPC keys are structured as: [['procedure', 'path'], { input: {...}, type: 'query' }]
      // When invalidating with ['procedure', 'path'], we match the first element
      await Promise.all(
        invalidateKeys.map((key) =>
          queryClient.invalidateQueries({
            predicate: (query) => {
              const queryKey = query.queryKey;
              // Check if first element of query key matches our invalidation key
              if (Array.isArray(queryKey) && Array.isArray(queryKey[0])) {
                // tRPC format: [['device', 'list'], { input: {...} }]
                return JSON.stringify(queryKey[0]) === JSON.stringify(key);
              }
              // Fallback to exact match for non-tRPC keys
              return JSON.stringify(queryKey) === JSON.stringify(key);
            }
          })
        )
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
