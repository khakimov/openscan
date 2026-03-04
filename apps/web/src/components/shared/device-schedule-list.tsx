import {
  useScheduleListByDevice,
  usePauseScheduleMutation,
  useResumeScheduleMutation,
  useDeleteScheduleMutation,
} from "@/queries/schedule-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Play, Pause, Trash2, Plus, Loader2 } from "lucide-react";
import { pushModal } from "@/modals";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface DeviceScheduleListProps {
  deviceId: string;
  deviceName?: string;
}

/**
 * Get friendly interval description from cron or label string
 */
function getIntervalDescription(interval: string): string {
  // Already a label (from optimistic update)
  if (interval.startsWith('Every') || interval.startsWith('Daily')) {
    return interval;
  }
  // Parse cron patterns
  if (interval.startsWith('*/')) {
    const minutes = interval.split(' ')[0].slice(2);
    return minutes === '1' ? 'Every minute' : `Every ${minutes} min`;
  }
  if (interval.startsWith('0 */')) {
    const hours = interval.split(' ')[1].slice(2);
    return hours === '1' ? 'Hourly' : `Every ${hours}h`;
  }
  // Daily pattern: m H * * *
  const parts = interval.split(' ');
  if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
    const hours = parts[1].padStart(2, '0');
    const minutes = parts[0].padStart(2, '0');
    return `Daily at ${hours}:${minutes} UTC`;
  }
  return interval;
}

/**
 * Format next run as relative time: "in 2h", "in 15 min"
 */
function formatNextRun(nextRunAt: string | null, isPending?: boolean): string {
  if (isPending) return 'Pending...';
  if (!nextRunAt) return '—';
  try {
    return formatDistanceToNow(new Date(nextRunAt), { addSuffix: true });
  } catch {
    return '—';
  }
}

/**
 * Format last run as relative time: "3d ago", "Never"
 */
function formatLastRun(lastRunAt?: string | null): string {
  if (!lastRunAt) return 'No previous runs';
  try {
    return `Last ran ${formatDistanceToNow(new Date(lastRunAt), { addSuffix: false })} ago`;
  } catch {
    return 'No previous runs';
  }
}

export function DeviceScheduleList({
  deviceId,
  deviceName,
}: DeviceScheduleListProps) {
  const { data: schedules = [], isLoading } = useScheduleListByDevice(deviceId);

  const pauseMutation = usePauseScheduleMutation();
  const resumeMutation = useResumeScheduleMutation();
  const deleteMutation = useDeleteScheduleMutation();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<any>(null);

  const handleCreateSchedule = () => {
    pushModal("CreateSchedule", { deviceId, deviceName });
  };

  const handlePause = (scheduleId: string) => {
    pauseMutation.mutate({ scheduleId });
  };

  const handleResume = (scheduleId: string) => {
    resumeMutation.mutate({ scheduleId });
  };

  const handleDeleteClick = (schedule: any) => {
    setScheduleToDelete(schedule);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!scheduleToDelete) return;
    deleteMutation.mutate(
      { scheduleId: scheduleToDelete.scheduleId },
      {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setScheduleToDelete(null);
        },
      }
    );
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setScheduleToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Scan Schedules</h3>
          <p className="text-sm text-muted-foreground">
            Automated recurring scans for this device
          </p>
        </div>
        <Button onClick={handleCreateSchedule} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Create Schedule
        </Button>
      </div>

      {/* Schedule Cards */}
      {!schedules || schedules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h4 className="text-sm font-medium mb-2">No schedules configured</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Create a schedule to automatically scan this device on a recurring basis
          </p>
          <Button onClick={handleCreateSchedule} variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Create First Schedule
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule: any) => {
            const isActive = schedule.status === 'ACTIVE';
            const isPending = schedule._isPending;
            const isPaused = schedule.status === 'PAUSED' || schedule.status === 'AUTO_PAUSED';

            return (
              <div
                key={schedule.id}
                className={`rounded-lg border p-4 transition-opacity ${
                  isPending ? 'opacity-60' : ''
                }`}
              >
                {/* Row 1: Status dot + Preset + Interval + Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Status indicator dot */}
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                        }`}
                      />
                    )}

                    {/* Preset badge */}
                    <Badge
                      variant={
                        schedule.preset === 'QUICK'
                          ? 'secondary'
                          : schedule.preset === 'STANDARD'
                            ? 'default'
                            : 'outline'
                      }
                      className="shrink-0"
                    >
                      {schedule.preset}
                    </Badge>

                    {/* Interval */}
                    <span className="text-sm text-muted-foreground truncate">
                      {getIntervalDescription(schedule.interval)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPending ? (
                      <>
                        <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0">
                          <Pause className="h-4 w-4 opacity-30" />
                        </Button>
                        <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0">
                          <Trash2 className="h-4 w-4 opacity-30" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePause(schedule.scheduleId)}
                            disabled={pauseMutation.isPending}
                            className="h-8 w-8 p-0"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResume(schedule.scheduleId)}
                            disabled={resumeMutation.isPending}
                            className="h-8 w-8 p-0"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(schedule)}
                          disabled={deleteMutation.isPending}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Row 2: Next run + Last run (secondary info) */}
                <div className="mt-1.5 ml-[18px] flex items-center gap-2 text-xs text-muted-foreground">
                  {isPaused && !isPending ? (
                    <span>Paused</span>
                  ) : (
                    <span>Next {formatNextRun(schedule.nextRunAt, isPending)}</span>
                  )}
                  <span>·</span>
                  <span>{formatLastRun(schedule.lastRunAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Schedule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this schedule?
            </DialogDescription>
          </DialogHeader>

          {scheduleToDelete && (
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Preset:</span>
                <Badge
                  variant={
                    scheduleToDelete.preset === 'QUICK'
                      ? 'secondary'
                      : scheduleToDelete.preset === 'STANDARD'
                        ? 'default'
                        : 'outline'
                  }
                >
                  {scheduleToDelete.preset}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Interval:</span>
                <span className="text-sm font-medium">
                  {getIntervalDescription(scheduleToDelete.interval)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
