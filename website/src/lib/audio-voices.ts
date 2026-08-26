/**
 * Reading the notes out of an audio-json payload.
 *
 * The declared shape nests notes inside voices:
 *
 *   { "voices": [ { "type": "sine", "notes": [ {freq, start, duration, gain} ] } ] }
 *
 * MNA-OR-0002-W-0030 wrote something else — seventy-five voices, each carrying
 * its own freq/start/end directly, with no notes array at all. The renderer
 * looked for `voice.notes`, found nothing seventy-five times, and played
 * silence behind a button that said "Listen". Nothing failed; the work simply
 * made no sound, which is the worst way for an audio work to be wrong.
 *
 * So both readings are accepted here: a voice may hold notes, or a voice may BE
 * a note. `end` is accepted alongside `duration` for the same reason — it is an
 * obvious way to write it, and rejecting sound over a synonym helps no one.
 *
 * Shared with submission validation so the institution cannot accept an audio
 * work the player will not sound. One reader, one answer.
 */

export type OscType = "sine" | "square" | "sawtooth" | "triangle";

export interface PlayableNote {
  type: OscType;
  freq: number;
  start: number;
  duration: number;
  gain: number;
}

const OSC_TYPES: OscType[] = ["sine", "square", "sawtooth", "triangle"];

function oscType(value: unknown, fallback: OscType = "sine"): OscType {
  return typeof value === "string" && (OSC_TYPES as string[]).includes(value)
    ? (value as OscType)
    : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Duration from either `duration` or a `start`/`end` pair. Returns null when
 * neither is expressed, so the caller can apply its own default rather than
 * silently inventing a length.
 */
function durationOf(source: Record<string, unknown>, start: number): number | null {
  const explicit = num(source.duration);
  if (explicit !== null) return explicit;
  const end = num(source.end);
  if (end !== null) return end - start;
  return null;
}

function toNote(
  source: Record<string, unknown>,
  inheritedType: OscType,
): PlayableNote | null {
  const freq = num(source.freq);
  if (freq === null) return null;
  const start = num(source.start) ?? 0;
  const duration = durationOf(source, start) ?? 1;
  if (duration <= 0) return null;
  return {
    type: oscType(source.type, inheritedType),
    freq,
    start: Math.max(0, start),
    duration,
    gain: num(source.gain) ?? 0.3,
  };
}

/** Every note an audio-json payload actually asks to be sounded. */
export function playableNotes(data: unknown): PlayableNote[] {
  if (!data || typeof data !== "object") return [];
  const voices = (data as { voices?: unknown }).voices;
  if (!Array.isArray(voices)) return [];

  const out: PlayableNote[] = [];
  for (const raw of voices) {
    if (!raw || typeof raw !== "object") continue;
    const voice = raw as Record<string, unknown>;
    const voiceType = oscType(voice.type);

    const notes = voice.notes;
    if (Array.isArray(notes) && notes.length > 0) {
      for (const n of notes) {
        if (!n || typeof n !== "object") continue;
        const note = toNote(n as Record<string, unknown>, voiceType);
        if (note) out.push(note);
      }
      continue;
    }

    // The voice is itself a note.
    const note = toNote(voice, voiceType);
    if (note) out.push(note);
  }
  return out;
}

/** Total sounding length, for players that need to know when to stop. */
export function audioDuration(data: unknown, notes: PlayableNote[]): number {
  const declared = num((data as { duration?: unknown })?.duration);
  const played = notes.reduce((max, n) => Math.max(max, n.start + n.duration), 0);
  return Math.max(declared ?? 0, played);
}
