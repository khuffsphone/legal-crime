/**
 * Octane Racer project canon, surfaced verbatim in MCP tool descriptions so the
 * agent driving Meshy never violates the asset pipeline's hard rules.
 */
export const CANON = {
  glbOnly:
    "GLB ONLY — never request FBX/OBJ/USDZ. Octane Racer ships GLB exclusively; every create call forces target_formats=[\"glb\"].",
  rawOutput:
    "RAW OUTPUT — do NOT recompress textures. pngquant is BANNED in this project. Assets are pulled and stored byte-for-byte as Meshy returns them.",
  orthoDownstream:
    "ISOMETRIC PIPELINE IS DOWNSTREAM — the fixedOrthoScale 2.8284 / camera yaw 60° pitch 45° projection is applied later in Blender, NOT at Meshy. Do not attempt to set camera or scale here; generate a clean, upright, centered model.",
} as const;

/** Multi-line canon block prepended to generation/download tool descriptions. */
export const CANON_PREAMBLE = [
  "── OCTANE RACER PROJECT CANON (enforced) ──",
  `• ${CANON.glbOnly}`,
  `• ${CANON.rawOutput}`,
  `• ${CANON.orthoDownstream}`,
  "───────────────────────────────────────────",
].join("\n");
