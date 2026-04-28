import puppeteer from "puppeteer";
const ROUTES = [
  ["critics",         "http://localhost:3000/critics"],
  ["council",         "http://localhost:3000/evaluation/council"],
];
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], protocolTimeout: 90000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 });
for (const [name, url] of ROUTES) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `/tmp/audit/${name}.png`, fullPage: true });
    console.log(`${resp.status()} ${name}`);
  } catch (e) {
    console.log(`ERR ${name} ${e.message.slice(0,80)}`);
  }
}
await browser.close();
