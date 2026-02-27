import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    id: 1,
    title: "Automated Security Monitoring",
    description: "Continuous scanning and vulnerability detection for your infrastructure",
    gradient: "from-zinc-800 to-zinc-900",
  },
  {
    id: 2,
    title: "Real-time Threat Detection",
    description: "Get instant alerts when security issues are discovered",
    gradient: "from-slate-800 to-slate-900",
  },
  {
    id: 3,
    title: "Comprehensive Asset Discovery",
    description: "Automatically discover and monitor all your internet-facing services",
    gradient: "from-gray-800 to-gray-900",
  },
];

export function LoginLeftPanel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000); // Auto-rotate every 5 seconds

    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div className="relative h-screen overflow-hidden w-full">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center p-8">
        <div className="text-2xl font-bold">sec.rocks</div>
        <a
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to website →
        </a>
      </div>

      {/* Slides */}
      <div className="relative h-full flex items-center justify-center p-8 pt-24 pb-32">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 flex items-center justify-center p-8 pt-24 pb-32 transition-opacity duration-500 ${
              index === currentSlide ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* Card container matching OpenPanel style */}
            <div className="rounded-xl h-full w-full overflow-hidden bg-card border border-border shadow-lg">
              <div className={`flex flex-col justify-center items-center h-full p-8 bg-gradient-to-br ${slide.gradient}`}>
                <div className="text-center">
                  <h2 className="text-6xl font-bold text-white drop-shadow-lg mb-4">
                    {slide.title}
                  </h2>
                  <p className="text-lg text-white/80 leading-relaxed max-w-lg">
                    {slide.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Navigation */}
        <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-4 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevSlide}
            className="hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          {/* Dots */}
          <div className="flex gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? "w-8 bg-foreground"
                    : "w-2 bg-muted-foreground hover:bg-foreground/50"
                }`}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={nextSlide}
            className="hover:bg-muted"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
