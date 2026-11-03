import puppeteer from "puppeteer-core";
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
for (const [w, h, tag] of [[1400, 900, "desk"], [390, 844, "mob"]]) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto("https://www.mini.de/de_DE/home.html", { waitUntil: "networkidle2", timeout: 90000 }).catch((e) => console.log("goto", e.message));
  await new Promise((r) => setTimeout(r, 4000));
  // dismiss cookie banner if present
  await p.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/akzeptieren|alle/i.test(b.textContent || "")) { b.click(); break; } });
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${out}/mini-${tag}.png` });
  await p.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2));
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${out}/mini-${tag}-2.png` });
}
const styles = await p.evaluate(() => {
  const pick = (sel) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); return { sel, font: s.fontFamily, size: s.fontSize, weight: s.fontWeight, tt: s.textTransform, ls: s.letterSpacing, color: s.color, bg: s.backgroundColor, radius: s.borderRadius }; };
  return ["body", "h1", "h2", "h3", "a.button, a[class*=button], button[class*=button]", "nav a", "p"].map(pick);
});
console.log(JSON.stringify(styles, null, 1));
await b.close();
