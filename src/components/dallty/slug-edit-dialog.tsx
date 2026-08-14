import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { validateSlugFormat } from "@/lib/slug-service";
import { updateBusinessSlug } from "@/lib/business-slug.functions";

export function SlugEditDialog({
  open,
  onOpenChange,
  businessId,
  currentSlug,
  redirectType,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  currentSlug: string;
  redirectType: "owner_rename" | "admin_correction";
  onUpdated: (newSlug: string) => void;
}) {
  const [value, setValue] = useState(currentSlug);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = useServerFn(updateBusinessSlug);
  const isSuperAdminCaller = redirectType === "admin_correction";

  const history = useQuery({
    queryKey: ["business-slug-history", businessId],
    enabled: open && !isSuperAdminCaller,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_slug_redirects")
        .select("created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCount = (history.data ?? []).filter(
    (r) => new Date(r.created_at).getTime() > since,
  ).length;
  const remaining = Math.max(0, 3 - recentCount);
  const lastChangeAt = history.data?.[0]?.created_at;
  const hoursSinceLast = lastChangeAt
    ? (Date.now() - new Date(lastChangeAt).getTime()) / (60 * 60 * 1000)
    : Infinity;
  const lockedHoursLeft = hoursSinceLast < 24 ? Math.ceil(24 - hoursSinceLast) : 0;
  const blocked = !isSuperAdminCaller && (remaining <= 0 || lockedHoursLeft > 0);

  const format = validateSlugFormat(value);
  const changed = value !== currentSlug;

  async function confirm() {
    setBusy(true);
    try {
      const result = await submit({ data: { businessId, newSlug: value, redirectType } });
      toast.success("URL updated");
      onUpdated(result.slug);
      onOpenChange(false);
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update URL");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {!confirming ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit your URL</AlertDialogTitle>
              <AlertDialogDescription>
                dallty.com/business/
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value.toLowerCase())}
                  disabled={blocked}
                  className="mt-2 block w-full rounded-2xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground outline-none disabled:opacity-60"
                />
                {!format.valid && value !== currentSlug ? (
                  <span className="mt-1 block text-xs text-destructive">
                    3-60 characters, lowercase letters/numbers/hyphens only.
                  </span>
                ) : null}
                {!isSuperAdminCaller && lockedHoursLeft > 0 ? (
                  <span className="mt-1 block text-xs text-destructive">
                    You can change your URL again in {lockedHoursLeft} hour(s).
                  </span>
                ) : !isSuperAdminCaller ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {remaining} of 3 changes left this month.
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!changed || !format.valid || blocked}
                onClick={(e) => {
                  e.preventDefault();
                  setConfirming(true);
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm your new URL</AlertDialogTitle>
              <AlertDialogDescription>
                Old: dallty.com/business/{currentSlug}
                <br />
                New: dallty.com/business/{value}
                <br />
                This takes effect immediately and the old link will keep redirecting here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirming(false)} disabled={busy}>
                Back
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
              >
                {busy && <Loader2 className="me-2 inline size-4 animate-spin" />}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
