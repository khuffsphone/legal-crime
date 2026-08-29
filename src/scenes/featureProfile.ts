// FP-01 — one explicit runtime feature profile. The old production entrypoint silently chose the
// conservative fallback for the exact layers that make Brassmere look, move and sound alive. This
// resolver makes the integrated SHOWCASE the default while preserving both a one-switch legacy
// rollback and per-feature query overrides for diagnosis.

export type FeatureProfileName = 'showcase' | 'legacy';

export interface RuntimeFeatureProfile {
  readonly name: FeatureProfileName;
  readonly sprites: boolean;
  readonly props: boolean;
  readonly cops: boolean;
  readonly combatControls: boolean;
  readonly atmosphereAudio: boolean;
  readonly facadeKit: boolean;
  readonly citizens: boolean;
}

const SHOWCASE: Omit<RuntimeFeatureProfile, 'name'> = {
  sprites: true,
  props: true,
  // Beat cops currently alter heat; keep them out of the presentation promotion until FP-01 validates
  // their balance. IsoScene preserves but does not render or simulate saved cops while disabled.
  cops: false,
  combatControls: true,
  // The atmosphere manifest is still a production queue, not a shipped library. Keep the new
  // coordinator dark until its asset gate is green; core music/VO/SFX remain active via AudioManager.
  atmosphereAudio: false,
  facadeKit: true,
  citizens: true,
};

const LEGACY: Omit<RuntimeFeatureProfile, 'name'> = {
  sprites: false,
  props: false,
  cops: false,
  combatControls: false,
  atmosphereAudio: false,
  facadeKit: false,
  citizens: false,
};

const FALSY = new Set(['0', 'off', 'false', 'no']);

function params(search: string): URLSearchParams {
  try { return new URLSearchParams(search); } catch { return new URLSearchParams(); }
}

function overridden(p: URLSearchParams, key: string, fallback: boolean): boolean {
  const raw = p.get(key);
  if (raw === null) return fallback;
  return !FALSY.has(raw.toLowerCase());
}

/** Resolve the normal runtime profile. `?profile=legacy` is the full rollback valve; every feature
 * also retains a narrow `?feature=off|0|false|no` / `?feature=1|on|true` override for UAT bisection. */
export function resolveFeatureProfile(search: string): RuntimeFeatureProfile {
  const p = params(search);
  const name: FeatureProfileName = p.get('profile')?.toLowerCase() === 'legacy' ? 'legacy' : 'showcase';
  const base = name === 'legacy' ? LEGACY : SHOWCASE;
  return {
    name,
    sprites: overridden(p, 'sprites', base.sprites),
    props: overridden(p, 'props', base.props),
    cops: overridden(p, 'cops', base.cops),
    combatControls: overridden(p, 'combat', base.combatControls),
    atmosphereAudio: overridden(p, 'audio', base.atmosphereAudio),
    facadeKit: overridden(p, 'facadekit', base.facadeKit),
    citizens: overridden(p, 'citizens', base.citizens),
  };
}
