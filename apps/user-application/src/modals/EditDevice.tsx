import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updateDeviceData,
  getDeviceTagSuggestionsData,
} from "@/server/devices";
import { DEVICE_DETAIL_QUERY_KEY } from "@/hooks/useDeviceDetailQuery";
import { Loader2, X, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";
import { QUERY_CONFIG } from "@repo/constants";

// IP address validation regex
const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Form validation schema
const EditDeviceSchema = z.object({
  name: z
    .string()
    .min(1, "Device name is required")
    .max(255, "Name is too long"),
  ip: z
    .string()
    .regex(IP_REGEX, "Invalid IP address")
    .optional()
    .or(z.literal("")),
  // riskLevel is set by server, not user
  state: z.string().optional(),
  scope: z.enum(["INTERNAL", "EXTERNAL", "HYBRID"]),
  source: z.string().optional(),
  isScanned: z.boolean().optional(),
  respondsToPing: z.boolean().optional(),
  tags: z.array(z.string()),
  notes: z.string().optional(),
});

type EditDeviceFormData = z.infer<typeof EditDeviceSchema>;

interface EditDeviceProps {
  deviceId: string;
  device?: any; // Initial device data
  onSuccess?: () => void;
}

export default function EditDevice({
  deviceId,
  device,
  onSuccess,
}: EditDeviceProps) {
  const [newTag, setNewTag] = useState("");
  const router = useRouter();
  const queryClient = useQueryClient();

  // Form setup
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<EditDeviceFormData>({
    // @ts-expect-error - Zod v4 type mismatch with @hookform/resolvers due to multiple Zod versions in dependency tree
    resolver: zodResolver<EditDeviceFormData, any, EditDeviceFormData>(EditDeviceSchema),
    defaultValues: {
      name: device?.name || "",
      ip: device?.ip || "",
      // riskLevel is calculated by server, not user input
      state: device?.status === "active" ? "AVAILABLE" : "UNAVAILABLE",
      scope: device?.scope?.toUpperCase() || "EXTERNAL",
      source: device?.source || "discovery",
      isScanned: device?.scanType === "scanned" || false,
      respondsToPing: device?.respondsToICMPPing || false,
      tags: device?.tags || [],
      notes: device?.notes || "",
    },
  });

  // Compute unsaved state during render (no useEffect needed)
  const isUnsaved = isDirty;

  // Get tag suggestions
  const { data: tagSuggestions = [] } = useQuery({
    queryKey: ["deviceTagSuggestions"],
    queryFn: getDeviceTagSuggestionsData,
    ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
  });

  // Update device mutation
  const updateDeviceMutation = useMutation({
    mutationFn: async (formData: EditDeviceFormData) => {
      console.log('🚀 EditDevice: Starting mutation', {
        deviceId,
        formData,
        updatePayload: {
          name: formData.name,
          ip: formData.ip || undefined,
          // riskLevel is calculated by server
          state: formData.state,
          scope: formData.scope,
          source: formData.source,
          isScanned: formData.isScanned,
          respondsToPing: formData.respondsToPing,
          tags: formData.tags,
          notes: formData.notes,
        }
      });

      try {
        const result = await updateDeviceData({
          data: {
            deviceId,
            updates: {
              name: formData.name,
              ip: formData.ip || undefined,
              // riskLevel is calculated by server
              state: formData.state,
              scope: formData.scope,
              source: formData.source,
              isScanned: formData.isScanned,
              respondsToPing: formData.respondsToPing,
              tags: formData.tags,
              notes: formData.notes,
            },
          },
        });
        console.log('✅ EditDevice: Server response', result);
        return result;
      } catch (error) {
        console.error('❌ EditDevice: Server error', error);
        throw error;
      }
    },
    onSuccess: async (response) => {
      console.log('🎉 EditDevice: Mutation success', {
        deviceId,
        updatedDevice: {
          id: response.device.id,
          name: response.device.name,
          ip: response.device.ip,
          tags: response.device.tags,
          scope: response.device.scope,
          notes: response.device.notes,
        },
        fullResponse: response
      });

      toast.success("Device updated successfully", {
        description: `${response.device.name} has been updated.`,
      });

      console.log('🔄 EditDevice: Starting cache invalidation...');

      // Aggressively refresh all device-related data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["devices"] }),
        queryClient.invalidateQueries({ queryKey: DEVICE_DETAIL_QUERY_KEY(deviceId) }),
        queryClient.invalidateQueries({ queryKey: ["deviceTagSuggestions"] }),
      ]);

      console.log('✅ EditDevice: Cache invalidation complete');

      // Force a complete refresh of the page data
      router.invalidate();

      console.log('🔄 EditDevice: Router invalidation complete');

      onSuccess?.();
      popModal("EditDevice");
    },
    onError: (error: any) => {
      console.error('💥 EditDevice: Mutation error', error);
      toast.error("Failed to update device", {
        description: error.message || "Please try again",
      });
    },
  });

  // Debug logging for button state (after mutation is defined)
  console.log('🔍 EditDevice: Component state', {
    deviceId,
    device: device ? { id: device.id, name: device.name } : null,
    isDirty,
    isUnsaved,
    isPending: updateDeviceMutation.isPending,
    buttonDisabled: updateDeviceMutation.isPending || !isDirty,
    formErrors: errors
  });

  // Handle form submission
  const onSubmit = (data: EditDeviceFormData) => {
    console.log('🔄 EditDevice: Form submitted (handleSubmit success)', {
      deviceId,
      formData: data,
      isDirty,
      isUnsaved,
      isPending: updateDeviceMutation.isPending
    });
    updateDeviceMutation.mutate(data);
  };

  // Handle form validation errors
  const onError = (errors: any) => {
    console.error('❌ EditDevice: Form validation failed', {
      errors,
      errorDetails: Object.entries(errors).map(([field, error]: [string, any]) => ({
        field,
        message: error?.message,
        type: error?.type,
        value: getValues(field as any)
      })),
      formData: getValues()
    });
  };

  // Handle adding a new tag
  const handleAddTag = () => {
    if (!newTag.trim()) return;

    const currentTags = getValues("tags");
    if (!currentTags.includes(newTag.trim())) {
      setValue("tags", [...currentTags, newTag.trim()], { shouldDirty: true });
    }
    setNewTag("");
  };

  // Handle removing a tag
  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = getValues("tags");
    setValue(
      "tags",
      currentTags.filter((tag) => tag !== tagToRemove),
      { shouldDirty: true },
    );
  };

  // Handle adding a suggested tag
  const handleAddSuggestedTag = (tagName: string) => {
    const currentTags = getValues("tags");
    if (!currentTags.includes(tagName)) {
      setValue("tags", [...currentTags, tagName], { shouldDirty: true });
    }
  };

  // Handle cancel with unsaved changes check
  const handleCancel = () => {
    if (isUnsaved) {
      if (
        !confirm("You have unsaved changes. Are you sure you want to close?")
      ) {
        return;
      }
    }
    popModal("EditDevice");
  };

  return (
    <ModalContent className="max-w-2xl" hideCloseButton>
      <ModalHeader title="Edit device information" className="mb-0" />

      <form
        onSubmit={(e) => {
          console.log('📝 EditDevice: Form onSubmit triggered', {
            event: e,
            formValid: Object.keys(errors).length === 0,
            errors,
            formData: getValues()
          });
          handleSubmit(onSubmit, onError)(e);
        }}
        className="space-y-6"
      >

        {/* Basic Information */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Device Name *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Enter device name"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                {...register("ip")}
                placeholder="192.168.1.100"
                className={errors.ip ? "border-red-500" : ""}
              />
              {errors.ip && (
                <p className="text-sm text-red-500">{errors.ip.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="riskLevel">Risk Level (TBD)</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scope">Scope</Label>
              <Controller
                name="scope"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className={errors.scope ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INTERNAL">Internal</SelectItem>
                      <SelectItem value="EXTERNAL">External</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.scope && (
                <p className="text-sm text-red-500">{errors.scope.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Tags Section */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">Tags</h3>

          {/* Current Tags */}
          <div className="flex flex-wrap gap-2 min-h-[2rem] p-2 border rounded-md">
            {watch("tags")?.map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="flex items-center gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:bg-red-100 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )) || (
              <span className="text-muted-foreground text-sm">
                No tags assigned
              </span>
            )}
          </div>

          {/* Add New Tag */}
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddTag}
              disabled={!newTag.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Tag Suggestions */}
          {tagSuggestions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Suggested tags
              </Label>
              <div className="flex flex-wrap gap-2">
                {tagSuggestions
                  .filter((tag: string) => !watch("tags")?.includes(tag))
                  .slice(0, 8)
                  .map((tag: string) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddSuggestedTag(tag)}
                      className="px-2 py-1 text-xs border border-dashed rounded hover:bg-muted transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            {...register("notes")}
            placeholder="Add any additional notes about this device..."
            rows={3}
          />
        </div>

        {/* Form Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={updateDeviceMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={updateDeviceMutation.isPending || !isDirty}
            className="flex-1"
            onClick={(e) => {
              console.log('🖱️ EditDevice: Save button clicked', {
                isPending: updateDeviceMutation.isPending,
                isDirty,
                disabled: updateDeviceMutation.isPending || !isDirty,
                event: e
              });
            }}
          >
            {updateDeviceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </ModalContent>
  );
}
