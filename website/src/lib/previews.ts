import fs from "fs";
import path from "path";

let _cache: Set<string> | null = null;

/** Return a Set of work IDs that have a generated preview PNG on disk. */
export function getPreviewIndex(): Set<string> {
  if (_cache) return _cache;
  const dir = path.join(process.cwd(), "public", "previews");
  try {
    const files = fs.readdirSync(dir);
    _cache = new Set(
      files
        .filter((f) => f.endsWith(".png"))
        .map((f) => f.replace(/\.png$/, ""))
    );
  } catch {
    _cache = new Set();
  }
  return _cache;
}
