import { useEffect, useState } from "react";

/**
 * Horizontal profile section nav — flat underline-tab style, matching the reference
 * screenshots exactly (a plain text row with a bottom rule and an underline on the active
 * item — not a rounded glass-pill segmented control, which is what this looked like before
 * user feedback that it was "still far from the target"). "About / Services / Team / Photos /
 * Other" scroll an anchor already on the `overview` page into view; "Reviews" is the one
 * genuinely separate route tab (own query, lazy-loaded only when opened — the "1000+ reviews"
 * case is exactly why it isn't rendered inline with everything else), so it calls the existing
 * `onOpenReviews` (== `setTab("reviews")`) instead of scrolling.
 *
 * No separate "Hours" item: the reference screenshots fold opening hours into the "Other"
 * section (alongside amenities and the map), not a standalone tab — business-hours-location.tsx
 * was merged into business-about.tsx's "other" section to match.
 *
 * English labels, matching the rest of this page's own existing convention (this whole page
 * is hardcoded English today, not routed through the i18n key system yet) — the reference app
 * itself happens to be French-locale, but that's its own locale choice, not part of the layout
 * spec to copy.
 */
const SECTIONS = [
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "team", label: "Team" },
  { id: "photos", label: "Photos" },
  { id: "other", label: "Other" },
] as const;

export function BusinessProfileNav({
  activeTab,
  onOpenReviews,
}: {
  activeTab: "overview" | "reviews";
  onOpenReviews: () => void;
}) {
  const [activeSection, setActiveSection] = useState<string>("about");

  useEffect(() => {
    if (activeTab !== "overview") return;

    // A plain "activation line" ~140px below the top of the viewport (roughly where content
    // clears the sticky header + this nav) — the active tab is whichever section's top has
    // most recently crossed above that line. Deliberately NOT "whichever section
    // IntersectionObserver currently reports as intersecting": a long section (e.g. Services,
    // with a dozen cards) stays "intersecting" for the entire time its bottom is still on
    // screen, which — with a naive "pick the topmost intersecting entry" rule — kept Services
    // permanently highlighted even after scrolling well into Team below it. Recomputing
    // straight from getBoundingClientRect on every scroll tick sidesteps that: it only cares
    // about each section's current position, not how long it's been "intersecting".
    const ACTIVATION_LINE = 140;
    let ticking = false;

    function recompute() {
      ticking = false;
      let current: (typeof SECTIONS)[number]["id"] = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= ACTIVATION_LINE) current = s.id;
      }
      setActiveSection(current);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(recompute);
    }

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [activeTab]);

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      role="tablist"
      aria-label="Business profile sections"
      className="mx-auto mt-3 flex max-w-3xl gap-6 overflow-x-auto border-b border-border bg-background px-4"
    >
      {SECTIONS.map((s) => {
        const selected = activeTab === "overview" && activeSection === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => scrollToSection(s.id)}
            className={`press shrink-0 border-b-2 pb-3 pt-1 text-sm font-bold transition-colors ${
              selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {s.label}
          </button>
        );
      })}
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "reviews"}
        onClick={onOpenReviews}
        className={`press shrink-0 border-b-2 pb-3 pt-1 text-sm font-bold transition-colors ${
          activeTab === "reviews"
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground"
        }`}
      >
        Reviews
      </button>
    </div>
  );
}
