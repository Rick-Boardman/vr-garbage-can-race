// Headless pass: the can must roll downhill, A must drift left, and the three
// cameras must render. Requires the `playwright` package.
//   npx playwright install chromium
//   npm run look

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "dist", "shots");
fs.mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});

const port = await new Promise((resolve, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(new Error("server did not print a port")), 8000);
  server.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const match = buffer.match(/127\.0\.0\.1:(\d+)/);
    if (match) {
      clearTimeout(timer);
      resolve(Number(match[1]));
    }
  });
  server.on("exit", (code) => reject(new Error(`server exited ${code}`)));
});

let browser;
try {
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on("pageerror", (error) => logs.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") logs.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?seed=7&view=close`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__garbageCanRace?.ready === true, null, { timeout: 15000 });
  const before = await page.evaluate(() => globalThis.__garbageCanRace.getState());
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => globalThis.__garbageCanRace.getState());
  if (!(after.s > before.s + 5)) throw new Error(`expected downhill travel, s ${before.s} -> ${after.s}`);
  if (!(after.y < before.y - 0.2)) throw new Error(`expected a drop, y ${before.y} -> ${after.y}`);
  if (!(after.z < before.z)) throw new Error(`expected -z travel, z ${before.z} -> ${after.z}`);
  await page.screenshot({ path: path.join(shots, "close.png") });
  await page.evaluate(() => globalThis.__garbageCanRace.cycleView());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, "far.png") });
  await page.evaluate(() => {
    globalThis.__garbageCanRace.cycleView();
  });
  await page.waitForTimeout(200);
  const view = await page.evaluate(() => globalThis.__garbageCanRace.getState().viewId);
  if (view !== "first") throw new Error(`expected first view, got ${view}`);
  await page.screenshot({ path: path.join(shots, "first.png") });
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));
  });
  await page.waitForTimeout(700);
  const steered = await page.evaluate(() => globalThis.__garbageCanRace.getState().offset);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true }));
  });
  if (!(steered < -0.4)) throw new Error(`A should drift left, offset ${steered}`);
  const problems = logs.filter((line) => !/favicon/i.test(line));
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(`look ok s=${after.s.toFixed(1)} offset=${steered.toFixed(2)} shots=${shots}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
