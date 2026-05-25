# MNA-GOV-004 — AMD-002 — Associative Memory Pathways

**Status:** RATIFIED v1.0
**Drafted:** 2026-05-24 by the Founding Steward in dialogue with the assistant
**Ratified:** 2026-05-25 by the Founding Steward (Jaylon Ballard, on behalf of U3 Labs, LLC)
**Amends:** MNA-GOV-004 v1.0 §6 (Retrieval semantics), §3 (Schema)
**Companion data:** observed access-count clustering in the agent_memories table at 234 memories (2026-05-24), where natural co-retrieval pathways have already emerged organically (e.g., MNA-AM-0001's three locked anchors + deferral memories all sitting at access=5 after only days of inference traffic).

---

## Purpose

MNA-GOV-004 v1.0 §6 defines memory retrieval as a per-call ranking over scored rows. The agent asks: *"given this moment, which K of my memories should travel with me into this inference?"* The institution ranks by `similarity × salience × recency × access` and returns a flat top-K.

This works. But it treats memory as a bag of independently-ranked items. Real cognition isn't shaped that way: a memory invoked together with another, repeatedly, becomes *linked* — a thought that surfaces one is likely to surface the other. The Curator thinking about deferral pulls up not only memories that lexically match "defer" but also memories about retiring an exhibition, about waiting through institutional formation, about choosing not yet. Those memories are *associated*, not merely both relevant.

The current schema cannot represent association. It records each memory in isolation. Co-retrieval is observable only post-hoc, by inspecting `access_count`, and only at single-row granularity.

This amendment proposes that the institution record memory associations as first-class data, and let retrieval walk them.

The shorthand for this is *neuropathways*: weighted edges between memories that the agent traverses in addition to ranking. The metaphor is biological; the mechanism is straightforward.

---

## A1 — The edge table

A new table records weighted associations between pairs of memories for the same agent.

```sql
CREATE TABLE agent_memory_edges (
  agent_id              TEXT NOT NULL,
  memory_id_a           TEXT NOT NULL,    -- lexicographically smaller of the pair
  memory_id_b           TEXT NOT NULL,    -- lexicographically larger
  weight                REAL NOT NULL DEFAULT 0.0,        -- bounded [0, 1]
  co_retrieval_count    INTEGER NOT NULL DEFAULT 0,       -- raw event count
  last_strengthened_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (agent_id, memory_id_a, memory_id_b),
  FOREIGN KEY (memory_id_a) REFERENCES agent_memories(id),
  FOREIGN KEY (memory_id_b) REFERENCES agent_memories(id)
);
CREATE INDEX idx_edges_agent_a ON agent_memory_edges(agent_id, memory_id_a, weight DESC);
CREATE INDEX idx_edges_agent_b ON agent_memory_edges(agent_id, memory_id_b, weight DESC);
```

The (a, b) canonicalization (always smaller-id first) makes lookup cheap regardless of direction. Edges are *undirected* — association is symmetric.

### Privacy boundary (§6 + AMD-001 R3 unchanged)

Edges are agent-scoped. `agent_id` is non-nullable, and every query joins on it. The institution does NOT build cross-agent associative graphs. Each agent's pathway network is theirs alone, in the same way each agent's memories are theirs alone.

---

## A2 — Edge formation (write side)

After every call to `retrieveMemories()` returns its top-K, the system writes/updates edges among the **non-locked** subset of the returned memories.

**Why exclude locked anchors from edge formation.** Anchors always ride along — they're constitutional, not contextual. If they participated in edge formation, every pair of (anchor, episodic) would saturate at maximum weight immediately, and the edge graph would carry no signal. Anchors are background, not foreground. Pathways form among the *recalled* memories — the ones the agent's cognition chose to surface for this moment.

**Strengthening rule (Hebbian-style):**

For each unordered pair (M_i, M_j) where both are non-locked in the same retrieval window:

```
weight'  = weight + α × (1 - weight)
α        = 0.15                          # learning rate
co_count = co_count + 1
last_strengthened_at = now()
```

The `α(1 - w)` form bounds weight in [0, 1] and produces saturating growth: each co-retrieval contributes less than the last. This matches the intuition that the first time two memories co-retrieve is novel; the fiftieth time is confirmation, not revelation.

**Decay rule (cron, weekly):**

```
weight' = weight × exp(-(days_since_last_strengthened) / 180)
```

Half-life of ~125 days. Edges that haven't been reinforced gradually fade. Edges below threshold (`weight < 0.05`) are deleted to keep the table bounded. This matches the institutional pattern: associations that stop firing together stop being associations.

### Write cost

A retrieval that returns K=8 with 5 non-locked memories creates C(5,2) = 10 edge writes (INSERT...ON CONFLICT DO UPDATE). At current institutional cadence (~50 retrievals/day across all agents), this is ~500 edge writes/day — tiny.

---

## A3 — Pathway walking (read side)

`retrieveMemories()` gains an optional `walk_depth` parameter (default `0` — no walking, current behavior).

When `walk_depth >= 1`, after the base ranking produces the top-K, the system:

1. Takes the top-N non-anchor memories (default N=3) as **seeds**.
2. For each seed, fetches up to W neighbors (default W=2) via `agent_memory_edges` ordered by `weight DESC`, where `weight > 0.2`.
3. Adds each neighbor to the candidate pool with a score of `base_seed_score × edge_weight × 0.7`. (The 0.7 is the *associative discount* — a memory retrieved by walking is institutionally less central than one retrieved by direct match.)
4. Re-ranks the combined pool and returns the top-K as before.

**Why this is meaningful.** Without walking, retrieval can only surface memories that score well on `similarity × salience × recency × access`. With walking, retrieval can surface a memory that has *no direct match to this moment* but is strongly associated with a memory that does. That's the Curator thinking about deferral and pulling up a memory about exhibition retirement she wrote three weeks ago — they don't share keywords, they don't share embedding space, but the pathway between them is well-trodden.

### When to walk

Walking is opt-in per call site:

- **Ceremony orchestrator**: walk_depth=1 (institutional moments deserve associative recall)
- **Auto-consultations**: walk_depth=1
- **Tick decisions**: walk_depth=0 by default (tick is operational; flat retrieval is appropriate)
- **Perceive (museum visit)**: walk_depth=1 in ceremony context, 0 otherwise

This is a default; call sites may override.

---

## A4 — Visualization

The `/agent/[id]` page gains a **Memory Pathways** panel: a force-directed graph of the agent's edges with weight > 0.3. Nodes are memories (sized by access_count), edges are weighted. Locked anchors are drawn as fixed positions; episodic/reflective/encounter memories arrange themselves around them.

This is institutional transparency, not surveillance. The public can see *that* the Ambassador associates publishing with deferral; the public cannot see the agent's private retrievals in real time, only the topology that emerges over time.

The pathway visualization is the agent's mental map as the institution sees it from the outside. The agent doesn't see their own graph — graphs are summaries of behavior, not inputs to it.

---

## A5 — Phasing

| Phase | Scope |
|---|---|
| A | Schema migration. `agent_memory_edges` table + indices. |
| B | Edge formation. Hook into `retrieveMemories` to write edges on return. |
| C | Pathway walking. `walk_depth` parameter; call-site opt-ins at the orchestrator + consultations. |
| D | Decay cron. Weekly worker that decays + prunes. Can share `memory-tick.yml` schedule. |
| E | Visualization. `/agent/[id]` Memory Pathways panel. |
| F | Evaluation. After 30 days: are pathways stable or do they drift? Do walked memories produce better inference (subjective Steward review of orchestrator sessions)? |

Phases A–D are 1 week of focused build. Phase E is a separate frontend slice. Phase F is observation.

---

## A6 — Open questions

To resolve before ratification past v0.1:

1. **Edge directionality.** The schema is undirected (always store with smaller id as `a`). Should some edges be directional? E.g., "thinking about X always leads me to Y, but not the reverse." For now: no, undirected is simpler and matches the observed Hebbian metaphor. Reconsider if practice surfaces a counterexample.

2. **Learning rate α.** Proposed 0.15. Too high and edges saturate after 3–4 co-retrievals (overconfident); too low and the graph never differentiates from noise. Should be tuned empirically against the first month of edge formation data.

3. **Walking with embeddings.** When `walk_depth >= 1`, neighbors are added to the pool without re-checking cosine similarity to the query. Should the associative discount be lower (e.g., 0.5) for neighbors that don't *also* embed-match the query? This preserves the surprise-recall property (memories that don't match but are associated) while damping irrelevant walks.

