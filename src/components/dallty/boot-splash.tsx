import { LogoMark } from "@/components/dallty/logo";

/**
 * Full-screen branded loader. Used as the router's `defaultPendingComponent`
 * so the very first paint (and any route whose loader — including the i18n
 * namespace preload in the root route — takes a moment) shows a deliberate
 * "working" state instead of a flash of untranslated keys or blank white.
 */
export function BootSplash() {
  return (
    <div className="fixed inset-0 z-(--z-toast) grid place-items-center overflow-hidden bg-[#0f4f35]">
      <div aria-hidden className="glow-blob size-[28rem] opacity-40" />
      <div className="relative flex flex-col items-center gap-7">
        <div className="animate-boot-pulse drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <LogoMark className="size-20" />
        </div>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span className="size-2 rounded-full bg-lime animate-boot-dot [animation-delay:-0.3s]" />
          <span className="size-2 rounded-full bg-lime animate-boot-dot [animation-delay:-0.15s]" />
          <span className="size-2 rounded-full bg-lime animate-boot-dot" />
          <span className="sr-only">Loading Dallty…</span>
        </div>
      </div>
    </div>
  );
}
