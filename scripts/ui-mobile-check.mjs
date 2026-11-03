// Phone UX check: loads the app at 390×844, then
//  1. screenshots the collapsed sheet,
//  2. taps the sheet handle → expanded sheet,
//  3. simulates the browser address bar collapsing (viewport 844 → 760) and measures
//     whether the canvas or the timeline moved (they must not: no jumping),
//  4. drags along the timeline with touch.
//   node scripts/ui-mobile-check.mjs <outDir> [url]
import puppeteer from "puppeteer-core";
const [out, url = "http://localhost:3123/?t=2026-11-03"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
await new Promise((r) => setTimeout(r, 9000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rects = () => p.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; };
  return { canvas: r(document.querySelector("canvas")), timeline: r(document.querySelector("[aria-label^='Play'], [aria-label^='Pause']")), scrollY: window.scrollY };
});

await p.screenshot({ path: `${out}/m1-collapsed.png` });
const before = await rects();

await p.tap("button[aria-label='Expand details']");
await wait(700);
await p.screenshot({ path: `${out}/m2-expanded.png` });
const expanded = await rects();
await p.tap("button[aria-label='Collapse details']");
await wait(600);

// address bar collapse/expand = viewport height change
await p.setViewport({ width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await wait(500);
const shorter = await rects();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await wait(500);

// touch-drag the timeline from 70% to 20%
const track = await p.evaluate(() => { const el = document.querySelector("[aria-label^='Next entry']")?.parentElement?.nextElementSibling; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2, w: b.width }; });
const cdp = await p.createCDPSession();
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
await touch("touchStart", track.x + track.w * 0.7, track.y);
for (let i = 1; i <= 10; i++) { await touch("touchMove", track.x + track.w * (0.7 - 0.05 * i), track.y); await wait(30); }
await touch("touchEnd");
await wait(1200);
const afterDrag = await rects();
await p.screenshot({ path: `${out}/m3-dragged.png` });
console.log(JSON.stringify({ before, expanded, shorter, afterDrag, url: p.url() }));
await b.close();
