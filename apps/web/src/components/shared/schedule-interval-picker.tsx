import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

/**
 * Schedule Interval Types:
 * - DURATION: Run every N minutes/hours (e.g., every 30 minutes, every 2 hours)
 * - DAILY: Run once per day at specific time (e.g., 2:00 AM UTC)
 */
export type IntervalType = 'DURATION' | 'DAILY';

export interface ScheduleInterval {
  type: IntervalType;

  // For DURATION type
  durationValue?: number;
  durationUnit?: 'MINUTES' | 'HOURS';

  // For DAILY type
  dailyTime?: string; // HH:mm format (UTC)
}

interface Props {
  value: ScheduleInterval;
  onChange: (interval: ScheduleInterval) => void;
  className?: string;
}

export function ScheduleIntervalPicker({ value, onChange, className }: Props) {
  const handleTypeChange = (type: IntervalType) => {
    if (type === 'DURATION') {
      onChange({
        type: 'DURATION',
        durationValue: 30,
        durationUnit: 'MINUTES',
      });
    } else {
      onChange({
        type: 'DAILY',
        dailyTime: '02:00',
      });
    }
  };

  const handleDurationValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const durationValue = parseInt(e.target.value, 10);
    if (!isNaN(durationValue) && durationValue > 0) {
      onChange({
        ...value,
        durationValue,
      });
    }
  };

  const handleDurationUnitChange = (durationUnit: 'MINUTES' | 'HOURS') => {
    onChange({
      ...value,
      durationUnit,
    });
  };

  const handleDailyTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      dailyTime: e.target.value,
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Interval Type Selector */}
      <div className="space-y-2">
        <Label>Schedule Type</Label>
        <Select
          value={value.type}
          onValueChange={(val) => handleTypeChange(val as IntervalType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DURATION">Recurring Interval</SelectItem>
            <SelectItem value="DAILY">Daily at Specific Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Duration Configuration */}
      {value.type === 'DURATION' && (
        <div className="space-y-2">
          <Label>Run Every</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min="1"
              value={value.durationValue || 30}
              onChange={handleDurationValueChange}
              className="w-24"
            />
            <Select
              value={value.durationUnit || 'MINUTES'}
              onValueChange={(val) => handleDurationUnitChange(val as 'MINUTES' | 'HOURS')}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MINUTES">Minutes</SelectItem>
                <SelectItem value="HOURS">Hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {value.durationUnit === 'MINUTES'
              ? `Scans will run every ${value.durationValue || 30} minutes`
              : `Scans will run every ${value.durationValue || 1} hour(s)`}
          </p>
        </div>
      )}

      {/* Daily Time Configuration */}
      {value.type === 'DAILY' && (
        <div className="space-y-2">
          <Label htmlFor="daily-time">Daily Run Time (UTC)</Label>
          <Input
            id="daily-time"
            type="time"
            value={value.dailyTime || '02:00'}
            onChange={handleDailyTimeChange}
          />
          <p className="text-xs text-muted-foreground">
            Scans will run once per day at {value.dailyTime || '02:00'} UTC
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Convert ScheduleInterval to cron expression
 * Used when creating schedules in server functions
 */
export function intervalToCron(interval: ScheduleInterval): string {
  if (interval.type === 'DURATION') {
    const value = interval.durationValue || 30;
    const unit = interval.durationUnit || 'MINUTES';

    if (unit === 'MINUTES') {
      // Every N minutes: */N * * * *
      return `*/${value} * * * *`;
    } else {
      // Every N hours: 0 */N * * *
      return `0 */${value} * * *`;
    }
  } else {
    // Daily at specific time: HH:mm -> m H * * *
    const [hours, minutes] = (interval.dailyTime || '02:00').split(':');
    return `${minutes} ${hours} * * *`;
  }
}

/**
 * Get human-readable description of interval
 */
export function getIntervalDescription(interval: ScheduleInterval): string {
  if (interval.type === 'DURATION') {
    const value = interval.durationValue || 30;
    const unit = interval.durationUnit || 'MINUTES';

    if (unit === 'MINUTES') {
      return value === 1 ? 'Every minute' : `Every ${value} minutes`;
    } else {
      return value === 1 ? 'Every hour' : `Every ${value} hours`;
    }
  } else {
    const time = interval.dailyTime || '02:00';
    return `Daily at ${time} UTC`;
  }
}
