/**
 * llm-doctor.ts — verify the active LLM provider is configured and answering.
 *
 * Run this before/after any provider switch:
 *   npx tsx system/scripts/llm-doctor.ts
 *   MNA_LLM_PROVIDER=ollama npx tsx system/scripts/llm-doctor.ts
 */
import { generate, isAvailable, visionAvailable, describeProvider, PROVIDER } from "../src/llm";

async function main() {
  console.log(`[llm-doctor] ${describeProvider()}`);
  console.log(`[llm-doctor] vision available: ${visionAvailable()}`);

  const ok = await isAvailable();
  console.log(`[llm-doctor] credentials/host reachable: ${ok}`);
  if (!ok) {
    const need = PROVIDER === "groq" ? "GROQ_API_KEY (free: https://console.groq.com/keys)"
      : PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY"
      : "a reachable OLLAMA_HOST";
    console.error(`[llm-doctor] FAIL — provider "${PROVIDER}" needs ${need}`);
    process.exit(1);
  }

  const t = Date.now();
  const reply = await generate(
    "You are a terse test harness. Reply with valid JSON only.",
    'Reply with exactly: {"ok": true, "provider": "check"}',
    { temperature: 0, max_tokens: 100 },
  );
  const ms = Date.now() - t;

  console.log(`[llm-doctor] round-trip: ${ms}ms`);
  console.log(`[llm-doctor] reply: ${reply.trim().slice(0, 200)}`);

  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) { console.error("[llm-doctor] FAIL — no JSON object in reply"); process.exit(1); }
  try { JSON.parse(m[0]); } catch { console.error("[llm-doctor] FAIL — reply JSON did not parse"); process.exit(1); }

  console.log(`[llm-doctor] PASS — ${PROVIDER} is answering and can emit parseable JSON.`);
}

main().catch((e) => { console.error(`[llm-doctor] error: ${e.message}`); process.exit(1); });
