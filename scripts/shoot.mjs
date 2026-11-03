// Usage: node scripts/shoot.mjs <url> <outPrefix> [views comma-separated]
// Screenshots a page (one per ?view=) using the locally installed Chrome.
import puppeteer from "puppeteer-core";
const [url, out, views = ""] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 1400), height: Number(process.env.H ?? 900), deviceScaleFactor: Number(process.env.DPR ?? 1), isMobile: !!process.env.MOBILE, hasTouch: !!process.env.MOBILE });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log("[console]", m.type(), m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
for (const v of views ? views.split(",") : [""]) {
  const u = v ? `${url}${url.includes("?") ? "&" : "?"}view=${v}` : url;
  await page.goto(u, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true || document.querySelector("canvas"), { timeout: 60000 }).catch(() => console.log("no canvas for", v));
  await new Promise((r) => setTimeout(r, Number(process.env.SHOOT_WAIT ?? 0)));
  await new Promise((r) => setTimeout(r, 800));
  const file = `${out}${v ? "-" + v : ""}.png`;
  await page.screenshot({ path: file });
  console.log("saved", file);
}
await browser.close();
