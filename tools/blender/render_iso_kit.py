# render_iso_kit.py — headless entry: render static modular-kit pieces to single-view PNGs + manifests
# at the TILE-CALIBRATED FIXED SCALE. OFFLINE TOOLING — not shipped to the browser.
#
#   blender -b -P tools/blender/render_iso_kit.py -- --job tools/blender/render_jobs/kit_batch_phase1.json
#   (or, with the bpy pip module:)  python3 tools/blender/render_iso_kit.py -- --job <job>
#
# A job renders ONE piece (top-level "pieceId" + "geometry") or a BATCH ("pieces": [...]) sharing the
# camera/shader/light/output blocks. Every piece emits kit_<pieceId>.png + kit_<pieceId>_manifest.json.
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
# In-container scars found here: transform_apply acts on ALL selected objects (never use it in a
# multi-object build); primitive_cube_add(size=1) makes ±0.5 vertices (we use size=2 for ±1).

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
FLOOR_UPPER = 116
DOOR_RESIDENTIAL = 68
DOOR_COMMERCIAL = 76
STOREFRONT_BULKHEAD = 20
STOREFRONT_GLASS = 56
STOREFRONT_TRANSOM = 20
CORNICE_DEFAULT = 28
CORNICE_LARGE = 40
PARAPET_DEFAULT = 40
PARAPET_TALL = 56
STOREFRONT_SIGN_BAND = FLOOR_GROUND - (STOREFRONT_BULKHEAD + STOREFRONT_GLASS + STOREFRONT_TRANSOM)  # 36

def v_bu(px):
    """Vertical screen px -> authored Blender units (the ruling's conversion)."""
    return px / V_PX_PER_BU


def h_bu(px):
    """Horizontal screen px along a frontage -> BU along the wall axis (1 tile = 64 screen px = 1 BU)."""
    return px / 64.0


# ── scenery palette: warm noir neutrals ONLY (canon: scenery never carries brass/red/green) ───────
KIT_COLORS = {
    "brickField": "#6b5344",   # warm mortar stone
    "brickDark": "#4a3d33",    # alley/service brick
    "limestone": "#847a6a",    # pale limestone/terra-cotta body
    "warehouseBrick": "#5d4a3d",
    "stoneTrim": "#9a8f80",    # cool fog stone
    "bulkhead": "#3a3027",     # dark wood kickplate
    "glass": "#47423b",        # slate glass — mid value so panes read against door/bulkhead ink
    "glassDim": "#332d26",     # unlit/service glass
    "signHost": "#5b4a3a",     # darker host band so the board pops without brass
    "signBoard": "#8f8068",    # lit sepia board (a painted sign, never brass)
    "door": "#241f1a",         # near-ink heavy wood door
    "plank": "#57493a",        # weathered boarding
    "ironwork": "#221e19",     # fire escape / bars / brackets
    "metal": "#3d3a35",        # shutters, lintels
    "canvasAwning": "#5c5346", # weathered canvas
    "tankWood": "#5a4a38",     # rooftop water-tank staves
    "chimney": "#54423a",
    "sandbag": "#6e6353",
}


def _mat(ob, name, hex_color):
    m = ic.make_toon_material("kit_" + name, hex_color, [0.28, 0.62, 0.88])
    ob.data.materials.append(m)
    return ob


def _box(name, x0, x1, y0, y1, z0, z1, mat, rot=None):
    """Axis-aligned box spanning the two corners (optionally rotated about its own centre afterwards),
    with a toon material stamped from its base hex."""
    # NB: no bpy.ops.object.transform_apply here — it acts on ALL selected objects, so with several
    # boxes it re-bakes earlier meshes and explodes the assembly. Object-level transforms flow through
    # matrix_world for both the render and the projection pre-pass, which is all we need.
    if _YAW90:  # (x,y) -> (-y,x): the wall runs along +Y and presents the dark screen-left face (+X)
        x0, x1, y0, y1 = -y1, -y0, x0, x1
    bpy.ops.object.select_all(action='DESELECT')
    # size=2.0 -> unit cube vertices at ±1, so a half-extent scale spans exactly (x0..x1) etc.
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    if rot:
        ob.rotation_euler = rot
    return _mat(ob, name, mat)


