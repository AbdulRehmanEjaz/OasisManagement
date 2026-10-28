export const roles = ["admin", "viewer", "supervisor"] as const;
export type Role = (typeof roles)[number];
export function canReadReports(role: string) {
  return role === "admin" || role === "viewer";
}
export function canSubmit(role: string) {
  return role === "admin" || role === "supervisor";
}
export function canManageUsers(role: string) {
  return role === "admin";
}
export function canReadType(role: string, type: string) {
  return (
    role === "admin" ||
    (role === "viewer" &&
      ["overview", "waste", "facilities", "inspections", "palms", "options"].includes(
        type,
      )) ||
    (role === "supervisor" && ["facilities", "options", "waste", "inspections"].includes(type))
  );
}
export function allowedViews(role: string) {
  return role === "admin"
    ? [
        "dashboard",
        "waste",
        "facilities",
        "inspections",
        "reports-management",
        "palms",
        "submission-control",
        "notifications",
        "users",
        "settings",
      ]
    : role === "viewer"
      ? ["dashboard", "waste", "facilities", "inspections", "palms"]
      : ["dashboard", "waste", "facilities", "inspections"];
}
