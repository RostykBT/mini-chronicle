import puppeteer from "puppeteer-core";
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 900 });
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto("http://localhost:3123/?t=2026-11-03", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 6000));
await p.screenshot({ path: `${out}/scrub-0.png` });
// click the first marker (factory) like a user would
const markers = await p.$$("button[title]");
const titles = await Promise.all(markers.map((m) => m.evaluate((e) => e.title)));
console.log(titles);
await markers.find((_, i) => titles[i].includes("Built"))?.click();
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: `${out}/scrub-1.png` });
// drag the track from left to right edge
const track = await p.$("div.cursor-pointer.rounded-full");
const bb = await track.boundingBox();
await p.mouse.move(bb.x + 5, bb.y + 3); await p.mouse.down();
await p.mouse.move(bb.x + bb.width - 5, bb.y + 3, { steps: 20 }); await p.mouse.up();
await new Promise((r) => setTimeout(r, 3000));
await p.screenshot({ path: `${out}/scrub-2.png` });
console.log("url", p.url());
await b.close();
