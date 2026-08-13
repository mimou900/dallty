import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { installEphemeralSessionGuard } from "@/lib/session";

export type AppRole = "client" | "salon_owner" | "specialist" | "admin" | "super_admin";

type AuthState = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  /** True until the signed-in user's roles have been fetched. */
  rolesLoading: boolean;
  hasRole: (role: AppRole) => boolean;
  primaryRole: AppRole;
};

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  roles: [],
  loading: true,
  rolesLoading: true,
  hasRole: () => false,
  primaryRole: "client",
});

const PRIORITY: AppRole[] = ["super_admin", "admin", "salon_owner", "specialist", "client"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRoles([]);
        setRolesLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const uninstall = installEphemeralSessionGuard();
    return () => {
      sub.subscription.unsubscribe();
      uninstall();
    };
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setRolesLoading(false);
      return;
    }
    let cancelled = false;
    setRolesLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (cancelled) return;
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setRolesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthState>(() => {
    const primaryRole = PRIORITY.find((r) => roles.includes(r)) ?? "client";
    return {
      user: session?.user ?? null,
      session,
      roles,
      loading,
      rolesLoading,
      hasRole: (role: AppRole) => roles.includes(role),
      primaryRole,
    };
  }, [session, roles, loading, rolesLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function signOutEverywhere() {
  await supabase.auth.signOut();
}
