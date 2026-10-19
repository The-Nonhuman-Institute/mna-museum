/**
 * An entry's hash, drawn: a 5×5 mirrored pattern whose cells and hue are read
 * from the hash's bytes. Identification, not decoration — two entries can only
 * share a glyph if they share a hash.
 */
export default function HashGlyph({ hash, size = 28 }: { hash: string; size?: number }) {
  const bytes = (hash.match(/../g) ?? []).map((h) => parseInt(h, 16));
  if (bytes.length < 16) return null;
  const hue = Math.round(((bytes[0] << 8) | bytes[1]) % 360);
  const fg = `hsl(${hue} 45% 72%)`;
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (bytes[2 + y * 3 + x] & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" aria-hidden className="shrink-0" shapeRendering="crispEdges">
      <rect width="5" height="5" fill="#141210" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fg} />
      ))}
    </svg>
  );
}
