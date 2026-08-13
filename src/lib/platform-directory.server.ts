import { assertSuperAdmin, adminClient } from "@/lib/platform.server";

export type DirectoryEntity = "shops" | "staff" | "services" | "appointments";

export type DirectoryRow = {
  id: string;
  title: string;
  subtitle: string;
  badges: string[];
  right: string;
};

export type DirectoryResult = {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
};

type Params = {
  entity: DirectoryEntity;
  q: string;
  status: string;
  page: number;
  pageSize: number;
};

/**
 * Paginated, searchable listing of every record on the marketplace.
 * Kept server-side so the console stays fast with hundreds of shops.
 */
export async function fetchDirectory(
  supabase: Parameters<typeof assertSuperAdmin>[0],
  userId: string,
  params: Params,
): Promise<DirectoryResult> {
  await assertSuperAdmin(supabase, userId);
  const db = await adminClient();

  const { entity, q, status, page, pageSize } = params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const like = `%${q}%`;

  if (entity === "shops") {
    let query = db
      .from("salons")
      .select("id, name, city, country, status, is_listed, plan, rating, review_count", {
        count: "exact",
      });
    if (q) query = query.ilike("name", like);
    if (status) query = query.eq("status", status as "approved");
    const { data, count, error } = await query.order("name").range(from, to);
    if (error) throw new Error(error.message);
    return {
      total: count ?? 0,
      page,
      pageSize,
      rows: (data ?? []).map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: [s.city, s.country].filter(Boolean).join(", "),
        badges: [s.status, s.is_listed ? "listed" : "hidden", s.plan].filter(Boolean) as string[],
        right: `${Number(s.rating ?? 0).toFixed(1)} ★ (${s.review_count ?? 0})`,
      })),
    };
  }

  if (entity === "staff") {
    let query = db
      .from("staff")
      .select("id, full_name, title, is_active, salon_id, salons(name)", { count: "exact" });
    if (q) query = query.ilike("full_name", like);
    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);
    const { data, count, error } = await query.order("full_name").range(from, to);
    if (error) throw new Error(error.message);
    return {
      total: count ?? 0,
      page,
      pageSize,
      rows: (data ?? []).map((s) => ({
        id: s.id,
        title: s.full_name,
        subtitle: (s.salons as { name?: string } | null)?.name ?? "—",
        badges: [s.title, s.is_active ? "active" : "inactive"].filter(Boolean) as string[],
        right: "",
      })),
    };
  }

  if (entity === "services") {
    let query = db
      .from("services")
      .select("id, name, category, price, duration_minutes, is_active, salons(name)", {
        count: "exact",
      });
    if (q) query = query.ilike("name", like);
    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);
    const { data, count, error } = await query.order("name").range(from, to);
    if (error) throw new Error(error.message);
    return {
      total: count ?? 0,
      page,
      pageSize,
      rows: (data ?? []).map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: (s.salons as { name?: string } | null)?.name ?? "—",
        badges: [s.category, `${s.duration_minutes} min`, s.is_active ? "active" : "inactive"],
        right: `${Number(s.price ?? 0).toFixed(0)}`,
      })),
    };
  }

  let query = db
    .from("bookings")
    .select("id, starts_at, status, total_price, salons(name), services(name), staff(full_name)", {
      count: "exact",
    });
  if (status) query = query.eq("status", status as "pending");
  const { data, count, error } = await query
    .order("starts_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((b) => ({
    id: b.id,
    title: (b.services as { name?: string } | null)?.name ?? "Service",
    subtitle: `${(b.salons as { name?: string } | null)?.name ?? "—"} · ${
      (b.staff as { full_name?: string } | null)?.full_name ?? "—"
    }`,
    badges: [b.status, new Date(b.starts_at).toLocaleString()],
    right: `${Number(b.total_price ?? 0).toFixed(0)}`,
  }));
  const filtered = q
    ? rows.filter((r) => `${r.title} ${r.subtitle}`.toLowerCase().includes(q.toLowerCase()))
    : rows;
  return { rows: filtered, total: count ?? 0, page, pageSize };
}
