import { env } from "cloudflare:workers";
import type { Bindings } from "../lib/bindings";
export async function getBindings(): Promise<Bindings> {
  return env as unknown as Bindings;
}
