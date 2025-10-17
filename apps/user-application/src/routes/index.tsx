import { createFileRoute, redirect } from "@tanstack/react-router";
import { HeroSection } from "@/components/landing/hero-section";
import { getCurrentUser } from "@/server/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) {
      throw redirect({ to: "/dashboard" });
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
