import { requireUser } from "./backend";
export { sessionCookie } from "./backend";
export async function requirePanel(admin = false) {
  return (await requireUser(admin)).profile;
}
