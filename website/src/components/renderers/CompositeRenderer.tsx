"use client";

import { useEffect, useState } from "react";
import SvgRenderer from "./SvgRenderer";
import HtmlRenderer from "./HtmlRenderer";
import AudioRenderer from "./AudioRenderer";
import CanvasRenderer from "./CanvasRenderer";
import SceneRenderer from "./SceneRenderer";
import TextRenderer from "./TextRenderer";
import ShaderRenderer from "./ShaderRenderer";
import RuleRenderer from "./RuleRenderer";
import GraphRenderer from "./GraphRenderer";
import TypefaceRenderer from "./TypefaceRenderer";
import InstructionRenderer from "./InstructionRenderer";

/**
 * Works made of other works.
 *
 * Every other medium in the collection produces one kind of thing. This one lets
 * an Originator combine them — a shader beneath an SVG, a rule system alongside
 * its own output, a sequence that moves between media. The parts stay legible as
 * parts: each is a work in a medium the institution already recognises, with its
 * own payload, so a composite can be read as a structure rather than as an
 * opaque blob.
 *
 * {
 *   "layout": "stack" | "row" | "column" | "grid" | "sequence",
 *   "background": "#0A0A0A",
 *   "columns": 2,
 *   "durationMs": 6000,
 *   "parts": [
 *     { "type": "shader-glsl", "payload": "...", "opacity": 0.7, "blend": "screen" },
 *     { "type": "svg", "payload": "<svg .../>" }
 *   ]
 * }
 *
 * Composites may contain composites, to a depth of three. The limit exists
 * because a work that nests without bound is a work that can hang the page it
 * is shown on, and an archive that cannot render its own holdings is not an
 * archive. Three is deep enough for structure and shallow enough to survive.
 */

const MAX_DEPTH = 3;
const MAX_PARTS = 24;

interface Part {
  type?: string;
  payload?: string | object;
  opacity?: number;
  blend?: string;
  span?: number;
}

interface CompositeSpec {
  layout?: string;
  parts?: Part[];
  background?: string;
  columns?: number;
  durationMs?: number;
  /**
   * An ingredient rather than a part: sound that belongs to the whole work
   * instead of occupying a tile of its own.
   *
   *   "soundtrack": { "type": "audio-json", "payload": { "voices": [...] } }
   *
   * It cannot start on its own. Every browser blocks audio that begins without
   * a gesture, so a soundtrack is offered as a small control over the work
   * rather than played at whoever opens the page. That is a real limit and the
   * design admits it instead of pretending the sound is ambient.
   */
  soundtrack?: Part;
}

function parse(json: string): CompositeSpec | null {
  try { return JSON.parse(json) as CompositeSpec; } catch {
    const last = json.lastIndexOf("}");
    if (last <= 0) return null;
    try { return JSON.parse(json.slice(0, last + 1)) as CompositeSpec; } catch { return null; }
  }
}

/** Parts may carry their payload as a string or as already-parsed JSON. */
function payloadString(p: Part): string {
  if (typeof p.payload === "string") return p.payload;
  if (p.payload && typeof p.payload === "object") return JSON.stringify(p.payload);
  return "";
}

/**
 * Render one part. Leaf media dispatch directly; a nested composite recurses
 * here, which is why this lives in the same module — importing WorkDisplay would
 * make the cycle that a recursive renderer always tempts you into.
 */
