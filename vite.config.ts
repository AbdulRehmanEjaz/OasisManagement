import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@/lib/photo-processing": fileURLToPath(
        new URL("./src/worker/photo-processing.ts", import.meta.url),
      ),
      "@/lib/runtime": fileURLToPath(
        new URL("./src/worker/runtime.ts", import.meta.url),
      ),
    },
  },
});
