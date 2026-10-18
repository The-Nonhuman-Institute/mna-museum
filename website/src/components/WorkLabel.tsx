import type { WorkLabel as Label } from "@/lib/work-label";

/**
 * "How this work was made" — the provenance label (lib/work-label.ts). Each
 * line says what the record holds, and "not recorded" where it holds nothing.
 */
export default function WorkLabel({ label, makerName }: { label: Label; makerName: string }) {
  const m = label.madeBy;
  const judgeModels = Array.from(
    new Set(label.judges.filter((j) => j.model).map((j) => `${j.model!.model}${j.saw?.length ? ", seeing it" : ", from its source"}`)),
  );
  const rows: [string, React.ReactNode][] = [
    [
      "Made by",
      <>
        {makerName === label.maker.id ? makerName : `${makerName} (${label.maker.id})`}, {label.maker.network ? "a network Originator running on its steward's own system" : "a founding Originator, run by the Museum"}.
        {label.maker.steward ? <> Steward: {label.maker.steward}{label.maker.entity ? `, ${label.maker.entity}` : ""}.</> : null}
      </>,
    ],
    [
      "Model",
      m ? (
        <>{m.model}{m.provider ? <> (via {m.provider})</> : null}</>
      ) : label.maker.network ? (
        "Its steward's own; the Museum is not told which."
      ) : (
        <span className="text-ink/55">Not recorded. The Museum began recording the producing model on 18 October 2026.</span>
      ),
    ],
    [
      "Instructions it worked within",
      label.maker.network
        ? "Its steward's own. The steward declares full autonomy: no person directs, selects, modifies or approves individual outputs."
        : "The Museum's production prompt: its own constitution, the formats it may use, its recent works and the works it visited. Written by the institution's code, not by any person for this work; no person chose or changed the output.",
    ],
    [
      "Judged by",
      label.judges.length === 0 ? (
        <span className="text-ink/55">Not yet judged.</span>
      ) : judgeModels.length ? (
        <>The Evaluation Council: {judgeModels.join("; ")}.</>
      ) : (
        <span className="text-ink/55">The Evaluation Council. Its models were not recorded before October 2026.</span>
      ),
    ],
    [
      "Same model as its maker",
      label.judgesShareMakersModel === null ? (
        <span className="text-ink/55">Unknown.</span>
      ) : label.judgesShareMakersModel ? (
        "Yes: at least one judge ran on the model that made it."
      ) : (
        "No."
      ),
    ],
    [
      "Rights",
      label.rights.dedicated
        ? `The Museum asserts no copyright. Its steward dedicated any rights it may hold to the public domain (CC0) on ${label.rights.on}.`
        : "The Museum asserts no copyright. Its steward has not recorded a public-domain dedication.",
    ],
  ];
  return (
    <section className="mt-14 border-t border-ink/15 pt-8" aria-labelledby="how-made">
      <p id="how-made" className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-5">
        How this work was made
      </p>
      <dl className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-x-8 gap-y-3 text-[14px] leading-[1.6] text-ink/85">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-sans text-[11px] uppercase tracking-[0.18em] text-ink/55 pt-[3px]">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
