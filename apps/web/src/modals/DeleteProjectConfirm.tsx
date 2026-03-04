import { Button } from "@/components/ui/button";
import { popModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppParams } from "@/hooks/use-app-params";
import { useTRPCClient } from "@/integrations/trpc/react";
import { projectQueries } from "@/queries/project-queries";
import { invalidateTRPCQuery } from "@/lib/query-utils";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface DeleteProjectConfirmProps {
  projectId: string;
  projectName: string;
  isActive?: boolean;
  onSuccess?: () => void;
}

export default function DeleteProjectConfirm({
  projectId,
  projectName,
  isActive,
  onSuccess,
}: DeleteProjectConfirmProps) {
  const params = useAppParams();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationKey: ["project", "delete", projectId],
    mutationFn: () =>
      trpcClient.project.delete.mutate({
        organizationId: params.organizationId,
        projectId,
      }),
    onSuccess: async () => {
      // Invalidate queries first, then close modals
      await queryClient.invalidateQueries(
        invalidateTRPCQuery(projectQueries.listByOrg.base)
      );

      popModal("DeleteProjectConfirm");
      popModal("ManageProjects");

      // If this was the active project, navigate to org page
      if (isActive) {
        await navigate({
          to: "/$organizationId",
          params: { organizationId: params.organizationId },
        });
      }

      onSuccess?.();
      toast.success(`"${projectName}" has been deleted`);
    },
    onError: (error) => {
      toast.error("Failed to delete project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const handleCancel = () => {
    popModal("DeleteProjectConfirm");
  };

  return (
    <ModalContent className="max-w-md" hideCloseButton>
      <ModalHeader
        title={
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Delete Project</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This action cannot be undone
              </p>
            </div>
          </div>
        }
      />

      <div className="py-4 space-y-3">
        <p className="text-sm">
          Are you sure you want to delete <strong>{projectName}</strong>?
        </p>
        
        {isActive && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
            <p className="font-medium">This is your active project</p>
            <p className="mt-1">
              After deletion, you will be redirected to your organization page.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          All associated data including servers, scan history, and vulnerabilities will be permanently removed.
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={deleteMutation.isPending}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="flex-1"
        >
          {deleteMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            "Delete Project"
          )}
        </Button>
      </div>
    </ModalContent>
  );
}
