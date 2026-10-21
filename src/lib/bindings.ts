import type { D1Database } from "@cloudflare/workers-types";
export type Bindings = {
  DB?: D1Database;
  PIN_LOOKUP_SECRET?: string;
  ADMIN_SETUP_TOKEN?: string;
};
