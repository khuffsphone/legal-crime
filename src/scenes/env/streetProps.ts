// streetProps.ts - flag-gated (?props=1) placement of the rendered Meshy environmental props onto the
// streetscape. Phaser-side render helper only; adds NOTHING to the sim. Each prop PNG was rendered at the
// canon density (90.5097 px/BU, 60/45) and screen-height-calibrated to its target, foot seated at the
// canvas bottom (footPadPx=0), so it draws at origin (0.5,1.0) / scale 1 in world proportion vs units.
//
// NO-X-RAY: every placed prop is pushed into the scene's `dressing` / `dressingDark` lists, so it rides the
// SAME per-frame fog-reveal + far-cull lifecycle as the existing set-dressing (a prop on an unrevealed tile
// draws nothing). Placement reuses scatterProps() (the vetted open-tile scatter) on a distinct seed, so
// props land only on legit open/sidewalk tiles, never inside buildings.
import type Phaser from 'phaser';
import { gridToScreen, depthValue } from '../../sim/iso';
import { scatterProps, tileKindAt } from '../../sim/worldgen';
import type { WorldLayout } from '../../sim/worldgen';

/** Pure URL predicate (mirrors copsRequested/spritesRequested): the layer is OFF unless ?props=1. */
export function propsRequested(search: string): boolean {
  return new URLSearchParams(search).get('props') === '1';
}

/** The 24 Phase-1 Chicago props (public/assets/sprites/props/<id>.png), rendered by render_props.py. */
export const STREET_PROP_IDS: readonly string[] = [
  'prop_awning__chicago_alley_door_07070',
  'prop_planter__chicago_building_stoo_07',
  'prop_awning__chicago_fire_escape_0707',
  'prop_fire_hydrant__chicago_fire_hydrant_070',
  'prop_vendor_cart__chicago_hand_cart_070702',
  'prop_bollard__chicago_hitching_post_07',
  'prop_hedge_shrub__chicago_iron_fence_07070',
  'prop_manhole_cover__chicago_manhole_cover_07',
  'prop_news_stand__chicago_newsstand_070702',
  'prop_bench__chicago_park_bench_07070',
  'prop_mailbox__chicago_postal_box_07070',
  'prop_crate_stack__chicago_steamer_trunk_07',
  'prop_traffic_signal__chicago_stop_sign_070702',
  'prop_sewer_grate__chicago_storm_drain_0707',
  'prop_statue_monument__chicago_street_clock_070',
  'prop_street_lamp__chicago_street_lamp_0707',
  'prop_crate_stack__chicago_street_props_070',
  'prop_blade_sign__chicago_street_sign_p_07',
  'prop_police_call_box__chicago_telephone_boo_07',
  'prop_trash_can__chicago_trash_can_070702',
  'prop_utility_pole__chicago_utility_pole_070',
  'prop_vendor_cart__chicago_vendor_pushca_07',
  'prop_produce_stall__speakeasy_bar_counter_07',
  'prop_produce_stall__speakeasy_table_and_c_07',
];

const MAX_PLACED = 96; // cap the scatter (fog-cull keeps only visible ones drawing; this bounds create cost)

/** Queue the 24 prop atlases. Call in preload() only when ?props=1. */
export function preloadStreetProps(scene: Phaser.Scene): void {
  for (const id of STREET_PROP_IDS) scene.load.image(id, `assets/sprites/props/${id}.png`);
}

/** Place the props on open tiles and register them into the scene's fog-gated dressing lists.
 *  Call in create() AFTER drawSetDressing(), only when ?props=1. Strictly additive: it reads the world +
 *  seed and appends Image records; it mutates no sim state and touches no existing dressing entries. */
export function placeStreetProps(
  scene: Phaser.Scene,
  world: WorldLayout,
  seed: number,
  dressing: { img: Phaser.GameObjects.Image; gx: number; gy: number }[],
  dressingDark: { img: Phaser.GameObjects.Image; gx: number; gy: number }[],
): number {
  // distinct seed so the Meshy props scatter to their OWN open tiles (not on top of the procedural dressing)
  const spots = scatterProps(world, { seed: (seed ^ 0x70705) >>> 0 });
  let placed = 0;
  for (const spot of spots) {
    if (placed >= MAX_PLACED) break;
    if (tileKindAt(world, spot.gx, spot.gy) === 'building') continue; // never inside a building
    const id = STREET_PROP_IDS[placed % STREET_PROP_IDS.length];
    if (!scene.textures.exists(id)) continue;
    const c = gridToScreen(spot.gx, spot.gy);
    const img = scene.add.image(c.x, c.y, id)
      .setOrigin(0.5, 1.0)                                   // foot baseline (footPadPx=0 for every prop)
      .setDepth(depthValue(spot.gx, spot.gy) * 10 + 4)      // above ground; units/buildings draw over by depth
      .setVisible(false);                                   // shown by the existing fog-reveal update loop
    const rec = { img, gx: spot.gx, gy: spot.gy };
    dressing.push(rec);
    dressingDark.push(rec);
    placed++;
  }
  return placed;
}
