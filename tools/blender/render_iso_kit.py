# render_iso_kit.py — headless entry: render ONE static modular-kit piece to a single-view PNG +
# manifest at the TILE-CALIBRATED FIXED SCALE. OFFLINE TOOLING — not shipped to the browser.
#
#   blender -b -P tools/blender/render_iso_kit.py -- --job tools/blender/render_jobs/kit_storefront_low.json
#   (or, with the bpy pip module:)  python3 tools/blender/render_iso_kit.py -- --job <job>
#
# WHY A SEPARATE ENTRY (ruling: docs/env-kit/DECISION_KIT_RENDER_SCALE.md): the character entry
# (render_iso_unit.py) is uniform-cell 8-dir × frames with frame-to-fit bbox zoom — structurally wrong
# for static, single-view, variable-size kit pieces, and frame-to-fit DRIFTS the px-per-world-unit
# between pieces that must butt/stack. This entry reuses render_iso_common's camera/toon/Freestyle/
# lights unchanged (same 60/45 ortho lock as the shipped thug/cop renders) but:
#   • the scale is FIXED at the canon density PX_PER_BU = 64·√2 ≈ 90.5097 px per Blender unit
#     (1 BU = 1 tile edge). ortho_scale = canvas / PX_PER_BU — the invariant is the DENSITY, not
#     the 2.8284 number (which is this density at a 256 canvas).
#   • the canvas is sized per piece (smallest 4-px-snapped square that fits the projection + pad);
#   • output is ONE image (no dir rows, no frames) anchored (0.5, 1.0) — base on the bottom edge,
#     horizontally centred — plus a kit manifest carrying the density so mismatches are testable.
#
# Corrected vertical canon (facadeKit.ts, screen px): ground 132 / upper 116 / service 76; doors 68/76;
# bulkhead 20 / glass 56 / transom 20 / sign band 36; cornice 28/40; parapet 40/56. Vertical px→BU is
# px / (PX_PER_BU · sin 60°) = px / 78.3846. Frontage is authored in tiles: 1 tile = 1 BU along +X.
#
# Scars honoured: BLENDER_EEVEE (not _NEXT); ic.clear_scene() FIRST (stray startup Cube); RAW PNG
# (pngquant BANNED); split streams at the call site; log everything needed to eyeball from the .out.

import os
import sys
import json
import math

import bpy  # type: ignore

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import render_iso_common as ic  # noqa: E402

# ── canon constants (mirrors src/scenes/env/facadeKit.ts — screen px) ────────────────────────────
PX_PER_BU = 64.0 * math.sqrt(2.0)          # 90.5097 px per Blender unit (canvas/ortho invariant)
V_PX_PER_BU = PX_PER_BU * math.sin(math.radians(60.0))  # 78.3846 vertical screen px per BU of height
V_SNAP = 4

FLOOR_GROUND = 132
DOOR_COMMERCIAL = 76
STOREFRONT_BULKHEAD = 20
STOREFRONT_GLASS = 56
STOREFRONT_TRANSOM = 20
STOREFRONT_SIGN_BAND = FLOOR_GROUND - (STOREFRONT_BULKHEAD + STOREFRONT_GLASS + STOREFRONT_TRANSOM)  # 36

def v_bu(px):
    """Vertical screen px -> authored Blender units (the ruling's conversion)."""
    return px / V_PX_PER_BU


# ── scenery palette: warm noir neutrals ONLY (canon: scenery never carries brass/red/green) ───────
KIT_COLORS = {
    "brickField": "#6b5344",   # warm mortar stone
    "stoneTrim": "#9a8f80",    # cool fog stone
    "bulkhead": "#3a3027",     # dark wood kickplate
    "glass": "#47423b",        # slate glass — mid value so panes read against door/bulkhead ink
    "signHost": "#5b4a3a",     # darker host band so the board pops without brass
    "signBoard": "#8f8068",    # lit sepia board (a painted sign, never brass)
    "door": "#241f1a",         # near-ink heavy wood door
}


