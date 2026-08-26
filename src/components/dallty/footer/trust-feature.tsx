import type { LucideIcon } from "lucide-react";

export function TrustFeature({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime-subtle text-primary">
        <Icon className="size-5" />
      </span>
      <span>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
      </span>
    </div>
  );
}
