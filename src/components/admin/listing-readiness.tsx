import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert } from "lucide-react";

/**
 * Shows whether a business meets the marketplace listing requirements:
 * approved status, at least one active service, and at least one active
 * staff member assigned to that service.
 */
export function ListingReadiness({
  businessName,
  isListed,
  status,
  activeServices,
  activeStaff,
  linkedPairs,
  staffWithHours,
}: {
  businessName: string;
  isListed: boolean;
  status: string | null;
  activeServices: number;
  activeStaff: number;
  linkedPairs: number;
  /** Active team members that have at least one weekly shift saved. */
  staffWithHours?: number;
}) {
  const checks = [
    { label: "Business approved by Dallty", ok: status === "approved" },
    { label: "At least one active service", ok: activeServices > 0 },
    { label: "At least one active team member", ok: activeStaff > 0 },
    { label: "A team member assigned to a service", ok: linkedPairs > 0 },
    ...(staffWithHours === undefined
      ? []
      : [{ label: "Working hours set for a team member", ok: staffWithHours > 0 }]),
  ];
  const live = isListed && status === "approved";

  return (
    <div className="rounded-3xl glass p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold">
            {businessName} · {live ? "Live on Dallty" : "Not visible to customers yet"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A shop only appears in search once it has a service and a specialist who performs it.
          </p>
        </div>
        <span
          className={`rounded-2xl px-3 py-1 text-xs font-bold ${
            live ? "bg-primary/15 text-primary" : "bg-gold/20 text-foreground"
          }`}
        >
          {live ? "Listed" : "Hidden"}
        </span>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-sm">
            {c.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
            ) : (
              <CircleAlert className="size-4 shrink-0 text-gold" />
            )}
            <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
      {!live && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          <Link to="/admin/services" className="press rounded-2xl glass-soft px-4 py-2">
            Manage services
          </Link>
          <Link to="/admin/staff" className="press rounded-2xl glass-soft px-4 py-2">
            Manage team
          </Link>
          <Link to="/admin/availability" search={{ staff: undefined }} className="press rounded-2xl glass-soft px-4 py-2">
            Set working hours
          </Link>
        </div>
      )}
    </div>
  );
}
