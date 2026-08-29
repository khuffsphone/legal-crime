# FP-01 Play-Through Checklist

Use this checklist on the deployed candidate after automated gates pass. A source review or green unit test does not count as gameplay proof.

## Locked behavior contract

- The first `[C]` action is a required, one-time tutorial **RUSH**. The automatic collector waits so the player can send this protected first run.
- After that first protected run, collections are automatic. Later `[C]` presses only rush accrued takings early.
- A completed one-shot `[C]` runner deposits, exits, and is removed. It must not remain parked at HQ.
- The Beat lowers police raid odds. It does **not** directly lower the raw Heat meter.
- City Hall improves raw Heat cooling on future settlements. It does not erase Heat immediately when purchased.
- The Bureau lowers Federal Exposure.
- Holding `[G]` must execute one purchase, not repeat purchases from keyboard auto-repeat.
- The Mayor victory requires both City Hall at **$40/week or more** and Civic Influence at **100 or more**. Neither gate alone can win.

## Preflight

- [ ] Hard-refresh the candidate URL.
- [ ] Record the exact URL, commit/build identifier, browser, operating system, viewport, and query string.
- [ ] Start **NEW GAME**, not Quickload, using the default showcase profile at `1x` speed.
- [ ] Use no debug, reveal, legacy, or feature-override flags.
- [ ] Use headphones or reliable speakers and unlock browser audio with one deliberate gesture.
- [ ] Record starting week, funds, Heat, Federal Exposure, all four bribe channels, Civic Influence, and Mayor progress.
- [ ] Open the browser console and retain any error or warning evidence.

## 1. Opening regression

- [ ] Background music begins once after audio unlock and does not stack.
- [ ] Voices remain clear over the music.
- [ ] Fog conceals unscouted areas and reveals terrain only through legitimate exploration.
- [ ] Leave the opening/tutorial card open for 20 seconds. Week, funds, Heat, rivals, and unit positions must remain frozen.
- [ ] Select Sal and Vito separately. Confirm the correct name and acknowledgement for each.

## 2. Footstep replacement

- [ ] Move Sal 8–12 tiles over pavement.
- [ ] Move Vito 8–12 tiles over pavement.
- [ ] Repeat over gravel if a gravel route is reachable.
- [ ] Footsteps read as restrained shoes or boots with low/mid-frequency body, not high-pitched clicking.
- [ ] More than one variation is audible; repeated steps do not sound like a single mechanical sample.
- [ ] Cadence follows visible movement and does not chatter every frame.
- [ ] Footsteps stop while idle, paused, or blocked.
- [ ] Footsteps sit below voices and do not mask music, command barks, or combat cues.

## 3. First shakedown and protected tutorial collection

- [ ] Select a gangster and complete the highlighted first shakedown.
- [ ] Confirm the order acknowledgement, walk, physical shakedown, proprietor reaction, control change, and accrued-takings feedback.
- [ ] Confirm the tutorial says `[C]` is the required one-time protected **RUSH**, not the permanent way income is collected.
- [ ] Before `[C]`, confirm the automatic route waits and does not steal the tutorial's first payday.
- [ ] Press `[C]` once.
- [ ] While the first collector is in flight, hold `[C]`. Confirm no duplicate collector, pickup, deposit, or cash credit; a clear in-flight message should appear.
- [ ] Exactly one collector departs, picks up exactly once, reaches HQ, deposits exactly once, and increases cash exactly once.
- [ ] After the deposit feedback completes, the one-shot collector exits and disappears. It must not remain inert at HQ.
- [ ] The first collector is visibly identified as protected/safe.

## 4. Automatic collections after the tutorial

- [ ] After the first protected deposit, do not press `[C]` for at least two settlements.
- [ ] Confirm the fixed collector automatically collects and banks newly accrued takings.
- [ ] Confirm each automatic pickup and deposit produces readable visual/audio feedback.
- [ ] Confirm no duplicate fixed collectors or double credit appears after multiple settlements.
- [ ] Let takings accrue again, then tap `[C]`. Confirm it only advances the timing of the same collection system.
- [ ] While that later rush is active, tap `[C]` again. Confirm a clear in-flight message and no state corruption.
- [ ] Confirm the later runner deposits, retires, and leaves no duplicate or parked collector.
- [ ] Tap `[C]` with no takings. Confirm the game explains that nothing is waiting (the automatic route may already have banked it) and does not create a runner.

