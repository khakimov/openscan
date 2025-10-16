import { cn } from "@/utils/cn";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function usePagination(take: number) {
  const [page, setPage] = useState(0);
  return {
    take,
    skip: page * take,
    setPage,
    page,
    paginate: <T,>(data: T[]): T[] =>
      data.slice(page * take, (page + 1) * take),
  };
}

export function Pagination({
  take,
  count,
  cursor,
  setCursor,
  className,
  size = "base",
  loading,
}: {
  take: number;
  count: number;
  cursor: number;
  setCursor: Dispatch<SetStateAction<number>>;
  className?: string;
  size?: "sm" | "base";
  loading?: boolean;
}) {
  const lastCursor = Math.floor(count / take) - 1;
  const isNextDisabled = count === 0 || lastCursor === cursor;
  return (
    <div
      className={cn(
        "flex select-none items-center justify-end gap-1",
        className,
      )}
    >
      {size === "base" && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCursor(0)}
          disabled={cursor === 0}
          className="max-sm:hidden"
        >
          <ChevronsLeftIcon className="h-4 w-4" />
          <span className="sr-only">First page</span>
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setCursor((p) => Math.max(0, p - 1))}
        disabled={cursor === 0}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <span className="sr-only">Previous page</span>
      </Button>

      <Button disabled variant="outline" size="icon" aria-live="polite">
        {loading ? "…" : cursor + 1}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={() => setCursor((p) => Math.min(lastCursor, p + 1))}
        disabled={isNextDisabled}
      >
        <ChevronRightIcon className="h-4 w-4" />
        <span className="sr-only">Next page</span>
      </Button>
    </div>
  );
}
