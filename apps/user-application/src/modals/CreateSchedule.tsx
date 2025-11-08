import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useCreateScheduleMutation } from "@/queries";
import { Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  ScheduleIntervalPicker,
  type ScheduleInterval,
  intervalToCron,
  getIntervalDescription,
} from "@/components/shared/schedule-interval-picker";

// Form validation schema
const CreateScheduleSchema = z.object({
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH'], {
    required_error: "Please select a scan preset",
  }),
});

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
  } = useForm<CreateScheduleFormData>({
    resolver: zodResolver<CreateScheduleFormData, any, CreateScheduleFormData>(
      CreateScheduleSchema
    ),
    defaultValues: {
      preset: 'STANDARD',
    },
  });

  // Interval state (managed separately from react-hook-form)
  const [interval, setInterval] = useState<ScheduleInterval>({
    type: 'DAILY',
    dailyTime: '02:00',
  });

  const selectedPreset = watch('preset');

  const createMutation = useCreateScheduleMutation();

  const onSubmit = async (data: CreateScheduleFormData) => {
    const cronExpression = intervalToCron(interval);
    const description = getIntervalDescription(interval);

    createMutation.mutate(
      {
        deviceId,
        preset: data.preset,
        interval: cronExpression,
        startImmediately: true,
      },
      {
        onSuccess: (response) => {
          if (response.success) {
            toast.success("Schedule created successfully", {
              description: `${deviceName || 'Device'} will be scanned ${description.toLowerCase()}`,
            });
            onSuccess?.();
            popModal("CreateSchedule");
          } else {
            toast.error("Failed to create schedule", {
              description: response.error || "Please try again",
            });
          }
        },
        onError: (error: any) => {
          toast.error("Failed to create schedule", {
            description:
              error instanceof Error ? error.message : "Please try again",
          });
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

        {/* Schedule Interval */}
        <ScheduleIntervalPicker value={interval} onChange={setInterval} />

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
                <strong>{getIntervalDescription(interval).toLowerCase()}</strong>
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
