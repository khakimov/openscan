import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useAppParams } from "@/hooks/use-app-params";
import { useMutationWithToast } from "@/hooks/use-mutation-with-toast";
import { useTRPCClient } from "@/integrations/trpc/react";
import { projectQueries } from "@/queries/project-queries";
import { getProjectDefaultRouteParams } from "@/lib/navigation";

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
  const trpcClient = useTRPCClient();

  // Create project mutation (using tRPC)
  const createProjectMutation = useMutationWithToast({
    mutationKey: ["project", "create"],
    mutationFn: (data: AddProjectFormData) =>
      trpcClient.project.create.mutate({
        organizationId: params.organizationId,
        name: data.name,
        description: data.description,
        domain: data.domain,
      }),
    // Invalidate all project list queries (base key matches regardless of org slug vs ID)
    invalidateKeys: [
      projectQueries.listByOrg.base,
    ],
    toastOnSuccess: false, // We'll show custom toast with navigation action
    onSuccess: async (response) => {
      const orgIdentifier = params.organizationId;

      popModal("AddProject");

      // Navigate to the new project's servers page
      navigate({
        ...getProjectDefaultRouteParams(orgIdentifier, response.project.id),
      });

      toast.success("Project created successfully", {
        description: response.project.name,
      });
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
