// Runs automatically after `npm run build` (npm "postbuild" hook).
// Inserts a restrictive Content-Security-Policy <meta> into dist/index.html so that the built app
// cannot load external scripts, styles, fonts or make network connections even if code tried to.
// (The dev server is unaffected; vite.config.ts is the supplied file, untouched.)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.html");
let html = readFileSync(file, "utf8");
const csp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
if (!html.includes("Content-Security-Policy")) {
  html = html.replace(/<meta charset="UTF-8"\s*\/?>/i, (m) => `${m}\n    ${tag}`);
  if (!html.includes("Content-Security-Policy")) throw new Error("could not insert CSP meta");
  writeFileSync(file, html);
}
console.log("dist/index.html: CSP meta present");
