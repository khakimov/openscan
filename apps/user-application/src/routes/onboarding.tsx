import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding2Layout,
});

function Onboarding2Layout() {
  return (
    <div className="relative min-h-screen pt-32 pb-8">
      <div className="relative z-10 border bg-background rounded-lg shadow-xl shadow-muted/50 max-w-xl mx-auto">
        <Progress />
        <Outlet />
      </div>
    </div>
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
