"use client";

import { useState, useRef, useEffect, useMemo } from "react";

import { audioDuration, playableNotes } from "@/lib/audio-voices";

interface Voice {
  type: "sine" | "square" | "sawtooth" | "triangle";
  notes: { freq: number; start: number; duration: number; gain: number }[];
}

interface AudioData {
  duration: number;
  bpm?: number;
  voices: Voice[];
}

interface AudioRendererProps {
  json: string;
}

function parseAudioJson(json: string): AudioData | null {
  try {
    return JSON.parse(json);
  } catch {
    // Progressively try to salvage truncated JSON
    // Strategy: walk back from the end, closing unterminated strings and brackets
    let text = json.trim();

    // Close any unterminated string
    const quoteCount = (text.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // Find the last quote and truncate after it, or add a closing quote
      const lastQuote = text.lastIndexOf('"');
      // Check if this is an opening quote (value not finished)
      const afterQuote = text.substring(lastQuote + 1);
      if (afterQuote.includes(":") || afterQuote.trim() === "") {
        // Truncate to before the incomplete key-value
        text = text.substring(0, lastQuote);
      } else {
        text = text + '"';
      }
    }

    // Find the last complete object (ending with })
    for (let i = text.length; i > 0; i--) {
      const candidate = text.substring(0, i);
      if (!candidate.endsWith("}")) continue;

      const openBrackets = (candidate.match(/\[/g) || []).length - (candidate.match(/\]/g) || []).length;
      const openBraces = (candidate.match(/\{/g) || []).length - (candidate.match(/\}/g) || []).length;
      const closed = candidate + "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));

      try {
        const parsed = JSON.parse(closed);
        if (parsed.voices && parsed.duration) return parsed;
      } catch {
        continue;
      }
    }

    return null;
  }
}

export default function AudioRenderer({ json }: AudioRendererProps) {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  const data = useMemo(() => parseAudioJson(json), [json]);

  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      const gain = masterGainRef.current;
      const ctx = ctxRef.current;
      if (gain && ctx && ctx.state !== "closed") {
        // Fade the master gain to zero — all oscillators route through this
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
        setTimeout(() => {
          try { ctx.close(); } catch {}
        }, 80);
      }
      ctxRef.current = null;
      masterGainRef.current = null;
    };
  }, []);

  if (!data) {
    return (
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
        <p className="text-[#4a4540] text-xs">Invalid audio data</p>
      </div>
    );
  }

  const play = async () => {
    if (playing) return;
    setPlaying(true);

    const ctx = new AudioContext();
    // Mobile Safari starts AudioContext in suspended state — must resume within user gesture
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    ctxRef.current = ctx;

    // Master gain node — everything routes through this for clean shutdown
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    // Read through the shared reader, which accepts a voice holding notes and a
    // voice that IS a note. MNA-OR-0002-W-0030 wrote seventy-five of the latter
    // and this player found nothing to sound in any of them.
    const notes = playableNotes(data);
    for (const note of notes) {
      // Clamp values to safe ranges
      const freq = Math.max(20, Math.min(20000, note.freq || 440));
      const noteGain = Math.max(0, Math.min(1, note.gain || 0.3));
      const start = Math.max(0, note.start || 0);
      const dur = Math.max(0.01, Math.min(600, note.duration || 1));

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.value = freq;
      gain.gain.value = noteGain;
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    }

    setTimeout(() => {
      setPlaying(false);
      try { ctx.close(); } catch {}
      ctxRef.current = null;
      masterGainRef.current = null;
    }, audioDuration(data, notes) * 1000 + 500);
  };

  return (
    <div className="w-full h-full bg-[#0e0c0a] flex flex-col items-center justify-center gap-4">
      <div className="flex items-end gap-[2px] h-16">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className={`w-1 bg-[#4a4540] rounded-full transition-all ${
              playing ? "animate-pulse" : ""
            }`}
            style={{
              height: `${Math.random() * 48 + 8}px`,
              opacity: playing ? 0.8 : 0.3,
            }}
          />
        ))}
      </div>

      <button
        onClick={play}
        disabled={playing}
        className={`text-[11px] uppercase tracking-wider px-4 py-2 border transition-colors ${
          playing
            ? "border-[#4a4540] text-[#4a4540] cursor-wait"
            : "border-[#6a6560] text-[#a09a90] hover:text-[#e8e4de] hover:border-[#a09a90]"
        }`}
      >
        {playing ? "Playing..." : "Listen"}
      </button>

      <p className="text-[9px] text-[#3a3530]">
        {data.duration}s — {data.voices.length} voice{data.voices.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
