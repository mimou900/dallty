import { z } from "zod";

/**
 * Shared, isomorphic password policy service.
 *
 * Two policies exist:
 * - "client"     — regular customers, low friction (length + letter + number)
 * - "privileged" — business owners, staff, managers, admins (full complexity)
 *
 * Both the UI and the server functions resolve their rules from here so signup,
 * password change and password reset always agree.
 */

export type PasswordPolicyId = "client" | "privileged";

export type PasswordRule = {
  id: string;
  label: string;
  labelAr: string;
  test: (value: string) => boolean;
};

/** Roles that must use the stronger policy. */
export const PRIVILEGED_ROLES = [
  "business_owner",
  "specialist",
  "receptionist",
  "manager",
  "admin",
  "super_admin",
] as const;

const CLIENT_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    labelAr: "٨ أحرف على الأقل",
    test: (v) => v.length >= 8,
  },
  {
    id: "letter",
    label: "Contains letters",
    labelAr: "يحتوي على أحرف",
    test: (v) => /[A-Za-z]/.test(v),
  },
  {
    id: "number",
    label: "Contains numbers",
    labelAr: "يحتوي على أرقام",
    test: (v) => /\d/.test(v),
  },
];

const PRIVILEGED_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    labelAr: "٨ أحرف على الأقل",
    test: (v) => v.length >= 8,
  },
  {
    id: "upper",
    label: "One uppercase letter",
    labelAr: "حرف كبير واحد",
    test: (v) => /[A-Z]/.test(v),
  },
  {
    id: "lower",
    label: "One lowercase letter",
    labelAr: "حرف صغير واحد",
    test: (v) => /[a-z]/.test(v),
  },
  {
    id: "number",
    label: "One number",
    labelAr: "رقم واحد",
    test: (v) => /\d/.test(v),
  },
  {
    id: "symbol",
    label: "One symbol",
    labelAr: "رمز خاص واحد",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

/** A short list of passwords we always reject, regardless of policy. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "abc12345",
  "iloveyou",
  "letmein1",
  "welcome1",
  "admin123",
]);

export function rulesFor(policy: PasswordPolicyId): PasswordRule[] {
  return policy === "privileged" ? PRIVILEGED_RULES : CLIENT_RULES;
}

/** Resolves the policy that applies to a set of app roles. */
export function policyForRoles(roles: readonly string[] | null | undefined): PasswordPolicyId {
  const list = roles ?? [];
  return list.some((r) => (PRIVILEGED_ROLES as readonly string[]).includes(r))
    ? "privileged"
    : "client";
}

export type PasswordCheck = { rule: PasswordRule; ok: boolean };

export function checkPassword(value: string, policy: PasswordPolicyId): PasswordCheck[] {
  return rulesFor(policy).map((rule) => ({ rule, ok: rule.test(value) }));
}

export function isCommonPassword(value: string) {
  return COMMON_PASSWORDS.has(value.trim().toLowerCase());
}

export type PasswordValidation = { valid: boolean; errors: string[] };

/** The single source of truth used by the UI and by server functions. */
export function validatePassword(value: string, policy: PasswordPolicyId): PasswordValidation {
  const errors = checkPassword(value, policy)
    .filter((c) => !c.ok)
    .map((c) => c.rule.label);
  if (value.length > 72) errors.push("Use at most 72 characters");
  if (errors.length === 0 && isCommonPassword(value)) {
    errors.push("This password is too common — pick something less predictable");
  }
  return { valid: errors.length === 0, errors };
}

export function isPasswordValid(value: string, policy: PasswordPolicyId) {
  return validatePassword(value, policy).valid;
}

export type PasswordStrengthLevel = "weak" | "good" | "strong";

/** Strength shown in the meter: Weak / Good / Strong. */
export function passwordStrength(value: string, policy: PasswordPolicyId): PasswordStrengthLevel {
  const checks = checkPassword(value, policy);
  const passed = checks.filter((c) => c.ok).length;
  if (passed < checks.length) return passed <= Math.ceil(checks.length / 2) ? "weak" : "good";
  if (isCommonPassword(value)) return "weak";
  const bonus = value.length >= 12 || /[^A-Za-z0-9]/.test(value);
  return bonus ? "strong" : "good";
}

/** Zod schema for a given policy — used by forms and server validators. */
export function passwordSchema(policy: PasswordPolicyId) {
  return z.string().superRefine((value, ctx) => {
    for (const message of validatePassword(value, policy).errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
}
