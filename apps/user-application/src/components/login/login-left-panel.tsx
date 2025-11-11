import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const slides = [
  {
    id: 1,
    title: "Automated Security Monitoring",
    description: "Continuous scanning and vulnerability detection for your infrastructure",
  },
  {
    id: 2,
    title: "Real-time Threat Detection",
    description: "Get instant alerts when security issues are discovered",
  },
  {
    id: 3,
    title: "Comprehensive Asset Discovery",
    description: "Automatically discover and monitor all your internet-facing services",
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
    <div className="relative h-screen overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center p-8">
        <div className="text-2xl font-bold text-white">sec.rocks</div>
        <a
          href="/"
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Back to website →
        </a>
      </div>

      {/* Slides */}
      <div className="relative h-full flex items-center justify-center p-12 pt-24 pb-24">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 flex items-center justify-center p-12 pt-24 pb-24 transition-opacity duration-500 ${
              index === currentSlide ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="max-w-2xl">
              {/* Image placeholder */}
              <div className="rounded-2xl bg-zinc-800 border border-zinc-700 shadow-2xl overflow-hidden mb-8">
                <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                  <div className="text-center">
                    <div className="text-6xl font-bold text-zinc-600 mb-4">
                      {slide.id}
                    </div>
                    <div className="text-zinc-500 text-lg">Image {slide.id}</div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="text-center">
                <h2 className="text-4xl font-bold text-white mb-4">
                  {slide.title}
                </h2>
                <p className="text-lg text-zinc-400">{slide.description}</p>
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
            className="text-white hover:bg-white/10"
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
                    ? "w-8 bg-white"
                    : "w-2 bg-zinc-600 hover:bg-zinc-500"
                }`}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={nextSlide}
            className="text-white hover:bg-white/10"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
