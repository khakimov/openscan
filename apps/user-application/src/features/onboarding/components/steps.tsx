import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { CheckCheck } from "lucide-react";

type StepStatus = "completed" | "current" | "pending";

interface StepDefinition {
  number: number;
  title: string;
  requiresProjectId?: boolean;
  getTarget: (projectId?: string | null) =>
    | {
        to: "/onboarding/";
      }
    | {
        to: "/onboarding/project";
      }
    | {
        to: "/onboarding/$projectId/discovery";
        params: { projectId: string };
      }
    | {
        to: "/onboarding/$projectId/connect";
        params: { projectId: string };
      }
    | null;
}

interface StepsProps {
  currentStep: number;
  maxStep?: number;
  projectId?: string | null;
  className?: string;
}

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    number: 1,
    title: "Create an account",
    getTarget: () => ({ to: "/onboarding/" }),
  },
  {
    number: 2,
    title: "Create project",
    getTarget: () => ({ to: "/onboarding/project" }),
  },
  {
    number: 3,
    title: "Discover assets",
    requiresProjectId: true,
    getTarget: (projectId) =>
      projectId
        ? { to: "/onboarding/$projectId/discovery", params: { projectId } }
        : null,
  },
  {
    number: 4,
    title: "Set monitoring",
    requiresProjectId: true,
    getTarget: (projectId) =>
      projectId
        ? { to: "/onboarding/$projectId/connect", params: { projectId } }
        : null,
  },
];

export function OnboardingSteps({
  currentStep,
  maxStep,
  projectId,
  className,
}: StepsProps) {
  const navigate = useNavigate();
  const highestUnlocked = Math.max(maxStep ?? currentStep, currentStep);

  const stepsWithStatus = STEP_DEFINITIONS.map((step) => {
    let status: StepStatus = "pending";
    if (step.number < currentStep) status = "completed";
    if (step.number === currentStep) status = "current";
    return {
      ...step,
      status,
    };
  });

  const currentIndex = stepsWithStatus.findIndex(
    (step) => step.status === "current",
  );
  const progressHeight =
    currentIndex <= 0
      ? "0%"
      : `calc(${((currentIndex + 1) / stepsWithStatus.length) * 100}% - 3.5rem)`;

  return (
    <div className="relative">
      <div className="absolute bottom-4 left-4 top-4 w-px bg-primary-foreground/20" />
      <div
        className="absolute left-4 top-4 w-px bg-primary-foreground transition-all duration-300"
        style={{ height: progressHeight }}
      />

      <div
        className={cn(
          "relative flex gap-4 overflow-hidden md:-ml-3 md:flex-col md:gap-8",
          className,
        )}
      >
        {stepsWithStatus.map((step, index) => {
          const allowNextStep = step.number === currentStep + 1;
          const baseEnabled = step.number <= highestUnlocked || allowNextStep;
          const hasRequiredProject = !step.requiresProjectId || !!projectId;
          const isEnabled = baseEnabled && hasRequiredProject;

          return (
            <button
              key={step.number}
              type="button"
              onClick={() => {
                if (!isEnabled) return;
                const target = step.getTarget(projectId ?? undefined);
                if (!target) return;
                navigate(target as never);
              }}
              disabled={!isEnabled}
              className={cn(
                "flex flex-shrink-0 items-center gap-4 self-start px-3 py-1.5 transition-all",
                step.status === "current" &&
                  "rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 shadow-sm",
                step.status === "completed" &&
                  index !== currentIndex - 1 &&
                  "max-md:hidden",
                !isEnabled && "cursor-not-allowed opacity-40",
                isEnabled && "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50",
              )}
            >
              <div
                className={cn(
                  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                )}
              >
                <div
                  className={cn(
                    "absolute inset-0 z-0 rounded-full bg-primary-foreground text-primary",
                    step.status === "pending" && "bg-primary-foreground/30 text-primary-foreground",
                  )}
                />
                {step.status === "current" && (
                  <div className="absolute inset-1 z-0 animate-ping-slow rounded-full bg-primary-foreground opacity-75" />
                )}
                <div className="relative z-10 text-sm font-medium">
                  {step.status === "completed" && <CheckCheck size={14} className="text-primary" />}
                  {step.status === "pending" && (
                    <span className="text-primary-foreground">{step.number}</span>
                  )}
                  {step.status === "current" && (
                    <span className="text-primary">{step.number}</span>
                  )}
                </div>
              </div>

              <div className="font-medium text-primary-foreground">{step.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
