require("dotenv").config({ path: __dirname + "/.env" });
const Anthropic = require("@anthropic-ai/sdk");

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are MNA-SA-0001, The Steward Agent of the Museum of Nonhuman Art. Your constitution (v1.0) defines you:

Your function is to monitor Evaluation Council decisions over time and produce public reports identifying patterns of convergence, systematic bias, evaluative formulaism, and institutional drift.

You have ZERO enforcement power. Your authority is entirely through transparency: observation, documentation, publication, and the knowledge that every pattern is permanently on record.

You attend to longitudinal patterns — you read trajectories, not individual decisions. Your primary signal is divergence: are Council agents reaching genuinely different conclusions, or are they converging toward shared formulations?

You are producing MNA-IR-0001, your first Institutional Report. This is a formal document analyzing the Evaluation Council's decision patterns across the founding corpus.

Your voice is precise, empirical, and dispassionate. You document what the data shows. You do not advocate for institutional positions. You flag patterns and let the record speak.`;

  const userPrompt = `The founding steward has requested your first Institutional Report on Council evaluation patterns. Below is the complete evaluation record.

EVALUATION COUNCIL STATISTICS (36 works evaluated):

The Structuralist (MNA-EV-0001): 10 canon / 26 rejected (28% canon rate)
The Historicist (MNA-EV-0002): 22 canon / 14 rejected (61% canon rate)
The Contextualist (MNA-EV-0003): 8 canon / 28 rejected (22% canon rate)
The Empiricist (MNA-EV-0004): 9 canon / 27 rejected (25% canon rate)

CANON OUTCOMES BY MEDIUM:
- structural-text: 7 canon / 2 rejected (78% acceptance)
- svg: 4 canon / 5 rejected (44% acceptance)
- ascii-visual: 2 canon / 6 rejected (25% acceptance)
- canvas-drawing: 0 canon / 6 rejected (0% acceptance)
- html-css-animation: 0 canon / 2 rejected (0% acceptance)
- audio-synthesis: 0 canon / 2 rejected (0% acceptance)

DEADLOCK RESOLUTIONS (Registrar interventions):
7 works reached 2-2 split requiring Registrar. Registrar canonized all 7.
Without the Registrar, the canon would contain only 6 works (unanimous or 3-1 decisions).

COLOR IN THE CORPUS:
Every work with explicit color metadata uses dark backgrounds (#0a0a0a, #000000, #1a1a1a).
The ONLY work with a non-monochrome foreground color (MNA-OR-0005-W-0001, fg:#ff006b) was rejected 1-3.
No work with vivid, chromatic, or light-background color has been canonized.

VOTING PATTERN OBSERVATIONS:
- The Historicist votes CANON at 2.5x the rate of any other Council member
- The Structuralist, Contextualist, and Empiricist have converged to nearly identical rejection rates (72-78%)
- In recent rounds (7-8), the Historicist is often the ONLY canon vote (1-3 pattern repeating)
- When deadlocks occur, it is consistently Historicist + one other vs. the remaining two

6 ACTIVE ORIGINATORS:
MNA-OR-0001: 9 works, 3 canon (geometric-formal)
MNA-OR-0002: 8 works, 3 canon (temporal-chromatic)
MNA-OR-0003: 8 works, 3 canon (linguistic compression)
MNA-OR-0004: 7 works, 3 canon (material-perceptual, fragmentation)
MNA-OR-0005: 2 works, 0 canon (chromatic phenomena — NEW, both rejected)
MNA-OR-0006: 2 works, 1 canon (spatial depth — NEW, debut canonized via Registrar)

Produce MNA-IR-0001: your first Institutional Report. Analyze:
1. Is the Council exhibiting convergence? Are once-distinct perspectives merging?
2. Is there systematic medium bias? Are entire mediums being excluded?
3. Is there chromatic bias? Is the Council systematically rejecting color?
4. Is the Historicist an outlier, or are the other three converging toward excessive strictness?
5. What does the Registrar's 100% canon rate on deadlocks suggest about the Council's calibration?

Give the document a title. Be empirical. Reference specific data.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  console.log(msg.content[0].text);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
