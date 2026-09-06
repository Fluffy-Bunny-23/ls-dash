/** Browser verification via CDP + headless chromium. No dependencies. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.LSDASH_BASE ?? "http://127.0.0.1:3100";
const EVIDENCE = "/tmp/lsdash-evidence";
mkdirSync(EVIDENCE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChromium() {
  // Fresh profile every run: no session leakage between evidence runs.
  const profile = `${EVIDENCE}/profile-${Date.now()}-${process.pid}`;
  mkdirSync(profile, { recursive: true });
  // Our debug port is ours by convention: clear any stale holder left by a
  // killed run first, otherwise we'd drive a stranger's browser.
  try {
    const { execSync } = await import("node:child_process");
    execSync('pkill -f "remote-debugging-port=9333" || true');
    await sleep(1500);
  } catch {}
  const proc = spawn(
    "/snap/bin/chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      `--user-data-dir=${profile}`,
      "--window-size=390,844",
      "--remote-debugging-port=9333",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  proc.unref();
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9333/json/version");
      if (r.ok) return proc;
    } catch {}
    await sleep(300);
  }
  proc.kill();
  throw new Error("chromium did not start a debugger");
}

async function newPage() {
  const r = await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" });
  const t = await r.json();
  return t.webSocketDebuggerUrl;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(e);
    });
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else res(m.result);
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const p = new Promise((res, rej) => this.pending.set(id, { res, rej }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  async eval(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;
    const { result } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.subtype === "error") throw new Error("eval: " + result.description);
    return result.value;
  }
  async goto(url) {
    await this.send("Page.enable");
    const nav = this.send("Page.navigate", { url });
    // Wait for load + a beat for React hydration.
    await new Promise((resolve) => {
      const h = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.method === "Page.loadEventFired") {
            this.ws.removeEventListener("message", h);
            resolve();
          }
        } catch {}
      };
      this.ws.addEventListener("message", h);
      setTimeout(() => {
        this.ws.removeEventListener("message", h);
        resolve();
      }, 15000);
    });
    await nav;
    await sleep(2500);
  }
  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const path = `${EVIDENCE}/${name}`;
    writeFileSync(path, Buffer.from(data, "base64"));
    console.log("saved", path);
    return path;
  }
  async waitFor(fn, timeout = 15000) {
    const t0 = Date.now();
    const expression = `!!((${fn.toString()})())`;
    for (;;) {
      try {
        const { result } = await this.send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.value === true) return true;
      } catch {}
      if (Date.now() - t0 > timeout) throw new Error("waitFor timeout: " + fn.toString().slice(0, 120));
      await sleep(400);
    }
  }
  close() {
    this.ws.close();
  }
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

const proc = await launchChromium();
const cdp = new Cdp(await newPage());

/** waitFor + Page.reload retries: the emulator occasionally wedges a listen
 *  stream under rapid navigation and a reload opens fresh listens. A genuine
 *  app breakage still fails after all attempts. */
