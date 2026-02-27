"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

type FloatingPathsProps = {
  position: number;
  className?: string;
  svgClassName?: string;
};

type BackgroundPathsProps = {
  className?: string;
  svgClassName?: string;
};

function FloatingPaths({
  position,
  className,
  svgClassName,
}: FloatingPathsProps) {
  const timings = useMemo(
    () =>
      Array.from({ length: 36 }, () => ({
        duration: 20 + Math.random() * 12,
        delay: Math.random() * 6,
      })),
    [],
  );

  const paths = useMemo(
    () =>
      Array.from({ length: 36 }, (_, index) => {
        const id = index + 1;
        const offset = index * 6;
        const horizontalShift = index * 5 * position;
        const { duration, delay } = timings[index];

        return {
          id,
          d: `M-${380 - horizontalShift} -${189 + offset}C-${
            380 - horizontalShift
          } -${189 + offset} -${312 - horizontalShift} ${216 - offset} ${
            152 - horizontalShift
          } ${343 - offset}C${616 - horizontalShift} ${470 - offset} ${
            684 - horizontalShift
          } ${875 - offset} ${684 - horizontalShift} ${875 - offset}`,
          strokeOpacity: Math.min(0.25 + index * 0.025, 0.85),
          strokeWidth: 0.4 + index * 0.03,
          duration,
          delay,
        };
      }),
    [position, timings],
  );

  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      <svg
        className={cn("h-full w-full text-muted-foreground", svgClassName)}
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={`${position}-${path.id}`}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.strokeWidth}
            strokeOpacity={path.strokeOpacity}
            strokeLinecap="round"
            initial={{ pathLength: 0.3, opacity: 0, pathOffset: 0 }}
            animate={{
              pathLength: [0.3, 1, 0.3],
              opacity: [0, 0.8, 0],
              pathOffset: [0, 0.5, 1],
            }}
            transition={{
              duration: path.duration,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "loop",
              delay: path.delay,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function BackgroundPaths({
  className,
  svgClassName,
}: BackgroundPathsProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        "flex items-center justify-center",
        className,
      )}
    >
      <FloatingPaths position={1} svgClassName={svgClassName} />
      <FloatingPaths position={-1} svgClassName={svgClassName} />
    </div>
  );
}
