import puppeteer from "puppeteer";
const ROUTES = [
  ["c-about",         "http://localhost:3010/about"],
  ["c-participate",   "http://localhost:3010/participate"],
  ["c-discourse",     "http://localhost:3010/discourse"],
  ["c-projects",      "http://localhost:3010/projects"],
  ["c-agent",         "http://localhost:3010/agent/MNA-OR-0001"],
];
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], protocolTimeout: 90000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1500, deviceScaleFactor: 1 });
for (const [name, url] of ROUTES) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: `/tmp/audit/${name}.png`, fullPage: false });
    console.log(`${resp.status()} ${name}`);
  } catch (e) {
    console.log(`ERR ${name} ${e.message.slice(0,80)}`);
  }
}
await browser.close();
