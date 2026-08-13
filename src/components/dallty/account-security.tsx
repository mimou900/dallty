import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Loader2,
  LogOut,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { changeMyPassword, deleteMyAccount } from "@/lib/account.functions";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { policyForRoles } from "@/lib/password-policy";
import { isValidE164 } from "@/lib/phone";

const inputClass =
  "min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2";

/**
 * Security & account controls rendered inline on the profile page so the
 * customer has a single place for everything about their account.
 */
export function AccountSecurity() {
  const { user, roles } = useAuth();
  const passwordPolicy = policyForRoles(roles);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const removeAccount = useServerFn(deleteMyAccount);
  const updatePassword = useServerFn(changeMyPassword);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  const emailVerified = Boolean(user?.email_confirmed_at);
  const phoneVerified = Boolean(user?.phone_confirmed_at);
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordStrong(password, passwordPolicy))
      return toast.error("Password does not meet the requirements");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy("password");
    try {
      await updatePassword({ data: { password } });
      setPassword("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(null);
    }
  }

  async function resendEmailVerification() {
    if (!user?.email) return;
    setBusy("email");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Verification email sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setBusy(null);
    }
  }

  async function sendPhoneCode() {
    if (!isValidE164(phone.trim())) {
      return toast.error("Use international format, e.g. +9715xxxxxxx");
    }
    setBusy("phone");
    try {
      const { error } = await supabase.auth.updateUser({ phone: phone.trim() });
      if (error) throw error;
      setOtpSent(true);
      toast.success("Verification code sent by SMS");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(null);
    }
  }

  async function verifyPhoneCode() {
    setBusy("phone");
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: "phone_change",
      });
      if (error) throw error;
      await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", user!.id);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setOtpSent(false);
      setOtp("");
      toast.success("Phone verified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    setBusy("sessions");
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast.success("Signed out on every device");
      navigate({ to: "/auth", search: { next: undefined }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign out");
    } finally {
      setBusy(null);
    }
  }

  async function signOutHere() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  }

  async function handleDelete() {
    if (confirmDelete.trim().toUpperCase() !== "DELETE") {
      return toast.error("Type DELETE to confirm");
    }
    setBusy("delete");
    try {
      await removeAccount({ data: undefined });
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the account");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Verification status */}
      <section className="rounded-3xl glass p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Verification
        </h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl glass-soft p-4">
            {emailVerified ? (
              <BadgeCheck className="size-5 shrink-0 text-primary" />
            ) : (
              <ShieldAlert className="size-5 shrink-0 text-gold" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{user?.email ?? "No email"}</p>
              <p className="text-xs text-muted-foreground">
                {emailVerified ? "Email verified" : "Email not verified yet"}
              </p>
            </div>
            {!emailVerified && user?.email && (
              <button
                type="button"
                onClick={resendEmailVerification}
                disabled={busy === "email"}
                className="press shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                Resend
              </button>
            )}
          </div>

          <div className="rounded-2xl glass-soft p-4">
            <div className="flex items-center gap-3">
              {phoneVerified ? (
                <BadgeCheck className="size-5 shrink-0 text-primary" />
              ) : (
                <ShieldAlert className="size-5 shrink-0 text-gold" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Phone</p>
                <p className="text-xs text-muted-foreground">
                  {phoneVerified ? "Phone verified" : "Add a number for SMS alerts and OTP login"}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+9715xxxxxxx"
                aria-label="Phone number"
                className={inputClass}
              />
              {otpSent && (
                <input
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit code"
                  aria-label="Verification code"
                  className={`${inputClass} tracking-[0.4em]`}
                />
              )}
              <button
                type="button"
                onClick={otpSent ? verifyPhoneCode : sendPhoneCode}
                disabled={busy === "phone"}
                className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy === "phone" && <Loader2 className="size-4 animate-spin" />}
                {otpSent ? "Verify code" : "Send verification code"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-3xl glass p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Change password
        </h2>
        <form onSubmit={changePassword} className="mt-4 space-y-3">
          {/* Hidden username helps password managers save the updated credential */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={user?.email ?? ""}
            readOnly
            hidden
            aria-hidden
            tabIndex={-1}
          />
          <input
            id="account-new-password"
            name="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            className={inputClass}
          />
          <PasswordStrength value={password} policy={passwordPolicy} />
          <input
            id="account-confirm-password"
            name="confirm-new-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            autoComplete="new-password"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy === "password" || !isPasswordStrong(password, passwordPolicy)}
            className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >

            {busy === "password" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Update password
          </button>
        </form>
      </section>

      {/* Sessions and devices */}
      <section className="rounded-3xl glass p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Sessions & devices
        </h2>
        <div className="mt-4 flex items-start gap-3 rounded-2xl glass-soft p-4">
          <MonitorSmartphone className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-bold">This device</p>
            <p className="text-xs text-muted-foreground">
              Signed in{providers.length ? ` via ${providers.join(", ")}` : ""}. Sessions refresh
              automatically and expire when revoked.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={signOutHere}
            className="press flex min-h-11 items-center justify-center gap-2 rounded-2xl glass-soft text-sm font-bold"
          >
            <LogOut className="size-4" />
            Sign out here
          </button>
          <button
            type="button"
            onClick={signOutEverywhere}
            disabled={busy === "sessions"}
            className="press flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-bold disabled:opacity-60"
          >
            {busy === "sessions" && <Loader2 className="size-4 animate-spin" />}
            Sign out all devices
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-3xl border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-destructive">
          <Trash2 className="size-4" />
          Delete account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This permanently removes your profile, bookings history and preferences. It cannot be
          undone.
        </p>
        <input
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          placeholder="Type DELETE to confirm"
          aria-label="Type DELETE to confirm"
          className={`${inputClass} mt-3`}
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy === "delete"}
          className="press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-bold text-destructive-foreground disabled:opacity-60"
        >
          {busy === "delete" && <Loader2 className="size-4 animate-spin" />}
          Delete my account
        </button>
      </section>
    </div>
  );
}
