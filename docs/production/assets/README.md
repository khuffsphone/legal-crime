# FP-01 Asset Production Records

This folder is the source of truth for generated-asset provenance and approval during **FP-01: The First Ten Minutes**. The format is provider-neutral: a provider, product, model, job, prompt or script, rights basis, files, runtime mapping, and approval decision are data rather than assumptions embedded in a filename.

## Files

| File | Purpose |
|---|---|
| `asset-manifest.schema.json` | JSON Schema Draft 2020-12 contract for manifests and asset records |
| `asset-manifest.template.json` | Empty, valid manifest to copy for a new production batch |
| `fp01-asset-manifest.json` | Four FP-01 generation briefs: Meshy AI model, ElevenLabs voice, Google `Flow Music` score (Lyria model), and Google `Flow` cinematic (Veo model) |

The four starter records are briefs, not generated assets and not approvals. Their provider job, exact model/version, rights evidence, files, and hashes deliberately remain null, empty, or unconfirmed until production occurs and the exact account tier and terms effective on the generation date are captured.

These four generation briefs are separate from the audio catalog's 16 repair blockers: nine missing physical clips and seven overlong event cues. Replacements for those blockers need their own production records; completing one of the four starter briefs does not clear the audio gate.

## Provider mapping

The schema does not hard-code vendor-specific fields. Put stable vendor data in the shared provider envelope and preserve API/UI-specific options in `provenance.provider.parameters`.

| Production lane | `provider.name` | Typical `provider.product` | Required receipt details |
|---|---|---|---|
| 3D generation, remesh, rigging | `Meshy AI` | Text/Image to 3D, Remesh, Rigging | exact model/version, job ID, seed/options, source image hash when used |
| Gameplay voice and sound design | `ElevenLabs` | Text to Speech, Sound Effects | exact model/version, voice ID for VO, generation ID, settings and seed when exposed |
| Adaptive score | `Google` | `Flow Music` | exact Lyria model/version, job ID, duration/options and stem relationship |
| Short transitions | `Google` | `Flow` | exact Veo model/version, job ID, input image/video hashes, duration and export settings |

Another provider or an original human-made asset uses the same envelope. Use the provider's real name; do not label a tool as one of the vendors above merely to fit the examples.

## Record lifecycle

1. **Brief** — assign `assetId` and `integration.inGameKey`; capture the exact prompt/script, direction, target technical data, intended trigger, and an unapproved rights basis.
2. **Generate** — record the exact provider product, model/version, job ID/URI, plan, generation time, parameters, references, and identity/IP disclosure.
3. **Candidate** — add every returned source file. A candidate or later record must contain at least one file with its media type, byte size, timestamp, and lowercase SHA-256.
4. **Edit/select** — retain source, intermediate, master, and preview files as separate entries. Derived assets cite parents in `provenance.sourceAssetIds`; never overwrite provenance with the last editor.
5. **Integrate** — add the repository-relative runtime path and a `runtime` file record. Integrated, review, and approved states require a runtime file.
6. **Review** — test creative, rights, technical, integration, and fun gates in context. A rights receipt or terms snapshot belongs in `rights.evidencePaths` and may also be hashed as a `rights-receipt` file.
7. **Approve** — set the lifecycle and approval states to `approved`, record the decision maker/time, pass or explicitly waive every gate, and confirm commercial use plus redistribution. The schema rejects an approval that omits these facts.

Rejection and supersession preserve the record and hashes. Do not delete failed generations that influenced a selected result; link the selected asset to any material parent/reference instead.

## File and temporal rules

- Hash the bytes actually received and every edited/runtime derivative separately with SHA-256. Do not hash a filename, URL, prompt, or transcoded substitute in place of the file.
- Use repository-relative paths for repository assets and durable receipt paths for external production evidence.
- `technical.temporal.durationSeconds` is the measured output duration; keep it `null` only before an output exists or for a truly non-temporal asset.
- `targetDurationSeconds` is a brief constraint, not a substitute for measured duration.
- Every record states loop intent. For a loop, fill exact `startSeconds`, `endSeconds`, and `crossfadeSeconds` after editing and verify repeated playback in game.
- Record audio targets and measured deliverable properties accurately. If the source and runtime formats differ, they are separate file entries.
- A provider job page is useful provenance but never replaces local file hashes and a durable rights receipt.

Example hash command:

```sh
sha256sum path/to/source path/to/runtime
```

Syntax-check all JSON records:

```sh
jq empty docs/production/assets/*.json
```

Use a JSON Schema Draft 2020-12 validator against both manifests before review. The `$schema` link is relative so repository tooling can resolve the contract without a network request.

Before copying the template, replace its manifest ID, owner, and both timestamps. Inclusion in this folder never implies generation, integration, rights clearance, or approval.

## Naming

- Production record IDs: `fp01.<kind-or-family>.<subject>.<variation>`
- Runtime keys: lowercase stable namespaces such as `voice.crew-lead.select.01`
- A variation gets its own record when it can be independently selected, rejected, integrated, or approved.
- A source model and each derived sprite/audio/video deliverable get separate records when their rights, hashes, technical contract, or review decision can differ.

Do not encode an approval state, provider model name, mutable version, or filesystem location into a stable in-game key.
