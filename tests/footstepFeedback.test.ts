import { describe, expect, it } from 'vitest';
import { advanceFootstepCadence, footstepKeyForTile } from '../src/scenes/footstepFeedback';

describe('FP-01 footstep feedback', () => {
  it('maps loose park/ground surfaces to gravel and city paving to pavement', () => {
    expect(footstepKeyForTile('park')).toBe('sfx_step_gravel');
    expect(footstepKeyForTile('ground')).toBe('sfx_step_gravel');
    for (const kind of ['avenue', 'street', 'sidewalk', 'plaza', 'building'] as const) {
      expect(footstepKeyForTile(kind)).toBe('sfx_step_pavement');
    }
  });

  it('emits by distance, retains the remainder, and stays silent while stopped', () => {
    expect(advanceFootstepCadence(0, 7, 32)).toEqual({ travelPx: 7, emit: false });
    expect(advanceFootstepCadence(7, 10, 32)).toEqual({ travelPx: 1, emit: true });
    expect(advanceFootstepCadence(1, 0, 32)).toEqual({ travelPx: 1, emit: false });
  });

  it('collapses a large frame jump to one governed cue without losing cadence phase', () => {
    expect(advanceFootstepCadence(0, 50, 32)).toEqual({ travelPx: 2, emit: true });
  });
});
