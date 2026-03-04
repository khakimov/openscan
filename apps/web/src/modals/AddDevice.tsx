import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useCreateDevicesFromDiscoveryMutation } from "@/queries/device-queries";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "@tanstack/react-router";

// Form validation schema
const AddDeviceSchema = z.object({
  targets: z
    .string()
    .min(1, "At least one IP address or domain is required")
    .refine((value) => {
      // Split by newlines and validate each target
      const targets = value.split('\n').map(t => t.trim()).filter(t => t.length > 0);
      if (targets.length === 0) return false;

      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

      return targets.every(target => ipRegex.test(target) || domainRegex.test(target));
    }, "Please enter valid IP addresses or domain names (one per line)"),
});

type AddDeviceFormData = z.infer<typeof AddDeviceSchema>;

interface AddDeviceProps {
  onDevicesAdded?: (deviceIds: string[]) => void; // Callback with newly created device IDs
}

export default function AddDevice({ onDevicesAdded }: AddDeviceProps = {}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddDeviceFormData>({
    resolver: zodResolver<AddDeviceFormData, any, AddDeviceFormData>(AddDeviceSchema),
  });

  // Get current project ID from route params
  const { projectId } = useParams({ strict: false });

  // Create device mutation (using centralized hook with custom toast handling)
  const createDeviceMutation = useCreateDevicesFromDiscoveryMutation({ disableToasts: true });

  const onSubmit = async (data: AddDeviceFormData) => {
    // ✅ Enforce projectId at runtime (compile-time already enforced by mutation hook)
    if (!projectId) {
      toast.error("Project required", {
        description: "Cannot add devices without a project context. Please navigate to a project first.",
      });
      return;
    }

    // Parse targets from textarea (one per line)
    const targets = data.targets
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(host => ({ host }));

    // Close modal immediately for responsive UX
    popModal("AddDevice");

    const targetCount = targets.length;

    // Use toast.promise with mutateAsync for proper Promise-based handling
    toast.promise(
      // Call mutateAsync which returns a proper Promise
      createDeviceMutation.mutateAsync({
        targets,
        projectId, // ✅ TypeScript knows this is string (not undefined) after guard above
      }),
      {
        loading: `Adding ${targetCount} device${targetCount > 1 ? 's' : ''}...`,
        success: (response) => {
          const deviceCount = response.devices?.length ?? 0;
          const deviceIds = response.devices?.map((d: { id: string }) => d.id) ?? [];

          // Notify parent of newly added device IDs (for glow animation)
          onDevicesAdded?.(deviceIds);

          return `${deviceCount} device${deviceCount !== 1 ? 's' : ''} created and scans initiated.`;
        },
        error: (err) =>
          err instanceof Error ? err.message : "Failed to add devices",
      }
    );
  };

  return (
    <ModalContent className="max-w-md" hideCloseButton>
      <ModalHeader title="Add Device" className="mb-0" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="targets">IP Addresses or Domains *</Label>
          <Textarea
            id="targets"
            {...register("targets")}
            placeholder="192.168.1.100&#10;example.com&#10;google.com&#10;95.216.243.233"
            className={errors.targets ? "border-red-500" : ""}
            rows={6}
          />
          {errors.targets && (
            <p className="text-sm text-red-500">{errors.targets.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Enter one IP address or domain name per line. Mix of IPs and domains is supported.
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => popModal("AddDevice")}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Devices
          </Button>
        </div>
      </form>
    </ModalContent>
  );
}
