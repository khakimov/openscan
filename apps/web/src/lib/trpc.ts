import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { AppRouter } from "@/trpc/router";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnReconnect: false,
    },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      transformer: superjson,
      url: "/trpc",
      fetch: async (url, options) => {
        const response = await fetch(url, {
          ...options,
          credentials: "include",
        });

        if (!response.ok) {
          let bodySnippet: string | undefined;
          try {
            const clone = response.clone();
            const text = await clone.text();
            bodySnippet = text.slice(0, 200);
          } catch {
            bodySnippet = undefined;
          }

          console.error("tRPC fetch failure", {
            url: typeof url === "string" ? url : url.toString(),
            status: response.status,
            contentType: response.headers.get("content-type"),
            bodySnippet,
          });
        }

        return response;
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