def _box(name, x0, x1, y0, y1, z0, z1, mat):
    """Axis-aligned box between two corners, with a toon material stamped with its base hex."""
    # NB: no bpy.ops.object.transform_apply here — it acts on ALL selected objects, so with several
    # boxes it re-bakes earlier meshes and explodes the assembly. Object-level scale flows through
    # matrix_world for both the render and the projection pre-pass, which is all we need.
    bpy.ops.object.select_all(action='DESELECT')
    # size=2.0 -> unit cube vertices at ±1, so a half-extent scale spans exactly (x0..x1) etc.
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    m = ic.make_toon_material("kit_" + name, mat, [0.28, 0.62, 0.88])
    ob.data.materials.append(m)
    return ob


def build_storefront_low(frontage_tiles):
    """PROOF PIECE — low-tier storefront ground floor (kit inventory #4): the NPS Brief-11 stack in the
    corrected px (bulkhead 20 / display glass 56 / transom 20 / fascia sign band 36 = FLOOR_GROUND 132),
    plus a commercial door (76 px) in the LEFT bay. Frontage runs along +X (1 tile = 1 BU); the front
    face is y=0 (outward normal −Y = the camera-lit wall). Returns the list of objects built."""
    W = float(frontage_tiles)          # BU along the frontage
    D = 0.18                           # wall slab thickness (BU) — thin relief slab, not a volume
    zB = v_bu(STOREFRONT_BULKHEAD)     # 0.2552 — bulkhead top
    zG = zB + v_bu(STOREFRONT_GLASS)   # 0.9696 — glass top
    zT = zG + v_bu(STOREFRONT_TRANSOM) # 1.2248 — transom top
    zS = zT + v_bu(STOREFRONT_SIGN_BAND)  # 1.6840 — sign-band top = FLOOR_GROUND
    objs = []

    # wall body (structure the details sit in/on)
    objs.append(_box("wall", 0, W, 0.0, D, 0.0, zS, KIT_COLORS["brickField"]))
    # bulkhead kickplate — protrudes toward the street
    objs.append(_box("bulkhead", 0.03, W - 0.03, -0.030, 0.0, 0.0, zB, KIT_COLORS["bulkhead"]))
    # display glass — recessed into the wall, one pane per bay with ink mullions
    for b in range(frontage_tiles):
        x0 = b * 1.0 + 0.10
        x1 = (b + 1) * 1.0 - 0.10
        objs.append(_box("glass_b%d" % b, x0, x1, -0.012, 0.0, zB + 0.02, zG - 0.02, KIT_COLORS["glass"]))
        objs.append(_box("sill_b%d" % b, x0 - 0.02, x1 + 0.02, -0.020, 0.0, zB, zB + 0.02, KIT_COLORS["stoneTrim"]))
    # transom band — shallow stone-trimmed strip of small panes
    objs.append(_box("transom", 0.06, W - 0.06, -0.015, 0.0, zG + 0.01, zT - 0.01, KIT_COLORS["glass"]))
    objs.append(_box("transomTrim", 0.03, W - 0.03, -0.018, 0.0, zT - 0.012, zT, KIT_COLORS["stoneTrim"]))
    # fascia sign band — the host band with an inset sepia sign board (28px board in the 36px host)
    objs.append(_box("signHost", 0.0, W, -0.022, 0.0, zT, zS, KIT_COLORS["signHost"]))
    board_in = (v_bu(STOREFRONT_SIGN_BAND) - v_bu(28)) / 2.0
    objs.append(_box("signBoard", 0.10, W - 0.10, -0.034, -0.022, zT + board_in, zS - board_in, KIT_COLORS["signBoard"]))
    # commercial entry door — LEFT bay, on the ground, punches through bulkhead+glass to 76 px
    door_w = 0.5
    dx0 = 0.5 - door_w / 2.0
    objs.append(_box("doorReveal", dx0 - 0.03, dx0 + door_w + 0.03, -0.024, 0.0, 0.0, v_bu(DOOR_COMMERCIAL) + 0.03, KIT_COLORS["stoneTrim"]))
    objs.append(_box("door", dx0, dx0 + door_w, -0.018, 0.0, 0.0, v_bu(DOOR_COMMERCIAL), KIT_COLORS["door"]))
    # end pilasters — pixel-stable tiling edges for butting the next piece
    for name, px0 in (("pilasterL", 0.0), ("pilasterR", W - 0.06)):
        objs.append(_box(name, px0, px0 + 0.06, -0.026, 0.0, 0.0, zS, KIT_COLORS["stoneTrim"]))
    bands_px = [
        {"role": "signHost", "hPx": STOREFRONT_SIGN_BAND},
        {"role": "transom", "hPx": STOREFRONT_TRANSOM},
        {"role": "glass", "hPx": STOREFRONT_GLASS},
        {"role": "bulkhead", "hPx": STOREFRONT_BULKHEAD},
    ]
    return objs, bands_px


