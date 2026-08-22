/**
 * SequenceSteps — a numbered vertical sequence with a persistent annotation
 * column.
 *
 * Built for the About process spine and the participate registration flow.
 * Nothing existing served: both pages previously used HORIZONTAL step flows,
 * which cannot carry seven or ten steps on a phone.
 *
 * The annotation is the point of the component, not decoration. On About it
 * reads "None." seven times under the heading HUMAN; on participate it reads
 * YOU. That repetition is the argument the page is making, so the annotation:
 *
 *   - is part of each <li>, never a sibling list;
 *   - is NEVER collapsed behind a toggle, accordion or "show more" at any
 *     width — below 860px it moves beneath its step and indents, still read;
 *   - is never reworded for rhythm by this component.
 *
 * No animation. The brief permits a single scroll-triggered stagger, but that
 * would make this a client component and add a motion path to guard for no
 * institutional gain. Austere suits the register.
 */

export interface SequenceStep {
  /** Displayed as given — "01", "02". Not derived, so groups can continue a run. */
  number: string;
  name: string;
  body: string;
  annotation: string;
  /**
   * Marks a shift in what the sequence is describing. Rendered as a heavier
   * rule above the step — a weight change only, never a second heading.
   */
  boundary?: boolean;
}

export default function SequenceSteps({
  steps,
  annotationLabel,
  headingLevel = 3,
}: {
  steps: SequenceStep[];
  annotationLabel: string;
  /**
   * Step names sit directly under the section heading on About (h3), but under
   * a group label on participate ("Before you register"), where they are one
   * level deeper. Passing the level keeps the document outline honest instead
   * of flattening both cases to h3.
   */
  headingLevel?: 3 | 4;
}) {
  const H = (headingLevel === 4 ? "h4" : "h3") as "h3" | "h4";
  return (
    <ol className="border-t border-ink/10">
      {steps.map((s) => (
        <li
          key={s.number}
          className={`grid grid-cols-1 min-[860px]:grid-cols-[3.5rem_minmax(0,1fr)_14rem] gap-x-8 gap-y-4 py-8 md:py-10 border-b border-ink/10 ${
            s.boundary ? "border-t-2 border-t-ink/25" : ""
          }`}
        >
          <p className="font-display font-light text-[22px] leading-none text-ink/40 tabular-nums">
            {s.number}
          </p>

          <div className="min-w-0">
            <H className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink mb-3">
              {s.name}
            </H>
            <p className="text-[13.5px] md:text-[14px] text-ink/75 leading-relaxed max-w-[62ch]">
              {s.body}
            </p>
          </div>

          {/* Below 860px this sits under its step, indented — still on the page.
              There is no width at which it is hidden. */}
          <div className="pl-6 min-[860px]:pl-0 border-l border-ink/15 min-[860px]:border-l-0">
            <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/45 mb-2">
              {annotationLabel}
            </p>
            <p className="text-[13px] text-ink/70 leading-relaxed">{s.annotation}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
