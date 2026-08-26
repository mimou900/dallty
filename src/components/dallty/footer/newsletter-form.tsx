import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { subscribeToNewsletter } from "@/lib/newsletter.functions";
import type { Lang } from "@/lib/i18n";

export function NewsletterForm({
  lang,
  placeholder,
  ctaLabel,
  successMessage,
  errorMessage,
  invalidMessage,
}: {
  lang: Lang;
  placeholder: string;
  ctaLabel: string;
  successMessage: string;
  errorMessage: string;
  invalidMessage: string;
}) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error(invalidMessage);
      return;
    }
    setSubmitting(true);
    try {
      await subscribeToNewsletter({ data: { email: trimmed, lang } });
      toast.success(successMessage);
      setEmail("");
    } catch {
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <Input
        id={inputId}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={placeholder}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-12 w-full rounded-2xl border-border bg-white px-4 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="press flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            {ctaLabel}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </>
        )}
      </button>
    </form>
  );
}
