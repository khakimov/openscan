import { type TRPCClientErrorBase } from "@trpc/client";
import { toast, type ExternalToast } from "sonner";
import { trpc, trpcClient } from "@/lib/trpc";

/**
 * Drop-in replacements for the old TRPCProvider-based hooks.
 * In the SPA architecture, trpc and trpcClient are module-level singletons
 * so no React context provider is needed.
 */
export function useTRPC() {
  return trpc;
}

export function useTRPCClient() {
  return trpcClient;
}

export function handleError(error: TRPCClientErrorBase<any>) {
  toast("Error", {
    description: error.message,
  });
}

export function handleErrorToastOptions(options: ExternalToast) {
  return (error: TRPCClientErrorBase<any>) => {
    toast("Error", {
      description: error.message,
      ...options,
    });
  };
}
