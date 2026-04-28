import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const React = (await import("react")).default;
const { render } = await import("@react-email/render");
const { composeMonthlyDigest } = await import("../src/lib/digest.ts");
const { default: MonthlyDigest } = await import("../src/emails/MonthlyDigest.tsx");

const payload = await composeMonthlyDigest();
const html = await render(React.createElement(MonthlyDigest, payload));
fs.writeFileSync("/tmp/bulletin-render.html", html);
console.log("ok " + html.length);
