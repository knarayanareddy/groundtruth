import { expect, test as base, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const DIST = join(ROOT, "dist", "index.html");
export const APP_URL = pathToFileURL(DIST).href;
export const ART = join(ROOT, "test-results", "artifacts");
mkdirSync(ART, { recursive: true });

export interface Net {
  requests: string[];
  external: string[];
  consoleErrors: string[];
  pageErrors: string[];
}

/** Every test records all requests and blocks http(s)/ws(s); the test fails if any external request, console error or page error occurs. */
export const test = base.extend<{ net: Net }>({
  net: [
    async ({ page }, use) => {
      const net: Net = { requests: [], external: [], consoleErrors: [], pageErrors: [] };
      page.on("request", (r) => {
        net.requests.push(r.url());
        if (!/^(file|blob|data|about):/.test(r.url())) net.external.push(r.url());
      });
      page.on("websocket", (w) => net.external.push(w.url()));
      page.on("console", (m) => {
        if (m.type() === "error") net.consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => net.pageErrors.push(String(e)));
      await page.route(/^(https?|wss?|ftp):/, (route) => {
        net.external.push(route.request().url());
        return route.abort();
      });
      await use(net);
      expect(net.external, "external requests during normal use").toEqual([]);
      expect(net.pageErrors, "uncaught page errors").toEqual([]);
      expect(net.consoleErrors, "console errors (includes CSP violations)").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const open = async (page: Page) => {
  await page.goto(APP_URL);
  await expect(page.getByTestId("empty-state")).toBeVisible();
};
export const loadRef = async (page: Page) => {
  await page.getByTestId("btn-load-ref").click();
  await expect(page.getByTestId("clock-T")).toContainText("T = 0 s");
};
export const setT = async (page: Page, T: number) => {
  await page.getByTestId("t-input").fill(String(T));
  await expect(page.getByTestId("clock-T")).toContainText(`T = ${T} s`);
};
export const stepTo = async (page: Page, T: number) => {
  await page.getByTestId("btn-restart").click();
  for (let i = 0; i < T; i++) await page.getByTestId("btn-step").click();
  await expect(page.getByTestId("clock-T")).toContainText(`T = ${T} s`);
};
export const st = (page: Page, id: string) => page.getByTestId(`state-${id}`);
export const importFile = (page: Page, path: string) => page.getByTestId("file-input").setInputFiles(path);
export const readText = (p: string) => readFileSync(p, "utf8");
