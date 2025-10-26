import { createFileRoute, redirect } from "@tanstack/react-router";
import { HeroSection } from "@/components/landing/hero-section";
import { getCurrentUser } from "@/server/auth";
import { getActiveOrganization } from "@/server/organization";
import { getOrCreateDefaultProject } from "@repo/data-ops";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) {
      // Get active organization and default project
      const activeOrgResult = await getActiveOrganization();
      const org = activeOrgResult.success ? activeOrgResult.organization : null;

      if (org) {
        // Get or create default project for the organization
        const defaultProject = await getOrCreateDefaultProject(org.id);

        // Prefer slug over ID for cleaner URLs (OpenPanel pattern)
        const orgIdentifier = org.slug || org.id;

        // Redirect to project-scoped route
        throw redirect({
          to: "/$organizationId/$projectId",
          params: {
            organizationId: orgIdentifier,
            projectId: defaultProject.id,
          },
        });
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
