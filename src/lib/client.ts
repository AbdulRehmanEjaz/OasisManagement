export type Row = { id: string; [key: string]: any };
export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "viewer" | "supervisor";
  is_active: boolean;
};
export async function api(action: string, body: Record<string, unknown> = {}) {
  const response = await fetch(
    action.startsWith("user.") ? "/api/access" : "/api/operations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export async function read(type: string, params: Record<string, string> = {}) {
  const r = await fetch(
    `${type === "users" ? "/api/access" : "/api/operations"}?${new URLSearchParams({ type, ...params })}`,
    { cache: "no-store" },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Could not load records.");
  return d;
}
export function formatDate(value: string, tz = "Asia/Riyadh", short = false) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: short ? undefined : "numeric",
    hour: short ? undefined : "2-digit",
    minute: short ? undefined : "2-digit",
  }).format(new Date(value));
}
