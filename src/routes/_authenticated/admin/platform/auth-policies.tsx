import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Lock, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  getAuthRolePolicies,
  getAuthSettings,
  updateAuthRolePolicy,
  updateAuthSettings,
} from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/auth-policies")({
  head: () => ({
    meta: [
      { title: "Auth policies — Dallty Platform" },
      {
        name: "description",
        content: "Configure email OTP login step-up settings, per role.",
      },
    ],
  }),
  component: AuthPoliciesAdminPage,
});

const ROLE_LABEL: Record<string, string> = {
  client: "Client",
  specialist: "Specialist",
  business_owner: "Business owner",
  admin: "Admin",
  super_admin: "Super admin",
};

function AuthPoliciesAdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getAuthSettings);
  const fetchPolicies = useServerFn(getAuthRolePolicies);
  const saveSettings = useServerFn(updateAuthSettings);
  const savePolicy = useServerFn(updateAuthRolePolicy);

  const settings = useQuery({
    queryKey: ["admin-auth-settings"],
    enabled: isSuper,
    queryFn: () => fetchSettings(),
  });
  const policies = useQuery({
    queryKey: ["admin-auth-role-policies"],
    enabled: isSuper,
    queryFn: () => fetchPolicies(),
  });

  const [form, setForm] = useState({
    otpMasterEnabled: true,
    otpExpiryMinutes: 10,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
  });
  useEffect(() => {
    if (!settings.data) return;
    setForm({
      otpMasterEnabled: settings.data.otp_master_enabled,
      otpExpiryMinutes: settings.data.otp_expiry_minutes,
      otpResendCooldownSeconds: settings.data.otp_resend_cooldown_seconds,
      otpMaxAttempts: settings.data.otp_max_attempts,
    });
  }, [settings.data]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [busyRole, setBusyRole] = useState<string | null>(null);

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await saveSettings({ data: form });
      await queryClient.invalidateQueries({ queryKey: ["admin-auth-settings"] });
      toast.success("OTP settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleRole(role: string, otpEnabled: boolean) {
    setBusyRole(role);
    try {
      await savePolicy({ data: { role: role as never, otpEnabled } });
      await queryClient.invalidateQueries({ queryKey: ["admin-auth-role-policies"] });
      toast.success(`${ROLE_LABEL[role] ?? role} OTP ${otpEnabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update policy");
    } finally {
      setBusyRole(null);
    }
  }

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

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-xl font-extrabold">
        <KeyRound className="size-5" /> Auth policies
      </h1>
      <p className="text-sm text-muted-foreground">
        Enforcement happens at the route level on the next protected page load, not on the raw
        access token — see the implementation notes before relying on this for token-level security.
      </p>

      <div className="space-y-4 rounded-2xl glass p-4">
        <h2 className="text-sm font-extrabold">Global OTP settings</h2>
        {settings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">Master enable</span>
              <input
                type="checkbox"
                checked={form.otpMasterEnabled}
                onChange={(e) => setForm((f) => ({ ...f, otpMasterEnabled: e.target.checked }))}
                className="size-5"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">Code expiry (minutes)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={form.otpExpiryMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, otpExpiryMinutes: Number(e.target.value) }))
                }
                className="w-20 rounded-lg glass-soft px-2 py-1 text-right text-sm"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">Resend cooldown (seconds)</span>
              <input
                type="number"
                min={10}
                max={600}
                value={form.otpResendCooldownSeconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, otpResendCooldownSeconds: Number(e.target.value) }))
                }
                className="w-20 rounded-lg glass-soft px-2 py-1 text-right text-sm"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">Max attempts</span>
              <input
                type="number"
                min={1}
                max={20}
                value={form.otpMaxAttempts}
                onChange={(e) => setForm((f) => ({ ...f, otpMaxAttempts: Number(e.target.value) }))}
                className="w-20 rounded-lg glass-soft px-2 py-1 text-right text-sm"
              />
            </label>
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveSettings}
              className="press flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {savingSettings && <Loader2 className="size-3.5 animate-spin" />}
              Save settings
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-extrabold">Per-role login step-up</h2>
        {policies.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {(policies.data ?? []).map((p) => (
              <div
                key={p.role}
                className="flex w-full items-center justify-between gap-3 rounded-2xl glass p-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <p className="truncate font-bold">{ROLE_LABEL[p.role] ?? p.role}</p>
                  {p.is_locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
                </div>
                <button
                  type="button"
                  disabled={busyRole === p.role || p.is_locked}
                  title={p.is_locked ? "This role always requires OTP" : undefined}
                  onClick={() => toggleRole(p.role, !p.otp_enabled)}
                  className={`press flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-60 ${
                    p.otp_enabled ? "bg-primary text-primary-foreground" : "glass-soft"
                  }`}
                >
                  {busyRole === p.role && <Loader2 className="size-3.5 animate-spin" />}
                  {p.otp_enabled ? "OTP required" : "OTP off"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
