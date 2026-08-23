import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  AdminButton,
  AdminInput,
  AdminSearchInput,
  AdminTextarea,
  AdminFieldLabel,
  AdminCard,
  AdminGlassCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminBadge,
  AdminStatusBadge,
  AdminRiskBadge,
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
  AdminDialog,
  AdminDialogTrigger,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDrawer,
  AdminDrawerTrigger,
  AdminDrawerContent,
  AdminDrawerHeader,
  AdminDrawerTitle,
  AdminDrawerDescription,
  AdminDrawerBody,
  AdminDrawerFooter,
  AdminTableScroll,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
  AdminPagination,
  AdminPageHeader,
  AdminEntityHeader,
  AdminSection,
  AdminDivider,
  AdminFilterBar,
  AdminFilterChip,
  AdminEmptyState,
  AdminErrorState,
  AdminPermissionDenied,
  AdminNotFound,
} from "@/components/admin/ui";
import {
  DashboardSkeleton,
  TableSkeleton,
  ListSkeleton,
  DetailSkeleton,
  SkeletonCard,
  SkeletonRow,
} from "@/components/dallty/skeletons";

/**
 * Internal design-system showcase (admin-design-system, Phase 01). Not
 * linked from the admin nav — reachable only by direct URL, super-admin
 * gated like every other platform page. Exists purely so the primitives in
 * `src/components/admin/ui/*` can be rendered and screenshotted for real
 * visual QA instead of trusting the code alone. Not a "page" in the brief's
 * sense (no business/customer/booking data, no Phase 02+ scope) — it renders
 * only this phase's own output.
 */
export const Route = createFileRoute("/_authenticated/admin/design-system")({
  head: () => ({ meta: [{ title: "Design System — Dallty Platform" }] }),
  component: DesignSystemPage,
});

function DesignSystemPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const [activeFilter, setActiveFilter] = useState("all");

  if (loading) return null;
  if (!isSuper) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <AdminPermissionDenied />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 sm:px-6">
      <AdminPageHeader
        title="Design System"
        description="Internal showcase of the Super Admin UI foundation — not a real admin page."
        breadcrumbs={[
          { label: "Platform", to: "/admin/platform/overview" },
          { label: "Design System" },
        ]}
      />

      <AdminSection title="Typography">
        <div className="space-y-3">
          <p className="text-display">Display</p>
          <p className="text-h1">Heading 1</p>
          <p className="text-h2">Heading 2</p>
          <p className="text-h3">Heading 3</p>
          <p className="text-stat">1,284</p>
          <p className="text-body-lg">Body large — used for a lead paragraph.</p>
          <p className="text-body">Body — the default reading size for admin content.</p>
          <p className="text-body-sm text-muted-foreground">Body small — secondary detail.</p>
          <p className="text-label">Label</p>
          <p className="text-caption">Caption</p>
        </div>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Status &amp; risk colors">
        <div className="flex flex-wrap gap-2">
          <AdminStatusBadge status="success">Active</AdminStatusBadge>
          <AdminStatusBadge status="warning">Pending review</AdminStatusBadge>
          <AdminStatusBadge status="error">Suspended</AdminStatusBadge>
          <AdminStatusBadge status="info">Draft</AdminStatusBadge>
          <AdminStatusBadge status="neutral">Archived</AdminStatusBadge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminRiskBadge level={0} />
          <AdminRiskBadge level={1} />
          <AdminRiskBadge level={2} />
          <AdminRiskBadge level={3} />
          <AdminRiskBadge level={4} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminBadge variant="neutral">Neutral</AdminBadge>
          <AdminBadge variant="primary">Primary</AdminBadge>
        </div>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Buttons">
        <div className="flex flex-wrap gap-3">
          <AdminButton variant="primary">Primary</AdminButton>
          <AdminButton variant="lime">Lime CTA</AdminButton>
          <AdminButton variant="accent">Accent</AdminButton>
          <AdminButton variant="secondary">Secondary</AdminButton>
          <AdminButton variant="outline">Outline</AdminButton>
          <AdminButton variant="ghost">Ghost</AdminButton>
          <AdminButton variant="destructive">Destructive</AdminButton>
          <AdminButton variant="primary" loading>
            Loading
          </AdminButton>
          <AdminButton variant="primary" disabled>
            Disabled
          </AdminButton>
          <AdminButton variant="outline" size="icon" aria-label="Example icon button">
            <ShieldAlert className="size-4" />
          </AdminButton>
        </div>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Forms">
        <AdminCard className="max-w-lg space-y-4">
          <div>
            <AdminFieldLabel htmlFor="ds-name">Business name</AdminFieldLabel>
            <AdminInput id="ds-name" placeholder="Bella Beauty" />
          </div>
          <div>
            <AdminFieldLabel htmlFor="ds-search">Search</AdminFieldLabel>
            <AdminSearchInput id="ds-search" placeholder="Search businesses…" defaultValue="" />
          </div>
          <div>
            <AdminFieldLabel htmlFor="ds-error">With an error</AdminFieldLabel>
            <AdminInput
              id="ds-error"
              error
              defaultValue="not-a-valid-slug!!"
              aria-describedby="ds-error-msg"
            />
            <p
              id="ds-error-msg"
              role="alert"
              className="mt-1.5 text-sm font-medium text-destructive"
            >
              This slug is already taken.
            </p>
          </div>
          <div>
            <AdminFieldLabel htmlFor="ds-note" optional>
              Note
            </AdminFieldLabel>
            <AdminTextarea id="ds-note" placeholder="Internal note…" />
          </div>
        </AdminCard>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminCard>
            <AdminCardHeader>
              <div>
                <AdminCardTitle>Solid card</AdminCardTitle>
                <AdminCardDescription>Default surface for ordinary content.</AdminCardDescription>
              </div>
            </AdminCardHeader>
            <p className="text-body-sm text-muted-foreground">
              White elevated surface over the cream canvas.
            </p>
          </AdminCard>
          <AdminGlassCard>
            <AdminCardHeader>
              <div>
                <AdminCardTitle>Glass card</AdminCardTitle>
                <AdminCardDescription>Floating/contextual surfaces only.</AdminCardDescription>
              </div>
            </AdminCardHeader>
            <p className="text-body-sm text-muted-foreground">
              Not used for ordinary page content.
            </p>
          </AdminGlassCard>
        </div>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Entity header">
        <AdminEntityHeader
          name="Bella Beauty"
          meta="Beauty Salon · Algeria"
          status={
            <>
              <AdminStatusBadge status="success">Active</AdminStatusBadge>
              <AdminBadge variant="primary">Premium</AdminBadge>
            </>
          }
          actions={
            <>
              <AdminButton variant="outline" size="sm">
                Edit
              </AdminButton>
              <AdminButton variant="outline" size="sm">
                View public
              </AdminButton>
            </>
          }
        />
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Tabs">
        <AdminTabs defaultValue="overview">
          <AdminTabsList>
            <AdminTabsTrigger value="overview">Overview</AdminTabsTrigger>
            <AdminTabsTrigger value="staff">Staff</AdminTabsTrigger>
            <AdminTabsTrigger value="disabled" disabled>
              Disabled
            </AdminTabsTrigger>
          </AdminTabsList>
          <AdminTabsContent value="overview">
            <p className="text-body-sm text-muted-foreground">Overview content.</p>
          </AdminTabsContent>
          <AdminTabsContent value="staff">
            <p className="text-body-sm text-muted-foreground">Staff content.</p>
          </AdminTabsContent>
        </AdminTabs>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Filters">
        <AdminFilterBar onClear={activeFilter !== "all" ? () => setActiveFilter("all") : undefined}>
          {(["all", "pending", "active", "suspended"] as const).map((f) => (
            <AdminFilterChip key={f} active={activeFilter === f} onClick={() => setActiveFilter(f)}>
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
            </AdminFilterChip>
          ))}
        </AdminFilterBar>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Table">
        <AdminTableScroll>
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Business</AdminTableHead>
                <AdminTableHead>Status</AdminTableHead>
                <AdminTableHead>City</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {[
                ["Bella Beauty", "Active", "Algiers"],
                ["Nails & Co", "Pending review", "Oran"],
              ].map((row) => (
                <AdminTableRow key={row[0]}>
                  <AdminTableCell className="font-semibold">{row[0]}</AdminTableCell>
                  <AdminTableCell>{row[1]}</AdminTableCell>
                  <AdminTableCell>{row[2]}</AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        </AdminTableScroll>
        <AdminPagination
          hasPrevious={false}
          hasNext
          label="Page 1"
          onPrevious={() => {}}
          onNext={() => {}}
        />
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Dialog &amp; drawer">
        <div className="flex flex-wrap gap-3">
          <AdminDialog>
            <AdminDialogTrigger asChild>
              <AdminButton variant="outline">Open dialog</AdminButton>
            </AdminDialogTrigger>
            <AdminDialogContent>
              <AdminDialogHeader>
                <AdminDialogTitle>Suspend this business?</AdminDialogTitle>
                <AdminDialogDescription>
                  It will be hidden from the marketplace until restored.
                </AdminDialogDescription>
              </AdminDialogHeader>
              <AdminDialogFooter>
                <AdminButton variant="outline">Cancel</AdminButton>
                <AdminButton variant="destructive">Suspend</AdminButton>
              </AdminDialogFooter>
            </AdminDialogContent>
          </AdminDialog>

          <AdminDrawer>
            <AdminDrawerTrigger asChild>
              <AdminButton variant="outline">Open drawer</AdminButton>
            </AdminDrawerTrigger>
            <AdminDrawerContent>
              <AdminDrawerHeader>
                <AdminDrawerTitle>Bella Beauty</AdminDrawerTitle>
                <AdminDrawerDescription>Entity detail drawer.</AdminDrawerDescription>
              </AdminDrawerHeader>
              <AdminDrawerBody>
                <p className="text-body-sm text-muted-foreground">
                  Bottom sheet on mobile, side drawer on tablet/desktop — one component.
                </p>
              </AdminDrawerBody>
              <AdminDrawerFooter>
                <AdminButton variant="primary">Save</AdminButton>
              </AdminDrawerFooter>
            </AdminDrawerContent>
          </AdminDrawer>
        </div>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Skeletons">
        <div className="space-y-6">
          <SkeletonCard />
          <div className="space-y-2 rounded-3xl border border-border/60 p-3">
            <SkeletonRow columns={3} />
            <SkeletonRow columns={3} />
          </div>
          <DashboardSkeleton />
          <TableSkeleton rows={2} />
          <ListSkeleton count={2} />
          <DetailSkeleton />
        </div>
      </AdminSection>

      <AdminDivider />

      <AdminSection title="Result states">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminEmptyState
            title="No businesses found"
            description="Try changing your filters or search."
            action={
              <AdminButton variant="outline" size="sm">
                Clear filters
              </AdminButton>
            }
          />
          <AdminErrorState
            title="Something went wrong"
            description="We couldn't load these businesses."
            onRetry={() => {}}
          />
          <AdminPermissionDenied />
          <AdminNotFound entity="Business" />
        </div>
      </AdminSection>
    </div>
  );
}
