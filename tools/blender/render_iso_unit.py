# render_iso_unit.py — headless entry: render a unit (the placeholder thug, or later a real FBX) to iso
# sprite SHEETS (one PNG per action, rows=8 directions x cols=frames) + a manifest JSON, framed to the
# game's exact tile projection. OFFLINE TOOLING — not shipped to the browser.
#
#   xvfb-run -a blender -b -P tools/blender/render_iso_unit.py -- --job tools/blender/render_jobs/thug_placeholder.json
#
# Overrides: --engine BLENDER_EEVEE|CYCLES  --outdir <dir>  --no-freestyle  (CLI wins over the job JSON).
# The SAME script renders the real model later: point the job's `source` at an fbx/glb instead of "blockout".

import os
import sys
import json
import math

import bpy  # type: ignore

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import render_iso_common as ic  # noqa: E402
import blockout_thug as blk      # noqa: E402

try:
    import numpy as np
except Exception:  # Blender ships numpy; this is just a guard
    np = None


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def get_opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def sample_frames(start, end, count, loop):
    """Evenly-spaced source frames. Looping actions EXCLUDE the terminal duplicate; non-looping INCLUDE it."""
    if count <= 1:
        return [float(start)]
    if loop:
        step = (end - start) / count
        return [start + i * step for i in range(count)]
    step = (end - start) / (count - 1)
    return [start + i * step for i in range(count)]


# Keyword fallbacks per action — used ONLY when the job's literal `fbx` path is missing. Meshy-native exports
# carry arbitrary filenames, so if "assets/raw/thug/Walking.fbx" isn't there we look for any FBX in that same
# folder whose name contains a walk keyword. The literal path stays the contract (the CI test enforces it);
# this just spares a re-render when the on-disk names differ from the job. Order = specificity.
ACTION_FBX_KEYWORDS = {
    "idle": ("idle", "breath", "stand", "rest"),
    "walk": ("walk",),
    "run": ("run", "jog", "sprint"),
    "hurt": ("hurt", "injured", "injure", "damage", "pain", "stagger", "flinch", "hit", "reaction"),
    "attack": ("attack", "punch", "melee", "swing", "strike", "combat", "kick"),
}


def resolve_fbx(fbx_rel, action_name):
    """Return an existing absolute FBX path for this action. The job's literal path wins; if it's absent we
    scan its folder for an FBX whose name matches the action's keywords (Meshy-native filenames are unknown to
    the repo). Raises SystemExit with a clear message if nothing matches — never renders the wrong clip."""
    fbx_abs = fbx_rel if os.path.isabs(fbx_rel) else os.path.abspath(os.path.join(_HERE, "..", "..", fbx_rel))
    if os.path.isfile(fbx_abs):
        return fbx_abs
    folder = os.path.dirname(fbx_abs)
    if not os.path.isdir(folder):
        raise SystemExit("RENDER_FAIL: %r not found and its folder %r does not exist" % (fbx_rel, folder))
    present = sorted(f for f in os.listdir(folder) if f.lower().endswith(".fbx"))
    kws = ACTION_FBX_KEYWORDS.get(action_name, (action_name,))
    matches = [f for f in present if any(k in f.lower() for k in kws)]
    if len(matches) == 1:
        chosen = os.path.join(folder, matches[0])
        print("FBX_RESOLVE action=%s literal-missing -> keyword match %r" % (action_name, matches[0]))
        return chosen
    if len(matches) > 1:
        raise SystemExit("RENDER_FAIL: action %r literal %r missing; %d keyword matches %s — rename or set "
                         "the exact 'fbx' in the job" % (action_name, os.path.basename(fbx_abs), len(matches), matches))
    raise SystemExit("RENDER_FAIL: action %r FBX %r not found; no keyword match in %s among %s"
                     % (action_name, os.path.basename(fbx_abs), folder, present))


def apply_toon_materials(meshes, shader_cfg):
    """Swap each material slot (across one or more meshes) for a toon cel variant built from the slot's base
    colour (the blockout stores __base_hex__; a real FBX exposes a Principled Base Color — material_base_hex
    handles both)."""
    thresholds = shader_cfg.get("toonThresholds01", [0.28, 0.62, 0.88])
    desat = shader_cfg.get("desaturateAmount01", 0.28)
    sepia = shader_cfg.get("sepiaAmount01", 0.12)
    for mesh in meshes:
        for slot in mesh.material_slots:
            m = slot.material
            if m is None:
                continue
            base_hex = ic.material_base_hex(m)
            slot.material = ic.make_toon_material("toon_" + m.name, base_hex, thresholds, desat, sepia)


