export const NAMESPACES = {
  common: { status: "active" },
  auth: { status: "active" },
  validation: { status: "active" },
  errors: { status: "active" },
  marketplace: { status: "active" },
  booking: { status: "active" },
  business: { status: "active" },
  customer: { status: "active" },
  services: { status: "active" },
  staff: { status: "active" },
  reviews: { status: "active" },
  settings: { status: "active" },
  notifications: { status: "active" },
  reports: { status: "active" },
  payments: { status: "active" },
  platform: { status: "active" },

  emails: { status: "active" },
  metadata: { status: "reserved", plannedFor: "International SEO" },
} as const satisfies Record<string, { status: "active" | "reserved"; plannedFor?: string }>;

export type NamespaceName = keyof typeof NAMESPACES;

export type ActiveNamespace = {
  [K in NamespaceName]: (typeof NAMESPACES)[K]["status"] extends "active" ? K : never;
}[NamespaceName];

export const ACTIVE_NAMESPACES = (Object.keys(NAMESPACES) as NamespaceName[]).filter(
  (n) => NAMESPACES[n].status === "active",
) as ActiveNamespace[];
