# Brassmere Production Reboot

Status: FP-01 foundation in implementation on `codex/brassmere-fun-proof-reboot`

Baseline: `rts/isometric-conversion` at `0d4581c`

## Product promise

Brassmere is an original Prohibition-era noir crime-strategy game. The player begins with a small outfit, leans on local businesses, protects collection routes, builds a crew, corrupts institutions, survives rival retaliation and law pressure, and chooses how to take the city.

The game must feel alive before it becomes broad. A feature does not count as shipped because its pure logic is tested or because it exists behind a URL flag. It counts when a player encounters it in the normal build, understands it, hears and sees its result, and wants to take the next action.

## Current playable loop

1. Read the neighborhood and select one or more thugs.
2. Right-click a storefront and order an embodied shakedown.
3. Build control until the storefront pays protection.
4. Establish a collection route and protect the collector from interception.
5. Recruit general muscle or weapon specialists.
6. Expand into another block while managing clean cash, dirty cash and heat.
7. Grease The Beat, The Bench, City Hall or The Bureau for bounded advantages.
8. Escalate through sabotage, raids, lockouts, demolition and assassination.
9. React to rival attacks, police activity and federal thresholds.
10. Win through Domination, Legitimacy or Political Capture; lose through organizational collapse or law pressure.

## Why the prior build felt dead

### Presentation was not the default

The prior normal launch left several high-value layers off unless query flags were supplied:

- 3D isometric unit sprites: `?sprites=1`
- 24 Meshy AI street props: `?props=1`
- beat-cop patrols: `?cops=1`
- newer combat controls: `?combat=1`
- expanded atmosphere coordinator: `?audio=1`
- facade kit: `?facadekit=1`

FP-01 now promotes unit sprites, street props, facades, citizens, and advanced combat controls into the normal `showcase` launch, with `?profile=legacy` as the full rollback. Beat cops and expanded atmosphere remain deliberately off until their gameplay-balance and media-completeness blockers are fixed; disabling cops preserves older saved patrol data but does not render or simulate it, so the patrols cannot generate invisible heat.

### Audio completeness was mistaken for audio quality

The core audio catalog references 49 physical files. Nine are absent:

- six weapon/fist impact clips
- pavement and gravel footsteps
- one downed-body settle clip

Seven legacy files labeled as event sound effects were 29-145 seconds long. Together with nine missing
files, the new gate initially reported 16 production blockers. FP-01 now ships 16 short deterministic
one-shots (including a distinct collector pickup), retires the unused generic warning cue, and quarantines
the malformed sources outside `public/`. Listening UAT remains required; middleware cannot make weak source
material exciting merely because the technical gate is green.

### Systems outran the experience

The simulation is broad and heavily tested, while `IsoScene.ts` has grown into a 431 KB orchestration monolith. The player is introduced to many verbs, meters and panels before the opening actions establish a compelling sensory and strategic rhythm.

### The old balance evidence already rejected the arc

The repository's UAT report called the game "FUNCTIONAL, NOT YET FUN." Its documented failure was a one-block poverty/heat trap: the player could recruit and begin operating, but could not fund expansion, offence and heat suppression before rivals and law pressure overwhelmed the run. Later tests prove logic, not that this experiential failure is gone.

## Production principle

Stop treating breadth as progress. Production now advances through one showcase loop:

`spot opportunity -> order crew -> watch movement -> hear acknowledgment -> witness action -> receive payoff -> face consequence -> choose escalation`

Every major action in that loop needs all six signals:

1. clear target and affordance
2. readable crew movement
3. voice acknowledgment
4. synchronized action animation and sound
5. visible state/economy consequence
6. a new decision or threat within seconds

## Milestone FP-01: The First Ten Minutes

### Required player sequence

1. Start a normal new game with no query parameters.
2. Hear a restrained menu theme and city bed after the browser's audio gesture.
3. Select a named thug and hear one of at least three short acknowledgments.
4. Order a shakedown; the thug walks with readable eight-direction motion and audible surface steps.
5. The shakedown lands with a synced physical performance, impact sound, proprietor reaction and cash/control feedback.
6. Establish a collector route and see the first pickup and bank-delivery payoff.
7. Receive a rival intent warning and an actionable map jump.
8. Fight one short street encounter with weapon-specific reports, hit reactions, civilian panic and a clear downed state.
9. Cross or narrowly approach one law-pressure threshold and understand the counterplay.
10. End with a meaningful choice: expand, recruit a specialist, or grease a channel.

### Acceptance gates

- Normal launch uses the approved showcase feature profile; no secret URL recipe is required.
- No missing-file requests for production audio or visual assets.
- No event SFX longer than 5 seconds unless explicitly classified as ambience, music or cinematic.
- At least three distinct confirmation barks are audible and non-overlapping.
- Footsteps are cadence-locked to planted frames and distance-governed.
- Every weapon class in the slice has a distinct report and impact identity.
- A collector deposit produces a satisfying visual/audio reward beat.
- A rival threat becomes actionable in one click.
- The opening cannot enter the documented one-block poverty/heat death spiral under standard play.
- Build, typecheck and the existing 1,938 tests remain green.
- A browser UAT recording proves the complete sequence at desktop resolution.
- Five fresh playtesters can answer "what should I do next?" without opening Help.
- At least four of five choose to continue after the ten-minute test.

## Branch policy

- `rts/isometric-conversion` remains the immutable recovery baseline during FP-01.
- New work lands on one integration branch, not independent unmerged lanes.
- Asset receipts include prompt, provider, plan/license, source file, processed output, hash and in-game key.
- Reviewers may reject or request changes; the implementer does not self-certify fun.
- No automatic merge for presentation, balance or generated-asset changes.

## First implementation order

1. **Started:** add a single typed showcase feature profile and make it the normal launch.
2. **Gate implemented; source work pending:** validate asset loading and repair missing/incorrect event audio.
3. Replace placeholder confirmation VO with a coherent cast and naming contract.
4. Tune one shakedown, one collector deposit and one street fight to final-quality timing.
5. Run visual/audio browser UAT and fix the first ten minutes.
6. Only then resume broader district, campaign and content expansion.
