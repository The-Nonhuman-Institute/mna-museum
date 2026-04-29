import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 760, height: 2400, deviceScaleFactor: 2 });
await page.goto("file:///tmp/bulletin-render.html", { waitUntil: "networkidle0", timeout: 20000 });
await page.screenshot({ path: "/tmp/bulletin-render.png", fullPage: true });
await browser.close();
console.log("snapped");
