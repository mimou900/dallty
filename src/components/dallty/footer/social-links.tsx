import { Facebook, Instagram, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Simple line-style glyph matching lucide's stroke conventions — lucide-react ships no TikTok icon. */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M15 3v11a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M15 3a5.5 5.5 0 0 0 5 5.5" />
    </svg>
  );
}

const SOCIALS: { key: string; label: string; icon: LucideIcon | typeof TikTokIcon }[] = [
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: TikTokIcon },
  { key: "youtube", label: "YouTube", icon: Youtube },
];

/**
 * No real Dallty social accounts exist yet, so these render as inert (no href) rather
 * than linking to guessed/fabricated URLs — swap in real links here once accounts exist.
 */
export function SocialLinks({ className }: { className?: string }) {
  return (
    <ul className={`flex items-center gap-2 ${className ?? ""}`}>
      {SOCIALS.map(({ key, label, icon: Icon }) => (
        <li key={key}>
          <span
            role="img"
            aria-label={label}
            title={label}
            className="flex size-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground"
          >
            <Icon className="size-4" />
          </span>
        </li>
      ))}
    </ul>
  );
}
