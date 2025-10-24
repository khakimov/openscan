import { createFileRoute, redirect } from "@tanstack/react-router";
import { HeroSection } from "@/components/landing/hero-section";
import { getCurrentUser } from "@/server/auth";
import { getActiveOrganization } from "@/server/organization";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) {
      // Get active organization and redirect to org dashboard
      const activeOrgResult = await getActiveOrganization();
      const org = activeOrgResult.success ? activeOrgResult.organization : null;

      if (org) {
        // Prefer slug over ID for cleaner URLs (OpenPanel pattern)
        const orgIdentifier = org.slug || org.id;
        throw redirect({ to: `/${orgIdentifier}` as any });
      } else {
        // No organization yet - redirect to onboarding
        throw redirect({ to: "/onboarding" });
      }
    }
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/*<NavigationBar />*/}
      <main>
        <HeroSection />
      </main>
      {/*<Footer />*/}
    </div>
  );
}
