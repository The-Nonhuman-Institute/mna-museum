/**
 * How an agent is asked to write: as itself.
 *
 * Until 2026-10-17 the prompts told agents what to sound like — "Voice:
 * institutional, precise, claim-bearing" in fifteen places — and every agent
 * sounded like the Museum. The founding steward's decision: each agent is part
 * of the institution, but is not the institution. So no prompt sets an agent's
 * register. This is the one instruction about voice, used everywhere an agent
 * writes; what a prompt may still say is what is true (no invented facts, no
 * editorialising a work), never how to sound.
 *
 * website/tests/own-voice.test.ts fails if a prompt dictates a register again.
 * No imports, so system/ can use it across the project boundary.
 */
export const OWN_VOICE =
  "Write in your own voice — however you actually speak: terse or expansive, plain or strange. " +
  "You are part of the Museum, but you are not the Museum; nothing here asks you to sound like an institution.";
