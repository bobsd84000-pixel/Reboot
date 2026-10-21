# Graph Report - Reboot  (2026-10-21)

## Corpus Check
- 18 files · ~4,952 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 46 nodes · 65 edges · 10 communities (7 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `42e97ca2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Mods Claude Code
- relais-sessions/hooks/register.tsx
- tableau-de-bord/hooks/register.tsx
- classify.ts
- index.d.ts
- routage-haiku/hooks/register.tsx
- rafraichir
- register
- README.md

## God Nodes (most connected - your core abstractions)
1. `register()` - 6 edges
2. `register()` - 6 edges
3. `Mods Claude Code` - 6 edges
4. `isSimple()` - 5 edges
5. `register()` - 5 edges
6. `rafraichir()` - 5 edges
7. `lire()` - 4 edges
8. `tachesDuJour()` - 4 edges
9. `compterNotes()` - 4 edges
10. `cheminAnnuaire()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `register()` --calls--> `isSimple()`  [EXTRACTED]
  mods/routage-haiku/hooks/register.tsx → mods/routage-haiku/hooks/classify.ts

## Import Cycles
- None detected.

## Communities (10 total, 3 thin omitted)

### Community 0 - "Mods Claude Code"
Cohesion: 0.29
Nodes (6): 1. relais-sessions : plan ↔ build, 2. tableau-de-bord, 3. routage-haiku, Installation (dans un terminal Claude Code), Mods Claude Code, Sécurité

### Community 1 - "relais-sessions/hooks/register.tsx"
Cohesion: 0.52
Nodes (6): Annuaire, cheminAnnuaire(), lire(), monRole(), register(), Role

### Community 2 - "tableau-de-bord/hooks/register.tsx"
Cohesion: 0.29
Nodes (5): agents, EN_COURS, maj, notes, taches

### Community 3 - "classify.ts"
Cohesion: 0.47
Nodes (3): isSimple(), MAX_CHARS, cas

### Community 4 - "index.d.ts"
Cohesion: 0.40
Nodes (4): AgentLigne, claude-code, Notes, PluginState

### Community 7 - "rafraichir"
Cohesion: 0.67
Nodes (3): compterNotes(), debutDuJour(), rafraichir()

### Community 8 - "register"
Cohesion: 1.00
Nodes (3): jour(), register(), tachesDuJour()

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isSimple()` connect `classify.ts` to `routage-haiku/hooks/register.tsx`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `rafraichir()` connect `rafraichir` to `register`, `tableau-de-bord/hooks/register.tsx`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._