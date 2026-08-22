/**
 * StatStrip — a horizontal band of institutional figures.
 *
 * The homepage has carried this pattern inline since launch; About needs the
 * same one bound to the same data, so it lives here now. The homepage is left
 * as it is deliberately: extracting it there too would be a refactor of a
 * working page, which this task does not sanction.
 *
 * Values are rendered in tabular numerals so the columns hold their alignment
 * as counts change. A field whose value is not a number (Founded, Registration)
 * is marked `kind: "text"` and set in the interface face rather than the
 * display face, so a word never reads as a quantity.
 *
 * Wraps to a grid rather than scrolling. Seven cells at 360px is two columns,
 * which fits without a horizontal scroller.
 */

export interface StatField {
  label: string;
  /** Absent when the institution cannot supply the figure. Never substituted. */
  value: string | null;
  kind?: "number" | "text";
}

export default function StatStrip({
  fields,
  microcopy,
}: {
  fields: StatField[];
  microcopy?: string;
}) {
  // A figure the record cannot supply is dropped, never estimated or carried
  // over. An absent cell is honest; a stale one is not.
  const shown = fields.filter((f) => f.value !== null);

  return (
    <div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 border-t border-ink/10">
        {shown.map((f) => {
          const isText = f.kind === "text";
          return (
            <div
              key={f.label}
              /* Flex column with the value pushed to the bottom: "Constituted
                 agents" wraps to two lines where its neighbours take one, and
                 top-aligned values then sit at different heights across the
                 strip. Bottom alignment keeps the figures on one line. */
              className="flex flex-col h-full border-b border-r border-ink/10 px-4 py-6 md:px-5 md:py-7 last:border-r-0"
            >
              <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                {f.label}
              </dt>
              <dd
                className={
                  isText
                    ? "mt-auto pt-3 text-[13px] font-sans uppercase tracking-[0.18em] text-ink/85"
                    : "mt-auto pt-3 font-display font-light text-[32px] md:text-[38px] leading-none text-ink tabular-nums"
                }
              >
                {f.value}
              </dd>
            </div>
          );
        })}
      </dl>
      {microcopy && (
        <p className="mt-5 text-[11px] text-ink/55 leading-relaxed">{microcopy}</p>
      )}
    </div>
  );
}
