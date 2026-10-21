import type { Bindings } from "./bindings";
// Node-only local development uses the same local D1 database as Wrangler.
let proxy: Promise<{ env: Bindings }> | undefined;
export async function getBindings(): Promise<Bindings> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Use the vinext Worker runtime for D1.");
  proxy ??= import(/* webpackIgnore: true */ "wrangler").then((w) =>
    w.getPlatformProxy<Bindings>({ configPath: "wrangler.jsonc" }),
  );
  return (await proxy).env;
}
