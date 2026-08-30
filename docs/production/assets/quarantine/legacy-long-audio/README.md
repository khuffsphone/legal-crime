# Quarantined legacy event audio

These seven files were removed from `public/audio` during FP-01 because they are continuous 29–145
second generated tracks, not synchronized event one-shots. Keeping them outside `public` prevents Vite
from shipping roughly 8 MB of unused media while preserving the source material in Git history.

`warning` was retired rather than replaced: it had no live runtime trigger and duplicated the distinct
NOTICE, WATCH, and RAID cues. The other six runtime keys now use deterministic short WAV candidates from
`scripts/generate-fp01-audio.ts`; future approved vendor masters can replace those exact WAV paths.