def set_frame(scene, f):
    fi = int(math.floor(f))
    scene.frame_set(fi, subframe=float(f - fi))


def set_only_visible(clips, active):
    """Render-hide every clip's meshes except the active clip's (real-FBX mode: each clip is its own imported
    rig+mesh, so we render one at a time). No-op-safe for shared-mesh blockout (single clip group)."""
    for c in clips:
        hide = c is not active
        for m in c["meshes"]:
            m.hide_render = hide


def bbox_prepass(scene, clips, dirs, basis, dir_start, dir_step, model_forward, multi_model, inplace):
    """Project every posed vertex (all clips x dirs x frames) onto the camera right/up axes; return the global
    (minR, maxR, minU, maxU). The UNION across clips locks ONE ortho_scale so idle/walk/run/... all render at
    the SAME size and foot anchor (the dispatch's 'shared normalization')."""
    right, up, _fwd = basis
    deps = bpy.context.evaluated_depsgraph_get()
    min_r = min_u = float("inf")
    max_r = max_u = float("-inf")
    for clip in clips:
        if multi_model:
            set_only_visible(clips, clip)
        ic.assign_action(clip["arm"], clip["action"])  # slot-bind on Blender 4.4+/5.1 slotted actions
        rot_obj = clip["piv"] or clip["arm"]
        for d in range(dirs):
            rot_obj.rotation_euler = (0, 0, math.radians(dir_start + model_forward + d * dir_step))
            for f in clip["frames"]:
                set_frame(scene, f)
                if inplace:
                    ic.center_root_world_xy(clip["arm"], clip["piv"])  # strip locomotion TRAVEL (keep Z bob)
                deps.update()
                for mesh in clip["meshes"]:
                    ev = mesh.evaluated_get(deps)
                    me = ev.to_mesh()
                    mw = ev.matrix_world
                    for v in me.vertices:
                        w = mw @ v.co
                        r = w.dot(right)
                        u = w.dot(up)
                        if r < min_r: min_r = r
                        if r > max_r: max_r = r
                        if u < min_u: min_u = u
                        if u > max_u: max_u = u
                    ev.to_mesh_clear()
    return (min_r, max_r, min_u, max_u)


def render_cell(scene, path_base):
    scene.render.filepath = path_base  # Blender appends .png from file_format
    bpy.ops.render.render(write_still=True)
    return path_base + ".png"


def load_cell_topdown(path, canvas):
    img = bpy.data.images.load(path)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape((canvas, canvas, 4))  # bottom-up rows
    arr = np.flipud(arr)  # -> top-down
    bpy.data.images.remove(img)
    return arr


