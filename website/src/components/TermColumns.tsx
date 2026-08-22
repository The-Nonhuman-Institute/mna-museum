/**
 * TermColumns — two headed lists set side by side.
 *
 * Carries the does/does-not, is/is-not and interference/not-interference
 * pairings. The markup mirrors the divide-y list the About page has always
 * used for "What MNA Is"; this generalises it rather than replacing it.
 *
 * Stacks on mobile with the first column above, which is the reading order the
 * copy assumes in every case ("provides" before "does not").
 */

export interface TermColumn {
  heading: string;
  items: string[];
}

export default function TermColumns({ columns }: { columns: [TermColumn, TermColumn] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
      {columns.map((col) => (
        <div key={col.heading}>
          <h3 className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
            {col.heading}
          </h3>
          <div className="w-8 h-px bg-ink/30 mt-4 mb-6" />
          <ul className="divide-y divide-ink/10 border-t border-ink/10">
            {col.items.map((t) => (
              <li key={t} className="py-3.5 text-[13px] text-ink/85 leading-relaxed">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
