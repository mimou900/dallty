import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Loader2,
  LogOut,
  Mail,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  checkPhoneHasAccount,
  confirmEmailChange,
  confirmPasswordChange,
  deleteMyAccount,
  notifyPhoneChanged,
  requestEmailChange,
  requestPasswordChange,
  verifyOldEmailForChange,
} from "@/lib/account.functions";
import { requestOtp, verifyOtp } from "@/lib/otp.functions";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { OtpCodeInput } from "@/components/dallty/otp-code-input";
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
  const startEmailChange = useServerFn(requestEmailChange);
  const verifyOldEmail = useServerFn(verifyOldEmailForChange);
  const finishEmailChange = useServerFn(confirmEmailChange);
  const startPasswordChange = useServerFn(requestPasswordChange);
  const finishPasswordChange = useServerFn(confirmPasswordChange);
  const checkPhone = useServerFn(checkPhoneHasAccount);
  const announcePhoneChanged = useServerFn(notifyPhoneChanged);

  // Change email — three steps: enter new address, verify the OLD address
  // owns this change, then verify the NEW address before applying it.
  const [newEmail, setNewEmail] = useState("");
  const [emailStep, setEmailStep] = useState<"idle" | "verify-old" | "verify-new">("idle");
  const [emailCode, setEmailCode] = useState("");

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordOtpPending, setPasswordOtpPending] = useState(false);
  const [passwordCode, setPasswordCode] = useState("");

  // Change phone — "idle" shows the current status; changing an already-verified number
  // gates through "email-otp" first (proves account ownership via a channel that's never the
  // number being replaced, so a lost/inaccessible old phone is never the thing blocking a
  // legitimate change); adding a first number, or (re-)verifying one already on file (e.g.
  // saved unverified from a booking), skips straight to "phone-otp" — nothing to protect yet.
  const [phoneStep, setPhoneStep] = useState<"idle" | "email-otp" | "phone-input" | "phone-otp">(
    "idle",
  );
  const [phoneEmailCode, setPhoneEmailCode] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  // Shares profile.tsx's exact query key/shape -- React Query serves this from the same
  // cache, no extra fetch. Needed because a phone added during the booking flow's inline
  // "Your Info" step is written straight to profiles.phone (never through
  // supabase.auth.updateUser), so it exists in the profile before auth.users/`user.phone`
  // ever knows about it -- without this, a number saved that way would be invisible here.
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const savedPhone = profileQuery.data?.phone || user?.phone || "";
  const emailVerified = Boolean(user?.email_confirmed_at);
  // Verified only when the auth-confirmed number is the SAME one currently saved on the
  // profile -- a number written by the booking flow (or any other direct profile update)
  // never went through OTP, so it must show as unverified even if some other, now-stale
  // number was verified in the past.
  const phoneVerified =
    Boolean(user?.phone_confirmed_at) && Boolean(savedPhone) && user?.phone === savedPhone;
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];

  async function requestEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return toast.error("Enter a valid email address");
    }
    setBusy("email-request");
    try {
      await startEmailChange({ data: { newEmail: trimmed } });
      setEmailStep("verify-old");
      toast.success("Code sent to your current email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start email change");
    } finally {
      setBusy(null);
    }
  }

  async function verifyOld() {
    if (emailCode.length !== 6) return;
    setBusy("email-verify-old");
    try {
      await verifyOldEmail({ data: { code: emailCode } });
      setEmailStep("verify-new");
      setEmailCode("");
      toast.success("Code sent to your new email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
      setEmailCode("");
    } finally {
      setBusy(null);
    }
  }

  async function confirmEmail() {
    if (emailCode.length !== 6) return;
    setBusy("email-confirm");
    try {
      await finishEmailChange({ data: { code: emailCode } });
      await supabase.auth.refreshSession();
      setEmailStep("idle");
      setEmailCode("");
      setNewEmail("");
      toast.success("Email address updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
      setEmailCode("");
    } finally {
      setBusy(null);
    }
  }

  async function requestPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) return toast.error("Enter your current password");
    if (!isPasswordStrong(newPassword, passwordPolicy)) {
      return toast.error("New password does not meet the requirements");
    }
    if (newPassword !== confirmNewPassword) return toast.error("Passwords do not match");
    setBusy("password-request");
    try {
      await startPasswordChange({ data: { currentPassword, newPassword } });
      setPasswordOtpPending(true);
      toast.success("Code sent to your email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start password change");
    } finally {
      setBusy(null);
    }
  }

  async function confirmPassword() {
    if (passwordCode.length !== 6) return;
    setBusy("password-confirm");
    try {
      await finishPasswordChange({ data: { code: passwordCode, newPassword } });
      await supabase.auth.signOut({ scope: "others" });
      setPasswordOtpPending(false);
      setPasswordCode("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("Password changed — other devices signed out");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
      setPasswordCode("");
    } finally {
      setBusy(null);
    }
  }

  async function resendEmailVerification() {
    if (!user?.email) return;
    setBusy("verify-email");
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

  /** Entry point from the "idle" card. Changing an already-verified number is gated by an
   * email OTP first; adding a first number, or (re-)verifying one already saved (e.g. from a
   * booking) but never confirmed, has nothing to protect yet and skips straight to typing/
   * confirming the number itself. */
  function startPhoneChange() {
    if (phoneVerified) {
      void requestPhoneEmailOtp();
    } else {
      setPhone(savedPhone);
      setPhoneStep("phone-input");
    }
  }

  async function requestPhoneEmailOtp() {
    setBusy("phone-email");
    try {
      await requestOtp({ data: { purpose: "change_phone" } });
      setPhoneStep("email-otp");
      toast.success("Code sent to your email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(null);
    }
  }

  async function verifyPhoneEmailOtp() {
    if (phoneEmailCode.length !== 6) return;
    setBusy("phone-email");
    try {
      await verifyOtp({ data: { purpose: "change_phone", code: phoneEmailCode } });
      setPhoneEmailCode("");
      setPhone("");
      setPhoneStep("phone-input");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
      setPhoneEmailCode("");
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
      if (phone.trim() !== user?.phone) {
        const { exists } = await checkPhone({ data: { phone: phone.trim() } });
        if (exists) throw new Error("This phone number is already registered to another account");
      }

      const { error } = await supabase.auth.updateUser({ phone: phone.trim() });
      if (error) throw error;
      setPhoneStep("phone-otp");
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
      announcePhoneChanged({ data: { newPhone: phone.trim() } }).catch(() => {});
      setPhoneStep("idle");
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
                disabled={busy === "verify-email"}
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
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {savedPhone ? savedPhone : "Add a number for SMS alerts and OTP login"}
                  {savedPhone && !phoneVerified && " · not verified yet"}
                </p>
              </div>
            </div>

            {phoneStep === "idle" && (
              <button
                type="button"
                onClick={startPhoneChange}
                disabled={busy === "phone-email"}
                className="press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy === "phone-email" && <Loader2 className="size-4 animate-spin" />}
                {!savedPhone
                  ? "Add phone number"
                  : phoneVerified
                    ? "Change number"
                    : "Verify this number"}
              </button>
            )}

            {phoneStep === "email-otp" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  For your security, changing a verified number starts with a code sent to your
                  email ({user?.email}) — not the old phone, in case it's the one you lost.
                </p>
                <OtpCodeInput
                  value={phoneEmailCode}
                  onChange={setPhoneEmailCode}
                  disabled={busy === "phone-email"}
                />
                <button
                  type="button"
                  onClick={verifyPhoneEmailOtp}
                  disabled={busy === "phone-email" || phoneEmailCode.length !== 6}
                  className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {busy === "phone-email" && <Loader2 className="size-4 animate-spin" />}
                  Verify code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep("idle");
                    setPhoneEmailCode("");
                  }}
                  className="press w-full text-center text-xs font-semibold text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            )}

            {phoneStep === "phone-input" && (
              <div className="mt-3 space-y-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+9715xxxxxxx"
                  aria-label="Phone number"
                  disabled={busy === "phone"}
                  className={`${inputClass} disabled:opacity-60`}
                />
                <button
                  type="button"
                  onClick={sendPhoneCode}
                  disabled={busy === "phone"}
                  className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {busy === "phone" && <Loader2 className="size-4 animate-spin" />}
                  Send verification code
                </button>
                <button
                  type="button"
                  onClick={() => setPhoneStep("idle")}
                  className="press w-full text-center text-xs font-semibold text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            )}

            {phoneStep === "phone-otp" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground" dir="ltr">
                  Code sent by SMS to {phone}
                </p>
                <OtpCodeInput value={otp} onChange={setOtp} disabled={busy === "phone"} />
                <button
                  type="button"
                  onClick={verifyPhoneCode}
                  disabled={busy === "phone" || otp.length !== 6}
                  className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {busy === "phone" && <Loader2 className="size-4 animate-spin" />}
                  Verify code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep("phone-input");
                    setOtp("");
                  }}
                  className="press w-full text-center text-xs font-semibold text-muted-foreground"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Change email */}
      <section className="rounded-3xl glass p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <Mail className="size-4" /> Change email
        </h2>
        {emailStep === "idle" && (
          <form onSubmit={requestEmail} className="mt-4 space-y-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              aria-label="New email address"
              autoComplete="email"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busy === "email-request"}
              className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy === "email-request" && <Loader2 className="size-4 animate-spin" />}
              Send confirmation code
            </button>
          </form>
        )}

        {emailStep === "verify-old" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              First, confirm it's you — enter the code we sent to your current email,{" "}
              <span className="font-semibold">{user?.email}</span>.
            </p>
            <OtpCodeInput
              value={emailCode}
              onChange={setEmailCode}
              disabled={busy === "email-verify-old"}
            />
            <button
              type="button"
              onClick={verifyOld}
              disabled={busy === "email-verify-old" || emailCode.length !== 6}
              className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy === "email-verify-old" && <Loader2 className="size-4 animate-spin" />}
              Verify
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailStep("idle");
                setEmailCode("");
              }}
              className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        )}

        {emailStep === "verify-new" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Now enter the code we sent to <span className="font-semibold">{newEmail}</span>.
            </p>
            <OtpCodeInput
              value={emailCode}
              onChange={setEmailCode}
              disabled={busy === "email-confirm"}
            />
            <button
              type="button"
              onClick={confirmEmail}
              disabled={busy === "email-confirm" || emailCode.length !== 6}
              className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy === "email-confirm" && <Loader2 className="size-4 animate-spin" />}
              Confirm new email
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailStep("idle");
                setEmailCode("");
                setNewEmail("");
              }}
              className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
            >
              Start over
            </button>
          </div>
        )}
      </section>

      {/* Password */}
      <section className="rounded-3xl glass p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Change password
        </h2>
        {passwordOtpPending ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the code we sent to your email to finish changing your password.
            </p>
            <OtpCodeInput
              value={passwordCode}
              onChange={setPasswordCode}
              disabled={busy === "password-confirm"}
            />
            <button
              type="button"
              onClick={confirmPassword}
              disabled={busy === "password-confirm" || passwordCode.length !== 6}
              className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy === "password-confirm" && <Loader2 className="size-4 animate-spin" />}
              Confirm password change
            </button>
            <button
              type="button"
              onClick={() => {
                setPasswordOtpPending(false);
                setPasswordCode("");
              }}
              className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        ) : (
          <form onSubmit={requestPassword} className="mt-4 space-y-3">
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
              id="account-current-password"
              name="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              aria-label="Current password"
              autoComplete="current-password"
              className={inputClass}
            />
            <input
              id="account-new-password"
              name="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              autoComplete="new-password"
              className={inputClass}
            />
            <PasswordStrength value={newPassword} policy={passwordPolicy} />
            <input
              id="account-confirm-password"
              name="confirm-new-password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Confirm new password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={
                busy === "password-request" ||
                !currentPassword ||
                !isPasswordStrong(newPassword, passwordPolicy)
              }
              className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy === "password-request" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Update password
            </button>
          </form>
        )}
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
