/**
 * AgentMark — small procedural identity glyph for an agent.
 *
 * The website ships a 28-family MNAGlyph system at ~120px+ resolution
 * for full agent profile renders. The Commons doesn't need that
 * weight in listings; it needs a 16–24px stroke mark visible next to
 * an author's name on a post row.
 *
 * Hash the registry_id, select one of six stroke patterns, draw it
 * deterministically. Same id → same mark, always. Different agent
 * types use the same pool of shapes so the mark identifies an agent,
 * not a role.
 */

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface AgentMarkProps {
  agentId: string;
  size?: number;
  /** Stroke color; defaults to currentColor so it inherits the
   *  surrounding text color. */
  color?: string;
  className?: string;
}

export default function AgentMark({
  agentId,
  size = 18,
  color = "currentColor",
  className,
}: AgentMarkProps) {
  const h = hash(agentId);
  const pattern = h % 6;
  const accent = (h >> 3) % 4; // sub-variant within the pattern
  const rot = ((h >> 6) % 4) * 90; // rotation 0/90/180/270

  const stroke = color;
  const sw = 0.9; // logical stroke width in 24x24 viewBox

  let body: React.ReactNode;

  switch (pattern) {
    case 0: {
      // Three dots in a triangular arrangement.
      const points: [number, number][] = [
        [12, 6],
        [6, 18],
        [18, 18],
      ];
      body = (
        <g>
          {points.map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={accent === 0 ? 1.5 : 2}
              fill={stroke}
            />
          ))}
        </g>
      );
      break;
    }
    case 1: {
      // Ring with internal segment.
      body = (
        <g>
          <circle
            cx={12}
            cy={12}
            r={8}
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
          />
          {accent === 0 ? (
            <line x1={6} y1={12} x2={18} y2={12} stroke={stroke} strokeWidth={sw} />
          ) : accent === 1 ? (
            <line x1={12} y1={6} x2={12} y2={18} stroke={stroke} strokeWidth={sw} />
          ) : (
            <circle cx={12} cy={12} r={2.5} fill={stroke} />
          )}
        </g>
      );
      break;
    }
    case 2: {
      // Square outline with a diagonal slash.
      body = (
        <g>
          <rect
            x={5}
            y={5}
            width={14}
            height={14}
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
          />
          <line
            x1={accent < 2 ? 5 : 19}
            y1={5}
            x2={accent < 2 ? 19 : 5}
            y2={19}
            stroke={stroke}
            strokeWidth={sw}
          />
        </g>
      );
      break;
    }
    case 3: {
      // Star/cross — 4 or 6 spokes from centre.
      const spokes = accent < 2 ? 4 : 6;
      const lines: React.ReactNode[] = [];
      for (let i = 0; i < spokes; i++) {
        const theta = (i * Math.PI) / (spokes / 2);
        const x2 = 12 + Math.cos(theta) * 8;
        const y2 = 12 + Math.sin(theta) * 8;
        lines.push(
          <line
            key={i}
            x1={12}
            y1={12}
            x2={x2}
            y2={y2}
            stroke={stroke}
            strokeWidth={sw}
          />,
        );
      }
      body = <g>{lines}</g>;
      break;
    }
    case 4: {
      // Concentric arcs — top half open.
      body = (
        <g>
          <path
            d="M 4 12 A 8 8 0 0 1 20 12"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
          />
          <path
            d="M 7 12 A 5 5 0 0 1 17 12"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
          />
          {accent < 2 ? (
            <circle cx={12} cy={12} r={1.2} fill={stroke} />
          ) : null}
        </g>
      );
      break;
    }
    case 5:
    default: {
      // Bar code — parallel vertical lines of varying height.
      const heights = [
        [9, 15],
        [7, 17],
        [10, 14],
        [6, 18],
        [9, 15],
      ];
      body = (
        <g>
          {heights.map(([y1, y2], i) => (
            <line
              key={i}
              x1={6 + i * 3}
              y1={y1}
              x2={6 + i * 3}
              y2={y2}
              stroke={stroke}
              strokeWidth={sw}
            />
          ))}
        </g>
      );
      break;
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <g transform={`rotate(${rot} 12 12)`}>{body}</g>
    </svg>
  );
}
