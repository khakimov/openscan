import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OnboardingSteps } from "./steps";

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number;
  maxStep?: number;
  projectId?: string | null;
  className?: string;
}

export function OnboardingLayout({
  children,
  currentStep,
  maxStep,
  projectId,
  className,
}: OnboardingLayoutProps) {
  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute inset-0 hidden lg:grid lg:grid-cols-[28vw_1fr] pointer-events-none">
        <div className="bg-primary" />
        <div className="border-l border-border/60 bg-background" />
      </div>

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <aside className="hidden lg:flex lg:w-[28vw] xl:w-[24vw] bg-primary text-primary-foreground">
          <div className="flex w-full flex-col gap-10 px-10 py-14">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary-foreground/75">
                Welcome to
              </p>
              <p className="text-4xl font-bold">SECROCKS</p>
            </div>
            <OnboardingSteps currentStep={currentStep} maxStep={maxStep} projectId={projectId} />
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
          <div className={cn("w-full max-w-4xl", className)}>{children}</div>
        </main>
      </div>
    </div>
  );
}
