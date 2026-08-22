import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import { useTranslation } from "@/lib/i18n/hooks";

/**
 * Non-blocking "connection lost" banner (brief §19-20). Purely informational —
 * it never auto-retries anything itself. Booking/payment/refund mutations
 * keep their own explicit, idempotent retry logic; this banner just tells the
 * customer what's going on.
 */
export function ConnectionBanner() {
  const { t } = useTranslation("common");
  const [online, setOnline] = useState(true);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    function goOnline() {
      setOnline(true);
      setShowRestored(true);
      const id = setTimeout(() => setShowRestored(false), 2500);
      return () => clearTimeout(id);
    }
    function goOffline() {
      setOnline(false);
      setShowRestored(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[var(--z-toast)] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-xl transition-colors ${
          online
            ? "bg-primary text-primary-foreground"
            : "bg-foreground text-background"
        }`}
      >
        <WifiOff className="size-4 shrink-0" />
        {online ? t("connection_restored") : `${t("connection_lost")} — ${t("connection_lost_sub")}`}
      </div>
    </div>
  );
}
