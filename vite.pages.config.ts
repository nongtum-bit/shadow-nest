import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dir = dirname(fileURLToPath(import.meta.url));

function inlineCss(): Plugin {
  return {
    name: "inline-css",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        let css = "";
        for (const asset of Object.values(ctx.bundle)) {
          if (asset.type === "asset" && asset.fileName.endsWith(".css")) {
            css += String(asset.source);
          }
        }
        if (!css) return html;
        html = html.replace(/<link rel="stylesheet"[^>]*href="[^"]*assets\/[^"]+\.css"[^>]*>\s*/g, "");
        html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
        html = html.replace("</head>", `<style>\n${css}\n</style>\n  </head>`);
        return html;
      },
    },
  };
}

export default defineConfig({
  root: resolve(dir, "pages"),
  base: "/shadow-nest/",
  publicDir: resolve(dir, "public"),
  plugins: [tailwindcss(), viteReact(), inlineCss()],
  resolve: {
    alias: { "@": resolve(dir, "src") },
  },
  build: {
    outDir: resolve(dir, "docs"),
    emptyOutDir: true,
  },
});
