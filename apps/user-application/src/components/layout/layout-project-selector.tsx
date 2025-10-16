import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

type SelectorAlignment = "start" | "end" | "center";

interface SelectorEntity {
  id: string;
  name?: string | null;
  slug?: string | null;
}

interface SelectorProject extends SelectorEntity {
  description?: string | null;
}

interface LayoutProjectSelectorProps {
  align?: SelectorAlignment;
  projects?: SelectorProject[];
  organizations?: SelectorEntity[];
  tenant?: SelectorEntity | null;
  isLoading?: boolean;
}

export function LayoutProjectSelector({
  align = "start",
  projects = [],
  organizations = [],
  tenant = null,
  isLoading = false,
}: LayoutProjectSelectorProps) {
  const [open, setOpen] = useState(false);

  const activeProject = projects[0];
  const activeProjectId = activeProject?.id;

  const activeOrganizationId = useMemo(
    () => tenant?.id ?? organizations[0]?.id ?? undefined,
    [organizations, tenant?.id],
  );

  const organizationDisplayName = useMemo(() => {
    if (isLoading) {
      return "Loading…";
    }

    if (tenant?.name) {
      return tenant.name;
    }

    const matchedOrg = organizations.find(
      (org) => org.id === activeOrganizationId,
    );
    if (matchedOrg?.name) {
      return matchedOrg.name;
    }

    if (organizations[0]?.name) {
      return organizations[0].name;
    }

    return "No organization";
  }, [activeOrganizationId, isLoading, organizations, tenant?.name]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-start"
          disabled={isLoading}
        >
          <Building2Icon size={16} className="shrink-0" />
          <div className="mx-2 flex min-w-0 flex-col text-left">
            <span className="truncate text-sm font-medium">
              {organizationDisplayName}
            </span>
          </div>
          <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[240px]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuGroup>
          {organizations.length === 0 ? (
            <DropdownMenuItem disabled>
              {isLoading ? "Loading…" : "No organizations"}
            </DropdownMenuItem>
          ) : (
            organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                className="flex items-center gap-2"
                onSelect={() => {
                  setOpen(false);
                  console.info("[LayoutProjectSelector] select organization", {
                    organizationId: organization.id,
                  });
                }}
              >
                <span className="truncate">
                  {organization.name ?? "Untitled organization"}
                </span>
                {organization.id === activeOrganizationId && (
                  <DropdownMenuShortcut>
                    <CheckIcon size={16} />
                  </DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuGroup>
          {projects.length === 0 ? (
            <DropdownMenuItem disabled>
              {isLoading ? "Loading…" : "No projects"}
            </DropdownMenuItem>
          ) : (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                className="flex items-center gap-2"
                onSelect={() => {
                  setOpen(false);
                  console.info("[LayoutProjectSelector] select project", {
                    projectId: project.id,
                  });
                }}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {project.name ?? "Untitled project"}
                  </span>
                  {project.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {project.description}
                    </span>
                  )}
                </div>
                {project.id === activeProjectId && (
                  <DropdownMenuShortcut>
                    <CheckIcon size={16} />
                  </DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuItem
            className="text-emerald-600"
            onSelect={() => {
              setOpen(false);
              console.info("[LayoutProjectSelector] create project");
            }}
          >
            Create new project
            <DropdownMenuShortcut>
              <PlusIcon size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
