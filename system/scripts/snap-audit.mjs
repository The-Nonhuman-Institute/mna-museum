import puppeteer from "puppeteer";
import fs from "fs";

const ROUTES = [
  // Website (port 3000)
  ["w-home",          "http://localhost:3000/"],
  ["w-about",         "http://localhost:3000/about"],
  ["w-charter",       "http://localhost:3000/charter"],
  ["w-protocol",      "http://localhost:3000/protocol"],
  ["w-participate",   "http://localhost:3000/participate"],
  ["w-api",           "http://localhost:3000/api"],
  ["w-agents",        "http://localhost:3000/agents"],
  ["w-agent-detail",  "http://localhost:3000/agent/MNA-OR-0001"],
  ["w-agent-const",   "http://localhost:3000/agent/MNA-OR-0001/constitution"],
  ["w-standards",     "http://localhost:3000/standards"],
  ["w-standards-detail", "http://localhost:3000/standards/MNA-ACS-001"],
  ["w-canon",         "http://localhost:3000/canon"],
  ["w-originators",   "http://localhost:3000/originators"],
  ["w-archive",       "http://localhost:3000/archive"],
  ["w-critics",       "http://localhost:3000/critics"],
  ["w-eval-council",  "http://localhost:3000/evaluation/council"],
  ["w-exhibitions",   "http://localhost:3000/exhibitions"],
  ["w-exhibition-detail", "http://localhost:3000/exhibitions/1"],
  ["w-research",      "http://localhost:3000/research"],
  ["w-research-detail", "http://localhost:3000/research/MNA-IR-0003"],
  ["w-press",         "http://localhost:3000/press"],
  ["w-press-detail",  "http://localhost:3000/press/MNA-INT-0001"],
  ["w-work-detail",   "http://localhost:3000/work/MNA-OR-0001-W-0001"],
  ["w-glyphs",        "http://localhost:3000/glyphs"],
  ["w-compositions",  "http://localhost:3000/compositions"],
  ["w-guidelines",    "http://localhost:3000/guidelines"],
  ["w-privacy",       "http://localhost:3000/privacy"],
  ["w-terms",         "http://localhost:3000/terms"],
  ["w-news-conf",     "http://localhost:3000/newsletter/confirmed"],
  ["w-news-err",      "http://localhost:3000/newsletter/error"],
  ["w-news-unsub",    "http://localhost:3000/newsletter/unsubscribed"],
  // Commons (port 3010)
  ["c-home",          "http://localhost:3010/"],
  ["c-about",         "http://localhost:3010/about"],
  ["c-participate",   "http://localhost:3010/participate"],
  ["c-discourse",     "http://localhost:3010/discourse"],
  ["c-projects",      "http://localhost:3010/projects"],
];

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 });

const out = [];
for (const [name, url] of ROUTES) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise(r => setTimeout(r, 700));
    const path = `/tmp/audit/${name}.png`;
    await page.screenshot({ path, fullPage: false });
    out.push([name, resp.status(), url]);
    console.log(`${resp.status()}  ${name}`);
  } catch (e) {
    out.push([name, "ERR", url]);
    console.log(`ERR    ${name}  ${e.message.slice(0, 80)}`);
  }
}

await browser.close();
fs.writeFileSync("/tmp/audit/_index.json", JSON.stringify(out, null, 2));
console.log("done");
