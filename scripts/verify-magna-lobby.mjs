// Two real browser contexts, pinned Magna UI, game hill/HUD and deployed dev API.
// Only arrival delivery is delayed; server responses and realtime are never mocked.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const site = process.argv[process.argv.indexOf("--site") + 1] || "";
const base = "https://dev.magnacms.com";
const policy = JSON.parse(await readFile(new URL("../config/play-game.json", import.meta.url), "utf8"));
if (!process.env.GCR_PROOF_API_TOKEN) throw new Error("Use Verify-MagnaLobby.ps1 to supply the temporary dev token.");
const response = await fetch(`${base}/api/play/admin/games`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-magna-site": site, "x-magna-api-token": process.env.GCR_PROOF_API_TOKEN },
  body: JSON.stringify(policy),
});
if (!response.ok) throw new Error(`Dev game policy refused (${response.status}).`);
console.log("PASS dev game uses config/play-game.json (retained for dev play)");
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "0", PLAY_API_URL: base }, stdio: ["ignore", "pipe", "pipe"],
});
let browser, releaseArrival, arrivalGate;
const contexts = [], errors = [], evidence = [];
const pass = message => { evidence.push(message); console.log(`PASS ${message}`); };
// A browser error rejects every guarded wait at once, so a bootstrap failure (for example no WebGL
// context) is reported when it happens instead of after a Connected or gate timeout.
let failBrowser;
const browserFailure = new Promise((_, reject) => { failBrowser = reject; });
browserFailure.catch(() => {});
const guard = promise => Promise.race([promise, browserFailure]);
const waitGate = (page, gate) => guard(page.waitForFunction(value => window.__garbageCanRace?.getState().gate === value, gate));
const state = page => page.evaluate(() => window.__garbageCanRace.getState());
const dir = ".scratchpad/magna-lobby-proof";
await mkdir(dir, { recursive: true });
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Game server did not start.")), 10000);
    server.stdout.on("data", value => {
      const match = String(value).match(/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    server.once("exit", () => reject(new Error("Game server exited.")));
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const stamp = Date.now().toString(36);
  const names = [`Host ${stamp}`, `Guest ${stamp}`];
  const pages = [];
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-magna-site": site } });
    contexts.push(context);
    const page = await context.newPage(); pages.push(page);
    page.on("pageerror", error => {
      errors.push(error.message);
      failBrowser(new Error(`[gcr-lobby-proof] ${names[index]} browser error: ${error.message}`));
    });
    // Read-only HUD instrumentation; the released game behavior is unchanged.
    await page.route("**/src/main.js", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nwindow.__gcrProof = { hudSystem, renderer };` });
    });
    if (index === 1) {
      arrivalGate = new Promise(resolve => { releaseArrival = resolve; });
      await page.route("**/api/play/rooms/*/arrive", async route => { await arrivalGate; await route.continue(); });
    }
    await page.goto(`http://127.0.0.1:${port}/?seed=42`, { waitUntil: "domcontentloaded" });
    await guard(page.getByText("Connected", { exact: true }).waitFor());
    await page.getByLabel("Name", { exact: true }).fill(names[index]);
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await page.getByRole("button", { name: "Open table", exact: true }).waitFor({ state: "visible" });
  }
  const [host, guest] = pages;
  await host.getByLabel("Seats", { exact: true }).selectOption("3");
  await host.getByRole("button", { name: "Open table", exact: true }).click();
  const invite = host.locator("li").filter({ hasText: names[1] }).getByRole("button", { name: "Invite", exact: true });
  await invite.click();
  await guest.getByRole("button", { name: "Accept invitation", exact: true }).click();
  for (const page of pages) {
    await page.getByLabel("Your table", { exact: true }).getByText(names[1], { exact: false }).waitFor();
    assert.equal((await state(page)).gate, "lobby");
  }
  pass("Invite and acceptance seat both players in Magna's lobby");
  const firstArrival = host.waitForResponse(response => response.url().endsWith("/arrive") && response.request().method() === "POST");
  await host.getByRole("button", { name: "Start table", exact: true }).click();
  for (const page of pages) await waitGate(page, "waiting");
  // Wait for the host arrival to reach the actual server, not merely for the hill frame.
  const arrived = await firstArrival;
  assert.ok(arrived.ok());
  assert.ok((await arrived.json()).room.slots.some(row => row.role === "host" && row.arrived));
  const before = await Promise.all(pages.map(state));
  assert.ok(before.every(row => row.startsAt === null && row.s === 36 && row.speed === 0));
  assert.equal(before[0].room, before[1].room);
  assert.deepEqual(before[0].riders, names);
  for (const page of pages) assert.equal(await page.locator("#play-entry").isVisible(), false);
  await host.screenshot({ path: `${dir}/hill-waiting.png` });
  pass("Both browsers reach the hill; a delayed arrival holds both at the start line without a countdown");
  releaseArrival();
  for (const page of pages) await waitGate(page, "countdown");
  const counting = await Promise.all(pages.map(state));
  assert.ok(counting[0].startsAt);
  assert.equal(counting[0].startsAt, counting[1].startsAt);
  pass("The final arrival starts one shared server countdown");
  const line = `HUD chat ${stamp}`;
  const point = await host.evaluate(() => {
    const hud = window.__gcrProof.hudSystem.hud, win = hud.ui.windows["race-chat"];
    const rect = document.querySelector("#c").getBoundingClientRect();
    return { x: rect.left + (win.x + 50) / hud.layoutW * rect.width, y: rect.top + (win.y + win.h - 25) / hud.layoutH * rect.height };
  });
  await host.mouse.click(point.x, point.y);
  await host.keyboard.type(line);
  await host.keyboard.press("Enter");
  for (const page of pages) {
    await page.waitForFunction(text => JSON.stringify(window.__gcrProof.hudSystem.hud.ui.data["race-chatLines"]).includes(text), line);
  }
  await guest.screenshot({ path: `${dir}/hill-chat-countdown.png` });
  pass("The Halo RIDERS panel sends and renders table chat in both browsers");
  for (const page of pages) await waitGate(page, "racing");
  pass("Both browsers release the start line after the shared countdown");
  // No physical headset is connected. Hardware and successful immersive entry are explicitly unverified.
  for (const page of pages) {
    const failures = await page.evaluate(() => window.__garbageCanRace.errors);
    assert.deepEqual(failures, []);
  }
  assert.deepEqual(errors, []);
  pass("No browser application errors");
  await writeFile(`${dir}/result.json`, JSON.stringify({ base, site, policy, evidence, states: counting, quest: "Not run on physical Quest" }, null, 2));
} finally {
  releaseArrival?.();
  // Close only this proof's table through its participant capability.
  for (const context of contexts) {
    for (const page of context.pages()) {
      await page.evaluate(async () => {
        const code = window.__garbageCanRace?.getState().room;
        if (code) await fetch(`/api/play/rooms/${code}/leave`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", credentials: "include" });
      }).catch(() => {});
    }
  }
  await browser?.close();
  server.kill();
}
