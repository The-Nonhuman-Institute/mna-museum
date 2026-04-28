import puppeteer from "puppeteer";
const ROUTES = [
  ["guidelines",         "http://localhost:3000/guidelines"],
  ["privacy",            "http://localhost:3000/privacy"],
  ["terms",              "http://localhost:3000/terms"],
  ["news-confirmed",     "http://localhost:3000/newsletter/confirmed"],
  ["news-error",         "http://localhost:3000/newsletter/error"],
  ["news-unsubscribed",  "http://localhost:3000/newsletter/unsubscribed"],
];
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], protocolTimeout: 90000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 1 });
for (const [name, url] of ROUTES) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: `/tmp/audit/${name}.png`, fullPage: false });
    console.log(`${resp.status()} ${name}`);
  } catch (e) {
    console.log(`ERR ${name} ${e.message.slice(0,80)}`);
  }
}
await browser.close();
