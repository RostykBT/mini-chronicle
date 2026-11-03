// Close-up of the front-left headlight in the real app at ?t=<date>.
import puppeteer from "puppeteer-core";
const [out, t = "2026-11-03"] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 900 });
await p.goto(`http://localhost:3123/?t=${t}`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 6000));
// zoom: scroll-wheel over the canvas a few times
const c = await p.$("canvas"); const bb = await c.boundingBox();
await p.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.55);
for (let i = 0; i < 8; i++) { await p.mouse.wheel({ deltaY: -300 }); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: out });
await b.close();
