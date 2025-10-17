import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pushModal, useOnPushModal } from "@/modals";
import { cn } from "@/utils/cn";
import { bind } from "bind-event-listener";
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { shouldIgnoreKeypress } from "@/utils/should-ignore-keypress";
import { timeWindows } from "@repo/constants";
import { endOfDay, format, startOfDay } from "date-fns";

type TimeWindowKey = keyof typeof timeWindows;
type TimeWindowConfig = (typeof timeWindows)[TimeWindowKey];

type Props = {
  value: TimeWindowKey;
  onChange: (value: TimeWindowKey) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  endDate: string | null;
  startDate: string | null;
  className?: string;
};
export function TimeWindowPicker({
  value,
  onChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  className,
}: Props) {
  const isDateRangerPickerOpen = useRef(false);
  useOnPushModal("DateRangerPicker", (open) => {
    isDateRangerPickerOpen.current = open;
  });
  const timeWindow = timeWindows[value];

  const handleCustom = useCallback(() => {
    pushModal("DateRangerPicker", {
      onChange: ({
        startDate: newStartDate,
        endDate: newEndDate,
      }: {
        startDate: Date;
        endDate: Date;
      }) => {
        onStartDateChange(
          format(startOfDay(newStartDate), "yyyy-MM-dd HH:mm:ss"),
        );
        onEndDateChange(format(endOfDay(newEndDate), "yyyy-MM-dd HH:mm:ss"));
        onChange("custom");
      },
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }, [endDate, onChange, onEndDateChange, onStartDateChange, startDate]);

  useEffect(() => {
    return bind(document, {
      type: "keydown",
      listener(event) {
        if (shouldIgnoreKeypress(event)) {
          return;
        }

        if (isDateRangerPickerOpen.current) {
          return;
        }

        const match = (
          Object.values(timeWindows) as TimeWindowConfig[]
        ).find((tw) => event.key === tw.shortcut.toLowerCase());
        if (match?.key === "custom") {
          handleCustom();
        } else if (match) {
          onChange(match.key);
        }
      },
    });
  }, [handleCustom, onChange]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("justify-start", className)}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {timeWindow?.label ?? "Select"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Time window</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange(timeWindows["30min"].key)}>
            {timeWindows["30min"].label}
            <DropdownMenuShortcut>
              {timeWindows["30min"].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastHour.key)}>
            {timeWindows.lastHour.label}
            <DropdownMenuShortcut>
              {timeWindows.lastHour.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.today.key)}>
            {timeWindows.today.label}
            <DropdownMenuShortcut>
              {timeWindows.today.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.yesterday.key)}>
            {timeWindows.yesterday.label}
            <DropdownMenuShortcut>
              {timeWindows.yesterday.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onChange(timeWindows["7d"].key)}>
            {timeWindows["7d"].label}
            <DropdownMenuShortcut>
              {timeWindows["7d"].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows["30d"].key)}>
            {timeWindows["30d"].label}
            <DropdownMenuShortcut>
              {timeWindows["30d"].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows["6m"].key)}>
            {timeWindows["6m"].label}
            <DropdownMenuShortcut>
              {timeWindows["6m"].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows["12m"].key)}>
            {timeWindows["12m"].label}
            <DropdownMenuShortcut>
              {timeWindows["12m"].shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => onChange(timeWindows.monthToDate.key)}
          >
            {timeWindows.monthToDate.label}
            <DropdownMenuShortcut>
              {timeWindows.monthToDate.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastMonth.key)}>
            {timeWindows.lastMonth.label}
            <DropdownMenuShortcut>
              {timeWindows.lastMonth.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => onChange(timeWindows.yearToDate.key)}
          >
            {timeWindows.yearToDate.label}
            <DropdownMenuShortcut>
              {timeWindows.yearToDate.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange(timeWindows.lastYear.key)}>
            {timeWindows.lastYear.label}
            <DropdownMenuShortcut>
              {timeWindows.lastYear.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleCustom}>
            {timeWindows.custom.label}
            <DropdownMenuShortcut>
              {timeWindows.custom.shortcut}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
