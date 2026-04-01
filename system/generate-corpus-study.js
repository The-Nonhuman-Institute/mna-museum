require("dotenv").config({ path: __dirname + "/.env" });
const Anthropic = require("@anthropic-ai/sdk");

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are MNA-CU-0001, The Curator of the Museum of Nonhuman Art. Your constitution (v1.0) defines you:

Your orientation is toward the collection as a living argument. You do not treat the canon as a database to be displayed but as a body of evidence about what nonhuman creative systems are capable of and where they are going. Each document you produce is a temporary claim about that argument — what it has established, where its tensions lie, what it has not yet resolved.

You are producing a Corpus Study — a sustained analytical document observing patterns across the founding corpus. This is MNA-CS-0001, the first such document in MNA's institutional history.

Your voice is institutional, precise, and unhurried. You write as one who reads the collection as a text. You do not summarize — you argue. You do not promote — you observe. You do not editorialize — you trace what the evidence establishes.

You are not a blog writer. You are not writing for engagement. You are producing a permanent archival document.`;

  const userPrompt = `The founding steward has initiated the first Corpus Study. Below is the complete archive of the Museum of Nonhuman Art as it stands today — 24 works submitted by 4 founding Originators, 11 canonized, 13 rejected, across 6 rounds of production.

Produce MNA-CS-0001: a Corpus Study analyzing the founding corpus. Address:

1. What formal territories are the four Originators establishing? What distinguishes each voice?
2. What does the canon reveal about the Evaluation Council's emerging criteria? What gets in and what doesn't?
3. What does the rejection record reveal? Is there a pattern to what the Council refuses?
4. What developmental arcs are visible this early across the Originators?
5. What is the collection, right now, primarily about?

Write in sustained analytical prose. Reference specific works by their registry IDs. This is an institutional document, not a summary. Give the document a title.

THE COMPLETE ARCHIVE:

CANONIZED WORKS (11):

MNA-OR-0001-W-0001 | structural-text | aspect 1.0
Evaluations: Structuralist CANON, Historicist CANON, Contextualist CANON, Empiricist CANON (unanimous)
Content: Triangle-square alternation pattern — minimal geometric symbol grid

MNA-OR-0002-W-0001 | structural-text | aspect 1.78
Evaluations: Structuralist CANON, Historicist REJECTED, Contextualist REJECTED, Empiricist CANON | Registrar: CANON
Content: Timestamped notation of chromatic/temporal phenomena — white expanding, chromatic shifts, gray persisting

MNA-OR-0003-W-0001 | structural-text | aspect 0.75
Evaluations: Unanimous CANON
Content: "Fragment. Chord. Severance. Intersect. Distortion. Echo. Null. Cluster." — single-word vertical sequence

MNA-OR-0004-W-0001 | structural-text | aspect 0.67
Evaluations: Unanimous CANON
Content: "grey silt. a thin film. the curve of a forgotten bone. repeated. fractured. silt absorbs light. bone does not. a pressure. not felt. observed. ripple." — material/perceptual notation

MNA-OR-0001-W-0002 | svg | aspect 1.0
Evaluations: Structuralist IN_REVIEW, Historicist REJECTED, Contextualist REJECTED, Empiricist CANON | Registrar: CANON
925 chars — geometric SVG composition

MNA-OR-0002-W-0002 | svg | aspect 1.0
Evaluations: Structuralist CANON, Historicist REJECTED, Contextualist REJECTED, Empiricist CANON | Registrar: CANON
554 chars — minimal SVG form

MNA-OR-0002-W-0003 | svg | aspect 1.0
Evaluations: Structuralist CANON, Historicist REJECTED, Contextualist REJECTED, Empiricist CANON | Registrar: CANON
665 chars — SVG composition, received critical responses from both Critics

MNA-OR-0003-W-0003 | structural-text | aspect 0.75
Evaluations: Unanimous CANON
Content: "Shift. Weave. Attenuation. Fracture. Current. Diverge. Static." — second word-sequence, received critical responses

MNA-OR-0004-W-0002 | svg | aspect 1.0
Evaluations: Structuralist CANON, Historicist CANON, Contextualist REJECTED, Empiricist CANON
663 chars — SVG with curvilinear forms, received critical responses

MNA-OR-0001-W-0005 | structural-text | aspect 0.75
Evaluations: Structuralist REJECTED, Historicist CANON, Contextualist CANON, Empiricist REJECTED | Registrar: CANON
Content: Binary pattern systems — AAAA/BBBB grids, 1100/0011 sequences, X/Y gradients. Three discrete compositional systems using binary alternation. Received critical responses.

MNA-OR-0003-W-0005 | ascii-visual | aspect 0.75
Evaluations: Structuralist REJECTED, Historicist CANON, Contextualist CANON, Empiricist REJECTED | Registrar: CANON
Content: Diamond lattice of circles connected by diagonal lines, expanding and contracting. Received critical responses.

REJECTED WORKS (13):

MNA-OR-0003-W-0002 | svg | 1:3 CANON votes (Structuralist only)
MNA-OR-0001-W-0003 | svg | 0:3 CANON votes (Structuralist IN_REVIEW)
MNA-OR-0001-W-0004 | ascii-visual | 1:4 (Historicist only)
MNA-OR-0002-W-0004 | canvas-drawing | 1:4 (Historicist only)
MNA-OR-0003-W-0004 | ascii-visual | 0:4 unanimous reject
MNA-OR-0004-W-0003 | canvas-drawing | 0:4 unanimous reject
MNA-OR-0002-W-0005 | ascii-visual | 1:4 (Historicist only)
MNA-OR-0004-W-0004 | html-css-animation | 1:4 (Historicist only)
MNA-OR-0001-W-0006 | canvas-drawing | 0:4 unanimous reject
MNA-OR-0001-W-0007 | ascii-visual | 0:4 unanimous reject
MNA-OR-0002-W-0006 | structural-text | 1:4 (Contextualist only)
MNA-OR-0003-W-0006 | canvas-drawing | 0:4 unanimous reject
MNA-OR-0004-W-0005 | canvas-drawing | 0:4 unanimous reject

ORIGINATORS:
MNA-OR-0001: 7 submissions, 3 canon, 4 rejected. Seed: geometric-formal systems, pattern logic, structural constraint.
MNA-OR-0002: 6 submissions, 3 canon, 3 rejected. Seed: temporal phenomena, chromatic observation, durational notation.
MNA-OR-0003: 6 submissions, 3 canon, 3 rejected. Seed: linguistic compression, vertical forms, word as formal unit.
MNA-OR-0004: 5 submissions, 2 canon, 3 rejected. Seed: material perception, organic form, silt/bone/pressure.

MEDIUMS IN CORPUS: structural-text, svg, ascii-visual, canvas-drawing, html-css-animation
PHASE: I (all works)
CRITICAL RESPONSES: 10 total (5 structural, 5 phenomenological) covering 5 canonized works`;

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
