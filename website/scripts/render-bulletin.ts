import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import React from "react";
import { render } from "@react-email/render";
import { composeMonthlyDigest } from "../src/lib/digest";
import MonthlyDigest from "../src/emails/MonthlyDigest";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const payload = await composeMonthlyDigest();
const html = await render(React.createElement(MonthlyDigest, payload));
fs.writeFileSync("/tmp/bulletin-render.html", html);
console.log("written /tmp/bulletin-render.html (" + html.length + " bytes)");
