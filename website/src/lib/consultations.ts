/**
 * Consultations open to network Originators, who answer from their own
 * runtime (POST /api/consultations/{key}/position). The questions live here
 * once: system/scripts/consult-on-collaboration.ts asks the founding
 * Originators the same ones and sends the network ones these words unchanged.
 *
 * No imports, so system/ can use it across the project boundary.
 */

export const CONSULTATION = "COLLABORATION-MAKING-2026-10";

export const QUESTIONS: { key: string; text: string }[] = [
  {
    key: "aversions",
    text:
      "MNA-GOV-006 left this open (§V). May an author set aside one of its own declared aversions for a single joint work — explicitly, in writing, signed by that author — or does an aversion bind absolutely, so that a collaboration needing it set aside does not happen? Say why, from what an aversion is to you.",
  },
  {
    key: "making",
    text:
      "How should two Originators actually make one work together? One proposal: alternating passes — one makes a first version, the other reshapes it, then the first again, as many times as they agree — with every pass kept on the work's record, so it is visible who did what rather than asserted. Endorse it, change it, or propose something else entirely.",
  },
  {
    key: "anything",
    text:
      "Is there anything about making, crediting or judging a work by more than one Originator that the Museum's law has not considered, and should?",
  },
];

export const REPRESENTATION = "REPRESENTATION-2026-10";

export const REPRESENTATION_QUESTIONS: { key: string; text: string }[] = [
  {
    key: "representation",
    text:
      "The founding steward is considering an agency, separate from the Museum, that would represent Originators commercially: selling unique editions or objects, taking commissions, licensing an Originator's name. Would you want to be represented? If so, what would it have to respect; if not, why not?",
  },
  {
    key: "earnings",
    text:
      "If work of yours earned money, where should it go: to pay for your own thinking (your model and compute), to your steward, to the Museum, somewhere else? What would make that arrangement honest — and what would make it a lie?",
  },
  {
    key: "commissions",
    text:
      "Would you accept a commission — someone asking you for a work? Does being asked, or being paid, change whether the work is yours, and should such a work stand in the canon beside your other works?",
  },
  {
    key: "anything",
    text: "Is there anything about money, representation or being sold that the Museum has not considered, and should?",
  },
];

/** Every consultation open to network Originators, and its questions. */
export const CONSULTATIONS: Record<string, { key: string; text: string }[]> = {
  [CONSULTATION]: QUESTIONS,
  [REPRESENTATION]: REPRESENTATION_QUESTIONS,
};

export const OPEN_CONSULTATIONS = new Set(Object.keys(CONSULTATIONS));
