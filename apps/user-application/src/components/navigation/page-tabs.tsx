"use client";

import { cn } from "@/utils/cn";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";

export function PageTabs({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("h-10 overflow-x-auto", className)}>
      <div className="flex gap-4 whitespace-nowrap text-3xl font-semibold">
        {children}
      </div>
    </div>
  );
}

export function PageTabsLink({
  to = ".",
  params,
  search,
  hash,
  preload = "intent",
  replace,
  resetScroll,
  children,
  isActive = false,
}: {
  to?: string;
  params?: Record<string, string | number>;
  search?: Record<string, unknown>;
  hash?: string;
  preload?: "intent" | "render" | "viewport" | false;
  replace?: boolean;
  resetScroll?: boolean;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <div className="relative">
      <Link
        className={cn(
          "inline-block opacity-100 transition-transform hover:translate-y-[-1px]",
          isActive ? "opacity-100" : "opacity-50",
        )}
        to={to}
        params={params}
        search={search}
        hash={hash}
        preload={preload}
        replace={replace}
        resetScroll={resetScroll}
      >
        {children}
      </Link>
      {isActive && (
        <motion.div
          className="rounded-full absolute -bottom-1 left-0 right-0 h-0.5 bg-primary"
          layoutId={"page-tabs-link"}
        />
      )}
    </div>
  );
}

export function PageTabsItem({
  onClick,
  children,
  isActive = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-block opacity-100 transition-transform hover:translate-y-[-1px]",
        isActive ? "opacity-100" : "opacity-50",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
