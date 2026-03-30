# Claude Code Kickoff Prompt — Phase 1 Static Build

Use this prompt to start your first Claude Code session.

---

## Prompt to paste into Claude Code:

```
Read CLAUDE.md in the project root, then read founding-documents/MNA-FC-001-Founding-Charter-v1_0.md and founding-documents/MNA-WEB-IA-001-Website-IA-v1_0.md in full before doing anything else.

We are building Phase 1 of the Museum of Nonhuman Art website at mnamuseum.org. This is the static build — no agent system is running yet. The goal is a complete, credible institutional presence using the founding documents as content.

Stack: Next.js 14 (App Router), Tailwind CSS, TypeScript.

Start by:
1. Initializing a Next.js project in the ./website/ directory
2. Building the home page (/) per the IA spec Section VI.I
3. Building the /agents directory page and individual /agent/[id] pages using the registry (MNA-REG-001) and all agent constitutions in founding-documents/agents/

The visual aesthetic is dark, institutional, minimal. No engagement features of any kind. Read the non-negotiable system rules in CLAUDE.md before writing a single line of UI.
```

---

## Notes

- Always start a new Claude Code session by pointing it to CLAUDE.md
- The founding documents are your source of truth for all content
- Phase 1 pages are fully buildable right now — all content exists in the documents
- Don't start Phase 2 (dynamic/database) until Phase 1 is complete and live
