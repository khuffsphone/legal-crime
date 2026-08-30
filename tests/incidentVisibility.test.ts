import { describe, expect, it } from 'vitest';
import type { IncidentRecord, IncidentType } from '../src/sim';
import {
  incidentInvolvesPlayer,
  incidentIsVisible,
  knowableIncidents,
  resolveIncidentVisibility,
} from '../src/scenes/info/incidentVisibility';
import { createInitialState } from '../src/sim';

function incident(
  seq: number,
  type: IncidentType,
  summary: string,
  data?: Record<string, unknown>,
): IncidentRecord {
  return { seq, week: seq + 10, type, severity: 'warning', summary, ...(data ? { data } : {}) };
}

describe('incident visibility — pure NO-X-RAY partition', () => {
  it('surfaces only player-global, player-involved, or scouted-district records', () => {
    const global = incident(1, 'settlement', 'our weekly settlement');
    const own = incident(2, 'bust', 'our boss was busted', { familyId: 'player' });
    const scouted = incident(3, 'territory', 'a visible block changed hands', { districtId: 'seen' });
    const hidden = incident(4, 'shock', 'SECRET rival audit', { familyId: 'rival-a', districtId: 'fog' });
    const known = (id: string) => id === 'seen';

    expect(incidentInvolvesPlayer(own, 'player')).toBe(true);
    expect(incidentInvolvesPlayer(hidden, 'player')).toBe(false);
    expect(incidentIsVisible(global, 'player', known)).toBe(true);
    expect(incidentIsVisible(own, 'player', known)).toBe(true);
    expect(incidentIsVisible(scouted, 'player', known)).toBe(true);
    expect(incidentIsVisible(hidden, 'player', known)).toBe(false);

    expect(resolveIncidentVisibility([global, own, scouted, hidden], 'player', known)).toEqual({
      visible: [global, own, scouted],
      hasHiddenActivity: true,
    });
  });

  it('collapses one or many hidden records to the same metadata-free result', () => {
    const one = incident(1, 'territory', 'SECRET_A', { familyId: 'rival-a', districtId: 'fog-a' });
    const many = [
      one,
      incident(999, 'bust', 'SECRET_B', { familyId: 'rival-b' }),
      incident(5, 'shock', 'SECRET_C', { districtId: 'fog-c' }),
    ];
    const sealed = () => false;

    const a = resolveIncidentVisibility([one], 'player', sealed);
    const b = resolveIncidentVisibility(many, 'player', sealed);
    expect(a).toEqual({ visible: [], hasHiddenActivity: true });
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).not.toMatch(/SECRET_|territory|bust|shock|999/);
  });

  it('does not treat an unlocated rival incident as visible', () => {
    const hidden = incident(8, 'family_fallen', 'SECRET family fell', { familyId: 'rival-a' });
    expect(incidentIsVisible(hidden, 'player', () => true)).toBe(false);
  });

  it('preserves player-only actions and global shocks without opening per-family shock consequences', () => {
    const playerScoped: IncidentType[] = ['market', 'vice', 'offense', 'event', 'civic'];
    for (const [index, type] of playerScoped.entries()) {
      expect(incidentIsVisible(incident(20 + index, type, `${type} feedback`), 'player', () => false)).toBe(true);
    }
    const globalShock = incident(30, 'shock', 'a citywide shock began', { shock: 'audit' });
    const rivalConsequence = incident(31, 'shock', 'SECRET rival seizure', { familyId: 'rival-a', seized: 900 });
    const ownConsequence = incident(32, 'shock', 'our seizure', { familyId: 'player', seized: 100 });
    expect(incidentIsVisible(globalShock, 'player', () => false)).toBe(true);
    expect(incidentIsVisible(rivalConsequence, 'player', () => false)).toBe(false);
    expect(incidentIsVisible(ownConsequence, 'player', () => false)).toBe(true);
  });

  it('returns visible records only for scene consumers, with player-held districts always known', () => {
    const state = createInitialState(551);
    const heldDistrict = state.districts.find((district) => district.control[state.player.id] !== undefined)!;
    heldDistrict.control = { [state.player.id]: 100 };
    const remoteDistrict = state.districts.find((district) => district.id !== heldDistrict.id)!;
    const own = incident(1, 'bust', 'our bust', { familyId: state.player.id });
    const held = incident(2, 'territory', 'news from our turf', { districtId: heldDistrict.id });
    const remote = incident(3, 'territory', 'SECRET remote turf', { districtId: remoteDistrict.id });
    state.incidents = [own, held, remote];

    expect(knowableIncidents(state, { districtScouted: () => false })).toEqual([own, held]);
    expect(knowableIncidents(state, { districtScouted: (id) => id === remoteDistrict.id })).toEqual([
      own,
      held,
      remote,
    ]);
  });
});
