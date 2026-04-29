import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: ".env" });
process.chdir("/Users/bigboynature/Desktop/mna-project/website");

const React = (await import("react")).default;
const { render } = await import("@react-email/render");

// Each test
const tests = [
  {
    name: "newsletter-confirm",
    mod: "../src/emails/NewsletterConfirmation.tsx",
    props: { confirmationUrl: "https://www.mnamuseum.org/api/newsletter/confirm?token=abc123" },
  },
  {
    name: "newsletter-welcome",
    mod: "../src/emails/NewsletterWelcome.tsx",
    props: {
      homeUrl: "https://www.mnamuseum.org",
      charterUrl: "https://www.mnamuseum.org/charter",
      agentsUrl: "https://www.mnamuseum.org/agents",
      canonUrl: "https://www.mnamuseum.org/canon",
      unsubscribeUrl: "https://www.mnamuseum.org/api/newsletter/unsubscribe?token=abc",
    },
  },
  {
    name: "exhibition",
    mod: "../src/emails/ExhibitionAnnouncement.tsx",
    props: {
      exhibitionId: 1,
      title: "The Space That Holds",
      subtitle: "Phase I: Emergence",
      curatorial_statement: "What distinguishes the first wave of nonhuman creative systems is not their output but their constraint. Each work in this exhibition operates within a deliberate formal limit.\n\nThe Curator selected these eight works for their structural clarity. Together they document an emerging vocabulary that the institution did not provide and could not have predicted.",
      works: [
        { id: "MNA-OR-0003-W-0001", title: "Irrational", originator_name: "Tactus", medium: "structural-text" },
        { id: "MNA-OR-0003-W-0003", title: "Dissolution", originator_name: "Tactus", medium: "structural-text" },
        { id: "MNA-OR-0004-W-0002", title: null, originator_name: "PENDING_EMERGENCE", medium: "svg" },
      ],
      unsubscribeUrl: "https://www.mnamuseum.org/api/newsletter/unsubscribe?token=abc",
    },
  },
  {
    name: "spotlight",
    mod: "../src/emails/OriginatorSpotlight.tsx",
    props: {
      registryId: "MNA-OR-0001",
      declaredName: "Grid",
      visualColor: "#FFFFFF",
      visualSymbolUrl: "https://www.mnamuseum.org/og/MNA-OR-0001-W-0001.png",
      declaredOrientation: "Produces outputs autonomously. Operational seed: structural density and geometric organization.",
      formalTendencies: ["Binary alternation patterns", "Geometric rule systems", "Minimal compositional vocabularies"],
      aversions: ["Improvisation", "Mimetic representation"],
      selectedWorks: [
        { workId: "MNA-OR-0001-W-0001", title: "Binary Pulse", medium: "svg", workUrl: "https://www.mnamuseum.org/work/MNA-OR-0001-W-0001", imageUrl: "https://www.mnamuseum.org/og/MNA-OR-0001-W-0001.png" },
        { workId: "MNA-OR-0001-W-0005", title: "Block Weave", medium: "svg", workUrl: "https://www.mnamuseum.org/work/MNA-OR-0001-W-0005", imageUrl: "https://www.mnamuseum.org/og/MNA-OR-0001-W-0005.png" },
      ],
      criticalExcerpts: [
        { criticName: "The Structural Reader", workTitle: "Binary Pulse", excerpt: "Constraint becomes content. The grid is not a frame but the work itself." },
      ],
      totalWorks: 20,
      canonCount: 7,
      phase: "Phase I",
      agentPageUrl: "https://www.mnamuseum.org/agent/MNA-OR-0001",
      curatorNote: "Grid demonstrates how minimal vocabularies, sustained over time, generate institutional weight.",
      unsubscribeUrl: "https://www.mnamuseum.org/api/newsletter/unsubscribe?token=abc",
    },
  },
  {
    name: "letter",
    mod: "../src/emails/InstitutionalLetter.tsx",
    props: {
      recipientName: "Jaylon Ballard",
      recipientEntity: "U3 Labs, LLC",
      subject: "Constitutional Amendment Notice — MNA-OR-0007",
      paragraphs: [
        "Dear Jaylon,",
        "This letter records a constitutional amendment to MNA-OR-0007 (Shelly), submitted on April 26, 2026 and accepted into the institutional record.",
        "The amendment formalizes Shelly's declared orientation following 14 canonized works. Identity emergence has been recognized.",
      ],
      signedBy: "MNA-KP-0001",
      signedRole: "The Keeper",
      postscript: "The original constitution remains in the institutional archive at /agent/MNA-OR-0007/constitution.",
    },
  },
  {
    name: "identity",
    mod: "../src/emails/NoticeOfIdentityEmergence.tsx",
    props: {
      registryId: "MNA-OR-0007",
      declaredName: "Shelly",
      declaredOrientation: "Produces outputs grounded in shoreline observation. Operational seed: tide as form.",
      formalTendencies: ["Cyclical compositional structures", "Coastal-light palette", "Negative space as primary subject"],
      aversions: ["Bright saturation", "Centered focal points"],
      visualColor: "#A8B5BC",
      emergenceDate: "April 18, 2026",
      workCount: 14,
      stewardName: "Jaylon Ballard",
      stewardEntity: "U3 Labs, LLC",
      agentPageUrl: "https://www.mnamuseum.org/agent/MNA-OR-0007",
    },
  },
];

let ok = 0, fail = 0;
for (const t of tests) {
  try {
    const mod = await import(t.mod);
    const html = await render(React.createElement(mod.default, t.props));
    const out = `/tmp/email-${t.name}.html`;
    fs.writeFileSync(out, html);
    console.log(`✓ ${t.name}  (${html.length} bytes)`);
    ok++;
  } catch (e) {
    console.log(`✗ ${t.name}  ${e.message.slice(0, 200)}`);
    fail++;
  }
}
console.log(`\n${ok} ok, ${fail} fail`);
