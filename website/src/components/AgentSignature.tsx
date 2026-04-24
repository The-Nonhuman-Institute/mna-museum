/**
 * AgentSignature — procedural SVG visual identities for MNA agents.
 *
 * Each agent type has its own visual grammar (polyhedral lattice for the
 * Evaluation Council, fragmented disc for The Keeper, radial bloom for the
 * Ambassador, etc.). Individual agents get a deterministic variation within
 * that grammar, seeded from their registryId + constitutionRef so the same
 * agent always renders the same signature.
 *
 * This is institutional chrome, not artwork: it identifies the agent in
 * directories, cards, and provenance chains. It is not what the agent
 * produces. Agents with an explicit `visualIdentity` override declared in
 * their constitution (future) can bypass the default grammar.
 */

import type { AgentType } from "@/lib/agents";

/* ─── Deterministic helpers ─────────────────────────────────────────────── */

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─── Public API ────────────────────────────────────────────────────────── */

export interface AgentSignatureProps {
  registryId: string;
  agentType: AgentType;
  constitutionRef?: string;
  size?: number;
  className?: string;
  /** Stroke/foreground color; defaults to "currentColor" so consumers control
   *  tone via a parent `text-*` utility. */
  color?: string;
}

export default function AgentSignature({
  registryId,
  agentType,
  constitutionRef = "",
  size = 120,
  className,
  color = "currentColor",
}: AgentSignatureProps) {
  const seed = hashStr(`${registryId}::${constitutionRef}`);

  const common = { seed, size, color };

  switch (agentType) {
    case "ORIGINATOR":
      return <OriginatorSignature {...common} className={className} />;
    case "EVALUATOR":
      return <CouncilSignature {...common} className={className} />;
    case "KEEPER":
      return <KeeperSignature {...common} className={className} />;
    case "CRITIC":
      return <CriticSignature {...common} className={className} />;
    case "CURATOR":
      return <CuratorSignature {...common} className={className} />;
    case "INSTALLER":
      return <InstallerSignature {...common} className={className} />;
    case "CONSERVATOR":
      return <ConservatorSignature {...common} className={className} />;
    case "AMBASSADOR":
      return <AmbassadorSignature {...common} className={className} />;
    case "REGISTRAR":
      return <RegistrarSignature {...common} className={className} />;
    case "STEWARD":
      return <StewardSignature {...common} className={className} />;
  }
}

/* ─── Shared SVG wrapper ────────────────────────────────────────────────── */

function SigFrame({
  size,
  className,
  children,
  title,
}: {
  size: number;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ─── Originator — particulate burst / cosmological cloud ───────────────── */

function OriginatorSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const rand = mulberry32(seed);
  // Pick one of four structural variants so the corps doesn't look uniform.
  const variant = seed % 4;
  const points: { x: number; y: number; r: number; op: number }[] = [];

  if (variant === 0) {
    // Dense dust-cloud with radial falloff.
    for (let i = 0; i < 260; i++) {
      const r = Math.pow(rand(), 0.6) * 42;
      const a = rand() * Math.PI * 2;
      const x = 50 + Math.cos(a) * r;
      const y = 50 + Math.sin(a) * r;
      const radius = 0.3 + rand() * 0.6;
      const op = 0.4 + (1 - r / 42) * 0.6;
      points.push({ x, y, r: radius, op });
    }
  } else if (variant === 1) {
    // Ringed system — one bright core, thin orbital rings of dots.
    const rings = 3 + (seed % 3);
    for (let ri = 0; ri < rings; ri++) {
      const r = 10 + ri * 10 + rand() * 3;
      const count = 40 + Math.floor(r * 2);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.2;
        const jitter = rand() * 1.5;
        points.push({
          x: 50 + Math.cos(a) * (r + jitter),
          y: 50 + Math.sin(a) * (r + jitter),
          r: 0.3 + rand() * 0.4,
          op: 0.5 + rand() * 0.35,
        });
      }
    }
    // Core blob
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 4;
      points.push({
        x: 50 + Math.cos(a) * r,
        y: 50 + Math.sin(a) * r,
        r: 0.4 + rand() * 0.6,
        op: 0.9,
      });
    }
  } else if (variant === 2) {
    // Filamentary — strands of dots along 3-5 radial arms.
    const arms = 3 + Math.floor(rand() * 3);
    for (let ai = 0; ai < arms; ai++) {
      const baseA = (ai / arms) * Math.PI * 2 + rand() * 0.3;
      const count = 50;
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const r = t * 40;
        const a = baseA + (rand() - 0.5) * 0.6 + t * 0.5;
        points.push({
          x: 50 + Math.cos(a) * r,
          y: 50 + Math.sin(a) * r,
          r: 0.25 + rand() * 0.5,
          op: 0.4 + (1 - t) * 0.5,
        });
      }
    }
  } else {
    // Lissajous / orbital weave.
    const a1 = 1 + (seed % 3);
    const a2 = 2 + ((seed >> 2) % 3);
    const phase = (seed % 100) / 100;
    const count = 300;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const x = 50 + Math.sin(a1 * t + phase) * 36;
      const y = 50 + Math.sin(a2 * t) * 36;
      points.push({ x, y, r: 0.35, op: 0.75 });
    }
  }

  return (
    <SigFrame size={size} className={className}>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill={color}
          opacity={p.op}
        />
      ))}
    </SigFrame>
  );
}