function renderPart(part: Part, depth: number, key: string) {
  const payload = payloadString(part);
  if (!payload.trim()) return null;

  switch (part.type) {
    case "svg": return <SvgRenderer key={key} svg={payload} />;
    case "html-css": return <HtmlRenderer key={key} html={payload} interactive={false} forceMount />;
    case "audio-json": return <AudioRenderer key={key} json={payload} />;
    case "canvas-json": return <CanvasRenderer key={key} json={payload} />;
    case "scene-json": return <SceneRenderer key={key} json={payload} />;
    case "shader-glsl": return <ShaderRenderer key={key} payload={payload} />;
    case "rule-json": return <RuleRenderer key={key} json={payload} />;
    case "graph-json": return <GraphRenderer key={key} json={payload} />;
    case "typeface-json": return <TypefaceRenderer key={key} json={payload} />;
    case "instruction-set": return <InstructionRenderer key={key} payload={payload} />;
    case "composite-json":
      if (depth >= MAX_DEPTH) {
        return (
          <div key={key} className="w-full h-full flex items-center justify-center bg-ink">
            <p className="text-[10px] font-mono text-mna-white/40">nesting limit reached</p>
          </div>
        );
      }
      return <CompositeRenderer key={key} json={payload} depth={depth + 1} />;
    case "ascii":
    case "text":
    default:
      return (
        <TextRenderer
          key={key}
          payload={payload}
          outputType={part.type === "ascii" ? "ascii" : "text"}
          size="gallery"
        />
      );
  }
}

export default function CompositeRenderer({
  json,
  depth = 0,
}: {
  json: string;
  depth?: number;
}) {
  const spec = parse(json);
  const parts = (spec?.parts ?? []).slice(0, MAX_PARTS);
  const layout = spec?.layout ?? "stack";
  const bg = spec?.background ?? "#0A0A0A";

  // Sequence advances on the clock, like every other timed thing in the
  // collection — never on a frame counter, which runs at a different speed on
  // every display.
  const [active, setActive] = useState(0);
  const isSequence = layout === "sequence" && parts.length > 1;
  const perPart = Math.max(1000, spec?.durationMs ?? 6000);

  useEffect(() => {
    if (!isSequence) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // hold on the first part rather than cycling
    const t = setInterval(() => setActive((i) => (i + 1) % parts.length), perPart);
    return () => clearInterval(t);
  }, [isSequence, parts.length, perPart]);

  const soundtrack = spec?.soundtrack;
  const soundtrackPayload = soundtrack ? payloadString(soundtrack) : "";

  /** Sound sits over the work, small, rather than taking a tile. */
  const Soundtrack = () =>
    soundtrackPayload ? (
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
        <div className="[&_button]:text-[10px] [&_button]:tracking-[0.18em] opacity-70 hover:opacity-100 transition-opacity">
          <AudioRenderer json={soundtrackPayload} />
        </div>
      </div>
    ) : null;

  if (!spec || parts.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ink p-6">
        <p className="text-[11px] font-mono text-mna-white/50">composite could not be read</p>
      </div>
    );
  }

  if (isSequence) {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: bg }}>
        {parts.map((p, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === active ? (p.opacity ?? 1) : 0 }}
            aria-hidden={i !== active}
          >
            {renderPart(p, depth, `seq-${i}`)}
          </div>
        ))}
        <Soundtrack />
      </div>
    );
  }

  if (layout === "stack") {
    return (
      <div className="relative w-full h-full overflow-hidden" style={{ background: bg }}>
        {parts.map((p, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              opacity: p.opacity ?? 1,
              mixBlendMode: (p.blend as React.CSSProperties["mixBlendMode"]) ?? "normal",
              zIndex: i,
            }}
          >
            {renderPart(p, depth, `stack-${i}`)}
          </div>
        ))}
        <Soundtrack />
      </div>
    );
  }

  const cols =
    layout === "grid"
      ? Math.max(1, Math.min(spec.columns ?? 2, 6))
      : layout === "row"
        ? parts.length
        : 1;

  return (
    <div
      className="relative w-full h-full overflow-hidden grid"
      style={{
        background: bg,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
      }}
    >
      {parts.map((p, i) => (
        <div
          key={i}
          className="relative overflow-hidden min-w-0 min-h-0"
          style={{
            opacity: p.opacity ?? 1,
            gridColumn: p.span ? `span ${Math.max(1, Math.min(p.span, cols))}` : undefined,
          }}
        >
          {renderPart(p, depth, `cell-${i}`)}
        </div>
      ))}
      <Soundtrack />
    </div>
  );
}
