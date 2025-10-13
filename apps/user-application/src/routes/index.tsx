import { createFileRoute } from "@tanstack/react-router";
import { NavigationBar } from "@/components/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { Footer } from "@/components/landing/footer";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      <main>
        <HeroSection />
      </main>
      <Footer />
    </div>
  );
}
