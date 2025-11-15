import { createFileRoute, redirect } from "@tanstack/react-router";
import { BackgroundPaths } from "@/components/landing/background-paths";
import { HeroSection } from "@/components/landing/hero-section";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    // Check session via tRPC (OpenPanel pattern)
    const sessionQuery = context.trpc.auth.session.queryOptions();
    const sessionData = await context.queryClient.ensureQueryData(sessionQuery);

    // Allow anonymous visitors to view the marketing page
    if (!sessionData?.session) {
      return;
    }

    const session = sessionData.session;

    // Fetch organizations to check if user has any
    const organizations = await context.queryClient.ensureQueryData(
      context.trpc.organization.list.queryOptions()
    );

    // No organizations - redirect to onboarding
    if (organizations.length === 0) {
      throw redirect({ to: "/onboarding" });
    }

    // Determine active organization (from session or first org)
    const activeOrg = session.activeOrganizationId
      ? organizations.find(org => org.id === session.activeOrganizationId) ?? organizations[0]
      : organizations[0];

    if (!activeOrg) {
      throw redirect({ to: "/onboarding" });
    }

    // Prefer slug over ID for cleaner URLs
    const orgIdentifier = activeOrg.slug || activeOrg.id;

    // Fetch projects to determine redirect destination (OpenPanel pattern)
    const projects = await context.queryClient.ensureQueryData(
      context.trpc.project.listByOrg.queryOptions({
        organizationId: activeOrg.id,
      })
    );

    // If user has exactly 1 project, go directly to it
    if (projects.length === 1 && projects[0].id) {
      throw redirect({
        to: "/$organizationId/$projectId",
        params: {
          organizationId: orgIdentifier,
          projectId: projects[0].id,
        },
      });
    }

    // If user has multiple projects (or none), show project selector at org root
    throw redirect({
      to: "/$organizationId",
      params: {
        organizationId: orgIdentifier,
      },
    });
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
