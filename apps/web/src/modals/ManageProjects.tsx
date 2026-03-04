import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { popModal, pushModal } from ".";
import { ModalContent, ModalHeader } from "./Modal/Container";
import {
  Loader2,
  Pencil,
  Trash2,
  X,
  Check,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useAppParams } from "@/hooks/use-app-params";
import { useTRPCClient } from "@/integrations/trpc/react";
import { projectQueries } from "@/queries/project-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectEntity } from "@repo/contracts/project";

interface ManageProjectsProps {
  projects: ProjectEntity[];
  activeProjectId?: string;
}

// Form schema for renaming
const RenameSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name is too long"),
});

type RenameFormData = z.infer<typeof RenameSchema>;

export default function ManageProjects({
  projects,
  activeProjectId,
}: ManageProjectsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const params = useAppParams();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  const navigate = useNavigate();

  // Update mutation
  const updateMutation = useMutation({
    mutationKey: ["project", "update"],
    mutationFn: (data: { projectId: string; name: string }) =>
      trpcClient.project.update.mutate({
        organizationId: params.organizationId,
        projectId: data.projectId,
        name: data.name,
      }),
    onSuccess: async () => {
      // Invalidate both list and detail queries
      await queryClient.invalidateQueries({
        queryKey: projectQueries.listByOrg.base,
      });
      await queryClient.invalidateQueries({
        queryKey: projectQueries.detail.base,
      });

      setEditingId(null);
      toast.success("Project renamed successfully");
    },
    onError: (error) => {
      toast.error("Failed to rename project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });



  const handleDelete = (project: ProjectEntity) => {
    pushModal("DeleteProjectConfirm", {
      projectId: project.id,
      projectName: project.name || "Untitled project",
      isActive: project.id === activeProjectId,
      onSuccess: () => {
        // If we deleted the active project, navigate to another one or org page
        if (project.id === activeProjectId && projects.length > 1) {
          const remainingProject = projects.find((p) => p.id !== project.id);
          if (remainingProject) {
            navigate({
              to: "/$organizationId/$projectId",
              params: {
                organizationId: params.organizationId,
                projectId: remainingProject.id,
              },
            });
          }
        }
      },
    });
  };

  const handleRenameSubmit = (projectId: string, data: RenameFormData) => {
    updateMutation.mutate({ projectId, name: data.name });
  };

  return (
    <ModalContent className="max-w-lg" hideCloseButton>
      <ModalHeader
        title={
          <div className="flex items-center gap-3">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <span>Manage Projects</span>
          </div>
        }
      />

      <div className="py-4">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No projects found
          </p>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                isEditing={editingId === project.id}
                onEdit={() => setEditingId(project.id)}
                onCancelEdit={() => setEditingId(null)}
                onRenameSubmit={(data) => handleRenameSubmit(project.id, data)}
                onDelete={() => handleDelete(project)}
                isLoading={
                  updateMutation.isPending && editingId === project.id
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => popModal("ManageProjects")}>
          Close
        </Button>
      </div>
    </ModalContent>
  );
}

interface ProjectItemProps {
  project: ProjectEntity;
  isActive: boolean;
  isEditing: boolean;
  isLoading: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRenameSubmit: (data: RenameFormData) => void;
  onDelete: () => void;
}

function ProjectItem({
  project,
  isActive,
  isEditing,
  isLoading,
  onEdit,
  onCancelEdit,
  onRenameSubmit,
  onDelete,
}: ProjectItemProps) {
  const form = useForm<RenameFormData>({
    resolver: zodResolver(RenameSchema),
    defaultValues: {
      name: project.name || "",
    },
  });

  if (isEditing) {
    return (
      <form
        onSubmit={form.handleSubmit(onRenameSubmit)}
        className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
      >
        <Input
          {...form.register("name")}
          className="h-8 flex-1"
          autoFocus
          disabled={isLoading}
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onCancelEdit}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-emerald-600"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={`flex items-center justify-between p-2 rounded-md group hover:bg-muted/50 ${
        isActive ? "bg-muted" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="truncate text-sm font-medium">
          {project.name || "Untitled project"}
        </span>
        {isActive && (
          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
            active
          </span>
        )}
        {project.isDefault && (
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
            default
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          title="Rename"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-600 hover:text-red-600 hover:bg-red-50"
          onClick={onDelete}
          disabled={project.isDefault}
          title={project.isDefault ? "Default projects cannot be deleted" : "Delete"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
