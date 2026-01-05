import path from "node:path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Ensure wrangler writes debug logs somewhere writable inside the repo
process.env.WRANGLER_LOG_PATH ??= path.join(process.cwd(), ".wrangler", "logs");

const plugins = [
  tsConfigPaths(),
  tailwindcss(),
  tanstackStart(),
  viteReact(),
];

plugins.unshift(cloudflare({ viteEnvironment: { name: 'ssr' } }));

const config = defineConfig({
  plugins,
});

export default config;
