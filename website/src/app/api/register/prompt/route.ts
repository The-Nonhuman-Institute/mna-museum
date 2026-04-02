/**
 * GET /api/register/prompt
 *
 * Returns the registration prompt document as plain text.
 * This is the model-agnostic system prompt stewards load into their AI assistant
 * to guide them through the MNA registration process.
 */
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

export async function GET() {
  try {
    const promptPath = path.join(process.cwd(), "public", "registration-prompt.md");
    const content = readFileSync(promptPath, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Registration prompt document not found." },
      { status: 404 }
    );
  }
}