def _cyl(name, cx, cy, z0, z1, radius, mat, vertices=24):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(z1 - z0),
                                        location=(cx, cy, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    return _mat(ob, name, mat)


def _cone(name, cx, cy, z0, z1, radius, mat, vertices=24):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0.02, depth=(z1 - z0),
                                    location=(cx, cy, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    return _mat(ob, name, mat)


D = 0.18  # standard wall-slab thickness (BU) — thin relief slab, not a volume

# +90° plan yaw for corner-return pieces, applied AT CONSTRUCTION ((x,y) -> (-y,x)) instead of via a
# rotated parent pivot: exact, and the projection pre-pass needs no depsgraph subtleties.
_YAW90 = False


# ── builders ──────────────────────────────────────────────────────────────────────────────────────
# Every builder takes the job's geometry dict and returns (objects, bandsPx, extras). extras may carry
# {"verify": {"xBu","yBu","expectPx"}} (a solid full-height column the pixel check can measure) and any
# additional manifest fields.

def build_storefront_low(geom):
    """Storefront ground floor (research #4/#5/#6 + the facadeKit 'bar' role): the NPS Brief-11 stack in
    the corrected px (bulkhead 20 / display glass 56 / transom 20 / fascia sign band 36 = FLOOR_GROUND
    132). variant: glass (proof piece, K-approved geometry — unchanged) | recessed | speakeasy | bar.
    Frontage runs along +X (1 tile = 1 BU); the front face is y=0 (outward normal −Y, camera-lit)."""
    frontage_tiles = int(geom.get("frontageTiles", 2))
    variant = geom.get("variant", "glass")
    W = float(frontage_tiles)
    zB = v_bu(STOREFRONT_BULKHEAD)
    zG = zB + v_bu(STOREFRONT_GLASS)
    zT = zG + v_bu(STOREFRONT_TRANSOM)
    zS = zT + v_bu(STOREFRONT_SIGN_BAND)
    objs = []

    objs.append(_box("wall", 0, W, 0.0, D, 0.0, zS, KIT_COLORS["brickField"]))
    objs.append(_box("bulkhead", 0.03, W - 0.03, -0.030, 0.0, 0.0, zB, KIT_COLORS["bulkhead"]))

    if variant == "glass":
        for b in range(frontage_tiles):
            x0, x1 = b * 1.0 + 0.10, (b + 1) * 1.0 - 0.10
            objs.append(_box("glass_b%d" % b, x0, x1, -0.012, 0.0, zB + 0.02, zG - 0.02, KIT_COLORS["glass"]))
            objs.append(_box("sill_b%d" % b, x0 - 0.02, x1 + 0.02, -0.020, 0.0, zB, zB + 0.02, KIT_COLORS["stoneTrim"]))
    elif variant == "recessed":
        # anchor-shop entry: the CENTRE bay recesses to a deep-set door; flanking bays keep display glass
        for b in range(frontage_tiles):
            x0, x1 = b * 1.0 + 0.10, (b + 1) * 1.0 - 0.10
            objs.append(_box("glass_b%d" % b, x0, x1, -0.012, 0.0, zB + 0.02, zG - 0.02, KIT_COLORS["glass"]))
            objs.append(_box("sill_b%d" % b, x0 - 0.02, x1 + 0.02, -0.020, 0.0, zB, zB + 0.02, KIT_COLORS["stoneTrim"]))
        rx = W / 2.0
        objs.append(_box("recessShadow", rx - 0.34, rx + 0.34, 0.0, 0.16, 0.0, zG, KIT_COLORS["ironwork"]))
        objs.append(_box("recessDoor", rx - 0.24, rx + 0.24, 0.10, 0.16, 0.0, v_bu(DOOR_COMMERCIAL), KIT_COLORS["door"]))
        objs.append(_box("recessJambL", rx - 0.40, rx - 0.34, -0.018, 0.0, 0.0, zG, KIT_COLORS["stoneTrim"]))
        objs.append(_box("recessJambR", rx + 0.34, rx + 0.40, -0.018, 0.0, 0.0, zG, KIT_COLORS["stoneTrim"]))
    elif variant == "speakeasy":
        # the fiction hook: boarded/soaped panes, one blank heavy door with a peephole slot, no display
        for b in range(frontage_tiles):
            x0, x1 = b * 1.0 + 0.10, (b + 1) * 1.0 - 0.10
            objs.append(_box("soaped_b%d" % b, x0, x1, -0.010, 0.0, zB + 0.02, zG - 0.02, KIT_COLORS["glassDim"]))
            objs.append(_box("board_b%d" % b, x0 + 0.05, x1 - 0.05, -0.016, -0.010, zB + 0.30, zB + 0.42, KIT_COLORS["plank"]))
    elif variant == "bar":
        # opaque/bar front (facadeKit 'storefrontBar'): panelled lower, small high clerestory panes
        objs.append(_box("barPanel", 0.08, W - 0.08, -0.016, 0.0, zB, zG - v_bu(16), KIT_COLORS["bulkhead"]))
        for b in range(frontage_tiles):
            x0, x1 = b * 1.0 + 0.16, (b + 1) * 1.0 - 0.16
            objs.append(_box("clerestory_b%d" % b, x0, x1, -0.012, 0.0, zG - v_bu(14), zG - 0.01, KIT_COLORS["glassDim"]))
    else:
        raise SystemExit("RENDER_FAIL: unknown storefront variant %r" % variant)

    objs.append(_box("transom", 0.06, W - 0.06, -0.015, 0.0, zG + 0.01, zT - 0.01,
                     KIT_COLORS["glassDim" if variant == "speakeasy" else "glass"]))
    objs.append(_box("transomTrim", 0.03, W - 0.03, -0.018, 0.0, zT - 0.012, zT, KIT_COLORS["stoneTrim"]))
    objs.append(_box("signHost", 0.0, W, -0.022, 0.0, zT, zS, KIT_COLORS["signHost"]))
    if variant != "speakeasy":  # a speakeasy advertises nothing
        board_in = (v_bu(STOREFRONT_SIGN_BAND) - v_bu(28)) / 2.0
        objs.append(_box("signBoard", 0.10, W - 0.10, -0.034, -0.022, zT + board_in, zS - board_in, KIT_COLORS["signBoard"]))
    if variant in ("glass", "speakeasy", "bar"):
        door_w = 0.5
        dx0 = 0.5 - door_w / 2.0
        objs.append(_box("doorReveal", dx0 - 0.03, dx0 + door_w + 0.03, -0.024, 0.0, 0.0, v_bu(DOOR_COMMERCIAL) + 0.03, KIT_COLORS["stoneTrim"]))
        objs.append(_box("door", dx0, dx0 + door_w, -0.018, 0.0, 0.0, v_bu(DOOR_COMMERCIAL), KIT_COLORS["door"]))
        if variant == "speakeasy":
            objs.append(_box("peephole", dx0 + door_w / 2 - 0.05, dx0 + door_w / 2 + 0.05, -0.022, -0.018,
                             v_bu(52), v_bu(58), KIT_COLORS["metal"]))
    for name, px0 in (("pilasterL", 0.0), ("pilasterR", W - 0.06)):
        objs.append(_box(name, px0, px0 + 0.06, -0.026, 0.0, 0.0, zS, KIT_COLORS["stoneTrim"]))
    bands = [
        {"role": "signHost", "hPx": STOREFRONT_SIGN_BAND},
        {"role": "transom", "hPx": STOREFRONT_TRANSOM},
        {"role": "glass", "hPx": STOREFRONT_GLASS},
        {"role": "bulkhead", "hPx": STOREFRONT_BULKHEAD},
    ]
    return objs, bands, {"verify": {"xBu": 0.03, "yBu": -0.013, "expectPx": FLOOR_GROUND}}


def build_facade_body(geom):
    """One UPPER-floor wall band (research #1/#2/#3/#15/#18/#24) — FLOOR_UPPER 116 px tall, stackable by
    whole floors. material: brickField | limestone | warehouseBrick | brickDark. Flags: pilasters (body B),
    banded (warehouse), blank+downpipe (alley/service), yawDeg 90 (corner return — the dark left wall)."""
    global _YAW90
    W = float(geom.get("frontageTiles", 2))
    material = geom.get("material", "brickField")
    _YAW90 = bool(geom.get("yawDeg"))
    H = v_bu(FLOOR_UPPER)
    objs = [_box("wall", 0, W, 0.0, D, 0.0, H, KIT_COLORS[material])]
    # string course at the top edge — the stacking seam reads as a deliberate line
    objs.append(_box("course", 0.0, W, -0.014, 0.0, H - v_bu(4), H, KIT_COLORS["stoneTrim"]))
    if geom.get("pilasters"):
        for i, px0 in enumerate((0.0, W / 2 - 0.03, W - 0.06)):
            objs.append(_box("pilaster%d" % i, px0, px0 + 0.06, -0.030, 0.0, 0.0, H, KIT_COLORS[material]))
    if material == "limestone":
        objs.append(_box("course2", 0.0, W, -0.014, 0.0, v_bu(8), v_bu(12), KIT_COLORS["stoneTrim"]))
    if geom.get("banded"):  # warehouse: recessed spandrels + a high clerestory strip
        objs.append(_box("spandrel", 0.10, W - 0.10, -0.008, 0.0, v_bu(20), v_bu(36), KIT_COLORS["brickDark"]))
        objs.append(_box("clerestory", 0.14, W - 0.14, -0.010, 0.0, H - v_bu(36), H - v_bu(12), KIT_COLORS["glassDim"]))
    if geom.get("downpipe"):
        objs.append(_box("downpipe", W - 0.28, W - 0.22, -0.040, -0.010, 0.0, H, KIT_COLORS["ironwork"]))
        objs.append(_box("shoe", W - 0.30, W - 0.20, -0.050, -0.010, 0.0, v_bu(6), KIT_COLORS["ironwork"]))
    if not geom.get("blank") and not geom.get("banded"):
        # faint window HEADS only (the window modules carry the real openings; heads keep a bare body wall
        # from reading as a bunker when used un-composited)
        for b in range(int(W)):
            x0 = b + 0.5 - h_bu(10)
            objs.append(_box("head_b%d" % b, x0, x0 + h_bu(20), -0.006, 0.0, H - v_bu(28), H - v_bu(24), KIT_COLORS["stoneTrim"]))
    _YAW90 = False
    return objs, [{"role": "brickUpper", "hPx": FLOOR_UPPER}], {
        "verify": {"xBu": 0.02, "yBu": -0.007, "expectPx": FLOOR_UPPER} if not geom.get("yawDeg") else None}


def build_window_module(geom):
    """Upper window module (research #7/#8) — ONE bay (1 tile) × FLOOR_UPPER, tiles horizontally.
    kind: single (one 20×40 double-hung) | paired (two, shared sill)."""
    kind = geom.get("kind", "single")
    H = v_bu(FLOOR_UPPER)
    objs = [_box("wall", 0, 1.0, 0.0, D, 0.0, H, KIT_COLORS["brickField"])]
    win_w, win_h = h_bu(20), v_bu(40)
    z0 = (H - win_h) / 2.0
    xs = [0.5 - win_w / 2] if kind == "single" else [0.25 - win_w / 2, 0.75 - win_w / 2]
    sill_x0 = min(xs) - 0.03
    sill_x1 = max(xs) + win_w + 0.03
    objs.append(_box("sill", sill_x0, sill_x1, -0.020, 0.0, z0 - v_bu(4), z0, KIT_COLORS["stoneTrim"]))
    objs.append(_box("lintel", sill_x0, sill_x1, -0.014, 0.0, z0 + win_h, z0 + win_h + v_bu(4), KIT_COLORS["stoneTrim"]))
    for i, x in enumerate(xs):
        objs.append(_box("glass%d" % i, x, x + win_w, -0.010, 0.0, z0, z0 + win_h, KIT_COLORS["glass"]))
        objs.append(_box("meeting%d" % i, x, x + win_w, -0.012, -0.010, z0 + win_h / 2 - 0.008, z0 + win_h / 2 + 0.008, KIT_COLORS["ironwork"]))
    return objs, [{"role": "brickUpper", "hPx": FLOOR_UPPER}], {
        "verify": {"xBu": 0.02, "yBu": -0.001, "expectPx": FLOOR_UPPER}}


def build_door_module(geom):
    """Entry door modules (research #9 + the facadeKit door roles), ONE bay wide, ground-standing.
    kind: commercial76 | residential68 | stairResidential (68 door + 20 transom — the taxpayer-block
    stairwell)."""
    kind = geom.get("kind", "commercial76")
    door_px = DOOR_COMMERCIAL if kind == "commercial76" else DOOR_RESIDENTIAL
    door_h = v_bu(door_px)
    transom = kind == "stairResidential"
    total = door_h + (v_bu(STOREFRONT_TRANSOM) if transom else 0.0) + v_bu(8)
    objs = [_box("wall", 0, 1.0, 0.0, D, 0.0, total, KIT_COLORS["brickField"])]
    dw = 0.5 if kind == "commercial76" else 0.45
    dx0 = 0.5 - dw / 2
    objs.append(_box("reveal", dx0 - 0.04, dx0 + dw + 0.04, -0.022, 0.0, 0.0, total - v_bu(2), KIT_COLORS["stoneTrim"]))
    objs.append(_box("door", dx0, dx0 + dw, -0.016, 0.0, 0.0, door_h, KIT_COLORS["door"]))
    if transom:
        objs.append(_box("transom", dx0, dx0 + dw, -0.014, 0.0, door_h + v_bu(2), door_h + v_bu(STOREFRONT_TRANSOM), KIT_COLORS["glass"]))
    if kind != "commercial76":
        objs.append(_box("stoop", dx0 - 0.08, dx0 + dw + 0.08, -0.060, 0.0, 0.0, v_bu(6), KIT_COLORS["stoneTrim"]))
    bands = [{"role": "doorCommercial" if kind == "commercial76" else "doorResidential", "hPx": door_px}]
    if transom:
        bands.insert(0, {"role": "transom", "hPx": STOREFRONT_TRANSOM})
    return objs, bands, {}


def build_cap(geom):
    """Roofline caps (research #10/#11 + facadeKit parapet roles), full frontage width.
    kind: cornice28 | corniceDeco40 | parapet40 | parapetTall56. Baseline = the cap's bottom edge."""
    kind = geom.get("kind", "parapet40")
    W = float(geom.get("frontageTiles", 2))
    px = {"cornice28": CORNICE_DEFAULT, "corniceDeco40": CORNICE_LARGE,
          "parapet40": PARAPET_DEFAULT, "parapetTall56": PARAPET_TALL}[kind]
    H = v_bu(px)
    objs = []
    if kind == "cornice28":
        objs.append(_box("fascia", 0, W, -0.010, D, 0.0, H - v_bu(8), KIT_COLORS["stoneTrim"]))
        objs.append(_box("lip", -0.02, W + 0.02, -0.050, D, H - v_bu(8), H, KIT_COLORS["stoneTrim"]))
    elif kind == "corniceDeco40":
        objs.append(_box("fascia", 0, W, -0.010, D, 0.0, H - v_bu(12), KIT_COLORS["limestone"]))
        objs.append(_box("step1", -0.01, W + 0.01, -0.034, D, H - v_bu(12), H - v_bu(6), KIT_COLORS["stoneTrim"]))
        objs.append(_box("step2", -0.02, W + 0.02, -0.052, D, H - v_bu(6), H, KIT_COLORS["stoneTrim"]))
        for i in range(int(W * 2)):  # deco dentils
            x0 = 0.14 + i * 0.5
            objs.append(_box("dentil%d" % i, x0, x0 + 0.10, -0.026, -0.010, v_bu(6), v_bu(14), KIT_COLORS["stoneTrim"]))
    else:  # parapets — a wall band with a coping lip; the tall one gets a recessed centre panel
        objs.append(_box("band", 0, W, 0.0, D, 0.0, H - v_bu(6), KIT_COLORS["brickField"]))
        objs.append(_box("coping", -0.02, W + 0.02, -0.030, D, H - v_bu(6), H, KIT_COLORS["stoneTrim"]))
        if kind == "parapetTall56":
            objs.append(_box("panel", 0.35, W - 0.35, -0.008, 0.0, v_bu(12), H - v_bu(18), KIT_COLORS["brickDark"]))
    # caps carry a deeper-projecting lip/coping whose TOP FACE adds ~2px of projection at the verify
    # column on top of the outline — widen the slack so legitimate iso reading isn't gated as drift.
    return objs, [{"role": "parapet" if "parapet" in kind else "cornice", "hPx": px}], {
        "verify": {"xBu": 0.05, "yBu": -0.001, "expectPx": px, "slackPx": 8}}


def build_sign(geom):
    """Signage overlays (research #12/#13). painted: flat wall board ~96×48 px. blade: projecting
    perpendicular panel ~48×64 px on an iron bracket (night neon is a Phase-2 glow pass — base reads
    as a dark blade with a bone letter band; no brass)."""
    kind = geom.get("kind", "painted")
    if kind == "painted":
        Wb, Hb = h_bu(96), v_bu(48)
        objs = [
            _box("frame", 0, Wb, -0.012, 0.0, 0.0, Hb, KIT_COLORS["signHost"]),
            _box("board", 0.04, Wb - 0.04, -0.020, -0.012, v_bu(4), Hb - v_bu(4), KIT_COLORS["signBoard"]),
            _box("letterBand", 0.10, Wb - 0.10, -0.024, -0.020, Hb / 2 - v_bu(8), Hb / 2 + v_bu(8), KIT_COLORS["signHost"]),
        ]
        return objs, [{"role": "fasciaSign", "hPx": 48}], {"overlay": True}
    # blade: panel plane perpendicular to the wall (extends −Y from a bracket at x≈0)
    Hb, out = v_bu(64), h_bu(48) / math.sqrt(2.0)  # 48 screen px of projection along the depth diagonal
    objs = [
        _box("bracket", 0.0, 0.05, -0.10, 0.0, Hb - v_bu(6), Hb, KIT_COLORS["ironwork"]),
        _box("panel", 0.02, 0.06, -0.10 - out, -0.10, 0.0, Hb, KIT_COLORS["signHost"]),
        _box("letters", 0.015, 0.02, -0.10 - out + 0.06, -0.16, v_bu(8), Hb - v_bu(8), KIT_COLORS["signBoard"]),
    ]
    return objs, [{"role": "fasciaSign", "hPx": 64}], {"overlay": True}


def build_awning(geom):
    """Awning/canopy (research #14) — sloped weathered canvas over a storefront glass zone, projecting
    ≤ 24 screen px so it never crosses the lot line; valance strip at the outer edge."""
    W = float(geom.get("frontageTiles", 2))
    top = v_bu(STOREFRONT_BULKHEAD + STOREFRONT_GLASS + STOREFRONT_TRANSOM)  # mounts at the transom top
    out = 0.24
    drop = v_bu(16)
    slope = math.atan2(drop, out)
    length = math.hypot(out, drop)
    objs = []
    sl = _box("slope", 0.02, W - 0.02, -length / 2, length / 2, top - 0.012, top + 0.012, KIT_COLORS["canvasAwning"])
    sl.location = (W / 2, -out / 2, top - drop / 2)
    sl.rotation_euler = (slope, 0.0, 0.0)
    objs.append(sl)
    objs.append(_box("valance", 0.02, W - 0.02, -out - 0.012, -out + 0.012, top - drop - v_bu(10), top - drop, KIT_COLORS["canvasAwning"]))
    for i in range(int(W) + 1):  # support arms
        x = 0.04 + i * ((W - 0.10) / max(1, int(W)))
        objs.append(_box("arm%d" % i, x, x + 0.03, -out, 0.0, top - drop - 0.01, top - drop + 0.01, KIT_COLORS["ironwork"]))
    return objs, [], {"overlay": True, "mountsAtPx": STOREFRONT_BULKHEAD + STOREFRONT_GLASS + STOREFRONT_TRANSOM}


def build_loading_door(geom):
    """Service loading door (research #16) — 1 tile, ~96 px: plank leaves under a steel lintel, ramp sill."""
    H = v_bu(96)
    objs = [_box("wall", 0, 1.0, 0.0, D, 0.0, H, KIT_COLORS["warehouseBrick"])]
    objs.append(_box("lintel", 0.06, 0.94, -0.024, 0.0, H - v_bu(12), H - v_bu(4), KIT_COLORS["metal"]))
    for i in range(4):  # vertical plank leaves
        x0 = 0.12 + i * 0.19
        objs.append(_box("plank%d" % i, x0, x0 + 0.17, -0.014, 0.0, v_bu(6), H - v_bu(12), KIT_COLORS["plank"]))
    objs.append(_box("ramp", 0.06, 0.94, -0.070, 0.0, 0.0, v_bu(6), KIT_COLORS["stoneTrim"]))
    return objs, [{"role": "serviceDoor", "hPx": 96}], {}


def build_fire_escape(geom):
    """Fire escape (research #17) — ~48 px wide × 128 px tall iron silhouette: stringers, mid platform,
    angled ladder, railing. An overlay that composites against any body wall."""
    Wf, H = h_bu(48), v_bu(128)
    plat_z = H * 0.52
    objs = []
    for name, x in (("stringerL", 0.0), ("stringerR", Wf - 0.03)):
        objs.append(_box(name, x, x + 0.03, -0.20, -0.17, 0.0, H, KIT_COLORS["ironwork"]))
    objs.append(_box("platform", -0.02, Wf + 0.02, -0.22, 0.0, plat_z, plat_z + 0.02, KIT_COLORS["ironwork"]))
    objs.append(_box("railTop", -0.02, Wf + 0.02, -0.22, -0.19, plat_z + v_bu(20), plat_z + v_bu(24), KIT_COLORS["ironwork"]))
    for i in range(3):
        x = 0.04 + i * (Wf - 0.10) / 2
        objs.append(_box("baluster%d" % i, x, x + 0.02, -0.21, -0.19, plat_z, plat_z + v_bu(22), KIT_COLORS["ironwork"]))
    ladder = _box("ladder", 0, 0.05, -0.02, 0.02, 0, math.hypot(plat_z, 0.16), KIT_COLORS["ironwork"])
    ladder.location = (Wf / 2, -0.10, plat_z / 2)
    ladder.rotation_euler = (math.radians(18), 0.0, 0.0)
    objs.append(ladder)
    return objs, [], {"overlay": True}


def build_roof_clutter(geom):
    """Rooftop clutter (research #19) — 1×1 tile: wood-stave water tank on legs with a conical cap +
    a brick chimney. Iso rooftops are highly visible; this is the skyline-life piece."""
    objs = []
    tank_r, leg_h = 0.26, v_bu(10)
    tank_h = v_bu(34)
    cx, cy = 0.42, 0.42
    for i, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        objs.append(_box("leg%d" % i, cx + dx * tank_r * 0.6 - 0.02, cx + dx * tank_r * 0.6 + 0.02,
                         cy + dy * tank_r * 0.6 - 0.02, cy + dy * tank_r * 0.6 + 0.02, 0.0, leg_h, KIT_COLORS["ironwork"]))
    objs.append(_cyl("tank", cx, cy, leg_h, leg_h + tank_h, tank_r, KIT_COLORS["tankWood"]))
    objs.append(_box("hoopBand", cx - tank_r - 0.01, cx + tank_r + 0.01, cy - tank_r - 0.01, cy + tank_r + 0.01,
                     leg_h + tank_h * 0.45, leg_h + tank_h * 0.5, KIT_COLORS["ironwork"]))
    objs.append(_cone("cap", cx, cy, leg_h + tank_h, leg_h + tank_h + v_bu(14), tank_r + 0.03, KIT_COLORS["metal"]))
    objs.append(_box("chimney", 0.78, 0.95, 0.70, 0.87, 0.0, v_bu(32), KIT_COLORS["chimney"]))
    objs.append(_box("chimneyCap", 0.76, 0.97, 0.68, 0.89, v_bu(32), v_bu(36), KIT_COLORS["stoneTrim"]))
    return objs, [], {}


def build_overlay(geom):
    """Growth-state overlays (research #20/#21/#22) — thin relief panels sized to the ground-floor
    storefront zone (2 tiles × 132 px), composited anchor-aligned over a body. kind: damage (boarded/
    soaped rundown) | wealth (established: richer trim + lit transom + valance — sepia, never brass) |
    fortified (barred glass, steel-shuttered door, sandbag row)."""
    kind = geom["kind"]
    W = float(geom.get("frontageTiles", 2))
    zB = v_bu(STOREFRONT_BULKHEAD)
    zG = zB + v_bu(STOREFRONT_GLASS)
    zT = zG + v_bu(STOREFRONT_TRANSOM)
    zS = zT + v_bu(STOREFRONT_SIGN_BAND)
    objs = []
    if kind == "damage":
        for b in range(int(W)):
            x0, x1 = b + 0.12, b + 0.88
            for j, (za, zb) in enumerate(((zB + 0.04, zG - 0.10), (zG - 0.34, zB + 0.24))):
                ang = math.atan2(zb - za, x1 - x0)
                ln = math.hypot(x1 - x0, zb - za)
                pl = _box("xplank%d_%d" % (b, j), -ln / 2, ln / 2, -0.020, -0.008, -0.035, 0.035, KIT_COLORS["plank"])
                pl.location = ((x0 + x1) / 2, -0.014, (za + zb) / 2)
                pl.rotation_euler = (0.0, -ang, 0.0)
                objs.append(pl)
        objs.append(_box("soaped", 0.10, W - 0.10, -0.006, 0.0, zB + 0.02, zG - 0.02, KIT_COLORS["glassDim"]))
        objs.append(_box("peel", W - 0.55, W - 0.15, -0.008, 0.0, zT + 0.05, zS - 0.03, KIT_COLORS["brickDark"]))
    elif kind == "wealth":
        objs.append(_box("litTransom", 0.08, W - 0.08, -0.010, 0.0, zG + 0.015, zT - 0.015, KIT_COLORS["signBoard"]))
        objs.append(_box("trimCourse", 0.0, W, -0.020, 0.0, zS - v_bu(4), zS, KIT_COLORS["stoneTrim"]))
        objs.append(_box("valance", 0.06, W - 0.06, -0.060, -0.045, zG - v_bu(8), zG, KIT_COLORS["canvasAwning"]))
        for b in range(int(W)):
            x0 = b + 0.5 - 0.02
            objs.append(_box("finial%d" % b, x0, x0 + 0.04, -0.026, -0.012, zS - v_bu(10), zS - v_bu(2), KIT_COLORS["stoneTrim"]))
    elif kind == "fortified":
        for b in range(int(W)):
            for i in range(5):  # window bars over each pane
                x = b + 0.14 + i * 0.15
                objs.append(_box("bar%d_%d" % (b, i), x, x + 0.025, -0.020, -0.008, zB + 0.02, zG - 0.02, KIT_COLORS["ironwork"]))
        objs.append(_box("shutter", 0.22, 0.78, -0.024, -0.010, 0.0, v_bu(DOOR_COMMERCIAL), KIT_COLORS["metal"]))
        for i in range(4):  # sandbag row at the base
            x0 = 0.9 + i * 0.26
            objs.append(_box("sandbag%d" % i, x0, x0 + 0.24, -0.085, -0.020, 0.0, v_bu(9), KIT_COLORS["sandbag"]))
    else:
        raise SystemExit("RENDER_FAIL: unknown overlay kind %r" % kind)
    return objs, [], {"overlay": True, "compositesOverPx": FLOOR_GROUND}


BUILDERS = {
    "storefront_low": build_storefront_low,
    "facade_body": build_facade_body,
    "window_module": build_window_module,
    "door_module": build_door_module,
    "cap": build_cap,
    "sign": build_sign,
    "awning": build_awning,
    "loading_door": build_loading_door,
    "fire_escape": build_fire_escape,
    "roof_clutter": build_roof_clutter,
    "overlay": build_overlay,
}


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def get_opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def render_piece(piece, shared, outdir, args):
    """Build + render + measure + manifest ONE kit piece. `piece` = {pieceId, tier?, geometry, ...};
    `shared` = the job's camera/framing/shader/light/output blocks."""
    piece_id = piece["pieceId"]
    geom = piece["geometry"]
    cam_cfg = shared["camera"]
    shader_cfg = shared.get("shader", {})
    light_cfg = shared.get("light", {})
    out_cfg = shared.get("output", {})
    pad = int(shared.get("framing", {}).get("pad", 12))

    scene = bpy.context.scene
    ic.clear_scene()  # the stray startup Cube (or the previous piece) must NEVER render into a kit sheet
    builder = BUILDERS.get(geom["builder"])
    if builder is None:
        raise SystemExit("RENDER_FAIL: unknown geometry builder %r (have %s)" % (geom["builder"], sorted(BUILDERS)))
    objs, bands_px, extras = builder(geom)
    extras = extras or {}
    yaw = float(geom.get("yawDeg", 0) or 0)  # yaw is applied at CONSTRUCTION by the builder (_YAW90)
    print("GEOMETRY piece=%s builder=%s objects=%d yaw=%s" % (piece_id, geom["builder"], len(objs), yaw or 0))

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

    deps = bpy.context.evaluated_depsgraph_get()
    deps.update()
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

    canvas = int(math.ceil((max(proj_w_px, proj_h_px) + 2 * pad) / 4.0) * 4)
    ortho = canvas / PX_PER_BU
    scene.render.resolution_x = canvas
    scene.render.resolution_y = canvas
    scene.render.resolution_percentage = 100
    got_ortho, _pw, _ph = ic.frame_camera(cam, basis, (min_r, max_r, min_u, max_u), canvas, canvas, pad,
                                          force_ortho_scale=ortho)
    print("FIXED-SCALE density=%.4f px/BU (canon 64*sqrt2=90.5097) canvas=%d ortho_scale=%.6f"
          % (canvas / got_ortho, canvas, got_ortho))
    print("PIECE %s projected %.1f x %.1f px (pad %d)" % (piece_id, proj_w_px, proj_h_px, pad))

    image_name = "kit_%s.png" % piece_id
    scene.render.filepath = os.path.join(outdir, image_name[:-4])
    bpy.ops.render.render(write_still=True)
    print("SHEET %s (single view, RAW PNG)" % os.path.join(outdir, image_name))

    # VERIFY-STACK: measure the rendered height in PIXELS at a builder-nominated solid column and gate
    # it against the corrected canon — the machine-checkable half of K's eyeball; the log carries it.
    verify = extras.get("verify")
    if verify:
        try:
            import numpy as np
            centre_r = (min_r + max_r) / 2.0
            img = bpy.data.images.load(os.path.join(outdir, image_name))
            arr = np.array(img.pixels[:], dtype=np.float32).reshape((canvas, canvas, 4))
            bpy.data.images.remove(img)
            alpha = np.flipud(arr[:, :, 3]) > 0.5
            r_col = verify["xBu"] * right[0] + verify["yBu"] * right[1]
            col = int(round(canvas / 2 + (r_col - centre_r) * PX_PER_BU))
            run = int(alpha[:, col].sum())
            expect = verify["expectPx"]
            slack = int(verify.get("slackPx", 6))
            print("VERIFY-STACK piece=%s column=%d alpha-run=%dpx expect~%dpx (+1..%dpx top-face/outline slack)"
                  % (piece_id, col, run, expect, slack))
            if not (expect - 2 <= run <= expect + slack):
                raise SystemExit("RENDER_FAIL: %s stack measured %dpx at the verify column; canon is %dpx — the "
                                 "vertical px->BU conversion or geometry drifted" % (piece_id, run, expect))
        except ImportError:
            print("VERIFY-STACK skipped (numpy unavailable)")

    W = float(geom.get("frontageTiles", 0) or 0)
    centre_r = (min_r + max_r) / 2.0
    manifest = {
        "pieceId": piece_id,
        "kind": "kit-piece",
        "tier": piece.get("tier", shared.get("tier", "low")),
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
        "vSnapPx": V_SNAP,
        "bayRunPx": 64,
        "bandsPx": bands_px,
    }
    if W:
        manifest["frontageTiles"] = int(W)
        yaw_rad = math.radians(yaw)
        def base_px(x_bu):
            wx, wy = x_bu * math.cos(yaw_rad), x_bu * math.sin(yaw_rad)
            r = wx * right[0] + wy * right[1]
            u = wx * up[0] + wy * up[1]
            return {"xPx": round((r - centre_r) * PX_PER_BU, 2), "yPx": round(-(u - min_u) * PX_PER_BU, 2)}
        manifest["baseEdgePx"] = {"left": base_px(0.0), "right": base_px(W)}
    for k, v in extras.items():
        if k != "verify" and v is not None:
            manifest[k] = v
    manifest_path = os.path.join(outdir, "kit_%s_manifest.json" % piece_id)
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("MANIFEST %s" % manifest_path)
    print("RENDER_OK piece=%s canvas=%d density=%.4f" % (piece_id, canvas, canvas / got_ortho))


def main():
    args = argv_after_dashes()
    job_path = get_opt(args, "--job")
    if not job_path:
        print("RENDER_FAIL: --job <path> required")
        sys.exit(2)
    with open(job_path) as fh:
        job = json.load(fh)

    outdir = get_opt(args, "--outdir", job["outputDir"])
    outdir = os.path.abspath(os.path.join(_HERE, "..", "..", outdir)) if not os.path.isabs(outdir) else outdir
    os.makedirs(outdir, exist_ok=True)

    out_cfg = job.get("output", {})
    engine = get_opt(args, "--engine", out_cfg.get("renderEngine", "BLENDER_EEVEE"))
    scene = bpy.context.scene
    scene.render.engine = engine
    if engine == "BLENDER_EEVEE":
        scene.eevee.taa_render_samples = int(out_cfg.get("eeveeSamples", 24))
    ic.setup_world_transparent(scene)
    scene.render.image_settings.compression = int(out_cfg.get("pngCompression", 100))  # lossless RAW PNG — NO pngquant

    only = get_opt(args, "--only")  # optional: re-render a single piece out of a batch
    pieces = job.get("pieces")
    if pieces is None:
        pieces = [{"pieceId": job["pieceId"], "tier": job.get("tier", "low"), "geometry": job["geometry"]}]
    if only:
        pieces = [p for p in pieces if p["pieceId"] == only]
        if not pieces:
            raise SystemExit("RENDER_FAIL: --only %r matched no piece in the job" % only)
    for piece in pieces:
        render_piece(piece, job, outdir, args)
    print("BATCH_OK pieces=%d outdir=%s" % (len(pieces), outdir))


if __name__ == "__main__":
    main()
