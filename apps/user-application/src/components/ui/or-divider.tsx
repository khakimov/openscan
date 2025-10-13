import { cn } from "@/lib/utils";

interface OrDividerProps {
  className?: string;
}

export function OrDivider({ className }: OrDividerProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">Or</span>
      </div>
    </div>
  );
}
