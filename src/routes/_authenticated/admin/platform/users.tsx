import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Ban, ShieldAlert, Trash2, Undo2, Users } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  deletePlatformUser,
  listPlatformUsers,
  setUserSuspended,
  verifyPlatformUser,
} from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/users")({
  head: () => ({
    meta: [
      { title: "Platform users — Dallty Platform" },
      {
        name: "description",
        content:
          "Search every Dallty account, review roles and verification, suspend or restore access and remove accounts.",
      },
      { property: "og:title", content: "Platform users — Dallty Platform" },
      { property: "og:description", content: "Super Admin control over every Dallty account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformUsersPage,
});

function PlatformUsersPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");

  const fetchUsers = useServerFn(listPlatformUsers);
  const suspend = useServerFn(setUserSuspended);
  const verify = useServerFn(verifyPlatformUser);
  const remove = useServerFn(deletePlatformUser);

  const users = useQuery({
    queryKey: ["platform-users"],
    enabled: isSuper,
    queryFn: () => fetchUsers(),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["platform-users"] });
  }

  const action = useMutation({
    mutationFn: async (vars: { type: "suspend" | "restore" | "verify" | "delete"; userId: string }) => {
      if (vars.type === "verify") return verify({ data: { userId: vars.userId } });
      if (vars.type === "delete") return remove({ data: { userId: vars.userId } });
      return suspend({ data: { userId: vars.userId, suspended: vars.type === "suspend" } });
    },
    onSuccess: () => {
      toast.success("Account updated");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!isSuper) {
    return (
      <div className="rounded-3xl glass p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-destructive" />
        <h2 className="mt-3 text-lg font-extrabold">Super Admin only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This area is reserved for the Dallty platform team.
        </p>
      </div>
    );
  }

  const q = term.trim().toLowerCase();
  const rows = (users.data ?? []).filter(
    (u) =>
      !q ||
      u.email.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      u.roles.some((r) => r.includes(q)),
  );

  return (
    <div className="space-y-5">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name, email or role…"
        className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2 sm:max-w-md"
      />

      {users.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading accounts…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No matching accounts.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((u) => (
            <article key={u.id} className="rounded-3xl glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-extrabold">
                    {u.fullName || "Unnamed"}{" "}
                    {u.emailConfirmed && <BadgeCheck className="inline size-4 text-primary" />}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{u.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Joined {new Date(u.createdAt).toLocaleDateString()} · Last sign-in{" "}
                    {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "never"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded-xl bg-secondary px-3 py-1 text-xs font-bold capitalize"
                    >
                      {r.replace("_", " ")}
                    </span>
                  ))}
                  {u.suspended && (
                    <span className="rounded-xl bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive">
                      Suspended
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!u.emailConfirmed && (
                  <button
                    type="button"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ type: "verify", userId: u.id })}
                    className="press flex min-h-10 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold disabled:opacity-60"
                  >
                    <BadgeCheck className="size-4" /> Verify email
                  </button>
                )}
                <button
                  type="button"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ type: u.suspended ? "restore" : "suspend", userId: u.id })
                  }
                  className="press flex min-h-10 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold disabled:opacity-60"
                >
                  {u.suspended ? <Undo2 className="size-4" /> : <Ban className="size-4" />}
                  {u.suspended ? "Restore access" : "Suspend"}
                </button>
                <button
                  type="button"
                  disabled={action.isPending}
                  onClick={() => {
                    if (!window.confirm(`Permanently delete ${u.email}?`)) return;
                    action.mutate({ type: "delete", userId: u.id });
                  }}
                  className="press flex min-h-10 items-center gap-2 rounded-2xl bg-destructive/10 px-4 text-sm font-bold text-destructive disabled:opacity-60"
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