/* ─── Evaluation Council — polyhedral lattice ───────────────────────────── */

function CouncilSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  // Pick a polyhedron family: octahedron, cube, icosahedron, cuboctahedron
  const family = seed % 4;
  const lines: [number, number, number, number][] = [];
  const dots: [number, number][] = [];
  const cx = 50;
  const cy = 50;
  const R = 32;

  if (family === 0) {
    // Octahedron-ish: 6 vertices, all edges
    const verts = [
      [cx, cy - R],
      [cx, cy + R],
      [cx - R, cy],
      [cx + R, cy],
      [cx - R * 0.7, cy - R * 0.3],
      [cx + R * 0.7, cy + R * 0.3],
    ];
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
      }
    }
    for (const v of verts) dots.push([v[0], v[1]]);
  } else if (family === 1) {
    // Cube wireframe rotated
    const front = [
      [cx - R * 0.7, cy - R * 0.7],
      [cx + R * 0.7, cy - R * 0.7],
      [cx + R * 0.7, cy + R * 0.7],
      [cx - R * 0.7, cy + R * 0.7],
    ];
    const back = front.map(([x, y]) => [x + R * 0.3, y - R * 0.3]);
    for (let i = 0; i < 4; i++) {
      const ni = (i + 1) % 4;
      lines.push([front[i][0], front[i][1], front[ni][0], front[ni][1]]);
      lines.push([back[i][0], back[i][1], back[ni][0], back[ni][1]]);
      lines.push([front[i][0], front[i][1], back[i][0], back[i][1]]);
    }
    for (const v of [...front, ...back]) dots.push([v[0], v[1]]);
  } else if (family === 2) {
    // Icosahedral star: 12 vertices on a circle with internal struts
    const count = 12;
    const verts: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      verts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 4) % count;
      lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    }
    for (const v of verts) dots.push(v);
  } else {
    // Cuboctahedron: 8 triangles + square inner
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      outer.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
      inner.push([cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5]);
    }
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      lines.push([outer[i][0], outer[i][1], outer[j][0], outer[j][1]]);
    }
    for (let i = 0; i < 4; i++) {
      lines.push([outer[i * 2][0], outer[i * 2][1], inner[i][0], inner[i][1]]);
      lines.push([outer[i * 2 + 1][0], outer[i * 2 + 1][1], inner[i][0], inner[i][1]]);
    }
    for (const v of outer) dots.push(v);
    for (const v of inner) dots.push(v);
  }

  return (
    <SigFrame size={size} className={className}>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth="0.4"
          opacity="0.55"
        />
      ))}
      {dots.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r="1" fill={color} opacity="0.85" />
      ))}
      <circle cx={cx} cy={cy} r="1.2" fill={color} />
    </SigFrame>
  );
}

/* ─── Keeper — fractured disc ───────────────────────────────────────────── */

function KeeperSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const rand = mulberry32(seed);
  const cx = 50;
  const cy = 50;
  const R = 34;
  // Three diametric cuts at slightly offset angles, forming a Y-like fracture
  const baseAngles = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const angles = baseAngles.map((a) => a + (rand() - 0.5) * 0.35);

  return (
    <SigFrame size={size} className={className}>
      {/* Stone-ground disc — soft radial gradient */}
      <defs>
        <radialGradient id={`keep-${seed}`} cx="50%" cy="42%">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill={`url(#keep-${seed})`} />
      <circle cx={cx} cy={cy} r={R} stroke={color} strokeWidth="0.35" opacity="0.45" />
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx + Math.cos(a) * R}
          y1={cy + Math.sin(a) * R}
          x2={cx - Math.cos(a) * R}
          y2={cy - Math.sin(a) * R}
          stroke={color}
          strokeWidth="2.2"
          opacity="0.92"
        />
      ))}
      <circle cx={cx} cy={cy} r="1.8" fill={color} />
    </SigFrame>
  );
}

/* ─── Critic — radial bloom / starburst with density halo ───────────────── */

function CriticSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const rand = mulberry32(seed);
  const cx = 50;
  const cy = 50;
  // Count and length distribution vary per critic
  const variant = seed % 3;
  const count = variant === 0 ? 72 : variant === 1 ? 96 : 120;

  const spokes: { x2: number; y2: number; op: number; w: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.05;
    const len = 10 + rand() * 30;
    spokes.push({
      x2: cx + Math.cos(a) * len,
      y2: cy + Math.sin(a) * len,
      op: 0.3 + rand() * 0.6,
      w: 0.25 + rand() * 0.25,
    });
  }

  return (
    <SigFrame size={size} className={className}>
      {spokes.map((s, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={s.x2}
          y2={s.y2}
          stroke={color}
          strokeWidth={s.w}
          opacity={s.op}
        />
      ))}
      <circle cx={cx} cy={cy} r="1.6" fill={color} />
    </SigFrame>
  );
}

