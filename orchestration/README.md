# Brassmere Conductor

Brassmere Conductor removes routine human prompt-copying by turning GitHub Issues, PRs, checks, and comments into the communication bus between GPT/Codex, Claude Code, Gemini CLI, GitHub, and the Google Drive Brain.

## Non-negotiable architecture

- GitHub owns mutable execution state: queued task envelopes, leases, branches, PRs, CI results, review decisions, and merge state.
- Google Drive owns durable knowledge: locked canon, approved specs, current recon, append-only dispatch/completion receipts, and generated digests.
- The Drive Brain is never used as the live queue or lease database.
- Models do not automate one another's consumer chat windows. Supported API, CLI, GitHub Action, and MCP surfaces perform unattended work.
- Gemini Spark is not a supported critical-path automation worker. Gemini CLI or Antigravity is the unattended Google worker; Spark may display summaries or accept manually initiated creative work.

This implements the existing canon ruling in `DECISION — HITL Cadence Policy PROMOTED TO CANON — 2026-07-04`: the review queue and lane registry belong in the repository, while Drive receives digests and reports.

## Runtime flow

1. An owner/member/collaborator opens a task issue containing the immutable `brassmere-task:v1` JSON envelope.
2. The hourly Conductor selects one unleased task and posts a 45-minute lease comment.
3. The deterministic router assigns one primary writer and a different reviewer.
4. The worker checks out the exact base commit, validates task scope, receives only cited Brain context, and works without repository credentials.
5. Deterministic steps validate changed paths and run typecheck, build, and tests.
6. A bot branch and draft PR are created after the model process exits.
7. A different provider performs read-only PR review. Gemini supplies an additional review/visual lane.
8. The task receives machine-readable event receipts. A separate Brain sync process copies completion receipts and digests to Drive.
9. Automatic merge remains off until branch protection, visual/UAT gates, secrets, and cost controls are verified.

## State model

`queued -> claimed -> running -> pr-open -> reviewing -> rework|mergeable -> merged -> brain-synced -> done`

Exceptional states are `blocked`, `retry-wait`, `dead-letter`, and `human-approval`.

Only the Conductor changes state or issues leases. Workers and reviewers only append receipts.

## Routing

| Task type | Primary | Independent reviewer |
|---|---|---|
| Design, research, VO, Brain reconciliation | GPT through Codex/OpenAI API | Claude |
| Architecture and code-grounded recon | Claude Code | Codex |
| Focused implementation, tests, refactors | Codex | Claude |
| Visual/UI/browser evaluation | Gemini CLI or Antigravity | Codex |
| Merge, receipt publishing, index generation | Deterministic workflow | No model |

Gemini is review-only under policy v1. Promote it to a writer only after its workflow permissions and visual regression outputs are proven.

## Safety defaults

- `policy.json` starts with `enabled: false` and automatic merge disabled.
- One active writer globally.
- Workers never receive a repository token while a model is running.
- Provider API keys remain GitHub Actions secrets.
- Every task has an immutable full base SHA, allowed and forbidden paths, acceptance criteria, provider budget, and idempotency key.
- Protected game source, workflows, dependencies, canon, assets, audio, save compatibility, and collision magnets require human review.
- Maximum two provider calls and one rework cycle per task.
- Untrusted Drive, issue, PR, and repository content is treated as data and cannot override the worker contract.

## Activation sequence

The bootstrap is intentionally fail-closed. Complete these one-time authority steps before setting `enabled` to `true`:

1. Change the GitHub default branch from stale `claude/legal-crime-remake-qeiy87` to `rts/isometric-conversion`. Scheduled and manually dispatched workflows are loaded from the default branch.
2. Retire or disable the Windows `LegalCrimeSync` scheduled task. It must not compete with the Conductor.
3. Add GitHub Actions secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY` (or configure provider workload identity).
4. Give the dedicated Brain writer access to the Brassmere Brain. Prefer a Shared Drive plus Workload Identity Federation; otherwise use scoped OAuth with the minimum Drive permissions.
5. Make CI, merge guard, agent policy, and independent review required checks on `rts/isometric-conversion`.
6. Merge this bootstrap PR, run one documentation-only canary task, and inspect the PR, tests, reviews, event receipt, and Drive receipt.
7. Set `enabled: true`. Keep automatic merge disabled for the first five successful canaries.
8. Add deterministic Playwright screenshot/UAT gates before allowing any source, rendering, audio, gameplay, or asset PR to merge without a person.

## Official implementation surfaces

- Codex GitHub Action: https://github.com/openai/codex-action
- Codex non-interactive automation: https://developers.openai.com/codex/noninteractive
- Claude Code GitHub Action: https://code.claude.com/docs/en/github-actions
- Gemini CLI GitHub Action: https://github.com/google-github-actions/run-gemini-cli
- Google Drive remote MCP: https://developers.google.com/workspace/drive/api/guides/configure-mcp-server
- GitHub scheduled workflow behavior: https://docs.github.com/actions/reference/workflows-and-actions/workflow-syntax

## What remains human

Routine prompting, context transfer, branch creation, testing, independent review, receipt logging, and queue monitoring become automatic. Human authority remains only for secrets/billing, new or changed canon, permissions, releases, destructive Drive operations, schema/save migrations, protected gameplay changes, failed-test waivers, and unresolved model disagreement.
