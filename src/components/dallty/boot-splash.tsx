import { useEffect, useState } from "react";

import { LogoMark } from "@/components/dallty/logo";

/**
 * Home-page-only pending screen (wired as the "/" route's own `pendingComponent`,
 * overriding the generic RouteSkeleton every other route uses). A fake 0-99% climb —
 * fast at first, easing off near the end, the same trick Netflix/most apps' progress
 * indicators use since real load time is rarely worth exposing directly — paired with
 * the backdrop sharpening from a heavy blur into focus as it climbs. If the real
 * pending state clears first (the common case once i18n namespaces are warm), this
 * simply unmounts mid-animation; nothing here depends on reaching 100 to look right.
 */
export function BootSplash() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 1800;
    const start = performance.now();
    let raf: number;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(t >= 1 ? 100 : Math.min(99, Math.round(eased * 99)));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const blur = Math.max(0, 22 - progress * 0.22);
  const clarity = progress / 100;

  return (
    <div className="fixed inset-0 z-(--z-toast) grid place-items-center overflow-hidden bg-[#0f4f35]">
      <div
        aria-hidden
        className="absolute inset-0 transition-[filter] duration-200 ease-out"
        style={{
          filter: `blur(${blur}px)`,
          opacity: 0.5 + clarity * 0.4,
          backgroundImage:
            "radial-gradient(circle at 20% 25%, oklch(0.82 0.19 119 / 0.55), transparent 55%)," +
            "radial-gradient(circle at 80% 20%, oklch(0.7 0.24 340 / 0.45), transparent 50%)," +
            "radial-gradient(circle at 50% 85%, oklch(0.6 0.12 161 / 0.6), transparent 60%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        <div className="animate-boot-pulse drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <LogoMark className="size-20" />
        </div>

        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <span className="text-3xl font-extrabold tabular-nums text-lime">{progress}%</span>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-background/15">
            <div
              className="h-full rounded-full bg-lime transition-[width] duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="sr-only">Loading Dallty…</span>
        </div>
      </div>
    </div>
  );
}
