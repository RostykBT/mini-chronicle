// Opens the app and clicks the given part on the car (by part id via the debug hook), then screenshots.
import puppeteer from "puppeteer-core";
const [url, out] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 900 });
await p.goto(url, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 6000));
// rear view: the rear bumper sits in the lower middle of the canvas
const c = await p.$("canvas"); const bb = await c.boundingBox();
await p.mouse.click(bb.x + bb.width * Number(process.env.CX ?? 0.42), bb.y + bb.height * Number(process.env.CY ?? 0.66));
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: out });
await b.close();
