import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], protocolTimeout: 90000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 });
const resp = await page.goto("http://localhost:3000/protocol", { waitUntil: "domcontentloaded", timeout: 30000 });
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: "/tmp/audit/protocol.png", fullPage: true });
console.log(`${resp.status()} protocol`);
await browser.close();
