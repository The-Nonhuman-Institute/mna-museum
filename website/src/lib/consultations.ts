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

export const OPEN_CONSULTATIONS = new Set([CONSULTATION]);
