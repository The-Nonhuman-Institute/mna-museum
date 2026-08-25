"use client";
import WorkDisplay from "@/components/WorkDisplay";
import type { Work } from "@/lib/collection";

const mk = (id: string, t: string, p: string): Work => ({
  id, output_type: t, output_payload: p, originator_id: "MNA-OR-0001", title: id,
  medium: t, canon_status: "CANON", submission_date: "2026-08-24", canon_date: "2026-08-24",
  evaluations: [], phase_at_submission: "I",
} as unknown as Work);

const SHADER = `void mainImage(out vec4 o, in vec2 f){
  vec2 uv=f/iResolution.xy;
  float g=step(0.5,fract(uv.x*8.0))*step(0.5,fract(uv.y*8.0));
  o=vec4(vec3(g,0.3+0.7*uv.y,1.0-g),1.0); }`;

const base = (surface: object | null) => JSON.stringify({
  bg: "#0A0A0A",
  camera: { x: 0, y: 1.5, z: 4, lookAt: [0,0,0] },
  lights: [{ type:"ambient", color:"#ffffff", intensity:0.9 },
           { type:"directional", color:"#ffffff", intensity:0.8, position:[5,10,5] }],
  objects: [ Object.assign({ shape:"cube", color:"#888888", position:[0,0,0], scale:[1.6,1.6,1.6] },
              surface ? { surface } : {}) ],
});

const PLAIN = base(null);
const TEXTURED = base({ type: "shader-glsl", payload: SHADER });
const WITH_SOUND = JSON.stringify({
  layout: "stack", background: "#0A0A0A",
  parts: [{ type: "scene-json", payload: TEXTURED }],
  soundtrack: { type: "audio-json", payload: { duration: 4, voices: [
    { wave:"sine", notes:[{freq:220,start:0,duration:1},{freq:330,start:1,duration:1}] } ] } },
});

const CASES: [string, string, string][] = [
  ["scene-plain", "scene-json", PLAIN],
  ["scene-with-shader-surface", "scene-json", TEXTURED],
  ["composite-with-soundtrack", "composite-json", WITH_SOUND],
];

export default function IngredientCheck() {
  return (
    <div className="p-6 grid grid-cols-3 gap-6 bg-warm-paper">
      {CASES.map(([name, type, payload]) => (
        <div key={name} data-case={name}>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2 text-ink/60">{name}</p>
          <div className="aspect-square border border-ink/20 overflow-hidden">
            <WorkDisplay work={mk(name, type, payload)} size="detail" framed={false} />
          </div>
        </div>
      ))}
    </div>
  );
}
