import "server-only";
import os from "node:os";
import { execSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { getDb, ensureSchema } from "./db";

/**
 * MNA Steward Terminal — hardware health probe.
 *
 * Reads the current machine's vital signs and returns a snapshot. Runs
 * on both the current Intel MacBook Pro and the incoming Mac Studio M4
 * Max without changes — `node:os` is portable and the macOS commands
 * used here (`sysctl`, `df`) exist on both.
 *
 * This is deliberately simple. No agents, no daemons, no external
 * monitoring. The System tab calls `probe()` on every render; results
 * are also written to the `hardware_snapshots` table so the Feed can
 * surface pressure warnings as priority alerts.
 *
 * Temperature on Apple Silicon requires `powermetrics` (which needs
 * sudo) or third-party tools. We don't require root and we don't bundle
 * a kernel extension — temperature is returned as `null` on machines
 * where we can't read it safely. The Mac Studio will either expose it
 * via a future read path or we'll wire a one-shot daemon at that point.
 */

export interface HardwareSnapshot {
  cpu_load: number; // 1-minute load average, unit: load per CPU
  cpu_cores: number;
  memory_used_gb: number;
  memory_total_gb: number;
  memory_pressure: number; // 0..1
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  disk_pressure: number | null; // 0..1
  network_mbps: number | null; // reserved for Phase 2.1 — throughput sampler
  temperature_c: number | null; // null on Intel MBP, populated on Mac Studio
  uptime_seconds: number;
  hostname: string;
  platform: string;
  arch: string;
  captured_at: string;
}

const BYTES_PER_GB = 1024 ** 3;

/**
 * Read a single snapshot. Never throws — all reads are wrapped in
 * try/catch so a missing sysctl or unreadable disk doesn't crash the
 * System tab. Fields we can't read return null and the UI shows "—".
 */
export function probe(): HardwareSnapshot {
  const cores = os.cpus().length || 1;
  const loadAvg = os.loadavg()[0] || 0;
  const cpu_load = loadAvg / cores;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memory_total_gb = totalMem / BYTES_PER_GB;
  const memory_used_gb = usedMem / BYTES_PER_GB;
  const memory_pressure = totalMem > 0 ? usedMem / totalMem : 0;

  let disk_used_gb: number | null = null;
  let disk_total_gb: number | null = null;
  let disk_pressure: number | null = null;
  try {
    // statfsSync is stable on Node 18+. Reads the root filesystem.
    const stat = statfsSync("/");
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bfree) * Number(stat.bsize);
    const usedBytes = totalBytes - freeBytes;
    disk_total_gb = totalBytes / BYTES_PER_GB;
    disk_used_gb = usedBytes / BYTES_PER_GB;
    disk_pressure = totalBytes > 0 ? usedBytes / totalBytes : 0;
  } catch {
    // Non-macOS or sandbox without statfs — leave null.
  }

  const temperature_c = readTemperatureSafe();

  return {
    cpu_load,
    cpu_cores: cores,
    memory_used_gb,
    memory_total_gb,
    memory_pressure,
    disk_used_gb,
    disk_total_gb,
    disk_pressure,
    network_mbps: null,
    temperature_c,
    uptime_seconds: os.uptime(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    captured_at: new Date().toISOString(),
  };
}

/**
 * Best-effort temperature read on macOS. Tries `sysctl` for Intel SMC
 * temperatures. Falls back to null on Apple Silicon (reading temp
 * without sudo requires tooling we don't want to ship in this phase).
 */
function readTemperatureSafe(): number | null {
  if (os.platform() !== "darwin") return null;
  try {
    // machdep.xcpm.cpu_thermal_level is coarse (0..100 index) but doesn't
    // need sudo. Real Celsius requires SMC tools; we don't ship those.
    const raw = execSync("sysctl -n machdep.xcpm.cpu_thermal_level 2>/dev/null", {
      encoding: "utf-8",
      timeout: 500,
    }).trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    // Coerce the 0..100 thermal index into a rough Celsius estimate so
    // the UI has a single unit. The Mac Studio will replace this with a
    // real SMC read when the hardware arrives.
    return Math.round(30 + n * 0.5);
  } catch {
    return null;
  }
}

/** Write a snapshot row to the terminal DB (used by a periodic sampler). */
export async function snapshotToDb(snapshot: HardwareSnapshot): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO hardware_snapshots
            (cpu_load, memory_used_gb, memory_total_gb, disk_used_gb, disk_total_gb, network_mbps, temperature_c)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      snapshot.cpu_load,
      snapshot.memory_used_gb,
      snapshot.memory_total_gb,
      snapshot.disk_used_gb,
      snapshot.disk_total_gb,
      snapshot.network_mbps,
      snapshot.temperature_c,
    ],
  });
}
