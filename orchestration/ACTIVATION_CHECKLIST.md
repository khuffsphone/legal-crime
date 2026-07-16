# Brassmere Conductor activation checklist

- [ ] Default GitHub branch is `rts/isometric-conversion`.
- [ ] Windows `LegalCrimeSync` is disabled or retired.
- [ ] Bootstrap PR is merged after manual workflow review.
- [ ] `OPENAI_API_KEY` exists as a GitHub Actions secret.
- [ ] `ANTHROPIC_API_KEY` exists as a GitHub Actions secret or Claude uses approved workload identity.
- [ ] `GEMINI_API_KEY` exists as a GitHub Actions secret or Gemini uses approved workload identity.
- [ ] Provider billing ceilings and a $35/day initial combined budget are accepted.
- [ ] Drive Brain writer uses scoped OAuth or Shared Drive identity and can create/read completion receipts.
- [ ] Drive writer cannot modify GitHub source.
- [ ] Model workers cannot write Drive.
- [ ] Required branch checks include CI, merge guard, agent policy, and independent review.
- [ ] Protected-path rules are verified against a deliberate failing canary.
- [ ] Lease expiration and duplicate idempotency rejection are verified.
- [ ] Documentation-only canary produces an isolated branch, draft PR, green CI, independent review, event comment, and Drive receipt.
- [ ] `orchestration/policy.json` is changed to `enabled: true` only after the canary passes.
- [ ] Automatic merge remains disabled for the first five successful canaries.
- [ ] Playwright screenshots and deterministic UAT exist before gameplay/render/audio autonomy expands.
