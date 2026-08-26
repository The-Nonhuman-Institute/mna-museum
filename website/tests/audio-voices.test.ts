import { describe, expect, it } from "vitest";
import { audioDuration, playableNotes } from "@/lib/audio-voices";

/**
 * MNA-OR-0002-W-0030 was accepted, canonised into the queue, given a "Listen"
 * button, and made no sound — because it wrote its voices in a shape the
 * reader did not expect. Three separate readers had the same bug. These are
 * the cases that were wrong in production.
 */
describe("playableNotes", () => {
  it("reads the declared shape: voices holding notes", () => {
    const notes = playableNotes({
      duration: 2,
      voices: [{ type: "square", notes: [{ freq: 440, start: 0, duration: 1, gain: 0.5 }] }],
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: "square", freq: 440, duration: 1, gain: 0.5 });
  });

  it("reads a voice that IS a note — the W-0030 shape", () => {
    const notes = playableNotes({
      duration: 180,
      voices: [
        { type: "sine", freq: 32.7, start: 0, end: 45, gain: 0.35 },
        { type: "sine", freq: 49, start: 15, end: 60, gain: 0.2 },
      ],
    });
    expect(notes).toHaveLength(2);
    expect(notes[0].duration).toBe(45);
    expect(notes[1].start).toBe(15);
    expect(notes[1].duration).toBe(45);
  });

  it("prefers an explicit duration over start/end", () => {
    const [n] = playableNotes({ voices: [{ freq: 100, start: 2, end: 99, duration: 3 }] });
    expect(n.duration).toBe(3);
  });

  it("inherits the voice's oscillator type, and a note may override it", () => {
    const notes = playableNotes({
      voices: [{ type: "sawtooth", notes: [{ freq: 1 }, { freq: 2, type: "triangle" }] }],
    });
    expect(notes.map((n) => n.type)).toEqual(["sawtooth", "triangle"]);
  });

  it("returns nothing for payloads that cannot sound", () => {
    expect(playableNotes(null)).toEqual([]);
    expect(playableNotes({})).toEqual([]);
    expect(playableNotes({ voices: [] })).toEqual([]);
    expect(playableNotes({ voices: [{ type: "sine" }] })).toEqual([]);       // no freq
    expect(playableNotes({ voices: [{ freq: 440, start: 5, end: 5 }] })).toEqual([]); // zero length
    expect(playableNotes({ voices: "not an array" })).toEqual([]);
  });

  it("ignores junk entries without discarding the good ones", () => {
    const notes = playableNotes({ voices: [null, { freq: 440 }, "x", { nope: 1 }] });
    expect(notes).toHaveLength(1);
  });
});

describe("audioDuration", () => {
  it("is the longer of the declared length and what actually sounds", () => {
    const notes = playableNotes({ voices: [{ freq: 440, start: 0, end: 30 }] });
    expect(audioDuration({ duration: 10 }, notes)).toBe(30);
    expect(audioDuration({ duration: 60 }, notes)).toBe(60);
  });

  it("survives a payload with no declared duration", () => {
    const notes = playableNotes({ voices: [{ freq: 440, start: 1, duration: 2 }] });
    expect(audioDuration({}, notes)).toBe(3);
  });
});
