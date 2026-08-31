import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Calendar, Home, Search, User } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { landingForRoles } from "@/lib/post-login";

const baseItems = [
  { to: "/", icon: Home },
  { to: "/search", icon: Search },
  { to: "/bookings", icon: Calendar },
  { to: "/favorites", icon: Bookmark },
  { to: "/profile", icon: User },
] as const;

export function BottomNav({ tabs }: { tabs: string[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles } = useAuth();
  const home = landingForRoles(roles);
  // Business accounts jump to their dashboard instead of the customer bookings list.
  const items = baseItems.map((item) => (item.to === "/bookings" ? { ...item, to: home } : item));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-(--z-nav) px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="glass glass-highlight mx-auto flex max-w-md items-center justify-between gap-1 rounded-3xl p-1.5">
        {tabs.map((tab, i) => {
          const item = items[i] ?? items[0];
          const Icon = item.icon;
          const active =
            i === 0 ? pathname === "/" : pathname.startsWith(item.to) && item.to !== "/";
          return (
            <li key={tab} className="min-w-0 flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition-[background-color,color,box-shadow] ${
                  active
                    ? "bg-(image:--gradient-primary) text-primary-foreground shadow-(--shadow-glow-primary)"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="size-[1.15rem]" strokeWidth={2} />
                <span className="truncate">{tab}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
