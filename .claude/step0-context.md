# Step 0 Context — Active Lane Registry

Human-maintained registry of in-flight work lanes. `tools/step0-check.ts` reads the
fenced JSON block below to detect when a new task's declared files collide with a lane
that is already owned by another agent or human. See `tools/step0-check.README.md` for
the CLI, the file format, and the collision-severity matrix.

Format: free-form markdown, plus exactly one fenced JSON block delimited by the
`DASHBOARD_STATE_JSON_BEGIN` / `DASHBOARD_STATE_JSON_END` markers (the dashboard v2
convention). The JSON is an object with an `activeLanes` array; each lane has an `id`
(or `owner`) and a `files` array of the paths/globs it is actively editing.

Example lane (delete once you add real ones):
```
{ "id": "rts-iso", "owner": "Code", "files": ["src/scenes/IsoScene.ts", "src/render/*.ts"] }
```

<!-- DASHBOARD_STATE_JSON_BEGIN -->
```json
{
  "activeLanes": []
}
```
<!-- DASHBOARD_STATE_JSON_END -->
