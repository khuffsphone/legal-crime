import { describe, expect, it } from 'vitest';
import {
  advanceFootstepCadence,
  footstepKeyForTile,
  footstepPlayback,
  RUN_FOOTFALL_TILES,
  WALK_FOOTFALL_TILES,
} from '../src/scenes/footstepFeedback';

describe('FP-01 footstep feedback', () => {
  it('maps loose park/ground surfaces to gravel and city paving to pavement', () => {
    expect(footstepKeyForTile('park')).toBe('sfx_step_gravel');
    expect(footstepKeyForTile('ground')).toBe('sfx_step_gravel');
    for (const kind of ['avenue', 'street', 'sidewalk', 'plaza', 'building'] as const) {
      expect(footstepKeyForTile(kind)).toBe('sfx_step_pavement');
    }
  });

  it('emits by grid distance, retains the remainder, and stays silent while stopped', () => {
    expect(advanceFootstepCadence(0, 0.2, WALK_FOOTFALL_TILES)).toEqual({ travelTiles: 0.2, emit: false });
    const contact = advanceFootstepCadence(0.2, 0.35, WALK_FOOTFALL_TILES);
    expect(contact.emit).toBe(true);
    expect(contact.travelTiles).toBeCloseTo(0.03);
    expect(advanceFootstepCadence(0.03, 0, WALK_FOOTFALL_TILES)).toEqual({ travelTiles: 0.03, emit: false });
  });

  it('collapses a large frame jump to one governed cue without losing cadence phase', () => {
    const contact = advanceFootstepCadence(0, 1.1, WALK_FOOTFALL_TILES);
    expect(contact.emit).toBe(true);
    expect(contact.travelTiles).toBeCloseTo(0.06);
  });

  it('gives consecutive contacts restrained deterministic playback variation', () => {
    const takes = [0, 1, 2, 3].map((step) => footstepPlayback(step, 7));
    expect(new Set(takes.map((take) => take.rate)).size).toBe(4);
    expect(takes.every((take) => take.rate >= 0.9 && take.rate <= 1.05)).toBe(true);
    expect(footstepPlayback(0, 7)).toEqual(footstepPlayback(0, 7));
  });

  it('keeps both stroll and default collector-run cadence below chatter speed', () => {
    expect(1.15 / WALK_FOOTFALL_TILES).toBeCloseTo(2.2, 1);
    expect(2.5 / RUN_FOOTFALL_TILES).toBeLessThanOrEqual(3.5);
  });
});
