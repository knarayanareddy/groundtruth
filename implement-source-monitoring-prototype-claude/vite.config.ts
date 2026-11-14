import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Restrictive CSP, injected at build time so it is present no matter how the app is built
 * (`npm run build`, `npx vite build`, CI). scripts/harden-dist.mjs still runs afterwards and now
 * only verifies that the tag survived — it no longer has to be the thing that adds it.
 */
export const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      if (html.includes("Content-Security-Policy")) return html;
      const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
      return html.includes("<head>") ? html.replace("<head>", `<head>\n    ${tag}`) : `${tag}\n${html}`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), cspMeta()],
  build: {
    // The single-file build emits no <link rel="modulepreload">, so Vite's preload polyfill is dead
    // weight that only adds an unused fetch() to the bundle. Drop it.
    modulePreload: { polyfill: false },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
