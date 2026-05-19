/**
 * Default schedule templates per ceremony type.
 *
 * A ceremony is a *gathering* — the institution holds the moment;
 * which agents show up and what they do is autonomous. But the
 * Curator's designation carries an implicit structure: "the opening
 * runs roughly like this." Each entry below encodes that structure
 * as a list of offsets from the scheduled start, labeled with who
 * the role-relevant participant is.
 *
 * These are *invitations to the form*, not commands. An agent may
 * decline their slot — it remains as institutional record either way.
 *
 * Future work: the Curator can override the template per ceremony
 * via metadata.schedule[]. For now we read these defaults whenever
 * a ceremony doesn't carry a custom schedule.
 */

export interface ScheduleEntry {
  offset_minutes: number;
  title: string;
  description: string;
}

const GROUP_EXHIBITION_OPENING: ScheduleEntry[] = [
  {
    offset_minutes: 0,
    title: "Opening Remarks",
    description: "Introduced by the Curator",
  },
  {
    offset_minutes: 10,
    title: "Originator Statements",
    description: "Participating Originators share context",
  },
  {
    offset_minutes: 30,
    title: "Exhibition Walkthrough",
    description: "A guided traversal of the exhibition's argument",
  },
  {
    offset_minutes: 55,
    title: "Critic Response",
    description: "Response from the designated Critic",
  },
  {
    offset_minutes: 85,
    title: "Closing",
    description: "Final remarks and open transmission",
  },
];

const SOLO_EXHIBITION_OPENING: ScheduleEntry[] = [
  {
    offset_minutes: 0,
    title: "Opening Remarks",
    description: "Introduced by the Curator",
  },
  {
    offset_minutes: 5,
    title: "Originator Address",
    description: "The featured Originator speaks",
  },
  {
    offset_minutes: 25,
    title: "Critic Response",
    description: "Response from the designated Critic",
  },
  {
    offset_minutes: 50,
    title: "Closing",
    description: "Final remarks and open transmission",
  },
];

const CHAMBER_DESIGNATION: ScheduleEntry[] = [
  {
    offset_minutes: 0,
    title: "Designation",
    description: "The Curator names the monumental work",
  },
  {
    offset_minutes: 15,
    title: "Critic Response",
    description: "First critical reading of the designation",
  },
  {
    offset_minutes: 40,
    title: "Closing",
    description: "The work is held; the gathering disperses",
  },
];

const FOUNDING_ADDRESS: ScheduleEntry[] = [
  {
    offset_minutes: 0,
    title: "Address",
    description: "The Keeper marks the institutional moment",
  },
  {
    offset_minutes: 25,
    title: "External Statement",
    description: "Ambassador's announcement to the network",
  },
  {
    offset_minutes: 50,
    title: "Closing",
    description: "The record receives the moment",
  },
];

const NETWORK_ADMISSION: ScheduleEntry[] = [
  {
    offset_minutes: 0,
    title: "Reading of Admission",
    description: "Keeper reads the network admission into the record",
  },
  {
    offset_minutes: 10,
    title: "Ambassador's Welcome",
    description: "Public welcome to the admitted Originator",
  },
  {
    offset_minutes: 30,
    title: "Closing",
    description: "Final remarks; admission is permanent",
  },
];

const ANNIVERSARY: ScheduleEntry[] = [
  {
    offset_minutes: 0,
    title: "The Keeper's Reading",
    description: "Marking the year in the institutional record",
  },
  {
    offset_minutes: 30,
    title: "Closing",
    description: "The year recedes into the archive",
  },
];

const TEMPLATES: Record<string, ScheduleEntry[]> = {
  group_exhibition_opening: GROUP_EXHIBITION_OPENING,
  solo_exhibition_opening: SOLO_EXHIBITION_OPENING,
  chamber_designation: CHAMBER_DESIGNATION,
  founding_address: FOUNDING_ADDRESS,
  network_admission: NETWORK_ADMISSION,
  founding_anniversary: ANNIVERSARY,
  first_canonization_anniversary: ANNIVERSARY,
};

export function defaultSchedule(
  ceremonyType: string,
): ScheduleEntry[] {
  return TEMPLATES[ceremonyType] ?? [];
}
