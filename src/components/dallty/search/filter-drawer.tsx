import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { BUSINESS_TYPES } from "@/lib/business-schema";

export type SortKey = "best-match" | "nearest" | "top-rated";
export type PriceTier = "" | "$" | "$$" | "$$$";
export type GenderFilter = "all" | "women" | "men";

export type FilterState = {
  sort: SortKey;
  price: PriceTier;
  gender: GenderFilter;
  amenities: string[];
  offers: boolean;
  shopType: string;
};

export const EMPTY_FILTERS: FilterState = {
  sort: "best-match",
  price: "",
  gender: "all",
  amenities: [],
  offers: false,
  shopType: "",
};

/** Excludes `women_only`/`men_only` — those two values power the separate
 *  "Type de prestation" group above, not the amenities list (Search
 *  redesign §8's gender-restriction reality check: they're two of the same
 *  free-text `amenities` array, not a distinct column, so they're the same
 *  underlying filter split into two UI groups). "Group bookings" has no
 *  real backend field anywhere in the schema (confirmed during planning) —
 *  deliberately not offered as a checkbox here rather than shipping a
 *  control that can never do anything. */
const AMENITY_KEYS = [
  "wifi",
  "parking",
  "coffee",
  "wheelchair",
  "pet_friendly",
  "home_service",
  "hotel_service",
  "kids",
] as const;

