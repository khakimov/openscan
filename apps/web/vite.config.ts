import path from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
    cloudflare(),
  ],
  server: {
    watch: {
      ignored: ["**/.wrangler/state/**"],
    },
  },
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "./src"),
      "@/worker": path.resolve(__dirname, "./worker"),
    },
  },
});
