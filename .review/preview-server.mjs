// Review preview server — serves both built single-file apps for side-by-side inspection.
// Bind 0.0.0.0 so the Arena live preview can proxy it. Serves ONLY files under the two dist dirs.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const ROOT = "/home/user/groundtruth";
const APPS = {
  "/argon/": `${ROOT}/implement-source-monitoring-protocolargon/dist/index.html`,
  "/claude/": `${ROOT}/implement-source-monitoring-prototype-claude/dist/index.html`,
};

const LANDING = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ground Truth + BlindSpot — review preview</title>
<style>
 body{font:15px/1.55 ui-sans-serif,system-ui,sans-serif;background:#0b1020;color:#e6edf7;margin:0;padding:40px 20px}
 .wrap{max-width:860px;margin:0 auto}
 h1{font-size:22px;margin:0 0 6px} p.sub{color:#8b98b0;margin:0 0 28px}
 a.card{display:block;text-decoration:none;color:inherit;background:#141c33;border:1px solid #26324f;border-radius:12px;padding:18px 20px;margin-bottom:14px}
 a.card:hover{border-color:#4d6bb0}
 a.card b{font-size:16px} a.card span{display:block;color:#8b98b0;font-size:13px;margin-top:4px}
 code{background:#0e1428;padding:1px 5px;border-radius:4px;font-size:12.5px}
 .note{color:#8b98b0;font-size:13px;margin-top:26px;border-top:1px solid #26324f;padding-top:16px}
</style></head><body><div class="wrap">
<h1>Ground Truth + BlindSpot — end-to-end review preview</h1>
<p class="sub">Both implementations, built from source in this sandbox and served statically. All data is synthetic.</p>
<a class="card" href="argon/"><b>Protocol Argon implementation (superseded)</b><span>Kept for comparison. Retains the Idea Studio shell, so its bundle still carries the claim vocabulary spec §1 forbids.</span></a>
<a class="card" href="claude/"><b>Canonical (merged) implementation</b><span>Purpose-built source-monitoring app + the ported optional test-feed adapter panel at the bottom. CSP-hardened single file.</span></a>
<p class="note">Suggested 2-minute check in each: step the clock to <code>T=5</code> (B goes STALE at the exact threshold), <code>T=6</code> (backfill must <i>not</i> restore B's heartbeat), <code>T=7</code> (B recovers), then open the dependency and disagreement panels. Then scroll to the bottom for the new <b>Optional test feed adapter</b>: opt in, simulate a valid heartbeat, simulate a poll failure, and advance the local clock. Press <code>Tab</code> to check keyboard focus.</p>
</div></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let p = url.pathname;
  if (p === "/" || p === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(LANDING);
  }
  if (!p.endsWith("/")) p += "/";
  const file = APPS[p];
  if (!file) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(buf);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("build missing — run npm run build");
  }
}).listen(4173, "0.0.0.0", () => console.log("review preview on 0.0.0.0:4173"));
