import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = 4199;

test("scripts/serve-local.mjs binds 127.0.0.1 only and serves the built app with a restrictive CSP", async () => {
  const child = spawn(process.execPath, [join(ROOT, "scripts/serve-local.mjs"), "--port", String(PORT)], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("server did not start")), 10_000);
      child.stdout.on("data", (d) => {
        if (String(d).includes("Serving dist/")) {
          clearTimeout(t);
          resolve();
        }
      });
      child.on("error", reject);
    });
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(await res.text()).toContain("Ground Truth + BlindSpot");
    expect((await fetch(`http://127.0.0.1:${PORT}/../package.json`)).status).not.toBe(200);
    expect((await fetch(`http://127.0.0.1:${PORT}/`, { method: "POST" })).status).toBe(405);

    // Not reachable on a non-loopback address of this machine (skipped if the machine has none).
    const external = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
    test.info().annotations.push({ type: "non-loopback-addresses-found", description: external.join(",") || "none" });
    for (const addr of external) {
      const refused = await new Promise<boolean>((resolve) => {
        const s = createConnection({ host: addr, port: PORT, timeout: 3000 });
        s.on("connect", () => { s.destroy(); resolve(false); });
        s.on("error", () => resolve(true));
        s.on("timeout", () => { s.destroy(); resolve(true); });
      });
      expect(refused, `connection to ${addr}:${PORT} must be refused`).toBe(true);
    }
  } finally {
    child.kill();
  }
});
