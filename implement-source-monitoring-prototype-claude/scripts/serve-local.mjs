// Loopback-only static server for the built single-file app.
//   npm run build && npm run serve        ->  http://127.0.0.1:4173/
// Binds 127.0.0.1 ONLY (never 0.0.0.0), serves only dist/, GET/HEAD only, sends a restrictive CSP.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const arg = process.argv.indexOf("--port");
const port = arg > -1 ? Number(process.argv[arg + 1]) : 4173;
const HOST = "127.0.0.1";
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let p = normalize(decodeURIComponent((req.url || "/").split("?")[0]));
  if (p === "/" || p === "\\") p = "/index.html";
  const file = join(root, p);
  if (!file.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404).end("not found (did you run npm run build?)");
  }
});

server.listen(port, HOST, () => {
  console.log(`Serving dist/ at http://${HOST}:${port}/  (loopback only; Ctrl+C to stop)`);
});
