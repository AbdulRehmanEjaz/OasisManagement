import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* Environment can be injected by the host. */
}
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    email = process.env.BOOTSTRAP_ADMIN_EMAIL,
    password = process.env.BOOTSTRAP_ADMIN_PASSWORD,
    full_name = process.env.BOOTSTRAP_ADMIN_NAME;
  if (!url || !key || !email || !password || !full_name || password.length < 12)
    throw new Error(
      "Set Supabase server variables and BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD (12+ characters) in the process environment.",
    );
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { count, error: countError } = await db
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  if (countError) throw countError;
  if (count)
    throw new Error(
      "An administrator already exists. Use the Supabase dashboard for an intentional recovery.",
    );
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const { error: profileError } = await db
    .from("profiles")
    .insert({
      id: data.user.id,
      email,
      full_name,
      role: "admin",
      is_active: true,
    });
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id);
    throw profileError;
  }
  console.log(
    "Initial administrator provisioned. Sign in and clear the bootstrap environment variables.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