const AMENITY_LABEL_KEY: Record<(typeof AMENITY_KEYS)[number], NamespaceKeyMap["marketplace"]> = {
  wifi: "amenity_wifi",
  parking: "amenity_parking",
  coffee: "amenity_coffee",
  wheelchair: "amenity_wheelchair",
  pet_friendly: "amenity_pet_friendly",
  home_service: "amenity_home_service",
  hotel_service: "amenity_hotel_service",
  kids: "amenity_kids",
};

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press min-h-10 rounded-2xl border px-4 text-sm font-semibold transition-colors duration-150 ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-card hover:border-border"
      }`}
    >
      {children}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-sm font-bold">{children}</p>;
}

function FilterBody({ draft, setDraft }: { draft: FilterState; setDraft: (f: FilterState) => void }) {
  const { t } = useTranslation("marketplace");

  function toggleAmenity(key: string) {
    setDraft({
      ...draft,
      amenities: draft.amenities.includes(key)
        ? draft.amenities.filter((a) => a !== key)
        : [...draft.amenities, key],
    });
  }

  return (
    <div className="divide-y divide-border/50 p-4 sm:p-5">
      <div className="pb-6">
        <GroupLabel>{t("filter_sort_label")}</GroupLabel>
        <div className="flex flex-wrap gap-2">
          <Pill active={draft.sort === "best-match"} onClick={() => setDraft({ ...draft, sort: "best-match" })}>
            {t("sort_best_match")}
          </Pill>
          <Pill active={draft.sort === "nearest"} onClick={() => setDraft({ ...draft, sort: "nearest" })}>
            {t("sort_nearest")}
          </Pill>
          <Pill active={draft.sort === "top-rated"} onClick={() => setDraft({ ...draft, sort: "top-rated" })}>
            {t("sort_top_rated")}
          </Pill>
        </div>
      </div>

      <div className="py-6">
        <GroupLabel>{t("filter_price_label")}</GroupLabel>
        <div className="flex flex-wrap gap-2">
          <Pill active={draft.price === ""} onClick={() => setDraft({ ...draft, price: "" })}>
            {t("filter_price_any")}
          </Pill>
          {(["$", "$$", "$$$"] as const).map((tier) => (
            <Pill key={tier} active={draft.price === tier} onClick={() => setDraft({ ...draft, price: tier })}>
              {t("filter_price_up_to", { tier })}
            </Pill>
          ))}
        </div>
      </div>

      <div className="py-6">
        <GroupLabel>{t("filter_shop_type_label")}</GroupLabel>
        <div className="flex flex-wrap gap-2">
          <Pill active={draft.shopType === ""} onClick={() => setDraft({ ...draft, shopType: "" })}>
            {t("filter_all_shop_types")}
          </Pill>
          {BUSINESS_TYPES.map((type) => (
            <Pill key={type} active={draft.shopType === type} onClick={() => setDraft({ ...draft, shopType: type })}>
              {type}
            </Pill>
          ))}
        </div>
      </div>

      <div className="py-6">
        <GroupLabel>{t("filter_gender_label")}</GroupLabel>
        <div className="flex flex-wrap gap-2">
          <Pill active={draft.gender === "all"} onClick={() => setDraft({ ...draft, gender: "all" })}>
            {t("filter_gender_all")}
          </Pill>
          <Pill active={draft.gender === "women"} onClick={() => setDraft({ ...draft, gender: "women" })}>
            {t("filter_gender_women")}
          </Pill>
          <Pill active={draft.gender === "men"} onClick={() => setDraft({ ...draft, gender: "men" })}>
            {t("filter_gender_men")}
          </Pill>
        </div>
      </div>

      <div className="py-6">
        <GroupLabel>{t("filter_amenities_label")}</GroupLabel>
        <div className="flex flex-wrap gap-2">
          {AMENITY_KEYS.map((key) => (
            <Pill key={key} active={draft.amenities.includes(key)} onClick={() => toggleAmenity(key)}>
              {t(AMENITY_LABEL_KEY[key])}
            </Pill>
          ))}
        </div>
      </div>

      <div className="pt-6">
        <GroupLabel>{t("filter_booking_options_label")}</GroupLabel>
        <Pill active={draft.offers} onClick={() => setDraft({ ...draft, offers: !draft.offers })}>
          {t("filter_has_offers")}
        </Pill>
      </div>
    </div>
  );
}

/**
 * Search redesign §7 — one component, two renders: full-height mobile
 * sheet, centered desktop modal (never a permanent sidebar). Draft state
 * lives here until "Appliquer" commits it to the URL via `onApply`;
 * "Tout effacer" resets the draft, not the URL, until Apply is pressed too
 * — matches the spec's "Only apply changes after pressing Apply."
 */
export function FilterDrawer({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: FilterState;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const breakpoint = useBreakpoint();
  const { t } = useTranslation("marketplace");

  useEffect(() => {
    if (open) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const activeCount =
    (draft.sort !== "best-match" ? 1 : 0) +
    (draft.price ? 1 : 0) +
    (draft.shopType ? 1 : 0) +
    (draft.gender !== "all" ? 1 : 0) +
    draft.amenities.length +
    (draft.offers ? 1 : 0);

  const body = (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 p-4">
        <h1 className="text-h3">{t("filters_title")}</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close_aria")}
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <FilterBody draft={draft} setDraft={setDraft} />
      </div>
      <footer className="flex shrink-0 items-center gap-3 border-t border-border/60 p-4">
        <button
          type="button"
          onClick={() => setDraft(EMPTY_FILTERS)}
          className="press flex-1 rounded-2xl border border-border/60 bg-card py-3 text-center text-sm font-bold hover:border-border"
        >
          {t("filter_clear_all")}
        </button>
        <button
          type="button"
          onClick={() => onApply(draft)}
          className="press flex-1 rounded-2xl bg-(image:--gradient-lime) py-3 text-center text-sm font-bold text-lime-foreground"
        >
          {t("filter_apply")}
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </footer>
    </>
  );

  if (breakpoint === "desktop") {
    return (
      <div
        className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-foreground/40 p-4"
        role="dialog"
        aria-modal
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-cream text-cream-foreground shadow-xl">
          {body}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-(--z-overlay) flex flex-col bg-cream text-cream-foreground"
      role="dialog"
      aria-modal
    >
      {body}
    </div>
  );
}
