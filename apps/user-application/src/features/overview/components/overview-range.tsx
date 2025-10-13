import { useOverviewOptions } from "../hooks/useOverviewOptions";
import { TimeWindowPicker } from "@/components/shared/time-window-picker";

export function OverviewRange() {
  const { range, setRange, setStartDate, setEndDate, endDate, startDate } =
    useOverviewOptions();

  return (
    <TimeWindowPicker
      onChange={setRange}
      value={range}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      endDate={endDate}
      startDate={startDate}
    />
  );
}
