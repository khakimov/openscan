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
import { useState } from "react";

interface LayoutProjectSelectorProps {
  align?: "start" | "end" | "center";
  projects?: any[];
  organizations?: any[];
  tenant?: {
    id: string;
    slug: string;
    name: string;
  } | null;
}

export default function LayoutProjectSelector({ tenant }: LayoutProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const tenantName = tenant?.name || "No Tenant";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size={"sm"}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-start"
        >
          <Building2Icon size={16} className="shrink-0" />
          <span className="mx-2 truncate">{tenantName}</span>
          <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            {tenantName}
            <DropdownMenuShortcut>
              <CheckIcon size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="text-emerald-600"
            onClick={() => console.log("AddProject")}
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
