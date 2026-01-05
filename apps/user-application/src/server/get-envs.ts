import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export interface ServerEnvData {
  appUrl: string;
  isSelfHosted: boolean;
}

const FALLBACK_APP_URL = "http://localhost:13000";

export const getServerEnvs = createServerFn().handler(
  async ({ context }): Promise<ServerEnvData> => {
    const env = (context as any)?.env;

    const appUrl =
      env?.APP_URL ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      FALLBACK_APP_URL;

    return {
      appUrl: String(appUrl),
      isSelfHosted: process.env.SELF_HOSTED !== undefined,
    };
  }
);

export const getServerEnvsQueryOptions = queryOptions({
  queryKey: ["server-envs"],
  queryFn: getServerEnvs,
  staleTime: Number.POSITIVE_INFINITY,
});
