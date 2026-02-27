import { useOverviewOptions } from "../hooks/useOverviewOptions";
import { TimeWindowPicker } from "@/components/shared/time-window-picker";
import type { timeWindows } from "@repo/constants";

type TimeWindowKey = keyof typeof timeWindows;

export function OverviewRange() {
  const { range, setRange, setStartDate, setEndDate, endDate, startDate } =
    useOverviewOptions();

  return (
    <TimeWindowPicker
      onChange={setRange}
      value={range as TimeWindowKey}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      endDate={endDate || null}
      startDate={startDate || null}
    />
  );
}
