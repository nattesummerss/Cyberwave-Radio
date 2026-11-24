import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, className }: { icon: LucideIcon; title: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", className)}>
      <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
    </div>
  );
}
