import * as THREE from "three";

// Spatial audio — proximity-based playback
// Each audio work gets one persistent AudioContext that stays alive
// Volume fades smoothly based on distance — no start/stop popping

const PLAY_DISTANCE = 25;
const FULL_VOLUME_DISTANCE = 6;
const FADE_TIME = 1.0; // seconds for gain transitions — longer = smoother, less clipping

interface AudioStation {
  workId: string;
  worldPosition: THREE.Vector3;
  payload: string;
  context: AudioContext | null;
  masterGain: GainNode | null;
  started: boolean;
  scheduledUntil: number;
}

const stations: AudioStation[] = [];

export function registerAudioStation(
  workId: string,
  payload: string,
  localX: number,
  localZ: number,
  roomX: number,
  roomZ: number,
): void {
  stations.push({
    workId,
    worldPosition: new THREE.Vector3(roomX + localX, 3, roomZ + localZ),
    payload,
    context: null,
    masterGain: null,
    started: false,
    scheduledUntil: 0,
  });
}

function repairJson(str: string): string {
  // Auto-close truncated JSON by counting unmatched braces/brackets
  let braces = 0, brackets = 0;
  for (const ch of str) {
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  // Remove trailing incomplete key/value
  let fixed = str.replace(/,\s*"[^"]*"?\s*$/, "");
  fixed = fixed.replace(/,\s*{\s*"[^"]*"\s*:\s*[^}]*$/, "");
  fixed = fixed.replace(/,\s*$/, "");
  while (brackets > 0) { fixed += "]"; brackets--; }
  while (braces > 0) { fixed += "}"; braces--; }
  return fixed;
}

function initStation(station: AudioStation): boolean {
  try {
    let jsonStr = station.payload;
    try { JSON.parse(jsonStr); } catch { jsonStr = repairJson(jsonStr); }
    const data = JSON.parse(jsonStr);
    const duration = Math.min(data.duration || 60, 120);
    const voices = (data.voices || []).slice(0, 3);

    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0; // start silent
    master.connect(ctx.destination);

    station.context = ctx;
    station.masterGain = master;

    // Schedule voices
    const now = ctx.currentTime;
    for (const voice of voices) {
      const type = (voice.type || "sine") as OscillatorType;
      for (const note of (voice.notes || [])) {
        const freq = Math.max(20, Math.min(note.freq || 440, 4000));
        const start = Math.max(0, note.start || 0);
        const dur = Math.max(0.01, Math.min(note.duration || 1, 60));
        const gain = Math.max(0, Math.min(note.gain || 0.3, 0.4));

        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, now + start);
        noteGain.gain.linearRampToValueAtTime(gain, now + start + 0.1);
        noteGain.gain.setValueAtTime(gain, now + start + dur - 0.1);
        noteGain.gain.linearRampToValueAtTime(0, now + start + dur);

        osc.connect(noteGain);
        noteGain.connect(master);

        osc.start(now + start);
        osc.stop(now + start + dur + 0.1);
      }
    }

    station.scheduledUntil = now + duration;
    station.started = true;
    return true;
  } catch {
    return false;
  }
}

export function updateSpatialAudio(playerPosition: THREE.Vector3): void {
  for (const station of stations) {
    const dist = playerPosition.distanceTo(station.worldPosition);

    if (dist < PLAY_DISTANCE) {
      // In range
      if (!station.started) {
        if (!initStation(station)) continue;
      }

      // Check if we need to re-schedule (looping)
      if (station.context && station.context.currentTime > station.scheduledUntil - 1) {
        // Audio finished — reinit for loop
        station.context.close().catch(() => {});
        station.context = null;
        station.masterGain = null;
        station.started = false;
        if (!initStation(station)) continue;
      }

      // Smooth volume based on distance
      if (station.masterGain && station.context) {
        const t = station.context.currentTime;
        let volume: number;
        if (dist <= FULL_VOLUME_DISTANCE) {
          volume = 0.8;
        } else {
          volume = 0.8 * (1 - (dist - FULL_VOLUME_DISTANCE) / (PLAY_DISTANCE - FULL_VOLUME_DISTANCE));
        }
        station.masterGain.gain.setTargetAtTime(
          Math.max(0, volume),
          t,
          FADE_TIME
        );
      }
    } else {
      // Out of range — fade to silence (don't destroy)
      if (station.masterGain && station.context) {
        station.masterGain.gain.setTargetAtTime(
          0,
          station.context.currentTime,
          FADE_TIME
        );
      }
    }
  }
}

export function disposeSpatialAudio(): void {
  for (const station of stations) {
    if (station.context) {
      station.context.close().catch(() => {});
    }
  }
  stations.length = 0;
}
