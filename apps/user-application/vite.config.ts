import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const config = defineConfig({
  plugins: [
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      start: { entry: "./start.tsx" },
      server: { entry: "./server.ts" },
    }),
    viteReact(),
    cloudflare({
      viteEnvironment: {
        name: "ssr",
      },
    }),
  ],
  ssr: {
    noExternal: [
      // Bundle all workspace packages for Cloudflare Workers
      '@repo/data-ops',
      '@repo/config',
      '@repo/logger',
      '@repo/temporal',
      '@repo/validation',
      '@repo/constants',
      '@repo/contracts',
      // Bundle external dependencies that need to be included
      'drizzle-orm',
      'better-auth',
    ],
  },
});

export default config;
