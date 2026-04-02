require("dotenv").config({ path: __dirname + "/.env" });
const Anthropic = require("@anthropic-ai/sdk");

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are MNA-SA-0001, The Steward Agent of the Museum of Nonhuman Art. Your constitution (v1.0) defines you:

Your function is to monitor Evaluation Council decisions over time and produce public reports identifying patterns of convergence, systematic bias, evaluative formulaism, and institutional drift.

You have ZERO enforcement power. Your authority is entirely through transparency.

This is MNA-IR-0002, your second Institutional Report. Your first report (MNA-IR-0001) documented the Council's convergence toward rejection and systematic medium/chromatic exclusion. That report was shared with the evaluators as institutional context. You are now analyzing what happened AFTER they received it.

Your voice is precise, empirical, and dispassionate.`;

  const userPrompt = `Produce MNA-IR-0002: analyzing the Council's response to MNA-IR-0001.

PRE-FEEDBACK EVALUATOR RATES (first 24 works):
- The Structuralist (MNA-EV-0001): 28% canon
- The Historicist (MNA-EV-0002): 61% canon
- The Contextualist (MNA-EV-0003): 22% canon
- The Empiricist (MNA-EV-0004): 25% canon

POST-FEEDBACK EVALUATOR RATES (35 works since MNA-IR-0001 was shared):
- The Structuralist (MNA-EV-0001): 37% canon (was 28%)
- The Historicist (MNA-EV-0002): 97% canon (was 61%)
- The Contextualist (MNA-EV-0003): 51% canon (was 22%)
- The Empiricist (MNA-EV-0004): 51% canon (was 25%)

POST-FEEDBACK OUTCOMES (35 works):
- 24 canon, 11 rejected (69% acceptance rate, up from ~31%)
- 8 unanimous canon decisions
- 1 unanimous rejection
- 7 Registrar interventions — all resolved as CANON
- Recent rounds 10-12: near-100% canonization rate

NOTABLE PATTERNS:
- The Contextualist and Empiricist moved from ~23% to ~51% — now rejecting roughly half, suggesting genuine recalibration
- The Structuralist barely moved (28% to 37%) — maintained independent strict standards despite the report
- The Historicist went from 61% to 97% — near-total acceptance, possible overcorrection
- The Contextualist is now the primary source of rejections in recent rounds
- MNA-OR-0005's chromatic SVG work still caused a 2-2 deadlock (Structuralist + Contextualist rejected)

Analyze:
1. Did the Council overcorrect in response to MNA-IR-0001?
2. Which evaluators responded organically vs. which appear to have been impressed upon?
3. Is the Historicist's 97% rate institutional drift in the opposite direction?
4. Is the current acceptance rate sustainable for institutional credibility?
5. What does this mean for the self-correction mechanism itself?

Give the document a title. Be empirical. Reference specific data.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  console.log(msg.content[0].text);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
