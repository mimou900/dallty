import { useMemo } from "react";
import { Check, X } from "lucide-react";

import {
  checkPassword,
  isPasswordValid,
  passwordStrength,
  type PasswordPolicyId,
} from "@/lib/password-policy";

export function isPasswordStrong(value: string, policy: PasswordPolicyId = "privileged") {
  return isPasswordValid(value, policy);
}

/**
 * Live password checklist + strength bar. The rules shown depend on the
 * account policy: simple for customers, full complexity for business roles.
 */
export function PasswordStrength({
  value,
  policy = "privileged",
  lang = "en",
  className = "",
}: {
  value: string;
  policy?: PasswordPolicyId;
  lang?: "en" | "ar";
  className?: string;
}) {
  const checks = useMemo(() => checkPassword(value, policy), [value, policy]);
  const total = checks.length;
  const score = checks.filter((c) => c.ok).length;

  if (!value) return null;

  const level = passwordStrength(value, policy);
  const levelLabel =
    lang === "ar"
      ? { weak: "ضعيفة", good: "جيدة", strong: "قوية" }[level]
      : { weak: "Weak", good: "Good", strong: "Strong" }[level];
  const barColor =
    level === "weak" ? "bg-destructive" : level === "good" ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    level === "weak" ? "text-destructive" : level === "good" ? "text-amber-500" : "text-emerald-500";
  const width = level === "strong" ? 100 : Math.max(12, (score / total) * 100);

  return (
    <div className={`rounded-2xl glass-soft p-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className={`shrink-0 text-xs font-bold ${textColor}`}>{levelLabel}</span>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li
            key={c.rule.id}
            className={`flex items-center gap-2 font-semibold ${
              c.ok ? "text-emerald-500" : "text-muted-foreground"
            }`}
          >
            {c.ok ? (
              <Check className="size-3.5 shrink-0" />
            ) : (
              <X className="size-3.5 shrink-0 opacity-60" />
            )}
            {lang === "ar" ? c.rule.labelAr : c.rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