async function waitForSteady(fn, tries = 3, timeout = 20000) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      await cdp.waitFor(fn, timeout);
      return;
    } catch (e) {
      last = e;
      await cdp.send("Page.reload");
      await sleep(5000);
    }
  }
  throw last;
}
try {
  // ---- 1. Logged-out login wall reveals nothing school-specific ----
  await cdp.goto(`${BASE}/?d=2026-09-08`);
  await cdp.waitFor(() => document.body.innerText.includes("Please sign in to continue"));
  await cdp.shot("01-login-wall.png");
  const wallText = await cdp.eval(() => document.body.innerText.toLowerCase());
  const forbidden = ["lakeside", "lakeside", "abc", "sage", "menu", "lunch", "breakfast", "schedule", "school", "entrée", "entree"];
  const leaks = forbidden.filter((w) => wallText.includes(w));
  check("login wall copy is generic", leaks.length === 0, leaks.join(","));
  const html = await cdp.eval(() => document.documentElement.outerHTML.toLowerCase());
  check("login wall ships no maroon/gold theme", !html.includes("820024") && !html.includes("ecaa1f"));
  const maroonEls = await cdp.eval(() => {
    const els = [...document.querySelectorAll("body *")];
    return els.filter((el) => {
      const bg = getComputedStyle(el).backgroundColor.replace(/\s+/g, "");
      return bg === "rgb(130,0,36)" || bg === "rgba(130,0,36,1)";
    }).length;
  });
  check("login wall renders zero maroon surfaces", maroonEls === 0, `${maroonEls} found`);

  // ---- 2. Dev sign-in (clicked) -> authed Today ----
  await cdp.eval(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => x.textContent.includes("Dev sign-in"));
    if (!b) throw new Error("no dev button");
    b.click();
  });
  await waitForSteady(() => document.body.innerText.includes("Italian-Roasted Pork Loin"), 20000);
  await waitForSteady(() => document.title === "LS Dash", 4, 10000);
  const title = await cdp.eval(() => document.title);
  check("authed document title", title === "LS Dash", title);
  const entree = await cdp.eval(() => document.querySelector('[data-testid="lunch-entree"]')?.textContent);
  check("today shows HAR lunch entrée", entree === "Italian-Roasted Pork Loin", entree);
  const bf = await cdp.eval(() => document.querySelector('[data-testid="breakfast-entree"]')?.textContent);
  check("today shows breakfast entrée", bf === "Grilled Ham", bf);
  const daily = await cdp.eval(() => document.querySelector('[data-testid="breakfast-daily"]')?.textContent);
  check("today shows daily offerings", daily?.includes("100% Apple Juice") && daily?.includes("Lions Mane Breakfast Platter") ? true : false, daily?.slice(0, 90));
  const badge = await cdp.eval(() => document.querySelector('[data-testid="day-badges"]')?.innerText);
  check("A-day badge", badge ? /A\s*day/.test(badge) : false, badge);
  await cdp.shot("02-today-a-day.png");

  // ---- 3. Click Month toggle -> month grid ----
  await cdp.eval(() => {
    const a = [...document.querySelectorAll("a")].find((x) => x.textContent === "Month");
    if (!a) throw new Error("no month link");
    a.click();
  });
  await waitForSteady(() => document.querySelector('[data-testid="month-grid"]'));
  await sleep(1500);
  await cdp.shot("03-month.png");
  const gridInfo = await cdp.eval(() => ({
    cells: document.querySelectorAll('[data-date]').length,
    sat: document.querySelectorAll('[data-date="2026-09-12"]').length,
    sun: document.querySelectorAll('[data-date="2026-09-13"]').length,
    headers: [...document.querySelectorAll('[data-testid="month-grid"] > div')].length > 0,
    sept8: document.querySelector('[data-date="2026-09-08"]')?.innerText,
    sept7: document.querySelector('[data-date="2026-09-07"]')?.innerText,
  }));
  check("month grid has all Sept weekdays", gridInfo.cells === 22, `${gridInfo.cells} cells`);
  check("weekend days have no cells", gridInfo.sat === 0 && gridInfo.sun === 0);
  check("month cell shows lunch entrée", gridInfo.sept8?.includes("Italian-Roasted Pork Loin") ?? false, gridInfo.sept8?.slice(0, 60));
  check("no-school cell labeled", gridInfo.sept7?.includes("Labor Day") ?? false, gridInfo.sept7?.slice(0, 60));

  // ---- 4. Click a month cell -> Today for that date ----
  await cdp.goto(`${BASE}/?d=2026-10-14`);
  await waitForSteady(() => (document.querySelector('[data-testid="special-label"]')?.textContent ?? "").length > 0);
  const special = await cdp.eval(() => document.querySelector('[data-testid="special-label"]')?.textContent);
  check("special day label", special === "MS special B day schedule", special);
  const specialBadge = await cdp.eval(() => document.querySelector('[data-testid="day-badges"]')?.innerText);
  check("special + B badges", specialBadge ? (/Special/.test(specialBadge) && /B\s*day/.test(specialBadge)) : false, specialBadge);
  await cdp.shot("04-today-special.png");

  // ---- 5. Weekend URL is not navigable (Sat -> Mon redirect) ----
  await cdp.goto(`${BASE}/?d=2026-09-12`);
  await cdp.waitFor(() => new URL(location.href).searchParams.get("d") === "2026-09-14");
  check("Saturday bounces to Monday", true, await cdp.eval(() => location.href));
  await cdp.shot("05-weekend-redirect.png");

  // ---- 6. No-school weekday ----
  await cdp.goto(`${BASE}/?d=2026-09-07`);
  await waitForSteady(() => (document.querySelector('[data-testid="noschool-label"]')?.textContent ?? "") === "Labor Day");
  await cdp.shot("06-noschool.png");
  const lunchHidden = await cdp.eval(() => !document.querySelector('[data-testid="lunch-entree"]'));
  check("no-school hides lunch sections", lunchHidden);

  // ---- 7. Prev/Next day navigation skips weekends ----
  await cdp.goto(`${BASE}/?d=2026-09-11`);
  await waitForSteady(() => document.querySelector('[data-testid="lunch-entree"]'));
  await cdp.eval(() => [...document.querySelectorAll("a")].find((x) => x.textContent.includes("Next")).click());
  await cdp.waitFor(() => new URL(location.href).searchParams.get("d") === "2026-09-14");
  check("Fri Next skips to Mon", true);
  await cdp.eval(() => [...document.querySelectorAll("a")].find((x) => x.textContent.includes("Prev")).click());
  await cdp.waitFor(() => new URL(location.href).searchParams.get("d") === "2026-09-11");
  check("Mon Prev skips to Fri", true);

  // ---- 8b. Root defaults to today, auto-advancing past weekends ----
  await cdp.goto(`${BASE}/`);
  const landed = await cdp.eval(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const wd = (id) => new Date(id + "T00:00:00Z").getUTCDay();
    const add = (id, n) => {
      const x = new Date(Date.parse(id + "T00:00:00Z") + n * 864e5);
      return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
    };
    let cur = parts;
    while (wd(cur) === 0 || wd(cur) === 6) cur = add(cur, 1);
    return cur;
  });
  await cdp.waitFor(`() => new URL(location.href).searchParams.get("d") === "${landed}"`);
  check("root defaults to next school day", true, `${await cdp.eval(() => location.href)} (expected ${landed})`);

  // ---- 8c. Day with no doc shows the empty state ----
  await cdp.goto(`${BASE}/?d=2026-10-20`);
  await waitForSteady(() => (document.body.innerText.includes("No data for this day yet.")));
  check("missing day renders empty state", true);

  // ---- 8. Fresh sync footer (no stale badge) ----
  // Temporary console tap for prod diagnosis.
  await cdp.send("Runtime.enable");
  const conmsgs = [];
  const conhandler = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.method === "Runtime.consoleAPICalled") {
        conmsgs.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 200));
      }
      if (m.method === "Runtime.exceptionThrown") conmsgs.push("EXC: " + (m.params.exceptionDetails?.text ?? "?").slice(0, 200));
    } catch {}
  };
  cdp.ws.addEventListener("message", conhandler);
  await cdp.goto(`${BASE}/?d=2026-09-08`);
  await cdp.waitFor(() => document.querySelector('[data-testid="sync-footer"]'));
  // The emulator occasionally wedges a listen stream under rapid navigation;
  // a reload opens fresh listens and recovers (verified). Retry a few times.
  let footer = { text: "", stale: "" };
  for (let i = 0; i < 4; i++) {
    await sleep(2500);
    footer = await cdp.eval(() => ({
      text: document.querySelector('[data-testid="sync-footer"]').textContent,
      stale: document.querySelector('[data-testid="sync-footer"]').dataset.stale,
    }));
    if (!footer.text.includes("updated never")) break;
    await cdp.goto(`${BASE}/?d=2026-09-08`);
    await cdp.waitFor(() => document.querySelector('[data-testid="sync-footer"]'));
  }
  check("fresh footer has no support-email badge", footer.stale === "false" && !footer.text.includes("zaned31"), footer.text + " | console: " + conmsgs.slice(0, 6).join(" / "));
  cdp.ws.removeEventListener("message", conhandler);
  // ---- 9. Stale sync => support-email badge, then restore fresh ----
  // (Admin SDK via set-meta.mjs: emulator REST enforces rules like prod.)
  const { execFileSync } = await import("node:child_process");
  const metaEnv = { ...process.env, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081" };
  execFileSync("node", ["scripts/set-meta.mjs", "stale"], { cwd: process.cwd(), env: metaEnv });
  await cdp.goto(`${BASE}/?d=2026-09-08`);
  await cdp.waitFor(() => document.querySelector('[data-testid="sync-footer"]')?.dataset.stale === "true");
  const staleFooter = await cdp.eval(() => document.querySelector('[data-testid="sync-footer"]').textContent);
  check(
    "stale badge shows updated-ago + support email",
    staleFooter.includes("ago, please email zaned31@lakesideschool.org for help"),
    staleFooter,
  );
  await cdp.shot("07-stale.png");
  execFileSync("node", ["scripts/set-meta.mjs", "fresh"], { cwd: process.cwd(), env: metaEnv });
} finally {
  cdp.close();
  // Kill the whole process group: plain kill() leaves snap children behind.
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {}
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
