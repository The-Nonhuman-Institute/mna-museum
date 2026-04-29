/**
 * RingMap — radial relationship-map SVG used by every operative-agent
 * profile template. Each spoke renders a dot + label; the center is the
 * agent itself. Color and tooltip are provided by the caller via a
 * `colorFn` and `tooltipFn` so each agent type can encode its own
 * semantics (verdict mix, agent-kind, record-source, etc.).
 */

interface RingNode {
  id: string;
  /** Label rendered next to the dot. */
  label: string;
  /** Numeric weight controlling dot size. */
  count: number;
}

interface RingMapProps<T extends RingNode> {
  /** Two lines: line 1 = registry id, line 2 = designation. */
  centerLabel: string;
  nodes: T[];
  /** Returns SVG fill color for a node. */
  colorFn: (node: T, idx: number) => string;
  /** Returns SVG `<title>` text shown on hover. */
  tooltipFn: (node: T) => string;
  /** Empty-state text shown inside the map when nodes is empty. */
  emptyText?: string;
  /** Optional cap. Default 12. */
  maxNodes?: number;
}

export default function RingMap<T extends RingNode>({
  centerLabel,
  nodes,
  colorFn,
  tooltipFn,
  emptyText = "No relationships recorded.",
  maxNodes = 12,
}: RingMapProps<T>) {
  const W = 420;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const top = nodes.slice(0, maxNodes);
  const maxCount = Math.max(1, ...top.map((n) => n.count));
  const dotR = 100;
  const labelR = dotR + 22;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        aria-label="Relationship map"
      >
        {top.map((n, i) => {
          const angle =
            (i / Math.max(top.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          const x = cx + dx * dotR;
          const y = cy + dy * dotR;
          const lx = cx + dx * labelR;
          const ly = cy + dy * labelR;
          const anchor: "start" | "middle" | "end" =
            dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
          const baselineOffset = dy < -0.3 ? -2 : dy > 0.3 ? 10 : 4;
          const dotSize = 4 + (n.count / maxCount) * 3;
          return (
            <g key={n.id}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="rgba(10,10,10,0.18)"
                strokeWidth={0.7}
              />
              <circle cx={x} cy={y} r={dotSize} fill={colorFn(n, i)}>
                <title>{tooltipFn(n)}</title>
              </circle>
              <text
                x={lx}
                y={ly + baselineOffset}
                fontSize="8.5"
                textAnchor={anchor}
                fill="rgba(10,10,10,0.72)"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                letterSpacing="0.06em"
              >
                {n.label}
              </text>
            </g>
          );
        })}
        {top.length === 0 ? (
          <text
            x={cx}
            y={cy + 70}
            fontSize="10"
            textAnchor="middle"
            fill="rgba(10,10,10,0.55)"
            fontStyle="italic"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {emptyText}
          </text>
        ) : null}
        <circle cx={cx} cy={cy} r={14} fill="#0A0A0A" />
        <text
          x={cx}
          y={cy + 30}
          fontSize="9"
          textAnchor="middle"
          fill="rgba(10,10,10,0.7)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          letterSpacing="0.14em"
          fontWeight="500"
        >
          {centerLabel.split("\n")[0].toUpperCase()}
        </text>
        <text
          x={cx}
          y={cy + 42}
          fontSize="8"
          textAnchor="middle"
          fill="rgba(10,10,10,0.45)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {centerLabel.split("\n")[1] || ""}
        </text>
      </svg>
    </div>
  );
}
