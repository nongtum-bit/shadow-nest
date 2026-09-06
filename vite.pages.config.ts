import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(dir, "pages"),
  base: "/shadow-nest/",
  publicDir: resolve(dir, "public"),
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    alias: { "@": resolve(dir, "src") },
  },
  build: {
    outDir: resolve(dir, "docs"),
    emptyOutDir: true,
  },
});
