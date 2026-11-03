// Regenerates the README screenshots in docs/screenshots/ from the running app.
//   node scripts/readme-shots.mjs [baseUrl=http://localhost:3123]
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3123";
const OUT = "docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(query, { mobile = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(`${BASE}/?${query}`, { waitUntil: "networkidle0", timeout: 120000 });
  // hide the Next.js dev-mode badge
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await wait(9000);
  return page;
}
async function shot(query, file, opts = {}) {
  const page = await open(query, opts);
  if (opts.before) await opts.before(page);
  await page.screenshot({ path: `${OUT}/${file}`, ...(opts.clip ? { clip: opts.clip } : {}) });
  await page.close();
  console.log("saved", file);
}

/** Side-by-side composite with a thin white gutter. */
async function pair(a, b, file, gutter = 16) {
  const [ia, ib] = await Promise.all([sharp(`${OUT}/${a}`).metadata(), sharp(`${OUT}/${b}`).metadata()]);
  const h = Math.min(ia.height, ib.height);
  const A = await sharp(`${OUT}/${a}`).resize({ height: h }).toBuffer({ resolveWithObject: true });
  const B = await sharp(`${OUT}/${b}`).resize({ height: h }).toBuffer({ resolveWithObject: true });
  await sharp({ create: { width: A.info.width + B.info.width + gutter, height: h, channels: 3, background: "#ffffff" } })
    .composite([{ input: A.data, left: 0, top: 0 }, { input: B.data, left: A.info.width + gutter, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
  fs.rmSync(`${OUT}/${a}`); fs.rmSync(`${OUT}/${b}`);
  console.log("saved", file);
}

// 1. hero
await shot("t=2026-11-03", "hero.png");
// 2. factory vs wrapped, same camera
const stage = { x: 0, y: 64 * 1.0, width: 1020, height: 746 };
await shot("t=2026-03-10", "_before.png", { clip: stage });
await shot("t=2026-11-03", "_after.png", { clip: stage });
await pair("_before.png", "_after.png", "before-after.png");
// 3. factory spec sheet
await shot("t=2015-07-21", "factory.png");
// 4. plates over time: Belgian transit (front) → Estonian (rear)
await shot("t=2026-03-10&view=front", "_plate-be.png", { clip: stage });
await shot("t=2026-11-03&view=rear", "_plate-ee.png", { clip: stage });
await pair("_plate-be.png", "_plate-ee.png", "plates.png");
// 5. sport spoiler close-up + hood scoop
await shot("t=2026-11-03&view=spoiler_close", "_spoiler.png", { clip: stage });
await shot("t=2026-11-03&view=scoop", "_scoop.png", { clip: stage });
await pair("_spoiler.png", "_scoop.png", "details.png");
// 6. part history (click the door)
await shot("t=2026-11-03&view=left", "part-history.png", {
  before: async (p) => {
    const c = await p.$("canvas"); const b = await c.boundingBox();
    await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.55);
    await wait(1500);
  },
});
// 7. phone: collapsed + expanded sheet
await shot("t=2026-06-26", "_m1.png", { mobile: true });
await shot("t=2026-06-26", "_m2.png", {
  mobile: true,
  before: async (p) => { await p.tap("button[aria-label='Expand details']"); await wait(900); },
});
await pair("_m1.png", "_m2.png", "mobile.png", 32);

await browser.close();

// compress for the repo: PNG → 2000 px JPEG
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith(".png"))) {
  await sharp(`${OUT}/${f}`).resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}/${f.replace(".png", ".jpg")}`);
  fs.rmSync(`${OUT}/${f}`);
}
