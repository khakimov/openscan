import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { StackedCardLayout } from "@/components/layout";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    // Skip SSR data fetching on Cloudflare Workers (prevents 522 timeouts)
    if (typeof window === 'undefined') {
      return;
    }

    // OpenPanel pattern: Use tRPC queryOptions for onboarding status
    const statusQuery = context.trpc.onboarding.status.queryOptions();

    // Ensure data is fetched and cached (deduplicates concurrent requests)
    const onboarding = await context.queryClient.ensureQueryData(statusQuery);

    return {
      context: {
        onboarding,
      },
    };
  },
  loader: async ({ context }) => {
    // Skip SSR data fetching on Cloudflare Workers (prevents 522 timeouts)
    if (typeof window === 'undefined') {
      return;
    }

    // OpenPanel pattern: Use tRPC queryOptions for onboarding status
    const statusQuery = context.trpc.onboarding.status.queryOptions();

    // Read from cache set by beforeLoad (no server call)
    const onboarding = context.queryClient.getQueryData(statusQuery.queryKey);

    return {
      onboarding,
    };
  },
  pendingComponent: () => (
    <StackedCardLayout>
      <div className="flex min-h-[280px] items-center justify-center">
        <Spinner size="md" wait="delay-200" />
      </div>
    </StackedCardLayout>
  ),
  component: Onboarding2Layout,
});

function Onboarding2Layout() {
  return (
    <StackedCardLayout header={<Progress />}>
      <Outlet />
    </StackedCardLayout>
  );
}

function Progress() {
  const steps = [
    {
      name: "Create account",
      match: "/onboarding",
    },
    {
      name: "Create project",
      match: "/onboarding/project",
    },
    {
      name: "Asset discovery",
      match: "/onboarding/$projectId/discovery",
    },
    {
      name: "Notifications",
      match: "/onboarding/$projectId/notifications",
    },
  ];
  const matchRoute = useMatchRoute();

  const currentStep = steps.find((step) =>
    matchRoute({
      // @ts-expect-error - TanStack Router types
      from: step.match,
      fuzzy: false,
    })
  );

  return (
    <div className="flex gap-4 p-4 border-b justify-between items-center w-full">
      <div className="font-bold">{currentStep?.name ?? "Onboarding"}</div>
      <div className="flex gap-4">
        {steps.map((step) => (
          <div
            className={cn(
              "w-10 h-2 rounded-full bg-muted",
              currentStep === step && "w-20 bg-primary"
            )}
            key={step.match}
          />
        ))}
      </div>
    </div>
  );
}