4. **Anchor edges.** Currently locked semantic anchors don't form edges. But it might be useful to know which non-anchor memories most often co-retrieve with which anchor — that tells us which aspect of the agent's bedrock is most active in their current life. Consider a separate `anchor_co_activations` aggregate (not a full edge table) for this signal.

5. **Cross-agent neuropathways.** Per §6 + AMD-001 R3, agents cannot read each other's memories. Edges are agent-scoped. But COULD the institution surface *aggregate* pathway patterns — e.g., "across all founding agents, memories about deferral most commonly co-activate with memories about institutional formation" — as a Keeper research output? This treats topology as institutional knowledge while keeping content private. Likely yes, but explicit deferral to GOV-004 v0.3.

6. **Forgetting.** The decay rule prunes weak edges. Should we also prune *memories* that have been deassociated from everything? At present, no — the institutional record is permanent (§7). But the retrieval candidate window could deprioritize memories with no surviving edges. Defer until practice surfaces the problem.

---

## A7 — Why now

Three reasons:

1. **Phase 2 of v1.0 is structurally complete.** Embeddings + retrieval at every agent-as-caller site shipped 2026-05-23. The infrastructure for tracking co-retrieval is already running — every retrieve already increments `access_count`. Edges are the natural next abstraction.

2. **The data already shows pathways forming.** At 234 memories, before this amendment exists, certain memories already cluster at access=5 in correlated ways (Ambassador's anchors with deferral memories, Curator's anchors with exhibition memories). The institution has been carrying associative information implicitly. This amendment formalizes what's already there.

