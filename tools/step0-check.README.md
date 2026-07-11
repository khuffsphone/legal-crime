# `step0-check` — pre-task collision guard

A tiny, dependency-free script that a **Code** or **Cowork** session runs at *step 0* of
every task — **before editing anything** — to catch when the files it's about to touch
collide with a work-lane another agent (or the human) already owns.

It prints the current git state and a severity report, and **exits `1`** if any declared
file hits a known collision-magnet module (so an automated session fails loudly instead
of stomping a hot shared file), or **`0`** otherwise.

## Usage

```bash
npx tsx tools/step0-check.ts <file-or-glob> [<file-or-glob> ...]
```

- Arguments are the files/globs the task **declares it will touch**. Globs (`*`, `**`,
  `?`) are supported and matched against the registry patterns.
- Options: `-h` / `--help`.
- Exit code: `1` if any overlap is severity `stop`, else `0`.

Example (a session about to edit the renderer):

```bash
npx tsx tools/step0-check.ts "src/render/*.ts" src/render/scene.ts
echo "exit=$?"
```

Because it exits non-zero on a `stop` collision, it composes directly into a guard:

```bash
npx tsx tools/step0-check.ts "$@" || { echo "step0 says STOP — coordinate first"; exit 1; }
```

The script is pure Node/TS (`child_process`, `fs`, `path`, `url` only) — **no Phaser,
Vite, or game-runtime imports** — so it runs anywhere `tsx`/`node` does and never pulls
in the game bundle. All collision logic is exported for unit testing; see
`tests/step0-check.test.ts`.

## The `.claude/step0-context.md` registry

A **human-maintained** file listing in-flight lanes. If it doesn't exist, `step0-check`
creates a stub with an empty `activeLanes` array on first run.

Format: free-form markdown, plus exactly **one fenced JSON block** delimited by the
`DASHBOARD_STATE_JSON_BEGIN` / `DASHBOARD_STATE_JSON_END` markers (the same convention as
the dashboard v2 iteration). Everything outside the markers is ignored, so you can keep
notes, a changelog, ownership contacts, etc. around the block.

```markdown
# Step 0 Context — Active Lane Registry

...notes for humans...

<!-- DASHBOARD_STATE_JSON_BEGIN -->
```json
{
  "activeLanes": [
    { "id": "rts-iso",   "owner": "Code",   "files": ["src/scenes/IsoScene.ts", "src/render/*.ts"] },
    { "id": "ui-polish", "owner": "Design", "files": ["src/scenes/ui/*"] }
  ]
}
```
<!-- DASHBOARD_STATE_JSON_END -->
```

Each lane:

| field   | required | meaning                                                        |
| ------- | -------- | -------------------------------------------------------------- |
| `id`    | no\*     | short lane identifier shown in the report                      |
| `owner` | no\*     | who owns the lane (used as the label if `id` is absent)        |
| `files` | yes      | array of paths/globs the lane is actively editing              |

\* at least one of `id` / `owner` is recommended so overlaps are attributable.

The parser is defensive: a missing block, malformed JSON, or a missing `files` array all
degrade to "no active lanes" rather than throwing.

## Severity matrix

For each `(declared file × lane file)` pair the guard assigns:

| severity | when                                                                     | exit impact |
| -------- | ------------------------------------------------------------------------ | ----------- |
| `stop`   | either side is a **collision magnet** (see below)                        | forces `1`  |
| `high`   | the same exact non-magnet file/pattern                                   | `0`         |
| `medium` | overlap within the **same directory** (e.g. `src/render/*.ts` vs a file) | `0`         |
| `low`    | overlap only through a **broad, cross-directory** glob (`src/**/*.ts`)   | `0`         |
| `none`   | no overlap                                                               | `0`         |

The report's `max severity` is the worst pair; the process exits `1` **iff** at least one
pair is `stop`. `high`/`medium`/`low` are advisory — they surface adjacency so a session
can proceed with awareness, without hard-blocking.

### Collision magnets

**Canonical** (from the dashboard v2 spec — matched by basename, so any directory):

- `IsoScene.ts`
- `save.ts`
- `tick.ts`
- `applyCommand.ts`
- `src/scenes/ui/*` (directory glob)

**Churn-discovered** (added during recon on `rts/isometric-conversion` via
`git log --name-only | sort | uniq -c` — the highest-churn shared modules outside the
canonical list; matched by **full path suffix**, not bare basename, to avoid false hits
on generic names like `index.ts`):

- `src/sim/index.ts` — 72 commits
- `src/sim/constants.ts` — 39 commits
- `src/sim/types.ts` — 30 commits
- `src/sim/state.ts` — 20 commits (the de-facto save/state module; `save.ts` per the spec
  does not exist as a literal file in this repo)

> Note for K: `save.ts` and `applyCommand.ts` from the canonical list are **symbolic** —
> there is no literal `save.ts`/`applyCommand.ts` in the tree (`applyCommand` is a function
> in `src/sim/commands.ts`; save/load state lives in `src/sim/state.ts`). They're kept in
> the basename magnet list verbatim per the spec so the convention stays portable. Trim or
> extend either list in `tools/step0-check.ts` (`CANONICAL_MAGNET_*` /
> `DISCOVERED_MAGNET_SUFFIXES`) as ownership shifts.

## Overlap detection notes

Overlap is computed **pattern-vs-pattern at the string level** (glob → RegExp), plus
concrete file-under-glob matching. It intentionally does **not** enumerate the filesystem,
so two globs that share files only through the actual tree (e.g. `src/*/a.ts` vs
`src/sim/*.ts`) may not be flagged. Magnet detection is independent of this and always
applies. The guard is a fast, deterministic pre-flight — not a substitute for a real merge.
