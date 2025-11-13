import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { StackedCardLayout } from "@/components/layout";
import { onboardingStatusQuery } from "@/queries/onboarding-queries";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    // Prefetch onboarding status into React Query cache (SSR + client navigation)
    await context.queryClient.prefetchQuery(onboardingStatusQuery);

    // Inject into router context so child routes have synchronous access
    // Guard: fallback to fetchQuery if prefetch somehow failed
    const onboarding = context.queryClient.getQueryData(onboardingStatusQuery.queryKey)
      ?? await context.queryClient.fetchQuery(onboardingStatusQuery);

    return {
      context: {
        onboarding,
      },
    };
  },
  loader: async ({ context }) => {
    // Make onboarding available via Route.useLoaderData()
    // Guard: fallback to fetchQuery if cache is empty
    const onboarding = context.queryClient.getQueryData(onboardingStatusQuery.queryKey)
      ?? await context.queryClient.fetchQuery(onboardingStatusQuery);

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
