# Chat blocks and the 3D goal

Claude's chat answers are Markdown. Two fenced code languages are drawn instead of shown as code:

| Fence | Body | Drawn as |
|---|---|---|
| ```` ```court ```` | `{ "title"?: string ≤ 60, "scene": Scene }` (a bare Scene works too) | animated 3D half court (`CourtScene`, compact) |
| ```` ```goal ```` | `{ "title"?, "zones": { top_left: [goals, shots], … 9 }, "miss"?: { over, left, right }, "mode"?: "scored" \| "conceded" }` | 3D goal heatmap (`Goal3D`) |

`Scene` is the drill contract in `src/lib/drills/plan.ts` (actors, cones, ball, beats; court coordinates are documented there). Instructions for the chat Claude: `scripts/chat-CLAUDE.md`, section "Diagrams".

## Rules
- Court scenes are illustrations of a drill, set play or tactic, never data.
- Goal blocks show team zone numbers only, copied from a `team_zones` query run in the same conversation. No per-player or per-keeper zones exist, so none are drawn.
- At most one court block per answer.

## Rendering (`src/components/chat-blocks/`)
- `parse.ts`: zod validation (`CourtBlock`, `GoalBlock`) plus `sceneProblems` (unique actor ids, ball holder and pass targets exist). Tests: `parse.test.ts`.
- `blocks.tsx`: the react-markdown `pre` override. `chat-app.tsx` keeps its components object at module level, so a drawn block is not remounted while the reply streams. `AnswerSource` gives each fence the answer's source text: a fence without its closing ``` during streaming shows a "Drawing court…" skeleton instead of growing JSON.
- Invalid JSON or a scene that fails the checks shows "Couldn't draw this diagram", collapsed, with the error and the code.
- WebGL contexts are limited per page: `live.ts` lets a block draw in 3D only while it is on screen, and at most 2 at once (the last ones scrolled to or clicked). Others show the flat picture: the SVG court with a play button, or the 2D goal.
- No WebGL: `Court2D` / `Goal2D`.

## Goal heatmap (`src/components/goal/`)
- `zones.ts`: zone keys, per-zone share of goals, conversion, heat colour (court green for scored, foul red for conceded).
- `goal-3d.tsx`: 3 × 2 m goal, 20 cm red/white stripes, net, nine rounded tiles labelled goals/shots and share of goals; misses over/left/right as pills around the frame. Hover or tap a tile: conversion, share and the league share, in a tooltip above the goal over the tile's column (beside the goal, or under it, when there's no room), never over other tiles; a tap elsewhere closes it. Floor: the court's colours and plank texture (`court/playback.ts` COLORS, `court/textures.ts`), the 6m goal area, a soft shadow under the goal and a light hall wall behind it; built in `goal-3d.tsx` because the court's `Floor` isn't exported. Default camera from the shooter's front-left and slightly above; it eases in once (skipped with reduced motion); orbit limited, no zoom or pan. Labels are DOM elements moved by projecting 3D anchors each frame. The court module draws its own simpler goal (`court-3d.tsx`); the two are separate on purpose.
- `goal-2d.tsx`: the same data flat, used without WebGL and by `GoalFrame` on the stats pages.
- `goal-view.tsx`: picks 3D or 2D, lazy-loads the three.js chunk, falls back to 2D if the canvas throws.

## Team page
`/stats/teams/[id]` shows one goal with a Scored / Conceded toggle (`team-goal.tsx`). `team()` in `src/lib/stats/queries.ts` returns `missAttack` / `missDefence` (sums of `team_shooting`) and `leagueZones` (all zone goals in the team's main competition and season; each goal is someone's attack, so one total serves both sides). The tooltip compares the team's share of goals per zone with the league's.
