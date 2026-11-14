// Runs automatically after `npm run build` (npm "postbuild" hook).
//
// The CSP <meta> tag is injected at build time by the cspMeta() plugin in vite.config.ts, so it is
// present however the app is built. This script is now a VERIFIER: it fails the build if the tag or
// its security-critical directives went missing, rather than silently patching the file afterwards.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.html");
const html = readFileSync(file, "utf8");

const required = [
  ["Content-Security-Policy meta tag", /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i],
  ["default-src 'none'", /default-src\s+'none'/],
  ["connect-src 'none'", /connect-src\s+'none'/],
  ["font-src 'none'", /font-src\s+'none'/],
  ["object-src 'none'", /object-src\s+'none'/],
  ["base-uri 'none'", /base-uri\s+'none'/],
  ["form-action 'none'", /form-action\s+'none'/],
];

const missing = required.filter(([, re]) => !re.test(html)).map(([name]) => name);
if (missing.length > 0) {
  console.error(`dist/index.html is missing required CSP directives:\n  - ${missing.join("\n  - ")}`);
  process.exit(1);
}
console.log("dist/index.html: CSP meta present and restrictive (verified, not patched)");
