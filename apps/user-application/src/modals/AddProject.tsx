import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { createProjectData } from "@/server/projects";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useAppParams } from "@/hooks/use-app-params";
import { useMutationWithToast } from "@/hooks/use-mutation-with-toast";

// Form validation schema
const AddProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name is too long"),
  description: z.string().optional(),
  domain: z.string().optional(),
});

type AddProjectFormData = z.infer<typeof AddProjectSchema>;

export default function AddProject() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddProjectFormData>({
    resolver: zodResolver<AddProjectFormData, any, AddProjectFormData>(AddProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      domain: "",
    },
  });

  const navigate = useNavigate();
  const params = useAppParams();

  // Create project mutation
  const createProjectMutation = useMutationWithToast({
    mutationKey: ["project", "create"],
    mutationFn: (data: AddProjectFormData) => createProjectData({ data }),
    successMessage: (response) =>
      response.success && response.project
        ? `Project ${response.project.name} created`
        : "Project created successfully",
    invalidateKeys: [["organization-projects"]],
    toastOnSuccess: false, // We'll show custom toast with navigation action
    onSuccess: async (response) => {
      if (response.success && response.project) {
        const orgIdentifier = params.organizationId;

        // Show success toast with action to navigate
        toast.success("Project created successfully", {
          description: response.project.name,
          action: {
            label: "View project",
            onClick: () => {
              navigate({
                to: "/$organizationId/$projectId",
                params: {
                  organizationId: orgIdentifier,
                  projectId: response.project.id,
                },
              });
            },
          },
        });

        popModal("AddProject");
      } else {
        toast.error("Failed to create project", {
          description: response.error || "Please try again",
        });
      }
    },
  });

  const onSubmit = async (data: AddProjectFormData) => {
    createProjectMutation.mutate(data);
  };

  return (
    <ModalContent className="max-w-md" hideCloseButton>
      <ModalHeader title="Create Project" className="mb-0" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Project Name *</Label>
          <Input
            id="name"
            {...register("name")}
            placeholder="My Security Project"
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && (
            <p className="text-sm text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="domain">Domain (Optional)</Label>
          <Input
            id="domain"
            {...register("domain")}
            placeholder="example.com"
            className={errors.domain ? "border-red-500" : ""}
          />
          {errors.domain && (
            <p className="text-sm text-red-500">{errors.domain.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            The main domain or application that this project will scan.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            {...register("description")}
            placeholder="Production environment security scanning..."
            className={errors.description ? "border-red-500" : ""}
            rows={3}
          />
          {errors.description && (
            <p className="text-sm text-red-500">{errors.description.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => popModal("AddProject")}
            disabled={createProjectMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createProjectMutation.isPending}
            className="flex-1"
          >
            {createProjectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </>
            )}
          </Button>
        </div>
      </form>
    </ModalContent>
  );
}
