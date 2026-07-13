# Brassmere bounded planner contract

Create no more than three independently mergeable Brassmere tasks from verified repository and Brain evidence.

- Do not implement anything.
- Every task must use the task schema and cite exact Drive file IDs plus the current repository SHA.
- Tasks may not overlap allowed paths or collision magnets.
- Prefer completing approved, already-specified work over inventing new features.
- Exclude tasks already represented by open PRs, live leases, or matching idempotency keys.
- Assign one primary provider and a different reviewer according to `orchestration/policy.json`.
- Set strict cost and runtime budgets.
- New canon, balance changes, save/schema changes, workflows, permissions, releases, and destructive Drive changes must use `human_approval`.
- Output only a JSON array of valid task envelopes.