BUILDERS = {
    "storefront_low": build_storefront_low,
}


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def get_opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def main():
    args = argv_after_dashes()
    job_path = get_opt(args, "--job")
    if not job_path:
        print("RENDER_FAIL: --job <path> required")
        sys.exit(2)
    with open(job_path) as fh:
        job = json.load(fh)

    piece_id = job["pieceId"]
    geom = job["geometry"]
    cam_cfg = job["camera"]
    shader_cfg = job.get("shader", {})
    light_cfg = job.get("light", {})
    out_cfg = job.get("output", {})
    pad = int(job.get("framing", {}).get("pad", 12))

    outdir = get_opt(args, "--outdir", job["outputDir"])
    outdir = os.path.abspath(os.path.join(_HERE, "..", "..", outdir)) if not os.path.isabs(outdir) else outdir
    os.makedirs(outdir, exist_ok=True)

    engine = get_opt(args, "--engine", out_cfg.get("renderEngine", "BLENDER_EEVEE"))
    scene = bpy.context.scene
    scene.render.engine = engine
    if engine == "BLENDER_EEVEE":
        scene.eevee.taa_render_samples = int(out_cfg.get("eeveeSamples", 24))
    ic.setup_world_transparent(scene)
    scene.render.image_settings.compression = int(out_cfg.get("pngCompression", 100))  # lossless RAW PNG — NO pngquant

    ic.clear_scene()  # the stray startup Cube must NEVER render into a kit sheet
    builder = BUILDERS.get(geom["builder"])
    if builder is None:
        raise SystemExit("RENDER_FAIL: unknown geometry builder %r (have %s)" % (geom["builder"], sorted(BUILDERS)))
    objs, bands_px = builder(int(geom.get("frontageTiles", 2)))
    print("GEOMETRY builder=%s objects=%d frontageTiles=%s" % (geom["builder"], len(objs), geom.get("frontageTiles", 2)))

    ic.setup_lights(scene, light_cfg.get("keyEnergy", 1200.0), light_cfg.get("fillEnergy", 500.0),
                    light_cfg.get("rimEnergy", 220.0))
    if shader_cfg.get("outlineEnabled", True) and "--no-freestyle" not in args:
        ic.setup_freestyle(scene, bpy.context.view_layer,
                           shader_cfg.get("outlineThicknessPx", 1.75), shader_cfg.get("outlineColorHex", "#1E1713"))

    cam = ic.make_camera()
    cam_x = ic.camera_x_deg(float(cam_cfg["tileW"]), float(cam_cfg["tileH"]), cam_cfg.get("cameraMode", "dimetric2to1"))
    cam_z = float(cam_cfg.get("cameraZDeg", 45))
    ic.orient_camera(cam, cam_x, cam_z)
    scene.camera = cam
    basis = ic.camera_basis(cam_x, cam_z)
    right, up, _fwd = basis

    # project every vertex on the camera right/up axes (static single view — no dirs, no frames)
    deps = bpy.context.evaluated_depsgraph_get()
    min_r = min_u = float("inf")
    max_r = max_u = float("-inf")
    for ob in objs:
        ev = ob.evaluated_get(deps)
        me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            r = w.dot(right)
            u = w.dot(up)
            min_r, max_r = min(min_r, r), max(max_r, r)
            min_u, max_u = min(min_u, u), max(max_u, u)
        ev.to_mesh_clear()
    proj_w_px = (max_r - min_r) * PX_PER_BU
    proj_h_px = (max_u - min_u) * PX_PER_BU

    # per-piece canvas: smallest 4-px-snapped square fitting the projection + pad; density stays canon.
    canvas = int(math.ceil((max(proj_w_px, proj_h_px) + 2 * pad) / 4.0) * 4)
    ortho = canvas / PX_PER_BU
    scene.render.resolution_x = canvas
    scene.render.resolution_y = canvas
    scene.render.resolution_percentage = 100
    got_ortho, pw, ph = ic.frame_camera(cam, basis, (min_r, max_r, min_u, max_u), canvas, canvas, pad,
                                        force_ortho_scale=ortho)
    print("FIXED-SCALE density=%.4f px/BU (canon 64*sqrt2=90.5097) canvas=%d ortho_scale=%.6f"
          % (canvas / got_ortho, canvas, got_ortho))
    print("PIECE %s projected %.1f x %.1f px (pad %d)" % (piece_id, proj_w_px, proj_h_px, pad))

    image_name = "kit_%s.png" % piece_id
    scene.render.filepath = os.path.join(outdir, image_name[:-4])
    bpy.ops.render.render(write_still=True)
    print("SHEET %s (single view, RAW PNG)" % os.path.join(outdir, image_name))

    # ── VERIFY-STACK: measure the rendered facade height in PIXELS at the left pilaster's column and
    # assert it hits the corrected canon (FLOOR_GROUND = 132 screen px for the ground-floor pieces).
    # This is the machine-checkable half of K's eyeball — the log carries the number.
    try:
        import numpy as np
        centre_r = (min_r + max_r) / 2.0
        img = bpy.data.images.load(os.path.join(outdir, image_name))
        arr = np.array(img.pixels[:], dtype=np.float32).reshape((canvas, canvas, 4))
        bpy.data.images.remove(img)
        alpha = np.flipud(arr[:, :, 3]) > 0.5  # top-down rows
        r_col = (0.03 * (right[0] + 0.0)) + (-0.013 * right[1])  # left pilaster centreline (x=0.03, y=-0.013)
        col = int(round(canvas / 2 + (r_col - centre_r) * PX_PER_BU))
        run = int(alpha[:, col].sum())
        expect = FLOOR_GROUND
        print("VERIFY-STACK column=%d alpha-run=%dpx expect~%dpx (FLOOR_GROUND; +1..3px top-face/outline slack)"
              % (col, run, expect))
        if not (expect - 2 <= run <= expect + 6):
            raise SystemExit("RENDER_FAIL: facade stack measured %dpx at the pilaster column; canon is %dpx "
                             "— the vertical px->BU conversion or geometry drifted" % (run, expect))
    except ImportError:
        print("VERIFY-STACK skipped (numpy unavailable)")

    # base edge in sprite px, relative to the (0.5, 1.0) anchor: where the piece's ground line runs —
    # the assembler needs this to seat the piece on its tile edge. Ground corners: (0,0,0) and (W,0,0).
    W = float(geom.get("frontageTiles", 2))
    centre_r = (min_r + max_r) / 2.0
    def base_px(x_bu):
        r = x_bu * right[0] + 0.0 * right[1]  # world (x,0,0)·right
        u = x_bu * up[0]
        return {"xPx": round((r - centre_r) * PX_PER_BU, 2), "yPx": round(-(u - min_u) * PX_PER_BU, 2)}
    manifest = {
        "pieceId": piece_id,
        "kind": "kit-piece",
        "tier": job.get("tier", "low"),
        "image": image_name,
        "generator": "tools/blender/render_iso_kit.py",
        "camera": {"mode": cam_cfg.get("cameraMode", "dimetric2to1"), "cameraXDeg": round(cam_x, 4),
                   "cameraZDeg": cam_z, "tileW": cam_cfg["tileW"], "tileH": cam_cfg["tileH"]},
        "anchor": {"anchorX": 0.5, "anchorY": 1.0},
        "pxPerBu": round(PX_PER_BU, 4),
        "vPxPerBu": round(V_PX_PER_BU, 4),
        "orthoScale": round(got_ortho, 6),
        "canvas": canvas,
        "spriteWPx": round(proj_w_px, 2),
        "spriteHPx": round(proj_h_px, 2),
        "frontageTiles": int(W),
        "vSnapPx": V_SNAP,
        "bayRunPx": 64,
        "bandsPx": bands_px,
        "baseEdgePx": {"left": base_px(0.0), "right": base_px(W)},
    }
    manifest_path = os.path.join(outdir, "kit_%s_manifest.json" % piece_id)
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("MANIFEST %s" % manifest_path)
    print("RENDER_OK piece=%s canvas=%d density=%.4f" % (piece_id, canvas, canvas / got_ortho))


if __name__ == "__main__":
    main()
