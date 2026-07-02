# Streetscape Layer — Phase 1: taxonomy + zones + district tables (Tickets 1–3)

**Pure data spine. Wires nothing into live rendering.** Same discipline as #53's facade-kit Phase 1: build +
test the data layer, place/render nothing. The concurrent **cop P0** branch owns `IsoScene.ts`, `realtime.ts`,
worldgen and `/src/sim`; this branch touches **none** of them — everything lives under `src/scenes/env/`
(Phaser-free, importable by sim later) + `tests/` + this doc.

## ⚠ Provenance — CC-DERIVED, reconcile before Ticket 4

The dispatch named GPT-Pro's *"Environmental Asset / Streetscape Aesthetic Specification"* (§2.1 zones, §6.1
districts, §10.2 height bands, §11.1 the 28 families, §12.1 anchor/rhythm/filler/rare, §12.2 density caps) as
the design source, "in this dispatch's context or the Drive brain folder." **It was in neither** — a thorough
search (titles, full-text, the brain folder, recent files) surfaced only the *building/ground-plane* kit spec
and the 25-Asset Batch plan. Rather than fabricate a spec I couldn't see, the **structure** here follows the
ticket exactly (the 9 zones + 4 anchor tiers are verbatim; the metadata fields are as listed), and the
**content** (the 28-family roster, per-district weights, cap numbers) is **synthesised** from the canon that
*is* available:

- `src/scenes/art/districtIdentity.ts` — the 9 district archetypes + the warm-noir **colour law** (scenery
  never carries brass/red/green, which are reserved for player/rival/danger).
- The Brassmere building/ground-plane kit spec — §7 ground-plane cross-section bands, §7.3 "props stay
  **subordinate**, the sidewalk-through + road travel lane stay clear", and the ~1920s Chicago period grammar.
- `LIVING_CITY_SPEC` — faction-neutral muted props; vendors at plazas/corners, never residential/business tiles.
- The 25-Asset Batch prop list (lamp, car, tree, hydrant, bench, cart, stall, crate, drum, pallet, mailbox,
  manhole, grate, puddle, awning, sign, …).

**Before Ticket 4 consumes this**, reconcile the roster / weights / cap numbers against GPT-Pro's actual
§11.1/§6.1/§10.2/§12.2. The schema, the zone model, and the predicate are stable and won't need to move; only
the tuning values might. Every module header repeats this caveat.

## Modules

| File | Ticket | Role |
|------|--------|------|
| `src/scenes/env/streetscapeTypes.ts` | — | Shared vocabulary (zone ids, height bands, categories, anchor tiers, condition states, rarity, the 8 districts). Foundational — breaks the import cycle. |
| `src/scenes/env/streetscapeZones.ts` | **2** | The 9 placement zones + the pure forbidden-placement predicate. |
| `src/scenes/env/streetscapeTaxonomy.ts` | **1** | The 28 MVP prop families as full metadata + family-level helpers. |
| `src/scenes/env/streetscapeDistricts.ts` | **3** | The 8 district composition tables + per-block-face density caps + `compositionFor`. |

Import DAG (acyclic): `types → zones → taxonomy → districts`.

## Ticket 1 — asset taxonomy (28 families)

Each family carries: `category` (utility · street_furniture · vegetation · commercial · vehicle · debris ·
ground_decal · civic), `heightBand` (flush · low · mid · tall, per §10.2 — subordinate clutter is ≤ ⅓ the
~56px figure; only lamps/poles/trees/signs rise past head height), `anchorType` (anchor · rhythm · filler ·
rare, §12.1), `rarity` (common · uncommon · rare), `placementZones`, `conditionStates`, and district affinity
(`baseWeight` + sparse `districtWeights`, resolved by `weightFor`).

The 28: `street_lamp, utility_pole, traffic_signal, fire_hydrant, police_call_box` (utility);
`mailbox, bench, trash_can, bollard` (furniture); `news_stand, vendor_cart, produce_stall, sandwich_board,
awning, blade_sign` (commercial); `street_tree, planter, hedge_shrub` (vegetation); `fountain,
statue_monument` (civic); `parked_car, delivery_truck` (vehicle); `crate_stack, barrel_drum, pallet_stack`
(debris); `manhole_cover, sewer_grate, puddle_stain` (ground decals).

## Ticket 2 — placement zones (9) + forbidden-placement predicate

Zones (cross-section, building → road → alley): `storefront_frontage, residential_frontage, furniture_band,
sidewalk_through, curb, road, park_plaza, alley_service, industrial_apron`.

`isForbiddenPlacement(family, zone)` is **two layers**:

1. **Family layer** — the zone must be in the family's declared `placementZones`, else forbidden. (This
   rejects the ticket's cases: hydrant→`sidewalk_through`, bench→`road`, vendor_cart→`residential_frontage`.)
2. **Structural layer** — a **through-movement** zone (`road` travel surface, `sidewalk_through` pedestrian
   corridor) rejects any *solid* (non-`flush`) prop that isn't part of that flow: **vehicles** are exempt on
   the road, **flush ground decals** have no mass, everything else would block movement (building-kit §7.3).
   This is an invariant guard — the family data is authored to already respect it, and a test asserts they agree.

No collision-system coupling: this only *decides* legality; it never reads or writes the nav grid (that's Ticket 4).

## Ticket 3 — district composition tables (8) + density caps

8 archetypes (a compile-time-checked subset of `districtIdentity`'s 9): `FINANCIAL, MARKET, THEATRE, TENEMENT,
CIVIC, DOCKS, INDUSTRIAL, RIVERSIDE`. Each has **per-block-face density caps** `{ anchor, rhythm, filler, rare }`
(§12.2) tuned per archetype (dense downtown vs sparse-poor vs debris-heavy vs green-leisure), all keeping
`anchor ≤ rhythm`, `filler ≥ anchor`, `rare ≤ 2`.

`compositionFor(district)` returns, per role, the cap + the eligible families (non-zero affinity) sorted by
weight — exactly what Ticket 4's placement pass samples from. Family weights are the taxonomy's
`districtWeights` (not duplicated here — one source of truth).

## What Ticket 4 (later, after cop P0 merges) will consume

For a district's block-face: `compositionFor(district)` → for each role, take up to `cap` families weighted by
affinity, filter candidate tiles with `isForbiddenPlacement`, place with the neutral colour law + subordinate
scale. **Not in this phase** — no rendering, no nav-grid writes, no map placement.

## Tests

`tests/streetscape{Taxonomy,Zones,Districts}.test.ts` cover the acceptance bar: every family has complete
metadata; the named forbidden placements are rejected (and legitimate ones allowed); the 8 districts produce
**distinct** distributions; **no** family dominates all districts; density caps are enforced; plus purity /
self-consistency invariants (every family is allowed in its own zones; no family declares a through-zone
unless flush/vehicle; no dead families; every district has an anchor-eligible family).
