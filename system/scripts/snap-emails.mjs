import puppeteer from "puppeteer";
const FILES = [
  "newsletter-confirm",
  "newsletter-welcome",
  "exhibition",
  "spotlight",
  "letter",
  "identity",
];
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 760, height: 1600, deviceScaleFactor: 2 });
for (const name of FILES) {
  await page.goto(`file:///tmp/email-${name}.html`, { waitUntil: "networkidle0", timeout: 20000 });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: `/tmp/email-${name}.png`, fullPage: true });
  console.log("snapped", name);
}
await browser.close();
