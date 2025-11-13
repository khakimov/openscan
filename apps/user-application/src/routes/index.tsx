import { createFileRoute, redirect } from "@tanstack/react-router";
import { BackgroundPaths } from "@/components/landing/background-paths";
import { HeroSection } from "@/components/landing/hero-section";
import { getOnboardingStatus } from "@/server/organization";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const onboarding = await getOnboardingStatus().catch(() => null);

    // Allow anonymous visitors to view the marketing page
    if (!onboarding?.user) {
      return;
    }

    // No organizations - redirect to onboarding
    if (!onboarding.organizationId) {
      throw redirect({ to: "/onboarding" });
    }

    // Has organization - redirect to dashboard
    if (onboarding.organizationId && onboarding.projectId) {
      // Prefer slug over ID for cleaner URLs (prevents double redirect)
      const orgIdentifier = onboarding.organization?.slug || onboarding.organizationId;

      throw redirect({
        to: "/$organizationId/$projectId",
        params: {
          organizationId: orgIdentifier,
          projectId: onboarding.projectId,
        },
      });
    }

    // Fallback to onboarding if project missing
    throw redirect({ to: "/onboarding" });
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="landing-page relative overflow-hidden">
      <BackgroundPaths className="opacity-80" svgClassName="text-white/60" />
      <div className="relative z-10">
        {/*<NavigationBar />*/}
        <main>
          <HeroSection />
        </main>
        {/*<Footer />*/}
      </div>
    </div>
  );
}
