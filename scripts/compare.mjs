/** Old-vs-new visual/DOM comparison. Captures inventory JSON + screenshots. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const EVIDENCE = "/tmp/lsdash-evidence/compare";
mkdirSync(EVIDENCE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dbgPort = 9360;

async function launch(width, height, profile) {
  const port = ++dbgPort;
  const proc = spawn(
    "/snap/bin/chromium",
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      `--user-data-dir=${EVIDENCE}/${profile}`, `--window-size=${width},${height}`,
      `--remote-debugging-port=${port}`, "about:blank"],
    { stdio: "ignore", detached: true },
  );
  proc.unref();
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch {}
    await sleep(300);
  }
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("ws timeout")), 10000); });
  return { proc, ws, port };
}

function cdp(ws) {
  let id = 0;
  const pend = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const evx = (expr) => send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
    .then((r) => { const v = r.result?.result; if (v?.subtype === "error") throw new Error(v.description); return v?.value; });
  return { send, evx };
}

const INVENTORY_FN = `() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const t = (el) => el ? (el.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 120) : null;
  return {
    title: document.title,
    headerLinks: [...document.querySelectorAll("header a")].map((a) => ({ text: t(a), href: a.getAttribute("href"), rect: r(a) })),
    headerButtons: [...document.querySelectorAll("header button")].map((b) => ({ text: t(b), rect: r(b) })),
    h1: t(document.querySelector("h1")),
    badges: [...document.querySelectorAll('[data-testid="day-badges"] span, [data-testid="day-badges"] *')].map((s) => t(s)).filter(Boolean),
    cards: [...document.querySelectorAll("main h3, main h2")].map((h) => t(h)),
    bodyText: (document.body.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 400),
    footer: document.querySelector('[data-testid="sync-footer"]')?.textContent ?? null,
    gridCells: document.querySelectorAll('[data-date]').length,
  };
}`;

async function capture(base, tag, width, height) {
  const { proc, ws } = await launch(width, height, `prof-${tag}`);
  const { send, evx } = cdp(ws);
  const out = {};
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${EVIDENCE}/${tag}-${name}.png`, Buffer.from(s.result.data, "base64"));
  };
  const nav = async (url) => { await send("Page.enable"); await send("Page.navigate", { url }); await sleep(7000); };
  try {
    await nav(`${base}/?d=2026-09-08`);
    out.wall = await evx(INVENTORY_FN);
    await shot("wall");
    // sign in
    await evx(`[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Dev sign-in")).click()`);
    await sleep(9000);
    await nav(`${base}/?d=2026-09-08`);
    out.today = await evx(INVENTORY_FN);
    await shot("today");
    await nav(`${base}/?d=2026-09-10`);
    out.special = await evx(INVENTORY_FN);
    await nav(`${base}/?d=2026-09-07`);
    out.noschool = await evx(INVENTORY_FN);
    await nav(`${base}/month?m=2026-09`);
    await sleep(3000);
    out.month = await evx(INVENTORY_FN);
    await shot("month");
  } finally {
    ws.close();
    try { process.kill(-proc.pid, "SIGKILL"); } catch {}
  }
  writeFileSync(`${EVIDENCE}/${tag}-inventory.json`, JSON.stringify(out, null, 1));
  console.log("captured", tag);
}

const jobs = [];
for (const v of [{ name: "old", base: "http://127.0.0.1:3100" }, { name: "new", base: "http://127.0.0.1:3000" }]) {
  for (const vp of [{ s: "mob", w: 390, h: 844 }, { s: "desk", w: 1280, h: 900 }]) {
    jobs.push(() => capture(v.base, `${v.name}-${vp.s}`, vp.w, vp.h));
  }
}
for (const j of jobs) await j(); // sequential: kinder to the emulators
console.log("done");
process.exit(0);