## 5. `[G]`, Heat, Federal Exposure, and input repeat

- [ ] On a fresh run, record Heat, Federal Exposure, The Beat, City Hall, The Bureau, recurring expenses, Civic Influence, and Mayor progress.
- [ ] Hold `[G]` for two seconds as one physical keypress.
- [ ] Exactly one $10/week transaction occurs. Keyboard auto-repeat must not stack purchases.
- [ ] During the first grease lesson, The Beat changes from `$0/week` to `$10/week`; City Hall and The Bureau remain unchanged.
- [ ] The Pistol Man unlock becomes available.
- [ ] The status, tutorial, and tooltip explain that The Beat lowers **raid odds**, not raw Heat.
- [ ] Raw Heat does not drop immediately merely because The Beat was greased.
- [ ] Advance a settlement. Heat may rise if new crimes add more than cooling removes; do not require it to fall.
- [ ] Explicitly grease City Hall, then observe later settlements. Any additional Heat cooling occurs on those future settlements, not at purchase time.
- [ ] Explicitly grease The Bureau and confirm Federal Exposure—not raw Heat or City Hall—inherits the benefit.
- [ ] Confirm each purchase identifies the affected channel and new recurring weekly cost.

## 6. Mayor victory gates

- [ ] With Civic Influence at or above `100` but City Hall below `$40/week`, Mayor progress remains blocked and no victory fires.
- [ ] With City Hall at or above `$40/week` but Civic Influence below `100`, Mayor progress remains blocked and no victory fires.
- [ ] Advance 4–6 settlements after only the tutorial Beat purchase. Civic Influence may accrue, but no Mayor victory can occur.
- [ ] The Mayor newspaper appears only when City Hall is at least `$40/week` **and** Civic Influence is at least `100`.
- [ ] The endgame report accurately lists both achieved gates and does not misattribute The Beat or The Bureau.

## 7. FP-01 first ten minutes

- [ ] Finish the first shakedown and collection payoff without contradictory instructions.
- [ ] Recruit the newly unlocked Pistol Man.
- [ ] Observe a rival warning and use its camera-jump affordance.
- [ ] Resolve one readable street fight with weapon report, impact, reaction, down-state, and civilian panic feedback.
- [ ] On a visible casualty, require exactly one weapon hit, a short hurt/fall beat, one body-contact sound near floor contact, a clearly horizontal/desaturated body, a late fade, and complete removal within 6.5 seconds at `1x`.
- [ ] The dead unit immediately loses selection, targeting, collision, control-group membership, and combat influence.
- [ ] Pause during the body linger. Confirm the casualty lifecycle freezes; resume and confirm it finishes normally.
- [ ] Save/load once during a body linger. Confirm one body resumes at the saved stage and does not duplicate or become a live target.
- [ ] Eliminate a rival family. Confirm its remaining fighters and collectors disappear and its routes, contests, and queued strikes stop within one reconciliation step.
- [ ] Hidden combat does not leak through camera movement, status text, effects, body markers, or adaptive music.
- [ ] Reach a law-pressure warning and confirm its copy names valid counterplay.
- [ ] Save and load once. Sal, Vito, collectors, fog, economy, and bribes persist correctly.
- [ ] Music, ambience, and voices do not duplicate after load, restart, or return from the menu.
- [ ] End with a legible choice among expansion, recruitment, and corruption.
- [ ] No unexplained or premature victory occurs.

## Evidence and release decision

Capture screenshots at minimum for:

1. Initial tutorial state.
2. First protected collector departure.
3. First HQ deposit.
4. State immediately before and after the held `[G]` test.
5. Bribe/Heat/Federal/Mayor state after 4–6 settlements.
6. First rival warning and street fight.
7. Casualty at hit/fall, body linger, and post-cleanup.
8. Every failure.

For each failure, record exact reproduction steps, expected result, actual result, frequency, severity, and evidence.

FP-01 does not pass unless:

- collection behavior and tutorial copy agree;
- `[G]` cannot repeat from a held key;
- The Beat, City Hall, and The Bureau communicate and affect the correct pressure;
- the Mayor gates cannot resolve early;
- footsteps no longer resemble high-pitched clicks;
- a casualty is unambiguously dead and fully cleaned up within 6.5 seconds at `1x`;
- an eliminated rival leaves no immortal map units, collectors, routes, contests, or queued strikes;
- the first-ten-minute loop completes without a P0 or P1 defect;
- audio was actually heard and browser gameplay was actually performed.