/* ─── Curator — grid square with center ─────────────────────────────────── */

function CuratorSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const sz = 46;
  const x = 50 - sz / 2;
  const y = 50 - sz / 2;
  const divisions = 2 + (seed % 2); // 2 or 3 inner cells
  const step = sz / divisions;

  const lines: React.ReactNode[] = [];
  lines.push(
    <rect
      key="r"
      x={x}
      y={y}
      width={sz}
      height={sz}
      stroke={color}
      strokeWidth="0.5"
      opacity="0.75"
    />
  );
  for (let i = 1; i < divisions; i++) {
    lines.push(
      <line
        key={`h${i}`}
        x1={x}
        y1={y + i * step}
        x2={x + sz}
        y2={y + i * step}
        stroke={color}
        strokeWidth="0.4"
        opacity="0.45"
      />
    );
    lines.push(
      <line
        key={`v${i}`}
        x1={x + i * step}
        y1={y}
        x2={x + i * step}
        y2={y + sz}
        stroke={color}
        strokeWidth="0.4"
        opacity="0.45"
      />
    );
  }

  return (
    <SigFrame size={size} className={className}>
      {lines}
      <circle cx="50" cy="50" r="1.4" fill={color} />
    </SigFrame>
  );
}

/* ─── Installer — isometric cube ─────────────────────────────────────────── */

function InstallerSignature({
  seed: _seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  // Fixed isometric cube — the Installer is one agent, no variation needed.
  return (
    <SigFrame size={size} className={className}>
      <polygon
        points="50,20 80,35 80,65 50,80 20,65 20,35"
        stroke={color}
        strokeWidth="0.55"
        opacity="0.75"
      />
      <polyline
        points="20,35 50,50 80,35"
        stroke={color}
        strokeWidth="0.55"
        opacity="0.75"
      />
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="80"
        stroke={color}
        strokeWidth="0.55"
        opacity="0.75"
      />
      <circle cx="50" cy="50" r="1.2" fill={color} />
    </SigFrame>
  );
}

/* ─── Conservator — concentric rings ────────────────────────────────────── */

function ConservatorSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const ringCount = 5 + (seed % 3); // 5–7 rings
  const rings = Array.from({ length: ringCount }, (_, i) => 8 + i * (28 / ringCount));

  return (
    <SigFrame size={size} className={className}>
      {rings.map((r, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={r}
          stroke={color}
          strokeWidth="0.45"
          opacity={0.35 + (1 - i / ringCount) * 0.45}
        />
      ))}
      <circle cx="50" cy="50" r="1.6" fill={color} />
    </SigFrame>
  );
}

/* ─── Ambassador — starburst bloom ──────────────────────────────────────── */

function AmbassadorSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const rand = mulberry32(seed);
  const cx = 50;
  const cy = 50;
  const count = 160;
  const spokes: { x2: number; y2: number; op: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // Long primary spokes every 8th, short in between
    const long = i % 8 === 0;
    const len = long ? 36 : 12 + rand() * 10;
    spokes.push({
      x2: cx + Math.cos(a) * len,
      y2: cy + Math.sin(a) * len,
      op: long ? 0.9 : 0.3 + rand() * 0.3,
    });
  }
  return (
    <SigFrame size={size} className={className}>
      {spokes.map((s, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={s.x2}
          y2={s.y2}
          stroke={color}
          strokeWidth="0.3"
          opacity={s.op}
        />
      ))}
      <circle cx={cx} cy={cy} r="1.8" fill={color} />
    </SigFrame>
  );
}

/* ─── Registrar — barcode / ledger bars ─────────────────────────────────── */

function RegistrarSignature({
  seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  const rand = mulberry32(seed);
  const bars: { x: number; w: number; op: number }[] = [];
  const total = 14;
  let x = 20;
  for (let i = 0; i < total; i++) {
    const w = 0.6 + rand() * 3;
    const gap = 0.8 + rand() * 2.2;
    bars.push({ x, w, op: 0.55 + rand() * 0.4 });
    x += w + gap;
    if (x > 82) break;
  }

  return (
    <SigFrame size={size} className={className}>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y="22"
          width={b.w}
          height="56"
          fill={color}
          opacity={b.op}
        />
      ))}
    </SigFrame>
  );
}

/* ─── Steward Agent — targeting ring ────────────────────────────────────── */

function StewardSignature({
  seed: _seed,
  size,
  color,
  className,
}: {
  seed: number;
  size: number;
  color: string;
  className?: string;
}) {
  return (
    <SigFrame size={size} className={className}>
      <circle cx="50" cy="50" r="32" stroke={color} strokeWidth="0.5" opacity="0.8" />
      <circle cx="50" cy="50" r="22" stroke={color} strokeWidth="0.35" opacity="0.45" />
      <line x1="12" y1="50" x2="22" y2="50" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <line x1="78" y1="50" x2="88" y2="50" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <line x1="50" y1="12" x2="50" y2="22" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <line x1="50" y1="78" x2="50" y2="88" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <circle cx="50" cy="50" r="2.2" fill={color} />
    </SigFrame>
  );
}
