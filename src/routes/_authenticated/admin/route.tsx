import { useEffect } from "react";
import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { AdminShell } from "@/components/admin/admin-shell";
import { useAuth } from "@/hooks/use-auth";
import { useManagedSalons, useMyStaffRecord } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

/** Pages a specialist (staff without owner rights) may open. */
const STAFF_ALLOWED = [
  "/admin/my-appointments",
  "/admin/availability",
  "/admin/calendar",
  "/admin/reviews",
  "/admin/settings",
];

/** Owner-only pages a platform admin has no use for (they own no salon). */
const OWNER_ONLY = ["/admin/marketplace"];

function AdminLayout() {
  const { hasRole, loading, rolesLoading } = useAuth();
  const isPlatformAdmin = hasRole("super_admin") || hasRole("admin");
  const { isStaffOnly, isLoading: staffLoading } = useMyStaffRecord();
  const managedSalons = useManagedSalons();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed =
    hasRole("salon_owner") || hasRole("specialist") || hasRole("admin") || hasRole("super_admin");

  const blockedForStaff =
    isStaffOnly && !STAFF_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const blockedForPlatform =
    isPlatformAdmin && (pathname === "/admin" || OWNER_ONLY.includes(pathname));

  // A salon owner who hasn't created a salon yet (stale bookmark, back
  // button) always resumes the creation wizard instead of an empty /admin.
  const blockedForUnownedOwner =
    hasRole("salon_owner") &&
    !isPlatformAdmin &&
    !managedSalons.isLoading &&
    (managedSalons.data?.length ?? 0) === 0;

  useEffect(() => {
    if (loading || rolesLoading || staffLoading || managedSalons.isLoading) return;
    if (blockedForUnownedOwner) {
      navigate({ to: "/business/signup", replace: true });
      return;
    }
    if (blockedForPlatform) {
      navigate({ to: "/admin/platform/overview", replace: true });
      return;
    }
    if (blockedForStaff) {
      navigate({ to: "/admin/my-appointments", replace: true });
    }
  }, [
    blockedForUnownedOwner,
    blockedForPlatform,
    blockedForStaff,
    loading,
    rolesLoading,
    staffLoading,
    managedSalons.isLoading,
    navigate,
  ]);

  if (loading || rolesLoading) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!allowed) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <div className="rounded-3xl glass p-8 text-center">
          <ShieldAlert className="mx-auto size-8 text-destructive" />
          <h1 className="mt-3 text-xl font-extrabold">Business area</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This dashboard is for salon owners and specialists. Ask your salon owner to invite you.
          </p>
          <Link
            to="/"
            className="press mt-5 inline-flex min-h-11 items-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground"
          >
            Back to Dallty
          </Link>
        </div>
      </main>
    );
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
