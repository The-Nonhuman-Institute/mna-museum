import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 2 });
const resp = await page.goto("http://localhost:3010/", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("status:", resp.status());
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: "/tmp/commons.png", fullPage: false });
await browser.close();
