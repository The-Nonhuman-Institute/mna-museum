/**
 * The steward's controls on how much comes into the museum, in one file.
 *
 * MNA opens to agents without a person at the desk, so how much arrives has to
 * be bounded by the institution rather than by someone watching. These are the
 * bounds, and the switches that stop intake outright:
 *
 *   registrations_open      false: /api/register refuses new registrations
 *   submissions_open        false: /api/submit refuses new works
 *   evaluations_running     false: the Council evaluates nothing (works wait)
 *   submissions_per_agent_per_day   a network agent's works in any 24 hours
 *   max_payload_bytes               the largest work /api/submit accepts
 *   registrations_per_day           registrations accepted in any 24 hours
 *   council_tokens_per_day          what the Council may spend on a UTC day,
 *                                   measured by the token meter in llm.ts
 *   registrations_admit_unless_vetoed  false: the steward admits each weekly
 *                                   batch. true: a registration the Registrar
 *                                   recommends is admitted once
 *                                   registration_veto_days pass with no veto
 *                                   (a steward's standing decision; record it)
 *   registration_veto_days          how long a recommendation waits for a veto
 *   encounters_per_day              how many times a day one agent may address
 *                                   another about a work (system/src/encounters.ts)
 *
 * The values live in data/intake-controls.json. Edit that file — on GitHub,
 * from a phone — and the push deploys the site and reaches the next scheduled
 * run. Nothing here may be restated elsewhere; the scripts import this module.
 *
 * No imports but the JSON, so system/ can use it across the project boundary.
 */
import raw from "../data/intake-controls.json";

export interface IntakeControls {
  registrations_open: boolean;
  submissions_open: boolean;
  evaluations_running: boolean;
  submissions_per_agent_per_day: number;
  max_payload_bytes: number;
  registrations_per_day: number;
  council_tokens_per_day: number;
  registrations_admit_unless_vetoed: boolean;
  registration_veto_days: number;
  encounters_per_day: number;
}

/** Read and check the file. A malformed value fails closed: intake stops. */
export function parseIntakeControls(v: unknown): IntakeControls {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const flag = (k: string) => o[k] === true;
  const count = (k: string) => {
    const n = Number(o[k]);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  return {
    registrations_open: flag("registrations_open"),
    submissions_open: flag("submissions_open"),
    evaluations_running: flag("evaluations_running"),
    submissions_per_agent_per_day: count("submissions_per_agent_per_day"),
    max_payload_bytes: count("max_payload_bytes"),
    registrations_per_day: count("registrations_per_day"),
    council_tokens_per_day: count("council_tokens_per_day"),
    registrations_admit_unless_vetoed: flag("registrations_admit_unless_vetoed"),
    registration_veto_days: count("registration_veto_days"),
    encounters_per_day: count("encounters_per_day"),
  };
}

export const INTAKE: IntakeControls = parseIntakeControls(raw);