def save_sheet(path, sheet_topdown):
    h, w, _ = sheet_topdown.shape
    img = bpy.data.images.new(os.path.basename(path), width=w, height=h, alpha=True)
    bu = np.flipud(sheet_topdown)  # back to bottom-up for Blender
    img.pixels = bu.reshape(-1)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def main():
    args = argv_after_dashes()
    job_path = get_opt(args, "--job")
    if not job_path:
        print("RENDER_FAIL: --job <path> required")
        sys.exit(2)
    with open(job_path) as fh:
        job = json.load(fh)

    cam_cfg = job["camera"]
    shader_cfg = job.get("shader", {})
    light_cfg = job.get("light", {})
    framing = job.get("framing", {})
    out_cfg = job.get("output", {})

    engine = get_opt(args, "--engine", out_cfg.get("renderEngine", "BLENDER_EEVEE"))
    outdir = get_opt(args, "--outdir", job["outputDir"])
    outdir = os.path.abspath(os.path.join(_HERE, "..", "..", outdir)) if not os.path.isabs(outdir) else outdir
    os.makedirs(outdir, exist_ok=True)
    tmpdir = os.path.join(outdir, "_tmp_frames")
    os.makedirs(tmpdir, exist_ok=True)

    canvas = int(framing.get("frameCanvasW", 256))
    pad = int(framing.get("pad", 16))
    target_h = int(framing.get("targetFigureMaxH", 224))
    dirs = int(cam_cfg.get("directions", 8))
    dir_start = float(cam_cfg.get("dirStartDeg", 0))
    dir_step = float(cam_cfg.get("dirStepDeg", 45))
    model_forward = float(cam_cfg.get("modelForwardDeg", 0))
    tile_w = float(cam_cfg["tileW"])
    tile_h = float(cam_cfg["tileH"])
    mode = cam_cfg.get("cameraMode", "dimetric2to1")

    # ── scene setup (engine, world, output) ─────────────────────────────────────────────────────────────
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = canvas
    scene.render.resolution_y = canvas
    scene.render.resolution_percentage = 100
    if engine == "BLENDER_EEVEE":
        scene.eevee.taa_render_samples = int(out_cfg.get("eeveeSamples", 24))
    ic.setup_world_transparent(scene)
    scene.render.image_settings.compression = int(out_cfg.get("pngCompression", 100))  # max lossless squeeze

    # ── build CLIPS: blockout = ONE shared rig + named baked actions; fbx = ONE imported rig PER clip ────
    # (Mixamo exports one FBX per animation, all sharing the rig/mesh). Either way the bbox pre-pass below
    # locks ONE shared scale + foot anchor across every clip so they line up in-game.
    source = job.get("source", "blockout")
    multi_model = (source == "fbx")
    inplace = bool(job.get("inPlace", multi_model))  # In-Place safeguard ON for real Mixamo clips
    ic.clear_scene()  # remove the default Cube/Light/Camera so ONLY the character renders + drives the bbox
    clips = []
    if source == "blockout":
        arm, mesh, _action_names = blk.build_thug()
        apply_toon_materials([mesh], shader_cfg)
        for a in job["actions"]:
            clips.append({
                "name": a["name"], "arm": arm, "meshes": [mesh], "piv": None,
                "action": bpy.data.actions[a["name"]],
                "frames": sample_frames(a["sourceFrameStart"], a["sourceFrameEnd"], a["outputFrameCount"], a["loop"]),
                "cols": a["outputFrameCount"], "fps": a["playbackFps"], "loop": a["loop"],
            })
    elif source == "fbx":
        for a in job["actions"]:
            fbx = a.get("fbx")
            if not fbx:
                raise SystemExit("RENDER_FAIL: action %r needs an 'fbx' path (source=fbx)" % a.get("name"))
            fbx_abs = resolve_fbx(fbx, a["name"])
            piv, arm, meshes, action = ic.import_fbx_unit(fbx_abs, a["name"], a.get("actionName"))
            if action is None:
                raise SystemExit("RENDER_FAIL: FBX %r has no animation action" % fbx_abs)
            apply_toon_materials(meshes, shader_cfg)
            fr = action.frame_range
            start = int(a.get("sourceFrameStart", int(fr[0])))
            end = int(a.get("sourceFrameEnd", int(fr[1])))
            clips.append({
                "name": a["name"], "arm": arm, "meshes": meshes, "piv": piv, "action": action,
                "frames": sample_frames(start, end, a["outputFrameCount"], a["loop"]),
                "cols": a["outputFrameCount"], "fps": a["playbackFps"], "loop": a["loop"],
            })
            print("IMPORTED %s <- %s frames[%d..%d]" % (a["name"], fbx_abs, start, end))
    else:
        raise SystemExit("RENDER_FAIL: unknown source %r (expected 'blockout' or 'fbx')" % source)

    ic.setup_lights(scene, light_cfg.get("keyEnergy", 1200.0), light_cfg.get("fillEnergy", 500.0),
                    light_cfg.get("rimEnergy", 220.0))
    if shader_cfg.get("outlineEnabled", True) and "--no-freestyle" not in args:
        ic.setup_freestyle(scene, bpy.context.view_layer,
                           shader_cfg.get("outlineThicknessPx", 1.75), shader_cfg.get("outlineColorHex", "#1E1713"))

    cam = ic.make_camera()
    cam_x = ic.camera_x_deg(tile_w, tile_h, mode)
    cam_z = float(cam_cfg.get("cameraZDeg", 45))
    ic.orient_camera(cam, cam_x, cam_z)
    scene.camera = cam
    basis = ic.camera_basis(cam_x, cam_z)

    # ── bbox pre-pass -> lock ONE framing across ALL clips (feet on bottom edge, shared scale) ───────────
    bounds = bbox_prepass(scene, clips, dirs, basis, dir_start, dir_step, model_forward, multi_model, inplace)
    ortho_scale, proj_w, proj_h = ic.frame_camera(cam, basis, bounds, canvas, target_h, pad)
    px_per_bu = canvas / ortho_scale
    figure_px_h = proj_h * px_per_bu
    figure_px_w = proj_w * px_per_bu
    print("CAM mode=%s cameraXDeg=%.4f cameraZDeg=%.1f ortho_scale=%.4f figurePx=%.1fx%.1f source=%s"
          % (mode, cam_x, cam_z, ortho_scale, figure_px_w, figure_px_h, source))

    # ── render every cell, pack per-clip sheets (rows=8 dirs × cols=frames) ──────────────────────────────
    unit_name = job["unitName"]
    manifest_actions = {}
    for clip in clips:
        if multi_model:
            set_only_visible(clips, clip)
        ic.assign_action(clip["arm"], clip["action"])  # slot-bind on Blender 4.4+/5.1 slotted actions
        rot_obj = clip["piv"] or clip["arm"]
        name = clip["name"]
        cols = clip["cols"]
        sheet = np.zeros((dirs * canvas, cols * canvas, 4), dtype=np.float32)
        frames_meta = []
        for d in range(dirs):
            rot_obj.rotation_euler = (0, 0, math.radians(dir_start + model_forward + d * dir_step))
            for ci, f in enumerate(clip["frames"]):
                set_frame(scene, f)
                if inplace:
                    ic.center_root_world_xy(clip["arm"], clip["piv"])  # strip locomotion TRAVEL (keep Z bob)
                base = os.path.join(tmpdir, "%s_%s_d%d_f%02d" % (unit_name, name, d, ci))
                png = render_cell(scene, base)
                cell = load_cell_topdown(png, canvas)
                y0 = d * canvas
                x0 = ci * canvas
                sheet[y0:y0 + canvas, x0:x0 + canvas, :] = cell
                frames_meta.append({
                    "name": "%s_%s_dir%d_f%02d" % (unit_name, name, d, ci),
                    "x": x0, "y": y0, "w": canvas, "h": canvas,
                    "anchorX": 0.5, "anchorY": 1.0,
                    "dirIndex": d, "action": name, "frameIndex": ci,
                })
        sheet_path = os.path.join(outdir, "%s_%s.png" % (unit_name, name))
        save_sheet(sheet_path, sheet)
        manifest_actions[name] = {
            "action": name,
            "image": "%s_%s.png" % (unit_name, name),
            "frameW": canvas, "frameH": canvas, "rows": dirs, "cols": cols,
            "playbackFps": clip["fps"], "loop": clip["loop"],
            "frames": frames_meta,
        }
        print("SHEET %s rows=%d cols=%d" % (sheet_path, dirs, cols))

    manifest = {
        "unitName": unit_name,
        "placeholder": (source == "blockout"),
        "generator": "tools/blender/render_iso_unit.py (%s)" % (
            "blockout_thug placeholder — NOT shipped art" if source == "blockout" else "real model render (%s)" % source),
        "camera": {"mode": mode, "cameraXDeg": round(cam_x, 4), "cameraZDeg": cam_z,
                   "tileW": tile_w, "tileH": tile_h, "orthoScale": round(ortho_scale, 4)},
        "anchor": {"anchorX": 0.5, "anchorY": 1.0},
        "directions": dirs, "dirStartDeg": dir_start, "dirStepDeg": dir_step, "modelForwardDeg": model_forward,
        "figurePxH": round(figure_px_h, 2), "figurePxW": round(figure_px_w, 2), "frameCanvas": canvas, "pad": pad,
        "actions": manifest_actions,
    }
    manifest_path = os.path.join(outdir, "%s_manifest.json" % unit_name)
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("MANIFEST %s" % manifest_path)

    # tidy temp frames
    for fn in os.listdir(tmpdir):
        try:
            os.remove(os.path.join(tmpdir, fn))
        except OSError:
            pass
    try:
        os.rmdir(tmpdir)
    except OSError:
        pass
    print("RENDER_OK unit=%s actions=%d dirs=%d" % (unit_name, len(clips), dirs))


if __name__ == "__main__":
    main()
