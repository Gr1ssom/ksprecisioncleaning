/**
 * End-to-end smoke test against a deployed preview loaded with demo data.
 *   E2E_BASE=https://<preview>.vercel.app E2E_SHARE=<_vercel_share token> E2E_PASSWORD=… node e2e/smoke.mjs
 * Signs in as owner@ks.test, manager@ks.test and staff@ks.test; opens every page; fails on any
 * page error, server error screen or wrong role access; on phone size, checks tap targets ≥ 40px
 * and no sideways scrolling.
 */
import { chromium, devices } from "playwright";

const B = process.env.E2E_BASE, PW = process.env.E2E_PASSWORD, SHARE = process.env.E2E_SHARE;
if (!B || !PW) { console.error("Set E2E_BASE and E2E_PASSWORD"); process.exit(2); }
const PAGES = ["/dashboard", "/checkin", "/checkin?mode=pickup", "/jobs", "/locations", "/sops", "/issues", "/time", "/account",
  "/inventory", "/reports", "/clients", "/invoices", "/invoices/new", "/team", "/team/new", "/settings", "/jobs/new", "/payroll", "/activity"];
const MIN = { "/inventory": "MANAGER", "/reports": "MANAGER", "/clients": "MANAGER", "/invoices": "MANAGER", "/invoices/new": "MANAGER", "/team": "MANAGER", "/team/new": "MANAGER", "/settings": "MANAGER", "/jobs/new": "MANAGER", "/payroll": "OWNER", "/activity": "OWNER" };
const RANK = { STAFF: 1, MANAGER: 2, OWNER: 3 };
const audit = () => {
  const small = [];
  for (const el of document.querySelectorAll("a, button, summary, input, select, textarea")) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === "hidden" || el.type === "hidden" || el.closest("aside")) continue;
    if (el.type === "checkbox" || el.type === "radio" || el.classList.contains("sr-only")) continue;
    if (el.tagName === "A" && s.display === "inline" && el.parentElement.textContent.trim().length > el.textContent.trim().length + 15) continue;
    if (r.height < 40 || (r.width < 40 && el.tagName !== "INPUT")) small.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || el.name || "").trim().slice(0, 24)}"`);
  }
  return { small: [...new Set(small)], overflow: document.documentElement.scrollWidth > innerWidth + 1 };
};

let failures = 0;
const fail = (m) => { failures++; console.log("  ✗ " + m); };
const browser = await chromium.launch();
for (const [who, role] of [["staff", "STAFF"], ["manager", "MANAGER"], ["owner", "OWNER"]]) {
  const phone = role !== "OWNER";
  const ctx = await browser.newContext(phone ? { ...devices["iPhone 13"] } : { viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  if (SHARE) await p.goto(`${B}/?_vercel_share=${SHARE}`);
  await p.goto(B + "/login");
  await p.fill("#email", `${who}@ks.test`); await p.fill("#password", PW);
  await Promise.all([p.waitForURL("**/dashboard", { timeout: 30000 }), p.click("form button")]);
  console.log(`${who}${phone ? " (iPhone)" : ""}`);
  for (const path of PAGES) {
    await p.goto(B + path); await p.waitForLoadState("networkidle");
    const at = p.url().replace(B, "");
    const allowed = RANK[role] >= RANK[MIN[path] ?? "STAFF"];
    if (await p.locator("text=/Application error|server-side exception/").count()) fail(`${path}: server error`);
    if (allowed && at !== path) fail(`${path}: sent to ${at}`);
    if (!allowed && at === path) fail(`${path}: ${role} can open it`);
    if (phone && allowed && at === path) {
      const a = await p.evaluate(audit);
      if (a.overflow) fail(`${path}: scrolls sideways`);
      if (a.small.length) fail(`${path}: small tap targets ${a.small.join(", ")}`);
    }
  }
  if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} problem(s)` : "All pages OK");
process.exit(failures ? 1 : 0);
