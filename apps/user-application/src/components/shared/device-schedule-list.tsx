import {
  useScheduleListByDevice,
  usePauseScheduleMutation,
  useResumeScheduleMutation,
  useDeleteScheduleMutation,
} from "@/queries/schedule-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";

interface DeviceScheduleListProps {
  deviceId: string;
  deviceName?: string;
}

export function DeviceScheduleList({
  deviceId,
  deviceName,
}: DeviceScheduleListProps) {
  // Fetch schedules for this device using centralized hook
  const { data: schedules = [], isLoading } = useScheduleListByDevice(deviceId);

  const pauseMutation = usePauseScheduleMutation();
  const resumeMutation = useResumeScheduleMutation();
  const deleteMutation = useDeleteScheduleMutation();

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<any>(null);

  const handleCreateSchedule = () => {
    pushModal("CreateSchedule", {
      deviceId,
      deviceName,
    });
  };

  const handlePause = (scheduleId: string) => {
    pauseMutation.mutate(
      { scheduleId },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success("Schedule paused");
          } else {
            toast.error("Failed to pause schedule");
          }
        },
      }
    );
  };

  const handleResume = (scheduleId: string) => {
    resumeMutation.mutate(
      { scheduleId },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success("Schedule resumed");
          } else {
            toast.error("Failed to resume schedule");
          }
        },
      }
    );
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
        onSuccess: (result) => {
          if (result.success) {
            toast.success("Schedule deleted");
            setDeleteDialogOpen(false);
            setScheduleToDelete(null);
          } else {
            toast.error("Failed to delete schedule");
          }
        },
        onError: () => {
          toast.error("Failed to delete schedule");
        },
      }
    );
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setScheduleToDelete(null);
  };

  // Get friendly interval description from cron
  const getIntervalDescription = (interval: string): string => {
    // Parse common patterns
    if (interval.startsWith('*/')) {
      const minutes = interval.split(' ')[0].slice(2);
      return minutes === '1' ? 'Every minute' : `Every ${minutes} minutes`;
    }
    if (interval.startsWith('0 */')) {
      const hours = interval.split(' ')[1].slice(2);
      return hours === '1' ? 'Every hour' : `Every ${hours} hours`;
    }
    // Daily pattern: m H * * *
    const parts = interval.split(' ');
    if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      const hours = parts[1].padStart(2, '0');
      const minutes = parts[0].padStart(2, '0');
      return `Daily at ${hours}:${minutes} UTC`;
    }
    return interval; // Fallback to cron string
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

      {/* Schedule List */}
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preset</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule: any) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">
                    <Badge
                      variant={
                        schedule.preset === 'QUICK'
                          ? 'secondary'
                          : schedule.preset === 'STANDARD'
                            ? 'default'
                            : 'outline'
                      }
                    >
                      {schedule.preset}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {getIntervalDescription(schedule.interval)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={schedule.status === 'ACTIVE' ? 'default' : 'secondary'}
                    >
                      {schedule.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {schedule.nextRunAt ? (
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(schedule.nextRunAt), 'MMM d, HH:mm')}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {schedule.lastRunAt ? (
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(schedule.lastRunAt), 'MMM d, HH:mm')}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {schedule.status === 'ACTIVE' ? (
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Info Note */}
      {schedules && schedules.length > 0 && (
        <div className="rounded-lg bg-muted p-4">
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> Maximum of 5 concurrent scans per organization.
            If concurrency limit is reached, scheduled scans will wait until a slot is available.
          </p>
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
