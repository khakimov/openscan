import { differenceInCalendarMonths } from "date-fns";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { setStorageItem } from "@/utils/storage";
import {
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  intervals,
  timeWindows,
} from "@repo/constants";
import type { IChartRange } from "@repo/constants";

// Define the search params schema
export const overviewSearchSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  range: z.enum(Object.keys(timeWindows) as [string, ...string[]]).default("7d"),
  overrideInterval: z.enum(Object.keys(intervals) as [string, ...string[]]).optional(),
  metric: z.number().default(0),
});

export type OverviewSearchParams = z.infer<typeof overviewSearchSchema>;

export function useOverviewOptions() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as OverviewSearchParams;

  const {
    start: startDate,
    end: endDate,
    range = "7d",
    overrideInterval,
    metric = 0,
  } = search;

  const interval =
    overrideInterval ||
    getDefaultIntervalByDates(startDate, endDate) ||
    getDefaultIntervalByRange(range);

  // Helper to update search params
  const updateSearch = (updates: Partial<OverviewSearchParams>) => {
    navigate({
      search: (prev) => ({
        ...prev,
        ...updates,
      }),
    });
  };

  return {
    // Skip previous for ranges over 6 months (for performance reasons)
    previous: !(
      range === "yearToDate" ||
      range === "lastYear" ||
      (range === "custom" &&
        startDate &&
        endDate &&
        differenceInCalendarMonths(new Date(startDate), new Date(endDate)) > 6)
    ),
    range,
    setRange: (value: IChartRange | null) => {
      if (value !== "custom") {
        updateSearch({
          range: value || undefined,
          start: undefined,
          end: undefined,
          overrideInterval: undefined,
        });
        setStorageItem("range", value);
      } else {
        updateSearch({ range: value });
      }
    },
    metric,
    setMetric: (value: number) => updateSearch({ metric: value }),
    startDate,
    setStartDate: (value: string | null) => updateSearch({ start: value || undefined }),
    endDate,
    setEndDate: (value: string | null) => updateSearch({ end: value || undefined }),
    interval,
    setInterval: (value: string | null) => updateSearch({ overrideInterval: value || undefined }),
  };
}