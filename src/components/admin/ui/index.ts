/**
 * Canonical Super Admin UI primitives (design-system Phase 01). Import from
 * here, not from `@/components/ui/*` directly, when building anything under
 * `src/routes/_authenticated/admin/`.
 *
 * Deliberately not built this phase (see docs/DALLTY_UI_UX_MASTER_SCHEMA.md
 * §11 for why): AdminSidebar, AdminCommand (both Shell/Navigation — the next
 * phase), AdminCalendar (no current consumer), AdminDropdown/AdminTooltip
 * (the shadcn primitives are already themed via CSS tokens; a wrapper would
 * add no value yet), AdminToast (sonner's existing Toaster is already the
 * one genuinely-consistent shared pattern Phase 00 found — use it directly).
 */
export * from "@/components/admin/ui/admin-button";
export * from "@/components/admin/ui/admin-input";
export * from "@/components/admin/ui/admin-select";
export * from "@/components/admin/ui/admin-card";
export * from "@/components/admin/ui/admin-badge";
export * from "@/components/admin/ui/admin-tabs";
export * from "@/components/admin/ui/admin-dialog";
export * from "@/components/admin/ui/admin-drawer";
export * from "@/components/admin/ui/admin-table";
export * from "@/components/admin/ui/admin-pagination";
export * from "@/components/admin/ui/admin-breadcrumbs";
export * from "@/components/admin/ui/admin-page-header";
export * from "@/components/admin/ui/admin-entity-header";
export * from "@/components/admin/ui/admin-section";
export * from "@/components/admin/ui/admin-filter";
export * from "@/components/admin/ui/admin-states";
