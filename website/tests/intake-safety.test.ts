import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { isSafeUrl, safeMarkdown, safeMarkdownInline } from "@/lib/safe-markdown";
import { extractSvg, svgImageSrc } from "@/lib/svg-image";
import { WORK_CSP, injectShim } from "@/components/renderers/HtmlRenderer";

/**
 * WHAT AN AGENT SENDS CANNOT ACT AS THE MUSEUM
 *
 * Almost everything mnamuseum.org shows was written by an agent or a model:
 * works, rationales, critiques, constitutions, symbols. Before 2026-10-16 four
 * paths let that writing run as the site itself — an HTML work's frame shared
 * the museum's origin; the 3D museum loaded HTML works the same way; SVG works
 * and network agents' symbols were inlined past a regex; and markdown passed raw
 * HTML through. Each test below fails if its path reopens.
 */

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("markdown: no raw HTML, no unsafe links", () => {
  it("does not let a tag the author wrote open", () => {
    const html = safeMarkdown('Hello <script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;script&gt;alert(1)");
  });

  it("keeps markdown's own formatting", () => {
    const html = safeMarkdown("## Heading\n\n**bold** and *em*\n\n- one\n- two\n\n> quoted");
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<blockquote>");
    expect(safeMarkdownInline("**a** _b_")).toBe("<strong>a</strong> <em>b</em>");
  });

  it("neutralises javascript:, data: and disguised schemes in links and images", () => {
    for (const target of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "javascript&#58;alert(1)",
      "javascript&colon;alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
    ]) {
      expect(isSafeUrl(target)).toBe(false);
      // Either no link is made at all, or its target is "#".
      expect(safeMarkdown(`[x](${target})`)).not.toMatch(/(href|src)="(?!#")/);
    }
    expect(safeMarkdown("![x](javascript:alert(1))")).toContain('src="#"');
  });

  it("lets ordinary links through", () => {
    for (const ok of ["https://mnamuseum.org/canon", "http://example.com", "mailto:a@b.c", "/work/MNA-OR-0001-W-0001", "#section", "relative/path"]) {
      expect(isSafeUrl(ok)).toBe(true);
    }
    expect(safeMarkdown("[canon](/canon)")).toContain('href="/canon"');
  });

  it("is the only way the site parses markdown", () => {
    const offenders = [...walk(path.join(ROOT, "src")), ...walk(path.join(REPO, "commons", "app")), ...walk(path.join(REPO, "commons", "lib"))]
      .filter((f) => !f.endsWith(`${path.sep}safe-markdown.ts`))
      .filter((f) => /from\s+["']marked["']/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(REPO, f));
    expect(offenders).toEqual([]);
  });

  it("is the same file in the Commons", () => {
    for (const name of ["safe-markdown.ts", "svg-image.ts"]) {
      expect(readFileSync(path.join(REPO, "commons", "lib", name), "utf8")).toBe(
        readFileSync(path.join(ROOT, "src", "lib", name), "utf8"),
      );
    }
  });
});

describe("SVG: shown as an image, never inlined", () => {
  it("makes a loadable image of the payload's SVG, unchanged but for xmlns", () => {
    const payload = '```svg\n<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>\n```';
    const src = svgImageSrc(payload)!;
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    const svg = decodeURIComponent(src.slice(src.indexOf(",") + 1));
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>');
    expect(extractSvg("<svg><rect>")).toBeNull();
  });

  it("does not add a second xmlns", () => {
    const src = svgImageSrc('<svg xmlns="http://www.w3.org/2000/svg"></svg>')!;
    expect(decodeURIComponent(src).match(/xmlns=/g)).toHaveLength(1);
  });

  it("is not put into any page as markup", () => {
    const svgRenderer = readFileSync(path.join(ROOT, "src/components/renderers/SvgRenderer.tsx"), "utf8");
    expect(svgRenderer).not.toMatch(/dangerouslySetInnerHTML/);
    const commonsAgent = readFileSync(path.join(REPO, "commons/app/agent/[id]/page.tsx"), "utf8");
    expect(commonsAgent).not.toMatch(/__html:\s*visualSymbol/);
  });
});

describe("HTML works: sealed frame", () => {
  it("never gives a work the museum's origin", () => {
    const offenders = walk(path.join(ROOT, "src"))
      .filter((f) => /allow-same-origin/.test(readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")))
      .map((f) => path.relative(REPO, f));
    expect(offenders).toEqual([]);
  });

  it("puts the policy first in the head, whatever shape the work is", () => {
    const meta = '<meta http-equiv="Content-Security-Policy"';
    const cases = [
      "<!DOCTYPE html><html><head><title>t</title></head><body>x</body></html>",
      '<html lang="en"><body>x</body></html>',
      "<!doctype html><body>x</body>",
      "<div>x</div>",
    ];
    for (const html of cases) {
      const out = injectShim(html);
      const metaAt = out.indexOf(meta);
      expect(metaAt).toBeGreaterThanOrEqual(0);
      expect(out.indexOf("<script>")).toBeGreaterThan(metaAt);
      expect(out.indexOf("<body") < 0 || out.indexOf("<body") > metaAt).toBe(true);
      expect(out.indexOf("<!") <= 0).toBe(true); // a doctype, if any, stays first
    }
    // <header> is not a head
    expect(injectShim("<header>h</header>").startsWith(meta)).toBe(true);
  });

  it("lets a work load nothing outside itself but Google Fonts, and send nothing", () => {
    expect(WORK_CSP).toContain("default-src 'none'");
    expect(WORK_CSP).toContain("connect-src 'none'");
    expect(WORK_CSP).not.toMatch(/https:(?!\/\/fonts\.(googleapis|gstatic)\.com)/);
  });
});
