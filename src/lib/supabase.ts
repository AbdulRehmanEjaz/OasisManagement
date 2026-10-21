import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
export async function database() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, {
                ...options,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
              }),
            );
          } catch {
            /* Read-only server component; route handlers refresh cookies. */
          }
        },
      },
    },
  );
}
export function privileged() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function requireUser(admin = false) {
  if (!configured()) throw new Error("CONFIGURATION_REQUIRED");
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error || !profile?.is_active || (admin && profile.role !== "admin"))
    throw new Error("FORBIDDEN");
  return { db, user, profile };
}
export async function rateLimit(
  db: Awaited<ReturnType<typeof database>>,
  action: string,
  max: number,
) {
  const { data, error } = await db.rpc("take_rate_limit", {
    p_action: action,
    p_max: max,
  });
  if (error) throw error;
  if (!data) throw new Error("Too many requests. Please wait a minute.");
}
