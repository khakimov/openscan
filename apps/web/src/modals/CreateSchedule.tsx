import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useCreateScheduleMutation } from "@/queries/schedule-queries";
import { Loader2, Clock } from "lucide-react";

// Form validation schema
const CreateScheduleSchema = z.object({
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH'], {
    message: "Please select a scan preset",
  }),
  scheduleFrequency: z.enum([
    'EVERY_30_MINUTES',
    'EVERY_HOUR',
    'EVERY_6_HOURS',
    'EVERY_12_HOURS',
    'DAILY',
  ], {
    message: "Please select a schedule frequency",
  }),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
}).refine(
  (data) => {
    if (data.scheduleFrequency === 'DAILY' && !data.dailyTime) {
      return false;
    }
    return true;
  },
  {
    message: 'Time is required for daily schedules',
    path: ['dailyTime'],
  }
);

type CreateScheduleFormData = z.infer<typeof CreateScheduleSchema>;

interface CreateScheduleProps {
  deviceId: string;
  deviceName?: string;
  onSuccess?: () => void;
}

export default function CreateSchedule({
  deviceId,
  deviceName,
  onSuccess,
}: CreateScheduleProps) {
  const {
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    register,
  } = useForm<CreateScheduleFormData>({
    resolver: zodResolver<CreateScheduleFormData, any, CreateScheduleFormData>(
      CreateScheduleSchema
    ),
    defaultValues: {
      preset: 'STANDARD',
      scheduleFrequency: 'DAILY',
      dailyTime: '02:00',
    },
  });

  const selectedPreset = watch('preset');
  const selectedFrequency = watch('scheduleFrequency');

  const createMutation = useCreateScheduleMutation();

  const onSubmit = (data: CreateScheduleFormData) => {
    createMutation.mutate(
      {
        deviceId,
        preset: data.preset,
        scheduleFrequency: data.scheduleFrequency,
        dailyTime: data.dailyTime,
        startImmediately: true,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            // Close modal and call success callback
            onSuccess?.();
            popModal("CreateSchedule");
          }
          // Note: Error and partial success toasts are handled by the mutation
        },
      }
    );
  };

  // Preset descriptions
  const presetDescriptions = {
    QUICK: 'Fast scan (~1-2 min) - Top 100 ports only',
    STANDARD: 'Balanced scan (~5 min) - Top 1000 ports',
    THOROUGH: 'Complete scan (~15-30 min) - All 65535 ports + OS detection',
  };

  return (
    <ModalContent className="max-w-lg" hideCloseButton>
      <ModalHeader title="Create Scan Schedule" className="mb-0" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Device Info */}
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm font-medium">Device</p>
          <p className="text-sm text-muted-foreground mt-1">
            {deviceName || deviceId}
          </p>
        </div>

        {/* Scan Preset */}
        <div className="space-y-2">
          <Label htmlFor="preset">Scan Preset *</Label>
          <Select
            value={selectedPreset}
            onValueChange={(value) =>
              setValue('preset', value as 'QUICK' | 'STANDARD' | 'THOROUGH')
            }
          >
            <SelectTrigger id="preset">
              <SelectValue placeholder="Select scan preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="QUICK">Quick Scan</SelectItem>
              <SelectItem value="STANDARD">Standard Scan</SelectItem>
              <SelectItem value="THOROUGH">Thorough Scan</SelectItem>
            </SelectContent>
          </Select>
          {errors.preset && (
            <p className="text-sm text-red-500">{errors.preset.message}</p>
          )}
          {selectedPreset && (
            <p className="text-xs text-muted-foreground">
              {presetDescriptions[selectedPreset]}
            </p>
          )}
        </div>

        {/* Schedule Frequency */}
        <div className="space-y-2">
          <Label htmlFor="scheduleFrequency">Schedule Frequency *</Label>
          <Select
            value={selectedFrequency}
            onValueChange={(value) =>
              setValue('scheduleFrequency', value as any)
            }
          >
            <SelectTrigger id="scheduleFrequency">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EVERY_30_MINUTES">Every 30 Minutes</SelectItem>
              <SelectItem value="EVERY_HOUR">Every Hour</SelectItem>
              <SelectItem value="EVERY_6_HOURS">Every 6 Hours</SelectItem>
              <SelectItem value="EVERY_12_HOURS">Every 12 Hours</SelectItem>
              <SelectItem value="DAILY">Daily at Specific Time</SelectItem>
            </SelectContent>
          </Select>
          {errors.scheduleFrequency && (
            <p className="text-sm text-red-500">{errors.scheduleFrequency.message}</p>
          )}
        </div>

        {/* Daily Time (only shown for DAILY frequency) */}
        {selectedFrequency === 'DAILY' && (
          <div className="space-y-2">
            <Label htmlFor="dailyTime">Daily Run Time (UTC) *</Label>
            <Input
              id="dailyTime"
              type="time"
              {...register('dailyTime')}
            />
            {errors.dailyTime && (
              <p className="text-sm text-red-500">{errors.dailyTime.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Scans will run once per day at this time (UTC timezone)
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Schedule Summary
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                <strong>{selectedPreset || 'Selected'}</strong> scan will run{' '}
                <strong>{getFrequencyDescription(selectedFrequency, watch('dailyTime'))}</strong>
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                First scan will start immediately after creation
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => popModal("CreateSchedule")}
            disabled={createMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Clock className="mr-2 h-4 w-4" />
                Create Schedule
              </>
            )}
          </Button>
        </div>
      </form>
    </ModalContent>
  );
}

/**
 * Get human-readable description of schedule frequency
 */
function getFrequencyDescription(
  frequency: string,
  dailyTime?: string
): string {
  switch (frequency) {
    case 'EVERY_30_MINUTES':
      return 'every 30 minutes';
    case 'EVERY_HOUR':
      return 'every hour';
    case 'EVERY_6_HOURS':
      return 'every 6 hours';
    case 'EVERY_12_HOURS':
      return 'every 12 hours';
    case 'DAILY':
      return `daily at ${dailyTime || '02:00'} UTC`;
    default:
      return 'on the selected schedule';
  }
}
