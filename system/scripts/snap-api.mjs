import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
const resp = await page.goto("http://localhost:3000/api", { waitUntil: "networkidle0", timeout: 30000 });
console.log("status:", resp.status());
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: "/tmp/api.png", fullPage: true });
await browser.close();
