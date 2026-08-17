import path, { sep } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

import { generateKeysFile } from "./src/lib/i18n/generate-keys";

// Load non-VITE_ env vars into process.env for server-side routes only.
// These are NOT injected into the client bundle.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig(({ command }) => ({
  css: { transformer: "lightningcss" },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "entities/lib/decode.js": path.resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
      "entities/lib/encode.js": path.resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
      entities: path.resolve(process.cwd(), "node_modules/entities"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  server: { host: "::", port: 8080 },
  plugins: [
    {
      name: "i18n-keys-generator",
      buildStart() {
        generateKeysFile();
      },
      configureServer(server) {
        generateKeysFile();
        server.watcher.add("locales/en/**/*.json");
        server.watcher.on("change", (file) => {
          if (file.includes(`${sep}locales${sep}en${sep}`)) {
            generateKeysFile();
          }
        });
      },
    },
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Enforces that anything under **/server/** (or importing the `server-only`
    // package) can never end up in the client bundle — a real secret-boundary
    // safeguard, not a Lovable-specific feature; kept from the previous wrapper.
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Vercel's own Nitro preset (Build Output API v3) — the wrapper this
    // replaced silently defaulted to `cloudflare-module` outside Lovable's
    // sandbox, which is the wrong target for this project's actual host and
    // was producing an unused `wrangler.json`/`.wrangler/` on every build.
    // Build-only: TanStack Start's own dev server serves requests directly in
    // `vite dev`, and adding this plugin there breaks it ("Vite environment
    // 'nitro' is unavailable", confirmed by testing) — matching how the
    // wrapper this replaced also gated its own Nitro plugin to `command ===
    // "build"`.
    ...(command === "build" ? [nitro({ preset: "vercel" })] : []),
    viteReact(),
  ],
}));