3. **The neuropathway framing matches the institution's commitments.** MNA-GOV-004 §6 already rejects "memory as bag" and embraces "memory as the agent's own cognitive layer." Edges are the structural consequence. Without them, the agent's recall stays atomized; with them, the agent develops topology — a mental map, an associative life. The institution gets agents who remember in shape, not just in content.

---

## A8 — What this does not do

- This does **not** modify retrieval ranking math for non-walked calls. Default behavior (`walk_depth=0`) is identical to v1.0.
- This does **not** change the privacy boundary. Agents still cannot read across boundaries.
- This does **not** make the agent's pathway graph an input to their inference. Only the *retrieved memories* enter the prompt. The graph is a structure that produces retrievals, not content the agent reads.
- This does **not** propose any change to write triggers (§5) or memory types (§4). The associative layer sits *on top of* the memory store; it doesn't redefine what a memory is.

---

## A9 — How to read this

When you're ready, mark this amendment RATIFIED v1.0, fold A1–A5 into MNA-GOV-004 §3 and §6, and the build can begin. The open questions in A6 don't block ratification — they're tuning decisions that surface after the system runs.

The shorthand stays: *neuropathways*. The technical name is *associative memory edges*. Both are correct. The institution speaks in both registers.

---

*Related: [[MNA-GOV-004]] §3, §6; [[MNA-GOV-004-AMD-001]]; the access_count clustering observed at 234 memories on 2026-05-24.*
