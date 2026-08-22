import { Link, useRouterState } from "@tanstack/react-router";
import { Calendar, Heart, Home, Search, User } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { landingForRoles } from "@/lib/post-login";

const baseItems = [
  { to: "/", icon: Home },
  { to: "/search", icon: Search },
  { to: "/bookings", icon: Calendar },
  { to: "/favorites", icon: Heart },
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
      <ul className="glass glass-highlight mx-auto flex max-w-md items-center justify-between rounded-3xl px-2 py-2">
        {tabs.map((tab, i) => {
          const item = items[i] ?? items[0];
          const Icon = item.icon;
          const active =
            i === 0 ? pathname === "/" : pathname.startsWith(item.to) && item.to !== "/";
          return (
            <li key={tab} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 w-full flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-5" />
                {tab}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
